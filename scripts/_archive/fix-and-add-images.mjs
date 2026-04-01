#!/usr/bin/env node
/**
 * 스크립트 역할:
 * 1. 중복 no 수정: 내 기사(no=13~22) → 실제 max no 이후 번호로 재배정
 * 2. 이미지 추가: Pexels에서 각 기사 제목 기반 이미지 검색 → Supabase Storage 업로드
 *    - thumbnail (대표이미지)
 *    - 본문 첫 문단 뒤에 <img> 삽입
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  for (const f of [".env.production.local", ".env.local", ".env"]) {
    const p = resolve(__dirname, "..", f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf-8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.*?)["']?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\\n$/, "").trim();
    }
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
let   PEXELS_KEY   = process.env.PEXELS_API_KEY;
let   GEMINI_KEY   = process.env.GEMINI_API_KEY || "";

const c = { green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", gray: "\x1b[90m", reset: "\x1b[0m", bold: "\x1b[1m" };
const BUCKET = "images";

if (!SUPABASE_URL || !SERVICE_KEY) { console.error("❌ Supabase 환경변수 미설정"); process.exit(1); }

// ── Supabase 설정 조회 ────────────────────────────────────────
async function getSetting(key) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/site_settings?key=eq.${encodeURIComponent(key)}&select=value`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
  if (!r.ok) return null;
  return (await r.json())?.[0]?.value ?? null;
}

// ── 내가 등록한 기사 목록 조회 (no 13~22, source_url 있는 것) ──
async function fetchMyArticles() {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?no=gte.13&no=lte.22&source_url=not.is.null&select=id,no,title,thumbnail,body,category,source_url&order=no.asc`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!r.ok) throw new Error(`fetch 실패: ${r.status}`);
  return await r.json();
}

// ── 현재 최대 no 조회 ─────────────────────────────────────────
async function getMaxNo() {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?select=no&order=no.desc&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!r.ok) return 83;
  const rows = await r.json();
  return rows?.[0]?.no ?? 83;
}

// ── Pexels 이미지 검색 ────────────────────────────────────────
async function searchPexels(query) {
  if (!PEXELS_KEY) return null;
  try {
    // Gemini로 영어 키워드 추출 (있으면)
    let englishQuery = query;
    if (GEMINI_KEY) {
      const gr = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `다음 뉴스 제목을 1~3개 영어 키워드로 변환하세요 (쉼표 구분, 설명 없이):\n${query}` }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 50 },
          }),
          signal: AbortSignal.timeout(10000),
        }
      );
      if (gr.ok) {
        const gd = await gr.json();
        const kw = gd.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (kw && kw.length < 100) englishQuery = kw;
      }
    }

    const r = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(englishQuery)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: PEXELS_KEY }, signal: AbortSignal.timeout(10000) }
    );
    if (!r.ok) return null;
    const data = await r.json();
    return data.photos?.[0]?.src?.large2x ?? data.photos?.[0]?.src?.large ?? null;
  } catch { return null; }
}

// ── 이미지 다운로드 ───────────────────────────────────────────
async function downloadImage(url) {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*,*/*;q=0.8" },
      signal: AbortSignal.timeout(20000),
      redirect: "follow",
    });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > 10 * 1024 * 1024) return null;
    let mime = r.headers.get("content-type")?.split(";")[0].trim() ?? "image/jpeg";
    const ALLOWED = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!ALLOWED.includes(mime)) mime = "image/jpeg";
    return { buf, mime };
  } catch { return null; }
}

// ── Supabase Storage 업로드 ───────────────────────────────────
async function uploadToSupabase(buf, mime) {
  const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };
  const ext = EXT[mime] ?? "jpg";
  const now = new Date();
  const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": mime, "x-upsert": "true" },
    body: buf,
  });
  if (!r.ok) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

// ── 기사 업데이트 ─────────────────────────────────────────────
async function updateArticle(id, patch) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  });
  return r.ok;
}

// ── 본문에 이미지 삽입 (첫 </p> 뒤) ──────────────────────────
function insertImageIntoBody(body, imageUrl, altText) {
  const imgTag = `<figure style="margin: 1.5em 0; text-align:center;">` +
    `<img src="${imageUrl}" alt="${altText}" style="max-width:100%;height:auto;border-radius:8px;" />` +
    `</figure>`;
  const idx = body.indexOf("</p>");
  if (idx === -1) return body + imgTag;
  return body.slice(0, idx + 4) + imgTag + body.slice(idx + 4);
}

// ── settings counter 업데이트 ────────────────────────────────
async function updateCounter(newMax) {
  await fetch(`${SUPABASE_URL}/rest/v1/site_settings`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ key: "cp-article-counter", value: newMax }),
  });
}

// ── 메인 ─────────────────────────────────────────────────────
async function main() {
  console.log(`\n${c.bold}기사 no 수정 + 이미지 추가${c.reset}`);
  console.log("─".repeat(60));

  // API 키 확인
  if (!PEXELS_KEY) {
    const settings = await getSetting("cp-ai-settings");
    PEXELS_KEY = settings?.pexelsApiKey ?? "";
  }
  if (!GEMINI_KEY) {
    const settings = await getSetting("cp-ai-settings");
    GEMINI_KEY = settings?.geminiApiKey ?? "";
  }
  if (!PEXELS_KEY) {
    console.error(`${c.red}❌ PEXELS_API_KEY 없음${c.reset}`);
    process.exit(1);
  }
  console.log(`  ${c.green}✓${c.reset} Pexels API 키 확인됨`);
  console.log(`  ${c.green}✓${c.reset} Gemini ${GEMINI_KEY ? "있음 (키워드 추출 활성)" : "없음 (한국어로 직접 검색)"}`);

  // 내 기사 조회
  const myArticles = await fetchMyArticles();
  if (myArticles.length === 0) {
    console.log(`${c.yellow}대상 기사 없음${c.reset} (no=13~22 & source_url 있는 기사)`);
    return;
  }
  console.log(`  ${c.green}✓${c.reset} 대상 기사 ${myArticles.length}건 조회됨\n`);

  // 현재 최대 no 확인
  const maxNo = await getMaxNo();
  console.log(`  현재 최대 no: ${maxNo}`);
  console.log(`  새로운 no 범위: ${maxNo + 1} ~ ${maxNo + myArticles.length}\n`);

  let fixed = 0, imageFailed = 0;

  for (let i = 0; i < myArticles.length; i++) {
    const article = myArticles[i];
    const newNo = maxNo + 1 + i;
    process.stdout.write(`  [${i + 1}/${myArticles.length}] no.${article.no}→no.${newNo} ${article.title.slice(0, 40).padEnd(40)} `);

    // 1. Pexels 이미지 검색
    const pexelsUrl = await searchPexels(article.title);
    let thumbnailUrl = "";
    let bodyWithImage = article.body;

    if (pexelsUrl) {
      const img = await downloadImage(pexelsUrl);
      if (img) {
        const uploaded = await uploadToSupabase(img.buf, img.mime);
        if (uploaded) {
          thumbnailUrl = uploaded;
          // 본문에도 이미지 삽입
          bodyWithImage = insertImageIntoBody(article.body, uploaded, article.title);
        }
      }
    }

    if (!thumbnailUrl) {
      imageFailed++;
      process.stdout.write(`${c.yellow}이미지 실패${c.reset} `);
    } else {
      process.stdout.write(`${c.green}이미지✓${c.reset} `);
    }

    // 2. no + 이미지 동시 업데이트
    const patch = { no: newNo };
    if (thumbnailUrl) {
      patch.thumbnail = thumbnailUrl;
      patch.body = bodyWithImage;
    }

    const ok = await updateArticle(article.id, patch);
    if (ok) {
      console.log(`→ ${c.green}업데이트 완료${c.reset}`);
      fixed++;
    } else {
      console.log(`→ ${c.red}DB 업데이트 실패${c.reset}`);
    }

    // rate limit
    if (i < myArticles.length - 1) await new Promise(r => setTimeout(r, 400));
  }

  // counter 업데이트
  const finalMax = maxNo + myArticles.length;
  await updateCounter(finalMax);
  console.log(`\n  ${c.gray}cp-article-counter → ${finalMax}${c.reset}`);

  console.log(`\n${"─".repeat(60)}`);
  console.log(`${c.bold}완료${c.reset}`);
  console.log(`  no 재배정+DB 업데이트: ${c.green}${fixed}건${c.reset}`);
  console.log(`  이미지 추가: ${c.green}${fixed - imageFailed}건 성공${c.reset}  ${imageFailed > 0 ? c.yellow + imageFailed + "건 실패" + c.reset : ""}`);
  console.log(`\n  확인: https://culturepeople.co.kr/article/${maxNo + 1}`);
  console.log();
}

main().catch(e => { console.error(e); process.exit(1); });
