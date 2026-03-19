#!/usr/bin/env node
/**
 * 3차 정밀 수정 — 트래킹 링크 + 외부 불필요 링크 제거
 */
const SB_URL = "https://ifducnfrjarmlpktrjkj.supabase.co";
const SB_KEY = "" + process.env.SUPABASE_SERVICE_KEY + "";

async function fetchArticle(no) {
  const res = await fetch(
    `${SB_URL}/rest/v1/articles?no=eq.${no}&select=id,no,title,body,summary,status`,
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

async function softDelete(id) {
  return updateArticle(id, { status: "삭제" });
}

function cleanTrackingLinks(body) {
  // track.maillink 링크 제거 (텍스트 보존)
  let c = body.replace(/<a\s+[^>]*href="[^"]*track\.maillink[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, '$1');
  // URL 직접 포함도 제거 (http://track.maillink... 텍스트)
  c = c.replace(/https?:\/\/track\.maillink\.co\.kr\/[^\s<"']*/gi, '');

  // twitter share 링크
  c = c.replace(/<a\s+[^>]*href="https?:\/\/twitter\.com\/share[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, '$1');

  // culturepeople.co.kr/bbs 구 사이트 링크
  c = c.replace(/<a\s+[^>]*href="https?:\/\/(?:www\.)?culturepeople\.co\.kr\/bbs[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, '$1');

  // kakao.ai 링크 → 텍스트 보존
  c = c.replace(/<a\s+[^>]*href="https?:\/\/kakao\.ai[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, '$1');

  // mt.co.kr/viewer 이미지 뷰어 링크 → img 보존
  c = c.replace(/<a\s+[^>]*href="https?:\/\/www\.mt\.co\.kr\/viewer[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, '$1');

  // kihoilbo 링크
  c = c.replace(/<a\s+[^>]*href="https?:\/\/www\.kihoilbo\.co\.kr[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, '$1');

  // handmk 링크
  c = c.replace(/<a\s+[^>]*href="https?:\/\/www\.handmk\.com[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, '$1');

  // instagram 임베드 링크
  c = c.replace(/<a\s+[^>]*href="https?:\/\/www\.instagram\.com[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, '$1');

  // newstong 링크
  c = c.replace(/<a\s+[^>]*href="https?:\/\/www\.newstong\.co\.kr[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, '$1');

  // bankofengland 링크
  c = c.replace(/<a\s+[^>]*href="https?:\/\/www\.bankofengland\.co\.uk[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, '$1');

  // HTML 엔티티 &#x3D; → =
  c = c.replace(/&#x3D;/g, '=');
  c = c.replace(/&#x27;/g, "'");

  // 빈 태그 정리
  c = c.replace(/<p>\s*<\/p>/g, '');
  c = c.replace(/<a\s*>\s*<\/a>/g, '');

  return c;
}

async function run() {
  console.log("=== 3차 정밀 수정 ===\n");

  // 삭제 대상: 본문 부족
  const deleteNos = [2645, 2654, 2657]; // 51, 72, 72자
  for (const no of deleteNos) {
    const art = await fetchArticle(no);
    if (art && art.status === "게시") {
      await softDelete(art.id);
      console.log(`삭제: #${no} ${art.title}`);
    }
  }

  // 수정 대상: 외부 링크/트래킹
  const fixNos = [14, 120, 1066, 1394, 1492, 1752, 2306, 2307, 2518, 2559, 2563, 2567, 2580, 2581, 2583, 2584, 2613, 2615, 2627, 2700, 2712, 2715, 2726, 2730, 2767, 2768, 2769, 2955];

  let fixed = 0;
  for (const no of fixNos) {
    const art = await fetchArticle(no);
    if (!art || art.status !== "게시") continue;

    const cleaned = cleanTrackingLinks(art.body);
    if (cleaned !== art.body) {
      const ok = await updateArticle(art.id, { body: cleaned });
      console.log(`수정: #${no} ${ok ? "✓" : "✗"}`);
      fixed++;
    } else {
      console.log(`변경없음: #${no}`);
    }
  }

  console.log(`\n=== 완료: 삭제 ${deleteNos.length}, 수정 ${fixed} ===`);
}

run().catch(console.error);
