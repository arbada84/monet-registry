#!/usr/bin/env node
/**
 * source_url 복구 스크립트
 * 네이버 블로그(curpy)에서 제목-logNo 매핑을 가져와서
 * articles 테이블의 source_url을 복구합니다.
 */
import { readFileSync } from "fs";

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

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SERVICE_KEY");
  process.exit(1);
}

// 1) 네이버 블로그에서 모든 포스트의 제목-logNo 매핑 수집
async function getAllBlogPosts() {
  const allPosts = [];
  let page = 1;
  const MAX_PAGES = 100;

  while (page <= MAX_PAGES) {
    const url = `https://blog.naver.com/PostTitleListAsync.naver?blogId=${BLOG_ID}&viewdate=&currentPage=${page}&categoryNo=0&parentCategoryNo=0&countPerPage=30`;
    try {
      const r = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: `https://blog.naver.com/${BLOG_ID}`,
        },
        signal: AbortSignal.timeout(10000),
      });
      const text = await r.text();
      const logNos = [...text.matchAll(/"logNo"\s*:\s*"(\d+)"/g)].map((m) => m[1]);
      const titles = [...text.matchAll(/"title"\s*:\s*"([^"]*)"/g)].map((m) =>
        decodeURIComponent(m[1].replace(/\+/g, " "))
          .replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
          .replace(/<[^>]*>/g, "").trim()
      );

      if (logNos.length === 0) break;

      for (let i = 0; i < logNos.length; i++) {
        allPosts.push({ logNo: logNos[i], title: titles[i] || "" });
      }
      console.log(`  페이지 ${page}: ${logNos.length}건 수집 (누적 ${allPosts.length})`);
      page++;
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.error(`  페이지 ${page} 에러: ${err.message}`);
      break;
    }
  }
  return allPosts;
}

// 2) DB에서 source_url이 없는 기사 목록 가져오기
async function getArticlesWithoutSource() {
  const allArticles = [];
  let offset = 0;
  const PAGE = 500;

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/articles?source_url=is.null&select=id,no,title&order=no.asc&limit=${PAGE}&offset=${offset}`;
    const r = await fetch(url, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const data = await r.json();
    if (!data.length) break;
    allArticles.push(...data);
    offset += PAGE;
  }

  // source_url='' 인 것도
  offset = 0;
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/articles?source_url=eq.&select=id,no,title&order=no.asc&limit=${PAGE}&offset=${offset}`;
    const r = await fetch(url, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const data = await r.json();
    if (!data.length) break;
    allArticles.push(...data);
    offset += PAGE;
  }

  return allArticles;
}

// 3) 제목 정규화 (비교용)
function normalize(title) {
  return (title || "")
    .replace(/\s+/g, "")
    .replace(/[''""·…–—]/g, "")
    .replace(/[^\w가-힣]/g, "")
    .toLowerCase();
}

// 4) 매칭 & 업데이트
async function updateSourceUrl(articleId, sourceUrl) {
  const url = `${SUPABASE_URL}/rest/v1/articles?id=eq.${articleId}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ source_url: sourceUrl }),
  });
  return r.ok;
}

async function main() {
  console.log("\n=== source_url 복구 스크립트 ===\n");

  // 블로그 포스트 수집
  console.log("1) 네이버 블로그 포스트 목록 수집 중...");
  const blogPosts = await getAllBlogPosts();
  console.log(`   총 ${blogPosts.length}건 수집 완료\n`);

  // 정규화된 제목 → logNo 맵 생성
  const titleMap = new Map();
  for (const post of blogPosts) {
    const key = normalize(post.title);
    if (key && !titleMap.has(key)) {
      titleMap.set(key, post.logNo);
    }
  }
  console.log(`   고유 제목 맵: ${titleMap.size}건\n`);

  // source_url 없는 기사 조회
  console.log("2) source_url 없는 기사 조회 중...");
  const articles = await getArticlesWithoutSource();
  console.log(`   ${articles.length}건 조회됨\n`);

  // 매칭 & 업데이트
  console.log("3) 제목 매칭 & source_url 복구 중...");
  let matched = 0, failed = 0;
  const unmatched = [];

  for (const art of articles) {
    const key = normalize(art.title);
    const logNo = titleMap.get(key);
    if (logNo) {
      const sourceUrl = `https://blog.naver.com/${BLOG_ID}/${logNo}`;
      const ok = await updateSourceUrl(art.id, sourceUrl);
      if (ok) {
        matched++;
        if (matched % 50 === 0) console.log(`   ... ${matched}건 복구됨`);
      } else {
        failed++;
      }
    } else {
      unmatched.push({ no: art.no, title: art.title });
    }
  }

  console.log(`\n=== 결과 ===`);
  console.log(`  매칭 성공: ${matched}건`);
  console.log(`  매칭 실패: ${unmatched.length}건`);
  console.log(`  업데이트 오류: ${failed}건`);

  if (unmatched.length > 0 && unmatched.length <= 50) {
    console.log(`\n  매칭 실패 기사:`);
    for (const u of unmatched) {
      console.log(`    no=${u.no}: ${u.title}`);
    }
  }
}

main().catch(console.error);
