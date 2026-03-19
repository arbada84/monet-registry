#!/usr/bin/env node
/**
 * source_url 복구 v2: 블로그 포스트를 임시 테이블에 저장 후 SQL 유사도 매칭
 */
import { readFileSync } from "fs";

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
const BLOG_ID = "curpy";

async function supabaseQuery(sql) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql }),
  });
  return r.json();
}

async function getAllBlogPosts() {
  const allPosts = [];
  let page = 1;
  while (page <= 100) {
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
          .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/<[^>]*>/g, "").trim()
      );
      if (logNos.length === 0) break;
      for (let i = 0; i < logNos.length; i++) {
        allPosts.push({ logNo: logNos[i], title: titles[i] || "" });
      }
      if (page % 20 === 0) console.log(`  ${page}페이지... (${allPosts.length}건)`);
      page++;
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.error(`  페이지 ${page} 에러: ${err.message}`);
      break;
    }
  }
  return allPosts;
}

// DB에 블로그 포스트를 UPSERT
async function uploadBlogPosts(posts) {
  const BATCH = 100;
  let uploaded = 0;
  for (let i = 0; i < posts.length; i += BATCH) {
    const batch = posts.slice(i, i + BATCH);
    const rows = batch.map((p) => ({
      log_no: p.logNo,
      title: p.title,
      source_url: `https://blog.naver.com/${BLOG_ID}/${p.logNo}`,
    }));
    const r = await fetch(`${SUPABASE_URL}/rest/v1/blog_post_mapping`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(rows),
    });
    if (!r.ok) {
      const err = await r.text();
      console.error(`  배치 ${i} 업로드 실패: ${err}`);
    }
    uploaded += batch.length;
  }
  return uploaded;
}

async function main() {
  console.log("\n=== source_url 복구 v2 (SQL 유사도 매칭) ===\n");

  // 1) 블로그 포스트 수집
  console.log("1) 네이버 블로그 포스트 수집...");
  const posts = await getAllBlogPosts();
  console.log(`   ${posts.length}건 수집\n`);

  // 2) 임시 매핑 테이블 생성
  console.log("2) 임시 매핑 테이블 생성...");
  const createR = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  }).catch(() => null);

  // REST API로 직접 테이블 사용 (이미 없으면 실패할 수 있으므로 HTTP PUT)
  // 대신 직접 Supabase에 데이터 넣기 위해 REST API 사용
  console.log("   데이터 업로드 중...");
  const uploaded = await uploadBlogPosts(posts);
  console.log(`   ${uploaded}건 업로드 완료\n`);

  console.log("3) SQL로 유사도 매칭 실행은 Supabase MCP에서 직접 수행합니다.\n");
  console.log("   완료! 다음 단계는 Supabase에서 SQL 실행.\n");
}

main().catch(console.error);
