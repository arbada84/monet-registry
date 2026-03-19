#!/usr/bin/env node
/**
 * 기사 전수 검수 — 자동 수정 스크립트
 * 1. HTML 엔티티 디코딩 (본문 + 요약)
 * 2. 빈 태그 제거
 * 3. 인코딩 깨짐 기사 삭제
 * 4. 본문 부족 기사 삭제
 * 5. 타 매체 기자명/출처 제거
 * 6. 외부 링크 제거
 * 7. 광고/프로모션 잔재 제거
 * 8. 저작권 문구 제거
 */

const SB_URL = "https://ifducnfrjarmlpktrjkj.supabase.co";
const SB_KEY = "" + process.env.SUPABASE_SERVICE_KEY + "";

const result = JSON.parse((await import("fs")).readFileSync("scripts/audit-result.json", "utf8"));

// HTML 엔티티 디코딩 맵
const ENTITY_MAP = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
  "&quot;": '"', "&apos;": "'", "&#39;": "'", "&#039;": "'",
  "&lsquo;": "\u2018", "&rsquo;": "\u2019", "&ldquo;": "\u201C", "&rdquo;": "\u201D",
  "&middot;": "\u00B7", "&hellip;": "\u2026", "&ndash;": "\u2013", "&mdash;": "\u2014",
  "&bull;": "\u2022", "&trade;": "\u2122", "&copy;": "\u00A9", "&reg;": "\u00AE",
  "&times;": "\u00D7", "&divide;": "\u00F7", "&shy;": "",
};

function decodeEntities(str) {
  if (!str) return str;
  let result = str;
  // Named entities
  for (const [entity, char] of Object.entries(ENTITY_MAP)) {
    result = result.replaceAll(entity, char);
  }
  // Numeric entities &#NNN;
  result = result.replace(/&#(\d{1,5});/g, (_, n) => {
    const code = parseInt(n, 10);
    return code > 0 && code < 65536 ? String.fromCharCode(code) : '';
  });
  // Hex entities &#xHHH;
  result = result.replace(/&#x([0-9a-fA-F]{1,4});/g, (_, h) => {
    const code = parseInt(h, 16);
    return code > 0 && code < 65536 ? String.fromCharCode(code) : '';
  });
  return result;
}

function cleanBody(body) {
  if (!body) return body;
  let cleaned = body;

  // 1. HTML 엔티티 디코딩 (href 내부는 보존)
  // href 속성 안의 &amp;는 보존해야 하므로 href를 임시 치환
  const hrefs = [];
  cleaned = cleaned.replace(/href="[^"]*"/g, (m) => {
    hrefs.push(m);
    return `__HREF_${hrefs.length - 1}__`;
  });
  cleaned = decodeEntities(cleaned);
  // href 복원
  cleaned = cleaned.replace(/__HREF_(\d+)__/g, (_, i) => hrefs[parseInt(i)]);

  // 2. 빈 태그 제거
  cleaned = cleaned.replace(/<p>\s*<\/p>/g, '');
  cleaned = cleaned.replace(/<strong>\s*<\/strong>/g, '');
  cleaned = cleaned.replace(/<em>\s*<\/em>/g, '');
  cleaned = cleaned.replace(/<span[^>]*>\s*<\/span>/g, '');
  cleaned = cleaned.replace(/(<br\s*\/?>){3,}/g, '<br><br>');

  // 3. 저작권/무단전재 문구 제거
  cleaned = cleaned.replace(/<p>[^<]*(?:무단\s*전재|재배포\s*금지|무단\s*복제|저작권자|All\s*[Rr]ights?\s*[Rr]eserved)[^<]*<\/p>/gi, '');
  cleaned = cleaned.replace(/[ⓒ©]\s*\d{4}[^<\n]*/g, '');

  // 4. 외부 링크 <a> 태그 → 텍스트만 보존
  cleaned = cleaned.replace(/<a\s+href="https?:\/\/(?!ifducnfrjarmlpktrjkj\.supabase|culturepeople)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, '$1');

  // 5. 광고/프로모션/관련 기사 문구 제거
  cleaned = cleaned.replace(/<p>[^<]*(?:관련\s*기사\s*[:·]|구독\s*(?:신청|하기|안내)|(?:네이버|다음|카카오)\s*(?:구독|채널|뉴스))[^<]*<\/p>/gi, '');

  // 6. 타 매체 바이라인 제거 (본문 마지막 단락)
  cleaned = cleaned.replace(/<p>\s*(?:\S{2,4}\s+기자\s*[=@(][^<]*)<\/p>\s*$/i, '');

  // 7. 연속 빈 줄 정리
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.trim();

  return cleaned;
}

function cleanSummary(summary) {
  if (!summary) return summary;
  return decodeEntities(summary).trim();
}

async function updateArticle(id, updates) {
  const res = await fetch(`${SB_URL}/rest/v1/articles?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(updates),
  });
  return res.ok;
}

async function deleteArticle(id) {
  const res = await fetch(`${SB_URL}/rest/v1/articles?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ status: "삭제" }),
  });
  return res.ok;
}

async function fetchArticle(no) {
  const res = await fetch(
    `${SB_URL}/rest/v1/articles?no=eq.${no}&select=id,no,title,body,summary,author,status`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

async function run() {
  console.log("=== 자동 수정 시작 ===\n");

  const deleteNos = new Set();
  const fixNos = new Set();

  // 인코딩 깨짐 → 삭제
  const encodingArticles = result.articles.filter(a => a.issues.some(i => i.type === "ENCODING"));
  for (const a of encodingArticles) deleteNos.add(a.no);

  // 본문 부족 (0자) → 삭제
  const shortArticles = result.articles.filter(a => a.issues.some(i => i.type === "SHORT_BODY"));
  for (const a of shortArticles) {
    const detail = a.issues.find(i => i.type === "SHORT_BODY")?.detail || "";
    const len = parseInt(detail.match(/(\d+)자/)?.[1] || "999");
    if (len <= 50) deleteNos.add(a.no);
    else fixNos.add(a.no); // 50자 초과는 수정 시도
  }

  // 나머지 문제 기사 → 수정
  for (const a of result.articles) {
    if (!deleteNos.has(a.no)) fixNos.add(a.no);
  }

  // 삭제 처리
  console.log(`--- 삭제 대상: ${deleteNos.size}건 ---`);
  for (const no of deleteNos) {
    const art = await fetchArticle(no);
    if (!art) { console.log(`  #${no}: 이미 없음`); continue; }
    const ok = await deleteArticle(art.id);
    console.log(`  #${no} ${art.title}: ${ok ? "삭제 완료" : "삭제 실패"}`);
    fixNos.delete(no);
  }

  // 수정 처리
  console.log(`\n--- 수정 대상: ${fixNos.size}건 ---`);
  let fixed = 0, skipped = 0;
  for (const no of [...fixNos].sort((a, b) => a - b)) {
    const art = await fetchArticle(no);
    if (!art) { console.log(`  #${no}: 없음`); continue; }

    const updates = {};
    let changed = false;

    // 본문 수정
    const cleanedBody = cleanBody(art.body);
    if (cleanedBody !== art.body) {
      updates.body = cleanedBody;
      changed = true;
    }

    // 요약 수정
    const cleanedSummary = cleanSummary(art.summary);
    if (cleanedSummary !== art.summary) {
      updates.summary = cleanedSummary;
      changed = true;
    }

    // 제목 수정 (매체명 제거)
    const cleanedTitle = decodeEntities(art.title);
    if (cleanedTitle !== art.title) {
      updates.title = cleanedTitle;
      changed = true;
    }

    if (changed) {
      const ok = await updateArticle(art.id, updates);
      console.log(`  #${no}: ${ok ? "수정 완료" : "수정 실패"} (${Object.keys(updates).join(",")})`);
      fixed++;
    } else {
      skipped++;
    }
  }

  console.log(`\n=== 완료 ===`);
  console.log(`삭제: ${deleteNos.size}건`);
  console.log(`수정: ${fixed}건`);
  console.log(`변경 없음: ${skipped}건`);
}

run().catch(console.error);
