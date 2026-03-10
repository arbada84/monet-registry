#!/usr/bin/env node
/**
 * 네이버 블로그(curpy) → 컬처피플 기사 마이그레이션 스크립트
 *
 * 조건:
 * - 이미지가 없거나 조회 불가능한 이미지만 있는 포스트는 건너뜀
 * - 등록일은 블로그 작성 날짜 기준
 * - 이미지는 Supabase Storage로 재업로드
 *
 * Usage: node scripts/blog-migrate.mjs [--dry-run] [--limit N] [--page N]
 */

import { readFileSync } from "fs";
import { randomUUID } from "crypto";

// ─── 환경변수 로드 ───
let env = {};
try {
  const raw = readFileSync(".env.production.local", "utf-8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m) env[m[1]] = m[2];
  }
} catch { /* ignore */ }

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;
const BLOG_ID = "curpy";
const AUTHOR = "박영래";
const AUTHOR_EMAIL = "youngrae_park@culturepeople.co.kr";
const CATEGORY = "문화"; // 기본 카테고리

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = parseInt(args.find((a, i) => args[i - 1] === "--limit") || "9999");
const START_PAGE = parseInt(args.find((a, i) => args[i - 1] === "--page") || "1");

console.log(`\n📋 네이버 블로그 → 컬처피플 마이그레이션`);
console.log(`   블로그: ${BLOG_ID} | 작성자: ${AUTHOR} | 카테고리: ${CATEGORY}`);
console.log(`   ${DRY_RUN ? "🔍 DRY RUN (실제 저장 안 함)" : "🚀 실제 실행"}`);
console.log(`   Supabase: ${SUPABASE_URL}\n`);

// ─── 글 목록 가져오기 ───
async function getPostList(page) {
  const url = `https://blog.naver.com/PostTitleListAsync.naver?blogId=${BLOG_ID}&viewdate=&currentPage=${page}&categoryNo=0&parentCategoryNo=0&countPerPage=30`;
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", Referer: `https://blog.naver.com/${BLOG_ID}` },
  });
  const text = await r.text();
  const logNos = [...text.matchAll(/"logNo"\s*:\s*"(\d+)"/g)].map((m) => m[1]);
  const titles = [...text.matchAll(/"title"\s*:\s*"([^"]*)"/g)].map((m) => decodeURIComponent(m[1].replace(/\+/g, " ")));
  const dates = [...text.matchAll(/"addDate"\s*:\s*"([^"]*)"/g)].map((m) => m[1]);
  return logNos.map((no, i) => ({ logNo: no, title: titles[i] || "", date: dates[i] || "" }));
}

// ─── 개별 포스트 크롤링 ───
async function fetchPost(logNo) {
  const url = `https://blog.naver.com/PostView.naver?blogId=${BLOG_ID}&logNo=${logNo}&redirect=Dlog&widgetTypeCall=true&noTrackingCode=true&directAccess=false`;
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", Referer: `https://blog.naver.com/${BLOG_ID}` },
  });
  const html = await r.text();

  // Title (더 정확하게)
  const title =
    html.match(/class="se-title-text[^"]*"[^>]*>([\s\S]*?)<\/span>/)?.[1]?.replace(/<[^>]*>/g, "").trim() ||
    html.match(/<title>(.*?)<\/title>/)?.[1]?.replace(/ : 네이버 블로그$/, "").trim() ||
    "";

  // Date
  const rawDate =
    html.match(/class="se_publishDate[^"]*"[^>]*>(.*?)<\//)?.[1]?.trim() ||
    html.match(/"publishDateText"\s*:\s*"([^"]*)"/)?.[1] ||
    html.match(/class="date"[^>]*>(.*?)<\//)?.[1]?.trim() ||
    html.match(/class="blog_date[^"]*"[^>]*>(.*?)<\//)?.[1]?.trim() ||
    "";

  // Parse Korean date "2024. 10. 2. 11:15" → "2024-10-02"
  const dateMatch = rawDate.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  const date = dateMatch ? `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}` : "";

  // Body HTML (se-main-container)
  let bodyHtml = "";
  const containerMatch = html.match(/class="se-main-container"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*(?:<div class="(?:post-btn|comment_area|blog2_series|post_footer))/);
  if (containerMatch) {
    bodyHtml = containerMatch[1];
  } else {
    // 대안: se-component들 추출
    const components = [...html.matchAll(/<div class="se-component[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div class="se-component|$)/g)];
    bodyHtml = components.map((m) => m[0]).join("\n");
  }

  // 본문 내 이미지 추출 (실제 콘텐츠 이미지만)
  const imgMatches = [...bodyHtml.matchAll(/(?:data-lazy-src|src)="(https?:\/\/[^"]+)"/gi)];
  const contentImages = imgMatches
    .map((m) => m[1])
    .filter((u) => {
      if (u.includes("ssl.pstatic.net/static")) return false;
      if (u.includes("blogimgs.pstatic.net/nblog")) return false;
      if (u.includes("dthumb-phinf")) return false;
      if (u.includes("profile")) return false;
      if (u.includes(".gif") && u.includes("static")) return false;
      if (u.includes("spc.gif")) return false;
      if (u.includes("btn_")) return false;
      if (!u.match(/\.(jpg|jpeg|png|gif|webp)/i)) return false;
      return true;
    });
  const uniqueImages = [...new Set(contentImages)];

  // Clean body HTML: 네이버 클래스 제거하고 기본 HTML로 정리
  let cleanBody = bodyHtml
    // 이미지: data-lazy-src → src로 변환
    .replace(/data-lazy-src="([^"]*)"/g, 'src="$1"')
    // 불필요한 네이버 속성 제거
    .replace(/\s+class="[^"]*"/g, "")
    .replace(/\s+id="[^"]*"/g, "")
    .replace(/\s+data-[a-z-]+="[^"]*"/g, "")
    .replace(/\s+style="[^"]*"/g, "")
    // 빈 div/span 제거
    .replace(/<(?:div|span)>\s*<\/(?:div|span)>/g, "")
    .replace(/<(?:div|span)>\s*<\/(?:div|span)>/g, "")
    // div → p 변환 (텍스트 내용이 있는 경우)
    .replace(/<div>([\s\S]*?)<\/div>/g, (match, inner) => {
      const text = inner.replace(/<[^>]*>/g, "").trim();
      if (!text && !inner.includes("<img")) return "";
      if (inner.includes("<img")) return inner;
      return `<p>${inner.trim()}</p>`;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { title, date, images: uniqueImages, bodyHtml: cleanBody, logNo };
}

// ─── 이미지 유효성 검사 (HEAD 요청) ───
async function isImageAccessible(imgUrl) {
  try {
    const r = await fetch(imgUrl, {
      method: "HEAD",
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    const ct = r.headers.get("content-type") || "";
    return r.ok && ct.startsWith("image/");
  } catch {
    return false;
  }
}

// ─── 이미지 Supabase 업로드 ───
async function uploadToSupabase(imgUrl) {
  try {
    const imgResp = await fetch(imgUrl, {
      headers: { "User-Agent": "Mozilla/5.0", Referer: `https://blog.naver.com/${BLOG_ID}` },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (!imgResp.ok) return null;

    const ct = imgResp.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) return null;

    const buffer = await imgResp.arrayBuffer();
    if (buffer.byteLength < 1000) return null; // 1KB 미만은 스킵

    const ext = ct.includes("png") ? "png" : ct.includes("gif") ? "gif" : ct.includes("webp") ? "webp" : "jpg";
    const now = new Date();
    const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/blog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const uploadResp = await fetch(`${SUPABASE_URL}/storage/v1/object/images/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        "Content-Type": ct,
        "x-upsert": "true",
      },
      body: Buffer.from(buffer),
    });
    if (!uploadResp.ok) return null;

    return `${SUPABASE_URL}/storage/v1/object/public/images/${path}`;
  } catch {
    return null;
  }
}

// ─── 기사 저장 ───
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
    const err = await resp.text();
    throw new Error(`Save failed: ${resp.status} ${err}`);
  }
  return await resp.json();
}

// ─── 기사번호 카운터 ───
async function getNextNo() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/site_settings?key=eq.cp-article-counter&select=value`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const data = await r.json();
  const current = data[0]?.value || 0;
  const next = current + 1;
  await fetch(`${SUPABASE_URL}/rest/v1/site_settings?key=eq.cp-article-counter`, {
    method: "PATCH",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ value: next }),
  });
  return next;
}

// ─── 중복 체크 ───
async function isDuplicate(title) {
  const encoded = encodeURIComponent(title);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/articles?title=eq.${encoded}&select=id&limit=1`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const data = await r.json();
  return data.length > 0;
}

// ─── 메인 실행 ───
async function main() {
  let totalPosts = 0;
  let migrated = 0;
  let skippedNoImage = 0;
  let skippedDup = 0;
  let skippedError = 0;

  // 모든 글 목록 수집
  console.log("📥 글 목록 수집 중...");
  const allPosts = [];
  for (let page = START_PAGE; ; page++) {
    const posts = await getPostList(page);
    if (posts.length === 0) break;
    allPosts.push(...posts);
    process.stdout.write(`  페이지 ${page}: ${posts.length}개 (누적 ${allPosts.length}개)\r`);
    if (allPosts.length >= LIMIT) break;
    await new Promise((r) => setTimeout(r, 300)); // rate limit
  }
  console.log(`\n📋 총 ${allPosts.length}개 글 발견\n`);

  const toProcess = allPosts.slice(0, LIMIT);

  for (let i = 0; i < toProcess.length; i++) {
    const { logNo, title: listTitle, date: listDate } = toProcess[i];
    totalPosts++;

    process.stdout.write(`[${i + 1}/${toProcess.length}] ${listTitle.substring(0, 40)}... `);

    try {
      // 중복 체크
      const dupTitle = decodeURIComponent(listTitle.replace(/\+/g, " ")).replace(/&#39;/g, "'").replace(/&amp;/g, "&");
      if (await isDuplicate(dupTitle)) {
        console.log("⏭️ 중복");
        skippedDup++;
        continue;
      }

      // 포스트 상세 크롤링
      const post = await fetchPost(logNo);
      if (!post.title) {
        console.log("⏭️ 제목 없음");
        skippedError++;
        continue;
      }

      // 중복 체크 (크롤링된 제목으로 다시)
      if (post.title !== dupTitle && (await isDuplicate(post.title))) {
        console.log("⏭️ 중복");
        skippedDup++;
        continue;
      }

      // 이미지 유효성 검사
      let validImages = [];
      for (const img of post.images) {
        const ok = await isImageAccessible(img);
        if (ok) {
          validImages.push(img);
          if (validImages.length >= 5) break; // 최대 5개만 검사
        }
      }

      if (validImages.length === 0) {
        console.log("⏭️ 유효 이미지 없음");
        skippedNoImage++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`✅ [DRY] 이미지 ${validImages.length}개 | ${post.date}`);
        migrated++;
        continue;
      }

      // 이미지 업로드 (첫 번째 = 썸네일)
      let thumbnail = "";
      const uploadedMap = {};
      for (const img of validImages.slice(0, 10)) {
        const newUrl = await uploadToSupabase(img);
        if (newUrl) {
          uploadedMap[img] = newUrl;
          if (!thumbnail) thumbnail = newUrl;
        }
      }

      if (!thumbnail) {
        console.log("⏭️ 이미지 업로드 실패");
        skippedNoImage++;
        continue;
      }

      // 본문 이미지 URL 교체
      let body = post.bodyHtml;
      for (const [orig, newUrl] of Object.entries(uploadedMap)) {
        body = body.split(orig).join(newUrl);
      }

      // 기사 번호
      const no = await getNextNo();

      // 기사 저장
      const article = {
        id: randomUUID(),
        no,
        title: post.title,
        body,
        category: CATEGORY,
        date: post.date || listDate.replace(/\.\s*/g, "-").replace(/-$/, ""),
        status: "게시",
        author: AUTHOR,
        author_email: AUTHOR_EMAIL,
        thumbnail,
        tags: "",
        summary: body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().substring(0, 160),
        views: 0,
        source_url: `https://blog.naver.com/${BLOG_ID}/${logNo}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await saveArticle(article);
      console.log(`✅ #${no} | 이미지 ${Object.keys(uploadedMap).length}개 | ${post.date}`);
      migrated++;

      await new Promise((r) => setTimeout(r, 500)); // rate limit
    } catch (err) {
      console.log(`❌ ${err.message?.substring(0, 60)}`);
      skippedError++;
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`📊 결과:`);
  console.log(`   총 글: ${totalPosts}`);
  console.log(`   ✅ 마이그레이션: ${migrated}`);
  console.log(`   ⏭️ 이미지 없음/불가: ${skippedNoImage}`);
  console.log(`   ⏭️ 중복: ${skippedDup}`);
  console.log(`   ❌ 에러: ${skippedError}`);
}

main().catch(console.error);
