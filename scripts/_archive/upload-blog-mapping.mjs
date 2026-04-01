#!/usr/bin/env node
/**
 * 네이버 블로그 포스트 → blog_post_mapping 테이블 업로드
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

async function main() {
  console.log("블로그 포스트 수집 중...");
  const posts = await getAllBlogPosts();
  console.log(`${posts.length}건 수집 완료. 업로드 중...`);

  const BATCH = 50;
  let ok = 0, fail = 0;
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
    if (r.ok) {
      ok += batch.length;
    } else {
      fail += batch.length;
      if (fail <= 50) console.error(`  배치 에러: ${await r.text()}`);
    }
    if ((i / BATCH) % 10 === 0 && i > 0) console.log(`  ${ok}건 업로드됨...`);
  }
  console.log(`완료: 성공 ${ok}, 실패 ${fail}`);
}

main().catch(console.error);
