#!/usr/bin/env node
/**
 * 블로그 이관 기사 — 인라인 이미지 복구 스크립트
 *
 * 문제: <a data-linkdata='{"src":"..."}'>  형태로 이미지가 숨어있어 렌더링 안 됨
 * 해결: data-linkdata에서 src 추출 → 다운로드 → Supabase 업로드 → <img> 태그로 교체
 *
 * Usage: node scripts/fix-inline-images.mjs [--dry-run] [--limit N]
 */

import { readFileSync } from "fs";

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

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = parseInt(args.find((_, i) => args[i - 1] === "--limit") || "9999");

console.log(`\n🔧 인라인 이미지 복구 스크립트`);
console.log(`   ${DRY_RUN ? "🔍 DRY RUN" : "🚀 실제 실행"}`);
console.log(`   Supabase: ${SUPABASE_URL}\n`);

// ─── Supabase 이미지 업로드 ───
async function uploadToSupabase(imgUrl) {
  try {
    const imgResp = await fetch(imgUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
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

// ─── data-linkdata 이미지 추출 & 교체 ───
async function fixDataLinkImages(body) {
  // <a ... data-linktype="img" data-linkdata='{"src":"URL",...}'> ... </a> 패턴 찾기
  const pattern = /<a\s[^>]*data-linktype="img"[^>]*data-linkdata='([^']*)'[^>]*>[\s\S]*?<\/a>/gi;
  const matches = [...body.matchAll(pattern)];

  if (matches.length === 0) return { body, fixed: 0, failed: 0 };

  let fixed = 0, failed = 0;
  let newBody = body;

  for (const match of matches) {
    const fullTag = match[0];
    const dataStr = match[1]
      .replace(/&amp;/g, "&")
      .replace(/&#x3D;/g, "=")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    let src = "";
    try {
      const data = JSON.parse(dataStr);
      src = data.src || "";
    } catch {
      // JSON 파싱 실패 시 정규식으로 추출
      const srcMatch = dataStr.match(/"src"\s*:\s*"([^"]+)"/);
      src = srcMatch?.[1] || "";
    }

    if (!src || src === "undefined") {
      // src 없으면 빈 태그 제거
      newBody = newBody.replace(fullTag, "");
      failed++;
      continue;
    }

    // 이미 Supabase URL이면 <img>로만 변환
    if (src.includes("supabase.co/storage")) {
      newBody = newBody.replace(fullTag, `<p><img src="${src}" alt="" style="max-width:100%"></p>`);
      fixed++;
      continue;
    }

    // culturepeople.co.kr (폐쇄 도메인) → 다운로드 불가, 제거
    if (src.includes("culturepeople.co.kr")) {
      newBody = newBody.replace(fullTag, "");
      failed++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`    [DRY] 이미지 발견: ${src.substring(0, 100)}`);
      fixed++;
      continue;
    }

    // 이미지 다운로드 → Supabase 업로드
    const newUrl = await uploadToSupabase(src);
    if (newUrl) {
      newBody = newBody.replace(fullTag, `<p><img src="${newUrl}" alt="" style="max-width:100%"></p>`);
      fixed++;
    } else {
      // 다운로드 실패 → 원본 URL로 <img> 태그 생성 (외부 이미지라도 보이게)
      newBody = newBody.replace(fullTag, `<p><img src="${src}" alt="" style="max-width:100%"></p>`);
      failed++;
    }

    // 속도 제한
    await new Promise((r) => setTimeout(r, 200));
  }

  // 빈 <p> 정리
  newBody = newBody.replace(/<p>\s*<\/p>/g, "");

  return { body: newBody, fixed, failed };
}

// ─── 기사 업데이트 ───
async function updateArticle(id, newBody) {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?id=eq.${id}`,
    {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ body: newBody }),
    }
  );
  return resp.ok;
}

// ─── 메인 ───
async function main() {
  // data-linktype="img" 포함 기사 조회 (페이지네이션)
  console.log("📥 인라인 이미지 포함 기사 조회 중...");
  const articles = [];
  const PAGE_SIZE = 100;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/articles?body=like.*data-linktype%3D%22img%22*&select=id,title,body&order=date.asc&limit=${PAGE_SIZE}&offset=${offset}`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    const batch = await resp.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    articles.push(...batch);
    if (batch.length < PAGE_SIZE || articles.length >= LIMIT) break;
  }
  if (articles.length > LIMIT) articles.length = LIMIT;
  console.log(`📋 ${articles.length}건 발견\n`);

  let totalFixed = 0, totalFailed = 0, articlesUpdated = 0;

  for (let i = 0; i < articles.length; i++) {
    const { id, title, body } = articles[i];
    const shortTitle = title.substring(0, 40);
    process.stdout.write(`[${i + 1}/${articles.length}] ${shortTitle}... `);

    const { body: newBody, fixed, failed } = await fixDataLinkImages(body);

    if (fixed === 0 && failed === 0) {
      console.log("⏭️ 패턴 없음");
      continue;
    }

    if (!DRY_RUN && newBody !== body) {
      const ok = await updateArticle(id, newBody);
      if (ok) {
        console.log(`✅ 이미지 ${fixed}개 복구, ${failed}개 제거`);
        articlesUpdated++;
      } else {
        console.log(`❌ 업데이트 실패`);
      }
    } else {
      console.log(`${DRY_RUN ? "🔍" : "✅"} 이미지 ${fixed}개 복구, ${failed}개 제거`);
      articlesUpdated++;
    }

    totalFixed += fixed;
    totalFailed += failed;
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`📊 결과:`);
  console.log(`   기사 처리: ${articlesUpdated}건`);
  console.log(`   이미지 복구: ${totalFixed}개`);
  console.log(`   이미지 제거(접근불가): ${totalFailed}개`);
}

main().catch(console.error);
