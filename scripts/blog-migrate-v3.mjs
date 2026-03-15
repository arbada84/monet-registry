#!/usr/bin/env node
/**
 * 네이버 블로그(curpy) → 컬처피플 추가 마이그레이션 v3
 *
 * v2 대비 개선:
 * - 본문 추출 강화: SE3 + SE2 + se-main-container 전체 + 최후 title 기반 body 생성
 * - data-linkdata 이미지 인라인 변환
 * - 최소 본문 길이 10자로 완화
 * - 이미지만 있는 글도 이관 (이미지+제목)
 *
 * Usage: node scripts/blog-migrate-v3.mjs [--dry-run] [--limit N] [--start-page N]
 */

import { readFileSync } from "fs";
import { randomUUID } from "crypto";

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

const CATEGORY_MAP = {
  "공공컬처": "공공", "비즈컬처": "비즈", "엔터테이너": "엔터",
  "스포츠N운동": "스포츠", "전자N모빌리티": "테크·모빌리티",
  "패션N라이프": "라이프", "북N컬처": "라이프", "펫컬처": "라이프",
  "e-스포츠N게임": "라이프", "키즈컬처": "라이프", "컬처피플": "라이프",
};
const SKIP_CATEGORIES = ["컬처피플 소개", "[POST] 컬처피플"];
const DEFAULT_CATEGORY = "라이프";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = parseInt(args.find((_, i) => args[i - 1] === "--limit") || "9999");
const START_PAGE = parseInt(args.find((_, i) => args[i - 1] === "--start-page") || "1");

console.log(`\n📋 블로그 추가 마이그레이션 v3`);
console.log(`   ${DRY_RUN ? "🔍 DRY RUN" : "🚀 실제 실행"}`);
console.log(`   시작페이지: ${START_PAGE} | 제한: ${LIMIT}건\n`);

// ─── 글 목록 가져오기 ───
async function getPostList(page) {
  const url = `https://blog.naver.com/PostTitleListAsync.naver?blogId=${BLOG_ID}&viewdate=&currentPage=${page}&categoryNo=0&parentCategoryNo=0&countPerPage=30`;
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

// ─── 포스트 크롤링 (강화) ───
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
    html.match(/(\d{4}\.\s*\d{1,2}\.\s*\d{1,2})/)?.[1] || "";
  const dateMatch = rawDate.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  const date = dateMatch ? `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}` : "";

  // Category
  const blogCategory =
    html.match(/class="(?:category|pcol2|blog2_category)[^"]*"[^>]*>\s*<a[^>]*>(.*?)<\/a>/)?.[1]?.trim() || "";

  // 첨부 이미지 (postfiles.pstatic.net)
  const attachedImages = [...new Set(
    [...html.matchAll(/(?:data-lazy-src|src)="(https?:\/\/postfiles\.pstatic\.net\/[^"]+)"/gi)].map((m) => m[1])
  )];

  // ── 본문 추출 (다단계) ──
  let bodyHtml = "";

  // 1단계: SE3 텍스트 단락
  const textParagraphs = [...html.matchAll(/<p class="se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p>/gi)];
  if (textParagraphs.length > 0) {
    const parts = [];
    for (const m of textParagraphs) {
      let text = m[1].trim();
      text = text.replace(/&nbsp;/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      text = text.replace(/<(?!\/?(?:b|i|u|em|strong|a|br)[>\s/])[^>]*>/gi, "");
      text = text.trim();
      if (!text || text === " ") continue;
      parts.push(`<p>${text}</p>`);
    }
    bodyHtml = parts.join("\n");
  }

  // 2단계: SE3 se-main-container 전체 (텍스트+이미지+링크 모두)
  if (!bodyHtml || bodyHtml.replace(/<[^>]*>/g, "").trim().length < 10) {
    const containerMatch = html.match(/class="se-main-container"[^>]*>([\s\S]*?)(?=<\/div>\s*<!--\s*SE3|<div class="(?:post-btn|comment_area|footer))/i);
    if (containerMatch) {
      let raw = containerMatch[1];
      // 기본 태그만 유지
      raw = raw.replace(/<script[\s\S]*?<\/script>/gi, "");
      // 이미지 태그 보존하면서 텍스트 추출
      const imgTags = [...raw.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/gi)].map(m => m[0]);
      const textContent = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      if (textContent.length > 10 || imgTags.length > 0) {
        // 텍스트를 문단으로 분리
        const sentences = textContent.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 2);
        const paragraphs = [];
        for (let i = 0; i < sentences.length; i += 3) {
          paragraphs.push(`<p>${sentences.slice(i, i + 3).join(" ")}</p>`);
        }
        bodyHtml = paragraphs.join("\n") || `<p>${textContent}</p>`;
      }
    }
  }

  // 3단계: SE2 (postViewArea)
  if (!bodyHtml || bodyHtml.replace(/<[^>]*>/g, "").trim().length < 10) {
    const se2Match = html.match(/id="postViewArea"[^>]*>([\s\S]*?)(?=<\/div>\s*<div class="(?:post-btn|comment_area))/);
    if (se2Match) {
      let body = se2Match[1];
      body = body.replace(/\s+class="[^"]*"/g, "").replace(/\s+id="[^"]*"/g, "").replace(/\s+style="[^"]*"/g, "");
      body = body.replace(/\s+data-[a-z-]+="[^"]*"/g, "");
      body = body.replace(/<script[\s\S]*?<\/script>/gi, "");
      body = body.replace(/<br\s*\/?>/gi, "</p>\n<p>");
      body = `<p>${body}</p>`;
      body = body.replace(/<p>\s*<\/p>/g, "");
      bodyHtml = body;
    }
  }

  // 4단계: 최후 수단 - __pcol_article__ 또는 기타 컨테이너
  if (!bodyHtml || bodyHtml.replace(/<[^>]*>/g, "").trim().length < 10) {
    const altMatch = html.match(/class="__pcol_article__[^"]*"[^>]*>([\s\S]*?)(?=<\/div>\s*<div)/i) ||
                     html.match(/class="post-view[^"]*"[^>]*>([\s\S]*?)(?=<\/div>\s*<div)/i) ||
                     html.match(/class="se_component_wrap[^"]*"[^>]*>([\s\S]*?)(?=<\/div>\s*<\/div>)/i);
    if (altMatch) {
      let body = altMatch[1].replace(/<script[\s\S]*?<\/script>/gi, "");
      const textContent = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      if (textContent.length > 10) {
        bodyHtml = `<p>${textContent}</p>`;
      }
    }
  }

  // data-linkdata 이미지를 <img>로 변환
  bodyHtml = bodyHtml.replace(/<a\s[^>]*data-linktype="img"[^>]*data-linkdata='([^']*)'[^>]*>[\s\S]*?<\/a>/gi, (match, dataStr) => {
    try {
      const cleaned = dataStr.replace(/&amp;/g, "&").replace(/&#x3D;/g, "=").replace(/&quot;/g, '"');
      const data = JSON.parse(cleaned);
      if (data.src && !data.src.includes("culturepeople.co.kr")) {
        return `<p><img src="${data.src}" alt="" style="max-width:100%"></p>`;
      }
    } catch {}
    return "";
  });

  // culturepeople.co.kr 깨진 이미지 제거
  bodyHtml = bodyHtml.replace(/<img[^>]*src="https?:\/\/(?:www\.)?culturepeople\.co\.kr\/[^"]*"[^>]*>/gi, "");
  bodyHtml = bodyHtml.replace(/<p>\s*<\/p>/g, "");

  return { title, date, blogCategory, attachedImages, bodyHtml, logNo };
}

// ─── 이미지 Supabase 업로드 ───
async function uploadToSupabase(imgUrl) {
  try {
    const imgResp = await fetch(imgUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", Referer: `https://blog.naver.com/${BLOG_ID}`, Accept: "image/*,*/*;q=0.8" },
      redirect: "follow", signal: AbortSignal.timeout(15000),
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
  } catch { return null; }
}

async function isImageAccessible(imgUrl) {
  try {
    const r = await fetch(imgUrl, { method: "HEAD", headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow", signal: AbortSignal.timeout(5000) });
    return r.ok && (r.headers.get("content-type") || "").startsWith("image/");
  } catch { return false; }
}

// ─── 중복 체크 ───
async function isDuplicate(logNo) {
  const sourceUrl = `https://blog.naver.com/${BLOG_ID}/${logNo}`;
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?source_url=eq.${encodeURIComponent(sourceUrl)}&select=id&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const data = await r.json();
  return data.length > 0;
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
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Save failed: ${resp.status} ${err}`);
  }
}

// ─── 메인 ───
async function main() {
  let total = 0, migrated = 0, skippedCat = 0, skippedDup = 0, skippedErr = 0, skippedShort = 0;
  let imgUploaded = 0;

  console.log("📥 글 목록 수집 중...");
  const allPosts = [];
  for (let page = START_PAGE; ; page++) {
    const posts = await getPostList(page);
    if (posts.length === 0) break;
    allPosts.push(...posts);
    process.stdout.write(`  페이지 ${page}: ${posts.length}개 (누적 ${allPosts.length}개)\r`);
    if (allPosts.length >= LIMIT) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log(`\n📋 총 ${allPosts.length}개 글 발견\n`);

  const toProcess = allPosts.slice(0, LIMIT);

  for (let i = 0; i < toProcess.length; i++) {
    const { logNo, title: listTitle, date: listDate, blogCategory: listCategory } = toProcess[i];
    total++;

    const shortTitle = listTitle.substring(0, 40);
    process.stdout.write(`[${i + 1}/${toProcess.length}] ${shortTitle}... `);

    try {
      if (SKIP_CATEGORIES.includes(listCategory)) {
        console.log(`⏭️ 제외(${listCategory})`);
        skippedCat++;
        continue;
      }

      if (await isDuplicate(logNo)) {
        console.log("⏭️ 중복");
        skippedDup++;
        continue;
      }

      const post = await fetchPost(logNo);
      if (!post.title) { console.log("⏭️ 제목없음"); skippedErr++; continue; }

      const category = CATEGORY_MAP[post.blogCategory] || CATEGORY_MAP[listCategory] || DEFAULT_CATEGORY;

      // 이미지 업로드 (첨부 이미지, 최대 5개)
      const uploadedUrls = [];
      if (!DRY_RUN) {
        for (const img of post.attachedImages.slice(0, 5)) {
          if (!(await isImageAccessible(img))) continue;
          const newUrl = await uploadToSupabase(img);
          if (newUrl) { uploadedUrls.push(newUrl); imgUploaded++; }
        }
      }

      // 본문 구성
      let finalBody = post.bodyHtml;

      // 이미지를 본문 앞에 삽입
      if (uploadedUrls.length > 0) {
        const imgHtml = uploadedUrls.map(u => `<p><img src="${u}" alt="" style="max-width:100%"></p>`).join("\n");
        finalBody = imgHtml + "\n" + finalBody;
      }

      // 최종 본문 정리
      finalBody = finalBody.replace(/<p>\s*<\/p>/g, "").trim();
      const plainText = finalBody.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

      // 이미지만 있어도 OK (10자 또는 이미지 존재)
      if (plainText.length < 10 && uploadedUrls.length === 0 && !finalBody.includes("<img")) {
        console.log(`⏭️ 짧음(${plainText.length}자)`);
        skippedShort++;
        continue;
      }

      // 본문이 거의 없으면 제목을 본문에 추가
      if (plainText.length < 10) {
        finalBody = `<p>${post.title}</p>\n` + finalBody;
      }

      const thumbnail = uploadedUrls[0] || "";
      const summary = plainText.substring(0, 160) || post.title;
      const articleDate = post.date || listDate.replace(/\.\s*/g, "-").replace(/-$/, "");

      if (DRY_RUN) {
        console.log(`✅ [DRY] ${category} | img:${uploadedUrls.length} body:${plainText.length}자 | ${articleDate}`);
        migrated++;
        continue;
      }

      const no = await getNextNo();
      await saveArticle({
        id: randomUUID(), no, title: post.title, body: finalBody,
        category, date: articleDate, status: "게시", author: AUTHOR,
        author_email: "", thumbnail, tags: "", summary, views: 0,
        source_url: `https://blog.naver.com/${BLOG_ID}/${logNo}`,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });

      console.log(`✅ #${no} ${category} | img:${uploadedUrls.length} body:${plainText.length}자 | ${articleDate}`);
      migrated++;
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.log(`❌ ${err.message?.substring(0, 80)}`);
      skippedErr++;
    }
  }

  console.log(`\n${"═".repeat(55)}`);
  console.log(`📊 결과: 총 ${total}건`);
  console.log(`   ✅ 이관: ${migrated}건`);
  console.log(`   ⏭️ 중복: ${skippedDup}건`);
  console.log(`   ⏭️ 카테고리제외: ${skippedCat}건`);
  console.log(`   ⏭️ 짧음: ${skippedShort}건`);
  console.log(`   ❌ 에러: ${skippedErr}건`);
  console.log(`   🖼️ 이미지업로드: ${imgUploaded}건`);
}

main().catch(console.error);
