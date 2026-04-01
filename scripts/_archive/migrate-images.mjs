#!/usr/bin/env node
/**
 * 기존 기사 외부/깨진 이미지 → Supabase Storage 이관 스크립트
 * - 이관 가능한 이미지: 다운로드 후 Supabase 업로드
 * - 이관 불가(404 등): Pexels에서 기사 제목 기반 대체 이미지 검색 후 교체
 *
 * 사용법:
 *   node scripts/migrate-images.mjs
 *   node scripts/migrate-images.mjs --dry-run
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const files = [".env.production.local", ".env.local", ".env"];
  for (const f of files) {
    const p = resolve(__dirname, "..", f);
    if (!existsSync(p)) continue;
    const lines = readFileSync(p, "utf-8").split("\n");
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.*?)["']?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\\n$/, "").trim();
    }
  }
}
loadEnv();

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY;
const PEXELS_KEY    = process.env.PEXELS_API_KEY;
const GEMINI_KEY    = process.env.GEMINI_API_KEY;
const BUCKET        = "images";
const DRY_RUN       = process.argv.includes("--dry-run");
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const EXT_MAP       = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };

if (!SUPABASE_URL || !SERVICE_KEY) { console.error("❌ Supabase 환경변수 미설정"); process.exit(1); }

const c = { green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", gray: "\x1b[90m", reset: "\x1b[0m", bold: "\x1b[1m" };

function isOwnUrl(url) {
  try { const h = new URL(url).hostname.toLowerCase(); return h.endsWith("supabase.co") || h.includes("culturepeople.co.kr"); }
  catch { return false; }
}

function isSafeUrl(url) {
  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol)) return false;
    const h = u.hostname.toLowerCase();
    if (["localhost", "127.0.0.1"].includes(h)) return false;
    const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4) {
      const [, a, b] = ipv4.map(Number);
      if ([0, 10, 127].includes(a)) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a === 192 && b === 168) return false;
      if (a >= 224) return false;
    }
    return true;
  } catch { return false; }
}

async function downloadImage(url) {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "image/*,*/*;q=0.8" },
      signal: AbortSignal.timeout(20000),
      redirect: "follow",
    });
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > 10 * 1024 * 1024) return null;
    let mime = resp.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!ALLOWED_TYPES.includes(mime)) {
      const u = url.toLowerCase().split("?")[0];
      mime = u.endsWith(".png") ? "image/png" : u.endsWith(".gif") ? "image/gif" : u.endsWith(".webp") ? "image/webp" : "image/jpeg";
    }
    return { buf, mime };
  } catch { return null; }
}

async function uploadToSupabase(buf, mime) {
  const ext = EXT_MAP[mime] ?? "jpg";
  const now = new Date();
  const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": mime, "x-upsert": "true" },
    body: buf,
  });
  if (!resp.ok) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

/** Pexels에서 이미지 검색 후 첫 번째 결과 URL 반환 */
async function searchPexels(title) {
  if (!PEXELS_KEY) return null;
  try {
    // 제목에서 핵심 키워드 추출 (영어 키워드 사용 시 결과 더 좋음)
    let query = title;
    if (GEMINI_KEY) {
      const geminiResp = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `다음 뉴스 제목에서 이미지 검색용 영어 키워드를 1~3개 뽑아 쉼표 구분으로만 답하세요 (설명 없이):\n${title}` }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 50 },
          }),
          signal: AbortSignal.timeout(10000),
        }
      );
      const gd = await geminiResp.json().catch(() => ({}));
      const kw = gd.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (kw && kw.length < 100) query = kw;
    }

    const resp = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: PEXELS_KEY }, signal: AbortSignal.timeout(10000) }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.photos?.[0]?.src?.large ?? null;
  } catch { return null; }
}

async function migrateOrReplace(url, title) {
  // 1. 기존 URL로 다운로드 시도
  if (url && isSafeUrl(url)) {
    const img = await downloadImage(url);
    if (img) {
      if (DRY_RUN) return { url: "[dry-upload]", source: "original" };
      const newUrl = await uploadToSupabase(img.buf, img.mime);
      if (newUrl) return { url: newUrl, source: "original" };
    }
  }
  // 2. 다운로드 실패 → Pexels 대체 이미지
  const pexelsUrl = await searchPexels(title);
  if (pexelsUrl) {
    const img = await downloadImage(pexelsUrl);
    if (img) {
      if (DRY_RUN) return { url: "[dry-pexels]", source: "pexels" };
      const newUrl = await uploadToSupabase(img.buf, img.mime);
      if (newUrl) return { url: newUrl, source: "pexels" };
    }
  }
  return null;
}

async function fetchAllArticles() {
  const results = [];
  let offset = 0;
  while (true) {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/articles?select=id,title,thumbnail,body&order=created_at.desc&limit=100&offset=${offset}`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (!resp.ok) break;
    const data = await resp.json();
    if (!data.length) break;
    results.push(...data);
    if (data.length < 100) break;
    offset += 100;
  }
  return results;
}

async function updateArticle(id, patch) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${id}`, {
    method: "PATCH",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
    body: JSON.stringify(patch),
  });
  return resp.ok;
}

async function main() {
  console.log(`\n${c.bold}기사 이미지 Supabase 이관${c.reset}`);
  console.log("─".repeat(50));
  if (DRY_RUN) console.log(`${c.yellow}⚠${c.reset} 드라이런 모드 — 실제 변경 없음\n`);
  if (!PEXELS_KEY) console.log(`${c.yellow}⚠${c.reset} PEXELS_API_KEY 없음 — 대체 이미지 검색 불가\n`);

  const articles = await fetchAllArticles();
  console.log(`📋 총 ${articles.length}개 기사 조회\n`);

  let thumbMigrated = 0, thumbPexels = 0, thumbFailed = 0, thumbSkipped = 0;
  let bodyMigrated = 0;

  for (const article of articles) {
    const patches = {};
    const title = article.title ?? "";

    // ── 썸네일 ──
    const thumb = article.thumbnail;
    if (thumb && !isOwnUrl(thumb)) {
      process.stdout.write(`  [썸네일] ${title.slice(0, 45).padEnd(45)} `);
      const result = await migrateOrReplace(thumb, title);
      if (result) {
        const icon = result.source === "pexels" ? `${c.yellow}Pexels대체${c.reset}` : `${c.green}이관✓${c.reset}`;
        console.log(icon);
        if (!DRY_RUN) patches.thumbnail = result.url;
        result.source === "pexels" ? thumbPexels++ : thumbMigrated++;
        // Pexels rate limit 방어
        if (result.source === "pexels") await new Promise(r => setTimeout(r, 300));
      } else {
        console.log(`${c.red}실패${c.reset}`);
        thumbFailed++;
      }
    } else if (thumb) {
      thumbSkipped++;
    }

    // ── 본문 이미지 ──
    const body = article.body;
    if (body) {
      const extUrls = [...new Set(
        [...body.matchAll(/<img[^>]+src="([^"]+)"/gi)].map(m => m[1]).filter(u => !isOwnUrl(u) && isSafeUrl(u))
      )];
      if (extUrls.length > 0) {
        const urlMap = new Map();
        for (const u of extUrls) {
          const img = await downloadImage(u);
          if (img && !DRY_RUN) {
            const newUrl = await uploadToSupabase(img.buf, img.mime);
            if (newUrl) { urlMap.set(u, newUrl); bodyMigrated++; }
          } else if (img && DRY_RUN) {
            urlMap.set(u, "[dry]"); bodyMigrated++;
          }
        }
        if (urlMap.size > 0 && !DRY_RUN) {
          patches.body = body.replace(/<img([^>]+)src="([^"]+)"/gi, (full, attrs, u) => {
            const r = urlMap.get(u); return r ? `<img${attrs}src="${r}"` : full;
          });
          console.log(`  [본문]  ${title.slice(0, 45).padEnd(45)} ${c.green}${urlMap.size}개 이관${c.reset}`);
        }
      }
    }

    if (Object.keys(patches).length > 0 && !DRY_RUN) {
      const ok = await updateArticle(article.id, patches);
      if (!ok) console.log(`  ${c.red}DB 업데이트 실패: ${article.id}${c.reset}`);
    }
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`${c.bold}완료${c.reset}`);
  console.log(`  썸네일: ${c.green}이관 ${thumbMigrated}건${c.reset}  ${c.yellow}Pexels대체 ${thumbPexels}건${c.reset}  ${c.red}실패 ${thumbFailed}건${c.reset}  이미Supabase ${c.gray}${thumbSkipped}건${c.reset}`);
  console.log(`  본문이미지: ${c.green}${bodyMigrated}건 이관${c.reset}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
