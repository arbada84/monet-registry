#!/usr/bin/env node
/**
 * 4차 수정 — 외부 이미지 Supabase 이관 + 불필요 외부 URL 정리
 */
const SB_URL = "https://ifducnfrjarmlpktrjkj.supabase.co";
const SB_KEY = "" + process.env.SUPABASE_SERVICE_KEY + "";

async function fetchArticle(no) {
  const res = await fetch(
    `${SB_URL}/rest/v1/articles?no=eq.${no}&select=id,no,title,body`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  const rows = await res.json();
  return rows[0] || null;
}

async function updateArticle(id, updates) {
  const res = await fetch(`${SB_URL}/rest/v1/articles?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json", Prefer: "return=minimal",
    },
    body: JSON.stringify(updates),
  });
  return res.ok;
}

// 이미지 Supabase 업로드
async function uploadToSupabase(imgUrl) {
  try {
    const resp = await fetch(imgUrl, { redirect: "follow", signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return null;
    const ct = resp.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 100 || buf.length > 5*1024*1024) return null;

    const ext = ct.includes("png") ? "png" : ct.includes("gif") ? "gif" : ct.includes("webp") ? "webp" : "jpg";
    const now = new Date();
    const path = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,"0")}/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;

    const upRes = await fetch(`${SB_URL}/storage/v1/object/images/${path}`, {
      method: "POST",
      headers: {
        apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": ct, "x-upsert": "true",
      },
      body: buf,
    });
    if (!upRes.ok) return null;
    return `${SB_URL}/storage/v1/object/public/images/${path}`;
  } catch { return null; }
}

function isOwnUrl(url) {
  return url.includes("ifducnfrjarmlpktrjkj.supabase") ||
    (url.includes("culturepeople.co.kr") && !url.includes("files.culturepeople.co.kr"));
}

async function migrateBodyImages(body) {
  // img src에서 외부 이미지 찾기
  const imgRegex = /<img[^>]*src="([^"]+)"[^>]*>/gi;
  let match;
  const replacements = [];

  while ((match = imgRegex.exec(body)) !== null) {
    const [full, src] = match;
    if (!isOwnUrl(src) && (src.startsWith("http://") || src.startsWith("https://"))) {
      replacements.push({ original: src, index: match.index });
    }
  }

  if (replacements.length === 0) return body;

  let result = body;
  // 5개씩 병렬 처리
  for (let i = 0; i < replacements.length; i += 5) {
    const batch = replacements.slice(i, i + 5);
    const results = await Promise.all(batch.map(r => uploadToSupabase(r.original)));
    for (let j = 0; j < batch.length; j++) {
      if (results[j]) {
        result = result.replaceAll(batch[j].original, results[j]);
      }
    }
  }

  return result;
}

async function run() {
  console.log("=== 4차: 외부 이미지 이관 + 불필요 링크 정리 ===\n");

  // 외부 이미지가 포함된 기사
  const imgNos = [14, 2700, 2712];
  // 불필요 외부 텍스트 URL (a 태그 없이 본문에 포함)
  const textUrlNos = [2715, 2726, 2955];

  let fixed = 0;

  // 이미지 이관
  for (const no of imgNos) {
    const art = await fetchArticle(no);
    if (!art) continue;
    console.log(`이미지 이관: #${no}...`);
    const migrated = await migrateBodyImages(art.body);
    if (migrated !== art.body) {
      await updateArticle(art.id, { body: migrated });
      console.log(`  #${no} 이미지 이관 완료 ✓`);
      fixed++;
    } else {
      console.log(`  #${no} 변경없음`);
    }
  }

  // 텍스트 URL 정리 (a 태그 없이 삽입된 외부 URL → 제거 또는 보존)
  for (const no of textUrlNos) {
    const art = await fetchArticle(no);
    if (!art) continue;
    let c = art.body;
    // daejonilbo 기사 링크 → 원문 참조이므로 보존 (문제 없음)
    // blog.naver 링크 텍스트 정리
    c = c.replace(/https?:\/\/blog\.naver\.com\/[^\s<)"']*/g, '');
    // bankofengland 텍스트 URL 제거
    c = c.replace(/https?:\/\/www\.bankofengland\.co\.uk[^\s<)"']*/g, '');
    if (c !== art.body) {
      await updateArticle(art.id, { body: c });
      console.log(`텍스트 URL 정리: #${no} ✓`);
      fixed++;
    }
  }

  console.log(`\n=== 완료: ${fixed}건 수정 ===`);
}

run().catch(console.error);
