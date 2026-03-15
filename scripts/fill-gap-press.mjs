#!/usr/bin/env node
/**
 * 공백기 기사 수집 스크립트 (Google News RSS → Puppeteer URL 해석 → 원문 크롤링 → AI 편집 → 등록)
 *
 * 파이프라인:
 *   1. Google News RSS 날짜 범위 검색 (문화 키워드)
 *   2. Puppeteer로 Google News 리다이렉트 → 원본 URL 추출
 *   3. 원문 사이트 직접 크롤링 (본문/이미지 추출)
 *   4. Gemini AI 편집 (제목/본문/요약/태그/카테고리)
 *   5. 이미지 Supabase 이관
 *   6. 기사 등록 (과거 날짜 유지)
 *
 * Usage: node scripts/fill-gap-press.mjs [--dry-run] [--limit N] [--gap 1]
 *   --gap 1: 2022-08 ~ 2023-08 (384일)
 *   --gap 2: 2023-09 ~ 2024-10 (411일)
 *   --gap 3: 2024-12 ~ 2026-02 (452일)
 *   --gap 4: 2021-10 ~ 2022-07 (257일)
 *   --gap 5: 2021-04 ~ 2021-07 (100일)
 */

import { readFileSync } from "fs";
import { randomUUID } from "crypto";
import puppeteer from "puppeteer";

let env = {};
try {
  const raw = readFileSync(".env.production.local", "utf-8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"]*)"?$/);
    if (m) env[m[1]] = m[2];
  }
} catch {}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;
const GEMINI_KEY = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const AUTHOR = "컬처피플";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = parseInt(args.find((_, i) => args[i - 1] === "--limit") || "30");
const GAP_ID = parseInt(args.find((_, i) => args[i - 1] === "--gap") || "1");

const GAPS = {
  // 8차 수집 — 창간 구간 3차 보강
  1: { start: "2018-05-24", end: "2018-06-19", name: "2018.05~06 (26일)" },
  2: { start: "2019-12-27", end: "2020-01-21", name: "2019.12~2020.01 (25일)" },
  3: { start: "2019-07-17", end: "2019-08-10", name: "2019.07~08 (24일)" },
  4: { start: "2018-12-21", end: "2019-01-13", name: "2018.12~2019.01 (23일)" },
  5: { start: "2018-11-21", end: "2018-12-13", name: "2018.11~12 (22일)" },
  6: { start: "2020-03-05", end: "2020-03-27", name: "2020.03 (22일)" },
  7: { start: "2018-10-19", end: "2018-11-09", name: "2018.10~11 (21일)" },
  8: { start: "2018-09-21", end: "2018-10-10", name: "2018.09~10 (19일)" },
  9: { start: "2019-04-04", end: "2019-04-22", name: "2019.04 (18일)" },
  10: { start: "2020-01-31", end: "2020-02-17", name: "2020.01~02 (17일)" },
  11: { start: "2020-03-27", end: "2020-04-13", name: "2020.03~04 (17일)" },
  12: { start: "2018-08-01", end: "2018-08-17", name: "2018.08 (16일)" },
};
const gap = GAPS[GAP_ID];
if (!gap) { console.error("유효한 --gap 값: 1, 2, 3, 4, 5"); process.exit(1); }

// ─── 문화 관련 검색 키워드 ───
const SEARCH_KEYWORDS = [
  "문화재단 행사",
  "문화예술 지원",
  "공연 전시 문화",
  "문화체육관광부 정책",
  "박물관 미술관 전시",
  "지역문화 축제",
  "예술 공연 축제",
];

console.log(`\n======================================`);
console.log(`  공백기 기사 수집 (Google News RSS)`);
console.log(`  구간: ${gap.name} (gap ${GAP_ID})`);
console.log(`  ${DRY_RUN ? "DRY RUN" : "실제 실행"} | 제한: ${LIMIT}건`);
console.log(`======================================\n`);

// ─── Google News RSS 검색 ───
async function searchGoogleNews(keyword, afterDate, beforeDate) {
  const q = encodeURIComponent(`${keyword} after:${afterDate} before:${beforeDate}`);
  const url = `https://news.google.com/rss/search?q=${q}&hl=ko&gl=KR&ceid=KR:ko`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return [];
    const xml = await r.text();
    const items = [];
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
      const block = m[1];
      const title = (block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "")
        .replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
      const gnLink = block.match(/<link>\s*(https?[^\s<]+)/i)?.[1]?.trim() || "";
      const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() || "";
      const source = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1]?.trim() || "";
      if (!title || !gnLink) continue;
      items.push({ title, gnLink, pubDate, source });
    }
    return items;
  } catch { return []; }
}

// ─── Puppeteer로 Google News URL → 원본 URL 해석 ───
async function resolveGoogleNewsUrl(page, gnLink) {
  try {
    await page.goto(gnLink, { waitUntil: "domcontentloaded", timeout: 15000 });
    // JS 리다이렉트 대기
    await new Promise(r => setTimeout(r, 3000));
    const finalUrl = page.url();
    if (!finalUrl.includes("google.com")) return finalUrl;
    // 추가 대기
    await new Promise(r => setTimeout(r, 3000));
    const finalUrl2 = page.url();
    return finalUrl2.includes("google.com") ? null : finalUrl2;
  } catch { return null; }
}

// ─── 원문 기사 크롤링 (범용 본문 추출) ───
async function fetchArticleContent(url) {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    const html = await r.text();
    if (html.length < 500) return null;

    // 제목
    const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i)?.[1] ||
      html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:title"/i)?.[1];
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]*>/g, "").trim();
    const title = ogTitle || h1 || "";

    // 날짜
    const dateMatch = html.match(/(\d{4}-\d{2}-\d{2})/) || html.match(/(\d{4}\.\d{2}\.\d{2})/);
    let date = dateMatch?.[1] || "";
    date = date.replace(/\./g, "-");

    // 본문 패턴
    const bodyPatterns = [
      /id="dic_area"[^>]*>([\s\S]*?)<\/div>/i,
      /id="newsct_article"[^>]*>([\s\S]*?)<\/div>/i,
      /class="[^"]*article[_-]?body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /class="[^"]*article[_-]?content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /class="[^"]*article[_-]?text[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /class="[^"]*news[_-]?content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /class="[^"]*view[_-]?content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /class="[^"]*view[_-]?cont[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /class="[^"]*view[_-]?text[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /class="[^"]*post[_-]?content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /class="[^"]*entry[_-]?content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /class="[^"]*detail[_-]?body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /class="[^"]*newsViewArea[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /class="[^"]*user-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<article[^>]*>([\s\S]*?)<\/article>/i,
    ];

    let bodyHtml = "";
    for (const pattern of bodyPatterns) {
      const m = html.match(pattern);
      if (m && m[1]) {
        const text = m[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        if (text.length > 100) { bodyHtml = m[1]; break; }
      }
    }

    if (!bodyHtml) {
      const ogDesc = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i)?.[1] ||
        html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i)?.[1];
      if (ogDesc && ogDesc.length > 50) bodyHtml = `<p>${ogDesc}</p>`;
    }

    bodyHtml = bodyHtml
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "");

    const bodyText = bodyHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

    // 이미지
    const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i)?.[1] ||
      html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/i)?.[1];
    const bodyImages = [...(bodyHtml || "").matchAll(/<img[^>]+src="([^"]+)"[^>]*>/gi)]
      .map(m => m[1])
      .filter(u => !u.includes("icon") && !u.includes("logo") && !u.includes("btn") &&
        !u.includes("ad_") && !u.includes("common/") && !u.includes("pixel") && u.length > 10);
    const images = [...new Set([...(ogImage ? [ogImage] : []), ...bodyImages])];

    return { title, date, bodyHtml, bodyText, images, sourceUrl: r.url || url };
  } catch { return null; }
}

// ─── Gemini AI 편집 ───
async function aiEdit(title, bodyText, imgTags) {
  if (!GEMINI_KEY) return null;

  const prompt = `다음 뉴스 원문을 컬처피플 뉴스 기사로 편집해주세요.

규칙:
1. 제목: 원문 의미 유지, 60자 이내, 핵심을 담아 간결하게
2. 본문: HTML <p> 태그 사용, 4-6개 문단, 각 2-4문장
3. 원문 사실만 작성 (창작/추측 금지), 객관적 어조
4. 광고, 관련 링크, 기자 정보, SNS 버튼 등 불필요 내용 제거
5. 원문 이미지 태그가 있으면 본문에 포함 (삭제 금지)
6. 요약: 2문장, 80자 이내
7. 태그: 3-5개 핵심 키워드, 쉼표 구분
8. category: "엔터", "스포츠", "라이프", "테크·모빌리티", "비즈", "공공" 중 하나

JSON 형식으로만 응답 (마크다운 코드블록 없이):
{"title":"...","body":"<p>...</p>","summary":"...","tags":"...","category":"..."}

원문 제목: ${title}

원문:
${bodyText.substring(0, 3000)}

${imgTags.length > 0 ? "원문 이미지:\n" + imgTags.join("\n") : ""}`;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 2048 },
        }),
        signal: AbortSignal.timeout(45000),
      }
    );
    if (!r.ok) return null;
    const data = await r.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!parsed.title || !parsed.body) return null;
    return parsed;
  } catch { return null; }
}

// ─── 이미지 Supabase 업로드 ───
async function uploadToSupabase(imgUrl) {
  try {
    if (imgUrl.startsWith("//")) imgUrl = "https:" + imgUrl;
    if (!imgUrl.startsWith("http")) return null;
    if (imgUrl.includes("supabase")) return imgUrl;

    const imgResp = await fetch(imgUrl, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*,*/*;q=0.8", Referer: new URL(imgUrl).origin },
      redirect: "follow", signal: AbortSignal.timeout(15000),
    });
    if (!imgResp.ok) return null;
    const ct = imgResp.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) return null;
    const buffer = await imgResp.arrayBuffer();
    if (buffer.byteLength < 500 || buffer.byteLength > 10 * 1024 * 1024) return null;
    const ext = ct.includes("png") ? "png" : ct.includes("gif") ? "gif" : ct.includes("webp") ? "webp" : "jpg";
    const path = `${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, "0")}/gap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const uploadResp = await fetch(`${SUPABASE_URL}/storage/v1/object/images/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": ct, "x-upsert": "true" },
      body: Buffer.from(buffer),
    });
    if (!uploadResp.ok) return null;
    return `${SUPABASE_URL}/storage/v1/object/public/images/${path}`;
  } catch { return null; }
}

// ─── 중복 체크 ───
async function isDuplicate(title) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?title=eq.${encodeURIComponent(title)}&select=id&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const data = await r.json();
  if (Array.isArray(data) && data.length > 0) return true;

  const shortTitle = title.substring(0, 15).replace(/[%_]/g, "");
  if (shortTitle.length < 5) return false;
  const r2 = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?title=like.*${encodeURIComponent(shortTitle)}*&select=id&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const data2 = await r2.json();
  return Array.isArray(data2) && data2.length > 0;
}

// ─── 기사번호 ───
async function getNextNo() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_next_article_no`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!r.ok) throw new Error(`get_next_article_no failed: ${r.status}`);
  return await r.json();
}

// ─── 기사 저장 ───
async function saveArticle(article) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/articles`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(article),
  });
  if (!resp.ok) throw new Error(`Save failed: ${resp.status} ${await resp.text()}`);
}

// ─── 금칙어 필터 ───
const BLOCKED_KEYWORDS = ["전대통령"];
function hasBlockedKeyword(text) {
  return BLOCKED_KEYWORDS.some(kw => text.includes(kw));
}

// ─── 메인 ───
async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("SUPABASE_URL 또는 SERVICE_KEY가 설정되지 않았습니다.");
    process.exit(1);
  }

  // Puppeteer 브라우저 관리
  console.log("Puppeteer 브라우저 시작...");
  let browser = null;
  let page = null;
  let pageUseCount = 0;

  async function ensureBrowser() {
    if (!browser || !browser.connected) {
      try { if (browser) await browser.close(); } catch {}
      browser = await puppeteer.launch({ headless: true, protocolTimeout: 60000 });
    }
    if (!page || page.isClosed()) {
      page = await browser.newPage();
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
      pageUseCount = 0;
    }
    return page;
  }

  async function resetBrowser() {
    try { if (browser) await browser.close(); } catch {}
    browser = await puppeteer.launch({ headless: true, protocolTimeout: 60000 });
    page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    pageUseCount = 0;
    return page;
  }

  async function getPage() {
    pageUseCount++;
    if (pageUseCount > 8) {
      return await resetBrowser();
    }
    return await ensureBrowser();
  }

  await ensureBrowser();

  let saved = 0, skipped = 0, failed = 0, resolved = 0;

  // 공백 구간을 월 단위로 분할
  const startDate = new Date(gap.start);
  const endDate = new Date(gap.end);
  const months = [];
  const cur = new Date(startDate);
  while (cur <= endDate) {
    const monthStart = cur.toISOString().slice(0, 10);
    cur.setMonth(cur.getMonth() + 1);
    const monthEnd = cur > endDate ? gap.end : new Date(cur.getTime() - 86400000).toISOString().slice(0, 10);
    months.push({ start: monthStart, end: monthEnd });
  }

  console.log(`${months.length}개월 구간, ${SEARCH_KEYWORDS.length}개 키워드\n`);

  const perMonth = Math.max(2, Math.ceil(LIMIT / months.length));

  for (const month of months) {
    if (saved >= LIMIT) break;
    let monthSaved = 0;

    console.log(`\n--- ${month.start} ~ ${month.end} ---`);

    // 키워드 랜덤 순서
    const shuffledKw = [...SEARCH_KEYWORDS].sort(() => Math.random() - 0.5);

    for (const keyword of shuffledKw) {
      if (saved >= LIMIT || monthSaved >= perMonth) break;

      const items = await searchGoogleNews(keyword, month.start, month.end);
      if (items.length === 0) continue;

      // 랜덤 선택
      const shuffled = items.sort(() => Math.random() - 0.5);

      for (const item of shuffled.slice(0, 3)) {
        if (saved >= LIMIT || monthSaved >= perMonth) break;

        try {
          // 금칙어
          if (hasBlockedKeyword(item.title)) { skipped++; continue; }

          // 중복
          const cleanTitle = item.title.replace(/ - .*$/, "").trim();
          if (await isDuplicate(cleanTitle)) { skipped++; continue; }

          const shortTitle = cleanTitle.substring(0, 40);
          process.stdout.write(`  ${shortTitle}... `);

          // Puppeteer로 URL 해석
          let originalUrl = null;
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const p = attempt === 0 ? await getPage() : await resetBrowser();
              originalUrl = await resolveGoogleNewsUrl(p, item.gnLink);
              if (originalUrl) break;
            } catch {
              if (attempt === 0) process.stdout.write("(재시도) ");
            }
          }
          if (!originalUrl) {
            console.log("URL 해석 실패");
            failed++;
            continue;
          }
          resolved++;

          // 원문 크롤링
          const content = await fetchArticleContent(originalUrl);
          if (!content || content.bodyText.length < 100) {
            console.log("본문 부족");
            failed++;
            continue;
          }

          // 금칙어 (본문)
          if (hasBlockedKeyword(content.bodyText)) {
            console.log("금칙어");
            skipped++;
            continue;
          }

          // 이미지 없으면 스킵
          if (content.images.length === 0) {
            console.log("이미지 없음");
            skipped++;
            continue;
          }

          // 날짜 결정
          let articleDate = content.date;
          if (!articleDate || articleDate.length < 10) {
            try {
              const pd = new Date(item.pubDate);
              if (!isNaN(pd.getTime())) articleDate = pd.toISOString().slice(0, 10);
            } catch {}
          }
          if (!articleDate || articleDate.length < 10) {
            const mid = new Date((new Date(month.start).getTime() + new Date(month.end).getTime()) / 2);
            articleDate = mid.toISOString().slice(0, 10);
          }

          if (DRY_RUN) {
            console.log(`[DRY] ${articleDate} | ${item.source}`);
            saved++;
            monthSaved++;
            continue;
          }

          // AI 편집
          const imgTags = content.images.slice(0, 3).map(u => `<img src="${u}" alt="">`);
          const edited = await aiEdit(content.title || cleanTitle, content.bodyText, imgTags);

          let finalTitle = cleanTitle;
          let finalBody = "";
          let finalSummary = "";
          let finalTags = "";
          let finalCategory = "공공";

          if (edited) {
            finalTitle = edited.title || cleanTitle;
            finalBody = edited.body || "";
            finalSummary = edited.summary || "";
            finalTags = edited.tags || "";
            const VALID = ["엔터", "스포츠", "라이프", "테크·모빌리티", "비즈", "공공"];
            finalCategory = VALID.includes(edited.category) ? edited.category : "공공";
          } else {
            finalBody = content.bodyHtml || `<p>${content.bodyText.substring(0, 2000)}</p>`;
            finalSummary = content.bodyText.substring(0, 160);
          }

          // 대표 이미지 업로드
          let thumbnail = "";
          if (content.images.length > 0) {
            const uploaded = await uploadToSupabase(content.images[0]);
            if (uploaded) {
              thumbnail = uploaded;
              if (!/<img[^>]+src=/i.test(finalBody)) {
                const imgHtml = `<figure style="margin:1.5em 0;text-align:center;"><img src="${uploaded}" alt="${finalTitle.replace(/"/g, "&quot;")}" style="max-width:100%;height:auto;border-radius:6px;" /></figure>`;
                let pCount = 0, insertIdx = -1, pos = 0;
                while (pos < finalBody.length) {
                  const found = finalBody.indexOf("</p>", pos);
                  if (found === -1) break;
                  pCount++;
                  if (pCount === 2) { insertIdx = found + 4; break; }
                  pos = found + 4;
                }
                finalBody = insertIdx > -1
                  ? finalBody.slice(0, insertIdx) + imgHtml + finalBody.slice(insertIdx)
                  : finalBody + imgHtml;
              }
            }
          }

          // 본문 내 외부 이미지 Supabase 이관
          const bodyImgs = [...finalBody.matchAll(/<img([^>]*)src="(https?:\/\/[^"]+)"([^>]*)>/gi)];
          for (const bm of bodyImgs) {
            if (bm[2].includes("supabase")) continue;
            const uploaded = await uploadToSupabase(bm[2]);
            if (uploaded) finalBody = finalBody.replace(bm[2], uploaded);
          }

          // 이미지 최종 확인
          if (!thumbnail && !/<img[^>]+src=/i.test(finalBody)) {
            console.log("이미지 업로드 실패");
            skipped++;
            continue;
          }

          // 저장
          const no = await getNextNo();
          await saveArticle({
            id: randomUUID(),
            no,
            title: finalTitle,
            body: finalBody,
            category: finalCategory,
            date: articleDate,
            status: "게시",
            author: AUTHOR,
            author_email: "",
            thumbnail,
            tags: finalTags,
            summary: finalSummary,
            views: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          console.log(`#${no} ${finalCategory} | ${articleDate}`);
          saved++;
          monthSaved++;

          // rate limit
          await new Promise(r => setTimeout(r, 1500));
        } catch (e) {
          console.log(`오류: ${e.message?.substring(0, 60)}`);
          failed++;
          // 브라우저 오류일 수 있으므로 재시작
          try { await resetBrowser(); } catch {}
        }
      }

      await new Promise(r => setTimeout(r, 300));
    }
  }

  try { if (browser) await browser.close(); } catch {}

  console.log(`\n${"=".repeat(50)}`);
  console.log(`결과: 저장 ${saved}건 | 스킵 ${skipped}건 | 실패 ${failed}건 | URL해석 ${resolved}건`);
}

main().catch(e => { console.error(e); process.exit(1); });
