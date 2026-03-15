#!/usr/bin/env node
/**
 * 네이버 블로그(curpy) → 컬처피플 기사 마이그레이션 스크립트 v2
 *
 * 핵심: culturepeople.co.kr 이미지(404) → postfiles.pstatic.net(정상) 으로 복구
 *
 * Usage: node scripts/blog-migrate.mjs [--dry-run] [--limit N] [--page N] [--category N]
 */

import { readFileSync } from "fs";
import { randomUUID } from "crypto";

// ─── 환경변수 로드 ───
let env = {};
try {
  const raw = readFileSync(".env.production.local", "utf-8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"]*)"?$/);
    if (m) env[m[1]] = m[2];
  }
} catch { /* ignore */ }

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;
const BLOG_ID = "curpy";
const AUTHOR = "컬처피플";

// ─── 카테고리 매핑 ───
const CATEGORY_MAP = {
  "공공컬처": "공공",
  "비즈컬처": "비즈",
  "엔터테이너": "엔터",
  "스포츠N운동": "스포츠",
  "전자N모빌리티": "테크·모빌리티",
  "패션N라이프": "라이프",
  "북N컬처": "라이프",
  "펫컬처": "라이프",
  "e-스포츠N게임": "라이프",
  "키즈컬처": "라이프",
  "컬처피플": "라이프",
};
const SKIP_CATEGORIES = ["컬처피플 소개", "[POST] 컬처피플"];
const DEFAULT_CATEGORY = "라이프";

// ─── CLI 인자 ───
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = parseInt(args.find((_, i) => args[i - 1] === "--limit") || "9999");
const START_PAGE = parseInt(args.find((_, i) => args[i - 1] === "--page") || "1");
const FILTER_CATEGORY = args.find((_, i) => args[i - 1] === "--category") || null;

console.log(`\n📋 네이버 블로그 → 컬처피플 마이그레이션 v2`);
console.log(`   블로그: ${BLOG_ID}`);
console.log(`   ${DRY_RUN ? "🔍 DRY RUN" : "🚀 실제 실행"}`);
console.log(`   시작 페이지: ${START_PAGE} | 제한: ${LIMIT}건`);
console.log(`   Supabase: ${SUPABASE_URL}\n`);

// ─── 글 목록 가져오기 ───
async function getPostList(page, categoryNo = 0) {
  const url = `https://blog.naver.com/PostTitleListAsync.naver?blogId=${BLOG_ID}&viewdate=&currentPage=${page}&categoryNo=${categoryNo}&parentCategoryNo=0&countPerPage=30`;
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", Referer: `https://blog.naver.com/${BLOG_ID}` },
  });
  const text = await r.text();
  const logNos = [...text.matchAll(/"logNo"\s*:\s*"(\d+)"/g)].map((m) => m[1]);
  const titles = [...text.matchAll(/"title"\s*:\s*"([^"]*)"/g)].map((m) =>
    decodeURIComponent(m[1].replace(/\+/g, " ")).replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
  );
  const dates = [...text.matchAll(/"addDate"\s*:\s*"([^"]*)"/g)].map((m) => m[1]);
  const categoryNames = [...text.matchAll(/"categoryName"\s*:\s*"([^"]*)"/g)].map((m) =>
    decodeURIComponent(m[1].replace(/\+/g, " "))
  );
  return logNos.map((no, i) => ({ logNo: no, title: titles[i] || "", date: dates[i] || "", blogCategory: categoryNames[i] || "" }));
}

// ─── 개별 포스트 크롤링 ───
async function fetchPost(logNo) {
  const url = `https://blog.naver.com/PostView.naver?blogId=${BLOG_ID}&logNo=${logNo}&redirect=Dlog&widgetTypeCall=true&noTrackingCode=true&directAccess=false`;
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", Referer: `https://blog.naver.com/${BLOG_ID}` },
    signal: AbortSignal.timeout(15000),
  });
  const html = await r.text();

  // Title
  const title =
    html.match(/class="se-title-text[^"]*"[^>]*>([\s\S]*?)<\/span>/)?.[1]?.replace(/<[^>]*>/g, "").trim() ||
    html.match(/<title>(.*?)<\/title>/)?.[1]?.replace(/ : 네이버 블로그$/, "").trim() || "";

  // Date
  const rawDate =
    html.match(/class="se_publishDate[^"]*"[^>]*>(.*?)<\//)?.[1]?.trim() ||
    html.match(/"publishDateText"\s*:\s*"([^"]*)"/)?.[1] ||
    html.match(/class="date"[^>]*>(.*?)<\//)?.[1]?.trim() ||
    html.match(/class="blog_date[^"]*"[^>]*>(.*?)<\//)?.[1]?.trim() ||
    html.match(/(\d{4}\.\s*\d{1,2}\.\s*\d{1,2})/)?.[1] || "";
  const dateMatch = rawDate.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  const date = dateMatch ? `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}` : "";

  // Category
  const blogCategory =
    html.match(/class="(?:category|pcol2|blog2_category)[^"]*"[^>]*>\s*<a[^>]*>(.*?)<\/a>/)?.[1]?.trim() || "";

  // ── 이미지 분석 ──
  // 1) 첨부 이미지 (postfiles.pstatic.net — 정상 접근 가능)
  const attachedImages = [...new Set(
    [...html.matchAll(/(?:data-lazy-src|src)="(https?:\/\/postfiles\.pstatic\.net\/[^"]+)"/gi)].map((m) => m[1])
  )];

  // 2) 깨진 이미지 (culturepeople.co.kr — 사이트 폐쇄로 404)
  const brokenImages = [...new Set(
    [...html.matchAll(/(?:data-lazy-src|src)="(https?:\/\/(?:www\.)?culturepeople\.co\.kr\/[^"]+)"/gi)].map((m) => m[1])
  )];

  // Body: 텍스트 단락 추출 (SE3 에디터)
  const textParagraphs = [...html.matchAll(/<p class="se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p>/gi)];

  // 구버전(SE2) 폴백
  let se2Body = "";
  if (textParagraphs.length === 0) {
    const se2Match = html.match(/id="postViewArea"[^>]*>([\s\S]*?)(?=<\/div>\s*<div class="(?:post-btn|comment_area))/);
    if (se2Match) se2Body = se2Match[1];
  }

  return { title, date, blogCategory, attachedImages, brokenImages, textParagraphs, se2Body, logNo };
}

// ─── 본문 HTML 생성 ───
function buildBody(post, uploadedMap) {
  const parts = [];

  if (post.textParagraphs.length > 0) {
    // SE3: 텍스트 단락 + 이미지 인라인
    for (const m of post.textParagraphs) {
      let text = m[1].trim();
      // HTML 엔티티 정리
      text = text.replace(/&nbsp;/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      // 허용 태그만 유지 (b, i, u, em, strong, a, br)
      text = text.replace(/<(?!\/?(?:b|i|u|em|strong|a|br)[>\s/])[^>]*>/gi, "");
      text = text.trim();
      if (!text || text === " ") continue;
      parts.push(`<p>${text}</p>`);
    }
  } else if (post.se2Body) {
    // SE2: 원본 HTML 정리
    let body = post.se2Body;
    body = body.replace(/\s+class="[^"]*"/g, "").replace(/\s+id="[^"]*"/g, "").replace(/\s+style="[^"]*"/g, "");
    body = body.replace(/\s+data-[a-z-]+="[^"]*"/g, "");
    body = body.replace(/<br\s*\/?>/gi, "</p>\n<p>");
    body = `<p>${body}</p>`;
    body = body.replace(/<p>\s*<\/p>/g, "");
    parts.push(body);
  }

  // 이미지를 본문 첫 부분에 삽입 (업로드된 이미지)
  const imgHtml = [];
  for (const [, newUrl] of uploadedMap) {
    imgHtml.push(`<p><img src="${newUrl}" alt="" style="max-width:100%"></p>`);
  }

  // 이미지를 본문 시작에 배치
  let finalBody = "";
  if (imgHtml.length > 0) {
    finalBody = imgHtml.join("\n") + "\n" + parts.join("\n");
  } else {
    finalBody = parts.join("\n");
  }

  // culturepeople.co.kr 깨진 이미지 태그 제거
  finalBody = finalBody.replace(/<img[^>]*src="https?:\/\/(?:www\.)?culturepeople\.co\.kr\/[^"]*"[^>]*>/gi, "");
  // 빈 <p> 정리
  finalBody = finalBody.replace(/<p>\s*<\/p>/g, "");

  return finalBody.trim();
}

// ─── 이미지 Supabase 업로드 ───
async function uploadToSupabase(imgUrl) {
  try {
    const imgResp = await fetch(imgUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: `https://blog.naver.com/${BLOG_ID}`,
        Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!imgResp.ok) return null;

    const ct = imgResp.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) return null;

    const buffer = await imgResp.arrayBuffer();
    if (buffer.byteLength < 500 || buffer.byteLength > 10 * 1024 * 1024) return null;

    const ext = ct.includes("png") ? "png" : ct.includes("gif") ? "gif" : ct.includes("webp") ? "webp" : "jpg";
    const now = new Date();
    const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/blog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const uploadResp = await fetch(`${SUPABASE_URL}/storage/v1/object/images/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": ct, "x-upsert": "true" },
      body: Buffer.from(buffer),
    });
    if (!uploadResp.ok) return null;

    return `${SUPABASE_URL}/storage/v1/object/public/images/${path}`;
  } catch {
    return null;
  }
}

// ─── 이미지 유효성 검사 ───
async function isImageAccessible(imgUrl) {
  try {
    const r = await fetch(imgUrl, { method: "HEAD", headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow", signal: AbortSignal.timeout(5000) });
    return r.ok && (r.headers.get("content-type") || "").startsWith("image/");
  } catch { return false; }
}

// ─── 기사번호 (RPC) ───
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
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Save failed: ${resp.status} ${err}`);
  }
}

// ─── source_url 기반 중복 체크 ───
async function isDuplicate(logNo) {
  const sourceUrl = `https://blog.naver.com/${BLOG_ID}/${logNo}`;
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?source_url=eq.${encodeURIComponent(sourceUrl)}&select=id&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const data = await r.json();
  return data.length > 0;
}

// ─── 메인 실행 ───
async function main() {
  let total = 0, migrated = 0, skippedCat = 0, skippedDup = 0, skippedErr = 0, skippedShort = 0;
  let imgUploaded = 0, imgRecovered = 0;

  // 1단계: 글 목록 수집
  console.log("📥 글 목록 수집 중...");
  const allPosts = [];
  for (let page = START_PAGE; ; page++) {
    const posts = await getPostList(page, FILTER_CATEGORY ? parseInt(FILTER_CATEGORY) : 0);
    if (posts.length === 0) break;
    allPosts.push(...posts);
    process.stdout.write(`  페이지 ${page}: ${posts.length}개 (누적 ${allPosts.length}개)\r`);
    if (allPosts.length >= LIMIT) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log(`\n📋 총 ${allPosts.length}개 글 발견\n`);

  const toProcess = allPosts.slice(0, LIMIT);

  // 2단계: 각 글 처리
  for (let i = 0; i < toProcess.length; i++) {
    const { logNo, title: listTitle, date: listDate, blogCategory: listCategory } = toProcess[i];
    total++;

    const shortTitle = listTitle.substring(0, 40);
    process.stdout.write(`[${i + 1}/${toProcess.length}] ${shortTitle}... `);

    try {
      // 카테고리 필터
      if (SKIP_CATEGORIES.includes(listCategory)) {
        console.log(`⏭️ 제외(${listCategory})`);
        skippedCat++;
        continue;
      }

      // 중복 체크
      if (await isDuplicate(logNo)) {
        console.log("⏭️ 중복");
        skippedDup++;
        continue;
      }

      // 포스트 크롤링
      const post = await fetchPost(logNo);
      if (!post.title) { console.log("⏭️ 제목없음"); skippedErr++; continue; }

      // 카테고리 매핑
      const category = CATEGORY_MAP[post.blogCategory] || CATEGORY_MAP[listCategory] || DEFAULT_CATEGORY;

      // 이미지 업로드 (첨부 이미지)
      const uploadedMap = new Map();
      if (!DRY_RUN) {
        for (const img of post.attachedImages.slice(0, 10)) {
          const ok = await isImageAccessible(img);
          if (!ok) continue;
          const newUrl = await uploadToSupabase(img);
          if (newUrl) {
            uploadedMap.set(img, newUrl);
            imgUploaded++;
          }
        }
      }

      // 깨진 이미지 복구 카운트
      if (post.brokenImages.length > 0 && uploadedMap.size > 0) {
        imgRecovered += Math.min(post.brokenImages.length, uploadedMap.size);
      }

      // 본문 생성
      const body = buildBody(post, uploadedMap);

      // 본문 길이 체크
      const plainText = body.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      if (plainText.length < 30) {
        console.log(`⏭️ 짧음(${plainText.length}자)`);
        skippedShort++;
        continue;
      }

      const thumbnail = uploadedMap.size > 0 ? [...uploadedMap.values()][0] : "";
      const summary = plainText.substring(0, 160);
      const articleDate = post.date || listDate.replace(/\.\s*/g, "-").replace(/-$/, "");

      if (DRY_RUN) {
        console.log(`✅ [DRY] ${category} | 첨부:${post.attachedImages.length} 깨짐:${post.brokenImages.length} | ${articleDate}`);
        migrated++;
        continue;
      }

      const no = await getNextNo();
      await saveArticle({
        id: randomUUID(),
        no,
        title: post.title,
        body,
        category,
        date: articleDate,
        status: "게시",
        author: AUTHOR,
        author_email: "",
        thumbnail,
        tags: "",
        summary,
        views: 0,
        source_url: `https://blog.naver.com/${BLOG_ID}/${logNo}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      console.log(`✅ #${no} ${category} | img:${uploadedMap.size}(복구:${Math.min(post.brokenImages.length, uploadedMap.size)}) | ${articleDate}`);
      migrated++;
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.log(`❌ ${err.message?.substring(0, 80)}`);
      skippedErr++;
    }
  }

  console.log(`\n${"═".repeat(55)}`);
  console.log(`📊 결과: 총 ${total}건`);
  console.log(`   ✅ 마이그레이션: ${migrated}`);
  console.log(`   🖼️ 이미지 업로드: ${imgUploaded} | 복구: ${imgRecovered}`);
  console.log(`   ⏭️ 제외카테고리: ${skippedCat} | 중복: ${skippedDup} | 짧음: ${skippedShort}`);
  console.log(`   ❌ 에러: ${skippedErr}`);
}

main().catch(console.error);
