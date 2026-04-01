#!/usr/bin/env node
/**
 * 선택된 기사 URL을 기반으로 AI 재창조 후 Supabase에 즉시 게시
 * 사용법: node scripts/publish-selected.mjs
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
let   GEMINI_KEY   = process.env.GEMINI_API_KEY || "";

const c = { green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", gray: "\x1b[90m", reset: "\x1b[0m", bold: "\x1b[1m" };

if (!SUPABASE_URL || !SERVICE_KEY) { console.error("❌ Supabase 환경변수 미설정"); process.exit(1); }

// ── 선택된 기사 10건 ───────────────────────────────────────────
const SELECTED = [
  { title: "법원, 정진상 보석 조건 완화… \"재판 영향 미칠 행동 금지\"",                                                              url: "https://www.chosun.com/national/court_law/2026/03/06/FTCK5WQNHNBUXGCWNLBP7OMVUE/",            category: "사회"   },
  { title: "\"선수들 탓하지 마세요. 제 잘못 입니다\" 충격 눈물, 굴욕적 콜드패 화살 한국 향하나",                                    url: "https://www.chosun.com/sports/world-baseball/2026/03/07/GVSDONJVGE3TQYLFMI3DQNBYGE/",          category: "스포츠" },
  { title: "'삼성 천만다행' 충격적 팔꿈치 도미노 부상, 선발 1명 남을뻔 했다",                                                        url: "https://www.chosun.com/sports/baseball/2026/03/07/GY2TQM3EGQ3TSYZVGI2DSNTGGM/",               category: "스포츠" },
  { title: "'감동' 이래서 다저스가 최고인가, 노숙자 전락한 선수를 8년째 챙기다니…\"보험 혜택 끝났지만 계속 돕는다\"",               url: "https://www.chosun.com/sports/world-baseball/2026/03/07/MM4TIMZXGRSTGMBUGJRGMNZSG4/",           category: "스포츠" },
  { title: "강상준, 아내 이소나眞소감 \"꼭 한 번 보고 싶었던 장면\"",                                                                url: "https://www.chosun.com/entertainments/broadcast/2026/03/07/HAZTEMLFMQYTEZDGHA2TGMRRMY/",     category: "연예"   },
  { title: "기름값 2000원 육박, 李 경고에도 연일 급등",                                                                              url: "https://www.chosun.com/economy/industry-company/2026/03/07/EUMG5MUGJ5CB7CJJIN53OPIVJE/",     category: "경제"   },
  { title: "지중해 너머까지… 美·이란 전쟁, 20국 얽혀들었다",                                                                        url: "https://www.chosun.com/international/international_general/2026/03/07/LIUK76WPIJD6ZDN4IVEQGFEQSI/", category: "국제" },
  { title: "52조 규모 기업 M&A, 이제 최종 결정권자는 노조",                                                                          url: "https://www.chosun.com/national/labor/2026/03/07/5NLP7OSLLBGTHADGTTMP563NYY/",                category: "경제"   },
  { title: "조현 \"북한군 포로, 北·러 송환 없을 것\"",                                                                               url: "https://www.chosun.com/politics/politics_general/2026/03/07/NND7L4AA4FG4PMLDF62ZD2MSZM/",    category: "정치"   },
  { title: "[바로잡습니다] 2월 27일 자 B7면 '트럼프 시대만 버티면 된다고?… 세계 경찰 美는 더 이상 없다' 기사에서 외",              url: "https://www.chosun.com/economy/economy_general/2026/03/07/MYUZBSSOVJD3NLTWMM3AOWULXA/",         category: "국제"   },
];

// temperature 배열 (각 기사마다 다르게 → 텍스트 다양성 확보)
const TEMPERATURES = [0.85, 0.75, 0.90, 0.80, 0.70, 0.88, 0.78, 0.92, 0.72, 0.82];

// ── Supabase 설정 읽기 ─────────────────────────────────────────
async function getSupabaseSetting(key) {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/site_settings?key=eq.${encodeURIComponent(key)}&select=value`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!resp.ok) return null;
  const rows = await resp.json();
  return rows?.[0]?.value ?? null;
}

// ── RSS 수집 (Chosun RSS에서 description 추출) ─────────────────
async function fetchRssDescriptions() {
  const map = new Map(); // url → description
  const rssUrl = "https://www.chosun.com/arc/outboundfeeds/rss/?outputType=xml";
  try {
    const resp = await fetch(rssUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CulturepeopleBot/1.0)", Accept: "application/rss+xml, */*" },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return map;
    const xml = await resp.text();
    const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = itemRegex.exec(xml)) !== null) {
      const block = m[1];
      const link  = (block.match(/<link>([\s\S]*?)<\/link>/i))?.[1]?.trim() ?? "";
      const desc  = (
        block.match(/<description[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i) ??
        block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)
      )?.[1]?.replace(/<[^>]+>/g, "").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim().slice(0, 400) ?? "";
      if (link) map.set(link, desc);
    }
  } catch (e) {
    console.warn(`  ${c.yellow}RSS 수집 실패:${c.reset}`, e.message);
  }
  return map;
}

// ── 원문 직접 수집 시도 ───────────────────────────────────────
async function fetchArticleText(url) {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "ko-KR,ko;q=0.9",
        "Referer": "https://www.chosun.com/",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    // 본문 추출: article 태그 또는 class 기반
    const bodyMatch =
      html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ??
      html.match(/class="[^"]*article[_-]?body[^"]*"[^>]*>([\s\S]*?)<\/(?:div|section)>/i);
    if (!bodyMatch) return null;
    const text = bodyMatch[1]
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 3000);
    return text.length > 100 ? text : null;
  } catch { return null; }
}

// ── Pexels 이미지 검색 (썸네일·본문용 2장) ────────────────────
async function searchPexelsImages(title) {
  const empty = { thumbnail: null, bodyImage: null };
  if (!PEXELS_KEY) return empty;
  try {
    let query = title;
    if (GEMINI_KEY) {
      const gr = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `다음 뉴스 제목을 Pexels 이미지 검색용 영어 키워드 1~3개로 변환 (쉼표 구분, 설명 없이):\n${title}` }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 50 },
          }),
          signal: AbortSignal.timeout(8000),
        }
      );
      if (gr.ok) {
        const gd = await gr.json();
        const kw = gd.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (kw && kw.length < 100) query = kw;
      }
    }
    // per_page=2 → photo[0]=대표이미지, photo[1]=본문이미지 (서로 다른 이미지)
    const pr = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=2&orientation=landscape`,
      { headers: { Authorization: PEXELS_KEY }, signal: AbortSignal.timeout(10000) }
    );
    if (!pr.ok) return empty;
    const pd = await pr.json();
    const photos = pd.photos ?? [];
    const pick = (p) => p?.src?.large2x ?? p?.src?.large ?? null;
    return {
      thumbnail: pick(photos[0]),
      bodyImage: pick(photos[1]),  // 썸네일과 다른 이미지
    };
  } catch { return empty; }
}

async function downloadAndUpload(url) {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*" },
      signal: AbortSignal.timeout(20000),
      redirect: "follow",
    });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > 10 * 1024 * 1024) return null;
    let mime = r.headers.get("content-type")?.split(";")[0].trim() ?? "image/jpeg";
    const ALLOWED = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!ALLOWED.includes(mime)) mime = "image/jpeg";
    const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };
    const ext = EXT[mime] ?? "jpg";
    const now = new Date();
    const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/images/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": mime, "x-upsert": "true" },
      body: buf,
    });
    if (!up.ok) return null;
    return `${SUPABASE_URL}/storage/v1/object/public/images/${path}`;
  } catch { return null; }
}

function injectImageIntoBody(body, imageUrl, altText) {
  if (!imageUrl || body.includes("<img")) return body;
  const imgHtml = `<figure style="margin:1.5em 0;text-align:center;"><img src="${imageUrl}" alt="${altText.replace(/"/g, "&quot;")}" style="max-width:100%;height:auto;border-radius:6px;" /></figure>`;
  // 2번째 </p> 뒤에 삽입 (대표이미지와 구분, 첫 문단 다음이 아닌 두번째 문단 다음)
  let count = 0, idx = -1, pos = 0;
  while (pos < body.length) {
    const found = body.indexOf("</p>", pos);
    if (found === -1) break;
    count++;
    if (count === 2) { idx = found + 4; break; }
    pos = found + 4;
  }
  if (idx === -1) {
    const firstP = body.indexOf("</p>");
    return firstP === -1 ? body + imgHtml : body.slice(0, firstP + 4) + imgHtml + body.slice(firstP + 4);
  }
  return body.slice(0, idx) + imgHtml + body.slice(idx);
}

// ── AI 재창조 프롬프트 ─────────────────────────────────────────
const RECREATE_PROMPT = `당신은 컬처피플 뉴스 AI 에디터입니다. 아래 뉴스 원문을 참고하여 완전히 독자적인 새 기사를 재창조하세요.

핵심 지침:
1. 원문 문장을 절대 그대로 복사하지 말 것 — 완전히 새로운 표현과 구성으로 작성
2. 핵심 사실(날짜·인물·수치·사건 경위)은 정확히 유지
3. 제목: 원문 의미를 살리되 새로운 각도에서 60자 이내로
4. 본문: HTML (<p> 태그), 4~6개 문단, 각 문단 2~4문장, 독자 친화적·흥미로운 전개
5. 도입부는 독자의 호기심을 자극하는 문장으로 시작
6. 광고·관련기사 링크·기자정보·SNS 안내 등 불필요 요소 완전 제거
7. 요약: 기사 핵심을 새로운 표현으로 2문장 이내 (80자 이내)
8. 태그: 핵심 키워드 3~5개 쉼표 구분

반드시 아래 JSON 형식으로만 응답하세요 (마크다운 코드블록 없이):
{"title":"...","summary":"...","body":"<p>...</p><p>...</p>","tags":"태그1,태그2,태그3"}`;

async function recreateWithGemini(title, content, temperature = 0.8) {
  const inputText = `원문 제목: ${title}\n\n원문 내용:\n${content}`;
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${RECREATE_PROMPT}\n\n---\n\n${inputText}` }] }],
        generationConfig: { temperature, maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(45000),
    }
  );
  if (!resp.ok) {
    const err = await resp.text().catch(() => resp.statusText);
    throw new Error(`Gemini ${resp.status}: ${err}`);
  }
  const data = await resp.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  // JSON 추출
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("JSON 파싱 실패: " + raw.slice(0, 200));
  const obj = JSON.parse(text.slice(start, end + 1));
  if (!obj.title || !obj.body) throw new Error("필드 누락");
  return {
    title:   String(obj.title).slice(0, 200),
    summary: String(obj.summary || "").slice(0, 300),
    body:    String(obj.body),
    tags:    String(obj.tags || ""),
  };
}

// ── Supabase 기사 저장 ─────────────────────────────────────────
async function saveArticle(article) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/articles`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(article),
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => resp.statusText);
    throw new Error(`Supabase ${resp.status}: ${err}`);
  }
  const rows = await resp.json();
  return rows?.[0]?.id ?? article.id;
}

// ── 다음 기사 번호 채번 ────────────────────────────────────────
async function getNextNo() {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/site_settings?key=eq.cp-article-counter&select=value`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  let current = 0;
  if (resp.ok) {
    const rows = await resp.json();
    current = rows?.[0]?.value ?? 0;
  }
  const next = current + 1;
  // upsert
  await fetch(`${SUPABASE_URL}/rest/v1/site_settings`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ key: "cp-article-counter", value: next }),
  });
  return next;
}

// ── 히스토리 업데이트 (중복 방지) ─────────────────────────────
async function appendHistory(run) {
  const existing = await getSupabaseSetting("cp-auto-news-history") ?? [];
  const newHistory = [run, ...existing].slice(0, 50);
  await fetch(`${SUPABASE_URL}/rest/v1/site_settings`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ key: "cp-auto-news-history", value: newHistory }),
  });
}

// ── 메인 ──────────────────────────────────────────────────────
async function main() {
  console.log(`\n${c.bold}선택 기사 AI 재창조 발행${c.reset}`);
  console.log("─".repeat(60));

  // Gemini API 키 확인
  if (!GEMINI_KEY) {
    console.log("  Gemini API 키 Supabase에서 조회 중...");
    const aiSettings = await getSupabaseSetting("cp-ai-settings");
    GEMINI_KEY = aiSettings?.geminiApiKey ?? "";
  }
  if (!GEMINI_KEY) {
    console.error(`${c.red}❌ Gemini API 키 없음. 어드민 > AI 설정에서 등록하거나 GEMINI_API_KEY 환경변수 설정 필요${c.reset}`);
    process.exit(1);
  }
  console.log(`  ${c.green}✓${c.reset} Gemini API 키 확인됨`);

  // RSS 설명 수집 (원문 수집 실패 시 폴백)
  console.log("  RSS 설명 수집 중 (폴백용)...");
  const rssDescriptions = await fetchRssDescriptions();
  console.log(`  ${c.green}✓${c.reset} RSS ${rssDescriptions.size}건 수집\n`);

  const runArticles = [];
  let published = 0, failed = 0;

  for (let i = 0; i < SELECTED.length; i++) {
    const { title, url, category } = SELECTED[i];
    const temp = TEMPERATURES[i];
    const num = i + 1;
    process.stdout.write(`  [${num}/${SELECTED.length}] ${title.slice(0, 50).padEnd(50)} `);

    // 1. 원문 직접 수집 시도
    let content = await fetchArticleText(url);
    let contentSource = "직접수집";

    // 2. 실패 시 RSS 설명 폴백
    if (!content) {
      content = rssDescriptions.get(url) ?? title;
      contentSource = content === title ? "제목만" : "RSS";
    }

    // 3. Gemini로 재창조
    let recreated;
    try {
      recreated = await recreateWithGemini(title, content, temp);
    } catch (e) {
      console.log(`${c.red}AI 실패${c.reset} — ${e.message}`);
      failed++;
      runArticles.push({ title, sourceUrl: url, status: "fail", error: e.message });
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }

    // 4. Pexels 이미지 2장 검색 + Supabase 업로드
    // photo[0] → 대표이미지(thumbnail), photo[1] → 본문 삽입 (서로 다른 이미지)
    let thumbnail = "";
    let bodyImageUrl = "";
    const pexels = await searchPexelsImages(recreated.title);
    if (pexels.thumbnail) {
      const up = await downloadAndUpload(pexels.thumbnail);
      if (up) thumbnail = up;
    }
    if (pexels.bodyImage) {
      const up = await downloadAndUpload(pexels.bodyImage);
      if (up) bodyImageUrl = up;
    }
    const finalBody = bodyImageUrl
      ? injectImageIntoBody(recreated.body, bodyImageUrl, recreated.title)
      : recreated.body;

    // 5. 기사 번호 채번 & 저장
    try {
      const no = await getNextNo();
      const id = crypto.randomUUID();
      const today = new Date().toISOString().slice(0, 10);
      await saveArticle({
        id,
        no,
        title: recreated.title,
        category,
        date: today,
        status: "게시",
        views: 0,
        body: finalBody,
        thumbnail: thumbnail || undefined,
        tags: recreated.tags || undefined,
        summary: recreated.summary || undefined,
        source_url: url,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      const imgStatus = thumbnail ? `${c.green}이미지✓${c.reset}` : `${c.yellow}이미지없음${c.reset}`;
      console.log(`${c.green}게시✓${c.reset} no.${no} ${imgStatus} (${contentSource}, temp=${temp})`);
      console.log(`         → ${c.gray}${recreated.title.slice(0, 60)}${c.reset}`);
      published++;
      runArticles.push({ title: recreated.title, sourceUrl: url, status: "ok", articleId: id });
    } catch (e) {
      console.log(`${c.red}저장 실패${c.reset} — ${e.message}`);
      failed++;
      runArticles.push({ title: recreated.title, sourceUrl: url, status: "fail", error: e.message });
    }

    // rate limit 방어
    if (i < SELECTED.length - 1) await new Promise(r => setTimeout(r, 600));
  }

  // 히스토리 기록
  const run = {
    id: `run_${Date.now()}`,
    startedAt: new Date(Date.now() - SELECTED.length * 2000).toISOString(),
    completedAt: new Date().toISOString(),
    source: "manual",
    articlesPublished: published,
    articlesSkipped: 0,
    articlesFailed: failed,
    articles: runArticles,
  };
  await appendHistory(run);

  console.log(`\n${"─".repeat(60)}`);
  console.log(`${c.bold}완료${c.reset}  게시 ${c.green}${published}건${c.reset}  실패 ${failed > 0 ? c.red : ""}${failed}건${failed > 0 ? c.reset : ""}`);
  console.log(`\n  ${c.gray}https://culturepeople.co.kr${c.reset}`);
  console.log();
}

main().catch(e => { console.error(e); process.exit(1); });
