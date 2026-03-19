#!/usr/bin/env node
/**
 * 2차 정밀 수정 스크립트
 * - 외부 링크 (a태그 텍스트 보존, href 제거)
 * - 남은 HTML 엔티티 (&eacute; &#39; &#x3D; &uarr; 등)
 * - 타 매체 기자명 텍스트 제거
 * - 광고/프로모션 잔재 제거
 * - 본문 부족 기사 삭제
 * - 트래킹 링크 제거
 */

const SB_URL = "https://ifducnfrjarmlpktrjkj.supabase.co";
const SB_KEY = "" + process.env.SUPABASE_SERVICE_KEY + "";

const result = JSON.parse((await import("fs")).readFileSync("scripts/audit-result.json", "utf8"));

// 추가 엔티티 맵
const EXTRA_ENTITIES = {
  "&eacute;": "é", "&uarr;": "↑", "&darr;": "↓",
  "&larr;": "←", "&rarr;": "→", "&hearts;": "♥",
  "&spades;": "♠", "&clubs;": "♣", "&diams;": "♦",
};

function decodeAllEntities(str) {
  if (!str) return str;
  let r = str;
  for (const [e, c] of Object.entries(EXTRA_ENTITIES)) {
    r = r.replaceAll(e, c);
  }
  // &#39; &#039; &#x3D; 등
  r = r.replace(/&#(\d{1,5});/g, (_, n) => String.fromCharCode(parseInt(n)));
  r = r.replace(/&#x([0-9a-fA-F]{1,4});/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  r = r.replace(/&apos;/g, "'").replace(/&quot;/g, '"');
  r = r.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  r = r.replace(/&lsquo;/g, '\u2018').replace(/&rsquo;/g, '\u2019');
  r = r.replace(/&ldquo;/g, '\u201C').replace(/&rdquo;/g, '\u201D');
  r = r.replace(/&hellip;/g, '…').replace(/&middot;/g, '·');
  return r;
}

function deepCleanBody(body) {
  if (!body) return body;
  let c = body;

  // 1. 트래킹 링크 완전 제거 (track.maillink.co.kr 등)
  c = c.replace(/<a\s+[^>]*href="https?:\/\/track\.maillink\.co\.kr[^"]*"[^>]*>[\s\S]*?<\/a>/gi, '');

  // 2. SNS 공유 링크 제거
  c = c.replace(/<a\s+[^>]*href="https?:\/\/(?:twitter\.com\/share|www\.facebook\.com\/sharer)[^"]*"[^>]*>[\s\S]*?<\/a>/gi, '');

  // 3. 구 사이트 링크 제거
  c = c.replace(/<a\s+[^>]*href="https?:\/\/(?:www\.)?culturepeople\.co\.kr\/bbs\/[^"]*"[^>]*>[\s\S]*?<\/a>/gi, '');

  // 4. 일반 외부 링크 → 텍스트 보존
  c = c.replace(/<a\s+href="https?:\/\/(?!ifducnfrjarmlpktrjkj\.supabase)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, '$1');

  // 5. 타 매체명 텍스트 제거 (본문에서)
  const mediaNames = ["인사이트", "전자신문", "스포츠조선", "스포츠동아", "스포츠서울", "OSEN", "뉴시스", "뉴스1"];
  for (const name of mediaNames) {
    // "출처: 인사이트" 같은 패턴
    c = c.replace(new RegExp(`[\\(\\[]?\\s*(?:출처|제공|사진|자료)\\s*[:=]?\\s*${name}\\s*[\\)\\]]?`, 'g'), '');
    // 단독 줄로 등장하는 매체명
    c = c.replace(new RegExp(`<p>\\s*(?:\\/\\s*)?${name}\\s*(?:기자)?\\s*<\\/p>`, 'gi'), '');
  }

  // 6. "이정은 차장", "다른 부장" 같은 직함 바이라인 제거 (본문 끝 단락)
  c = c.replace(/<p>\s*\S{2,4}\s+(?:차장|부장|국장|부국장|편집장)\s*[^<]{0,30}<\/p>\s*$/i, '');

  // 7. "구독하기" "카카오 채널" 등 프로모션 제거
  c = c.replace(/<p>[^<]*(?:구독하기|구독 신청|카카오\s*채널)[^<]*<\/p>/gi, '');

  // 8. HTML 엔티티 디코딩 (href 보존)
  const hrefs = [];
  c = c.replace(/href="[^"]*"/g, (m) => { hrefs.push(m); return `__H${hrefs.length-1}__`; });
  c = decodeAllEntities(c);
  c = c.replace(/__H(\d+)__/g, (_, i) => hrefs[parseInt(i)]);

  // 9. 빈 태그/줄 정리
  c = c.replace(/<p>\s*<\/p>/g, '');
  c = c.replace(/\n{3,}/g, '\n\n');

  return c.trim();
}

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

async function run() {
  console.log("=== 2차 정밀 수정 시작 ===\n");

  // 본문 0자 기사 삭제
  const deleteNos = [2625];
  for (const no of deleteNos) {
    const art = await fetchArticle(no);
    if (art) {
      await updateArticle(art.id, { status: "삭제" });
      console.log(`삭제: #${no} ${art.title}`);
    }
  }

  let fixed = 0, skipped = 0;
  for (const a of result.articles) {
    if (deleteNos.includes(a.no)) continue;

    const art = await fetchArticle(a.no);
    if (!art) { console.log(`#${a.no}: 없음`); continue; }

    const updates = {};
    let changed = false;

    const cleanedBody = deepCleanBody(art.body);
    if (cleanedBody !== art.body) {
      updates.body = cleanedBody;
      changed = true;
    }

    const cleanedSummary = decodeAllEntities(art.summary);
    if (cleanedSummary !== art.summary) {
      updates.summary = cleanedSummary;
      changed = true;
    }

    if (changed) {
      const ok = await updateArticle(art.id, updates);
      const fields = Object.keys(updates).join(",");
      console.log(`수정: #${a.no} (${fields}) ${ok ? "✓" : "✗"}`);
      fixed++;
    } else {
      skipped++;
    }
  }

  console.log(`\n=== 2차 완료: 삭제 ${deleteNos.length}, 수정 ${fixed}, 변경없음 ${skipped} ===`);
}

run().catch(console.error);
