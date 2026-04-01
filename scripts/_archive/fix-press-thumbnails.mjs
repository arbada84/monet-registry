#!/usr/bin/env node
/**
 * 썸네일 없는 기사에 Pexels 이미지 등록 (영어 검색어 사용)
 */
const SB_URL = "https://ifducnfrjarmlpktrjkj.supabase.co";
const SB_KEY = "" + process.env.SUPABASE_SERVICE_KEY + "";
const PEXELS_KEY = "PgdENcDqztiSOai0tuexhkL08UoV25xGyI2ncKBUnSQ5kDwvDQyQLxv4";

// 기사별 영어 검색어 매핑 (제목 기반)
const SEARCH_MAP = {
  2980: "cybersecurity technology expo",
  2979: "traditional korean music performance",
  2978: "book essay writing",
  2977: "flute music instrument",
  2974: "robotaxi autonomous driving",
  2973: "anime theme park japan",
  2972: "korean street food tteokbokki",
  2971: "climate change environment summit",
  2970: "flute classical music",
  2969: "samsung micro LED tv display",
  2968: "cryptocurrency bitcoin atm",
  2967: "mobile strategy game",
};

async function searchPexels(query) {
  const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=3&orientation=landscape`, {
    headers: { Authorization: PEXELS_KEY },
  });
  if (!res.ok) { console.log("  Pexels API 실패:", res.status); return null; }
  const data = await res.json();
  return data.photos?.[0]?.src?.large2x || data.photos?.[0]?.src?.large || null;
}

async function uploadToSupabase(imgUrl) {
  const resp = await fetch(imgUrl, { redirect: "follow", signal: AbortSignal.timeout(15000) });
  if (!resp.ok) return null;
  const ct = resp.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await resp.arrayBuffer());
  const ext = ct.includes("png") ? "png" : "jpg";
  const now = new Date();
  const path = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,"0")}/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
  const upRes = await fetch(`${SB_URL}/storage/v1/object/images/${path}`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": ct, "x-upsert": "true" },
    body: buf,
  });
  if (!upRes.ok) return null;
  return `${SB_URL}/storage/v1/object/public/images/${path}`;
}

async function run() {
  console.log("=== 썸네일 등록 시작 ===\n");

  for (const [noStr, query] of Object.entries(SEARCH_MAP)) {
    const no = parseInt(noStr);
    console.log(`#${no}: "${query}" 검색...`);

    const pexelsUrl = await searchPexels(query);
    if (!pexelsUrl) { console.log(`  이미지 없음\n`); continue; }

    const sbUrl = await uploadToSupabase(pexelsUrl);
    if (!sbUrl) { console.log(`  업로드 실패\n`); continue; }

    // DB 업데이트
    const res = await fetch(
      `${SB_URL}/rest/v1/articles?no=eq.${no}&select=id`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    const rows = await res.json();
    if (!rows[0]) { console.log(`  기사 없음\n`); continue; }

    const upd = await fetch(`${SB_URL}/rest/v1/articles?id=eq.${rows[0].id}`, {
      method: "PATCH",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ thumbnail: sbUrl }),
    });
    console.log(`  ${upd.ok ? "✓ 등록 완료" : "✗ 실패"}\n`);
  }

  console.log("=== 완료 ===");
}

run().catch(console.error);
