#!/usr/bin/env node
/**
 * 기사 전수 검수 v2 — 통합 자동 수정 스크립트
 *
 * audit-result-v2.json을 읽어 유형별 자동 수정/삭제 실행
 * --dry-run: 실제 DB 변경 없이 변경 내용만 출력
 *
 * 삭제 유형: ENCODING, SHORT_BODY, MISSING_CONTENT, BLOCKED_KEYWORD,
 *           DUPLICATE_SOURCE_URL, DUPLICATE_TITLE
 * 수정 유형: RISKY_IMAGE, BASE64_IMG, TRACKING_PIXEL, OTHER_MEDIA,
 *           OTHER_REPORTER, COPYRIGHT, NEWSWIRE, UI_REMNANT, NAMECARD,
 *           HTML_ENTITY, SUMMARY_ENTITY, EMPTY_TAGS, HTML_CLASS,
 *           EXTERNAL_LINK, AD_PROMO, TITLE_MEDIA, WRONG_AUTHOR
 */

import { readFileSync } from "fs";

const SB_URL = "https://ifducnfrjarmlpktrjkj.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SB_KEY) {
  console.error("SUPABASE_SERVICE_KEY 환경변수가 설정되지 않았습니다.");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");
const DELAY_MS = 100;

// ============================================================
// 감사 결과 로드
// ============================================================

const auditResult = JSON.parse(readFileSync("scripts/audit-result-v2.json", "utf8"));
console.log(`=== 기사 전수 수정 v2 ${DRY_RUN ? "(DRY RUN)" : ""} ===`);
console.log(`문제 기사: ${auditResult.totalProblems}건\n`);

// ============================================================
// 삭제/수정 분류
// ============================================================

const DELETE_TYPES = new Set([
  "ENCODING", "SHORT_BODY", "MISSING_CONTENT", "BLOCKED_KEYWORD",
  "DUPLICATE_SOURCE_URL", "DUPLICATE_TITLE",
]);

// 기사별로 삭제 대상인지 수정 대상인지 분류
const deleteArticles = [];
const fixArticles = [];

for (const art of auditResult.articles) {
  const hasDeleteIssue = art.issues.some(i => DELETE_TYPES.has(i.type));
  if (hasDeleteIssue) {
    deleteArticles.push(art);
  } else {
    fixArticles.push(art);
  }
}

console.log(`삭제 대상: ${deleteArticles.length}건`);
console.log(`수정 대상: ${fixArticles.length}건\n`);

// ============================================================
// 저작권 위험 도메인 목록 (audit-articles-v2.mjs와 동일)
// ============================================================

const RISKY_DOMAINS = [
  'yonhapnews', 'yna.co.kr', 'apimages', 'ap.org',
  'afp.com', 'reuters.com', 'gettyimages', 'epa.eu', 'shutterstock',
  'chosun.com', 'joongang', 'joins.com', 'donga.com',
  'hani.co.kr', 'khan.co.kr', 'hankookilbo', 'kmib.co.kr',
  'segye.com', 'seoul.co.kr', 'munhwa.com',
  'mk.co.kr', 'hankyung.com', 'sedaily.com', 'asiae.co.kr',
  'mt.co.kr', 'fnnews.com', 'heraldcorp', 'edaily.co.kr',
  'kbs.co.kr', 'imbc.com', 'sbs.co.kr', 'jtbc',
  'tvchosun', 'ichannela', 'mbn.co.kr', 'ytn.co.kr',
  'sportschosun', 'sportsdonga', 'isplus.com',
  'osen', 'starnewskorea', 'news1.kr', 'newsis.com', 'xportsnews',
  'nytimes.com', 'washingtonpost', 'bbc.co', 'cnn.com',
  'bloomberg.com', 'nhk.or.jp',
];

function isRiskyDomain(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return RISKY_DOMAINS.some(d => lower.includes(d));
}

// ============================================================
// HTML 엔티티 디코딩 맵 (audit-fix.mjs + audit-fix2.mjs 통합)
// ============================================================

const ENTITY_MAP = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
  "&quot;": '"', "&apos;": "'", "&#39;": "'", "&#039;": "'",
  "&lsquo;": "\u2018", "&rsquo;": "\u2019", "&ldquo;": "\u201C", "&rdquo;": "\u201D",
  "&middot;": "\u00B7", "&hellip;": "\u2026", "&ndash;": "\u2013", "&mdash;": "\u2014",
  "&bull;": "\u2022", "&trade;": "\u2122", "&copy;": "\u00A9", "&reg;": "\u00AE",
  "&times;": "\u00D7", "&divide;": "\u00F7", "&shy;": "",
  "&laquo;": "\u00AB", "&raquo;": "\u00BB",
  "&cent;": "\u00A2", "&pound;": "\u00A3", "&yen;": "\u00A5", "&euro;": "\u20AC",
  "&para;": "\u00B6", "&sect;": "\u00A7", "&deg;": "\u00B0",
  "&frac12;": "\u00BD", "&frac14;": "\u00BC", "&frac34;": "\u00BE",
};

function decodeEntities(str) {
  if (!str) return str;
  let result = str;
  for (const [entity, char] of Object.entries(ENTITY_MAP)) {
    result = result.replaceAll(entity, char);
  }
  result = result.replace(/&#(\d{1,5});/g, (_, n) => {
    const code = parseInt(n, 10);
    return code > 0 && code < 65536 ? String.fromCharCode(code) : '';
  });
  result = result.replace(/&#x([0-9a-fA-F]{1,4});/g, (_, h) => {
    const code = parseInt(h, 16);
    return code > 0 && code < 65536 ? String.fromCharCode(code) : '';
  });
  return result;
}

// ============================================================
// 본문 수정 함수 (유형별 순차 적용)
// ============================================================

function fixBody(body, issues) {
  if (!body) return body;
  let cleaned = body;
  const issueTypes = new Set(issues.map(i => i.type));

  // 1. RISKY_IMAGE: 저작권 위험 도메인 이미지 제거
  if (issueTypes.has("RISKY_IMAGE")) {
    // figure 안에 있는 risky img 전체 figure 제거
    cleaned = cleaned.replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, (match) => {
      const srcMatch = match.match(/src="([^"]+)"/i);
      if (srcMatch && isRiskyDomain(srcMatch[1])) return '';
      return match;
    });
    // figure 밖의 단독 img 제거
    cleaned = cleaned.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, (match, src) => {
      if (isRiskyDomain(src)) return '';
      return match;
    });
  }

  // 2. BASE64_IMG: base64 이미지 제거
  if (issueTypes.has("BASE64_IMG")) {
    cleaned = cleaned.replace(/<img[^>]*src="data:image\/[^"]*"[^>]*\/?>/gi, '');
  }

  // 3. TRACKING_PIXEL: 추적 픽셀 제거
  if (issueTypes.has("TRACKING_PIXEL")) {
    cleaned = cleaned.replace(/<img[^>]*(?:width=["']1["']|height=["']1["'])[^>]*\/?>/gi, '');
  }

  // 4. OTHER_MEDIA + OTHER_REPORTER + COPYRIGHT: 바이라인/저작권 문구 제거
  if (issueTypes.has("OTHER_MEDIA") || issueTypes.has("OTHER_REPORTER") || issueTypes.has("COPYRIGHT")) {
    // 저작권/무단전재 문구 줄 제거
    cleaned = cleaned.replace(/<p>[^<]*(?:무단\s*전재|재배포\s*금지|무단\s*복제|저작권자|All\s*[Rr]ights?\s*[Rr]eserved)[^<]*<\/p>/gi, '');
    cleaned = cleaned.replace(/[ⓒ©]\s*\d{4}[^<\n]*/g, '');
    // 타 매체 바이라인 제거
    cleaned = cleaned.replace(/<p>\s*(?:\S{2,4}\s+기자\s*[=@(][^<]*)<\/p>/gi, '');
    // 출처/제공 줄 제거
    cleaned = cleaned.replace(/<p>[^<]*(?:출처|제공|사진제공|자료제공)\s*[=:]\s*\S+(?:뉴스|일보|신문|통신|방송)[^<]*<\/p>/gi, '');
  }

  // 5. NEWSWIRE: 뉴스와이어 관련 문장/줄/이미지 제거
  if (issueTypes.has("NEWSWIRE")) {
    // 뉴스와이어 도메인 이미지 제거 (cdn.newswire.co.kr 등) - 큰따옴표+작은따옴표 모두
    cleaned = cleaned.replace(/<img[^>]*src=["'][^"']*newswire[^"']*["'][^>]*\/?>/gi, '');
    // <p> 태그 안의 뉴스와이어 문장 제거
    cleaned = cleaned.replace(/<p>[^<]*(?:뉴스와이어|newswire|뉴스\s*제공|배포\s*서비스|국내\s*최대\s*배포|보도자료\s*배포)[^<]*<\/p>/gi, '');
    // 태그 없는 줄에서도 제거
    cleaned = cleaned.replace(/(?:^|\n)[^\n<]*(?:뉴스와이어|newswire)[^\n<]*(?:\n|$)/gi, '\n');
  }

  // 6. UI_REMNANT: UI 잔재 문장 제거
  if (issueTypes.has("UI_REMNANT")) {
    cleaned = cleaned.replace(/<p>[^<]*(?:공유\s*(?:하기|버튼)|스크랩|인쇄\s*하기|글씨\s*크기\s*조절|페이스북\s*공유|트위터\s*공유|카카오\s*공유|기사\s*입력\s*\d{4}|기사\s*수정\s*\d{4}|관련\s*보도자료)[^<]*<\/p>/gi, '');
    // p 태그 없이 단독 텍스트인 경우도 처리
    cleaned = cleaned.replace(/(?:^|\n)[^\n<]*(?:공유\s*(?:하기|버튼)|스크랩\s*하기|인쇄\s*하기|글씨\s*크기)[^\n<]*(?:\n|$)/gi, '\n');
  }

  // 7. NAMECARD: 명함/연락처 블록 제거
  if (issueTypes.has("NAMECARD")) {
    cleaned = cleaned.replace(/<p>[^<]*(?:담당|문의|연락처|홍보|PR)\s*[:：]\s*\S+\s*(?:\/|\|)\s*\d{2,4}[-.]?\d{3,4}[-.]?\d{4}[^<]*<\/p>/gi, '');
    cleaned = cleaned.replace(/<p>[^<]*(?:전화|TEL|Tel)\s*[:：]?\s*\d{2,4}[-.]?\d{3,4}[-.]?\d{4}[^<]*<\/p>/gi, '');
  }

  // 8. HTML_ENTITY + SUMMARY_ENTITY: 엔티티 디코딩
  if (issueTypes.has("HTML_ENTITY") || issueTypes.has("SUMMARY_ENTITY")) {
    const hrefs = [];
    cleaned = cleaned.replace(/href="[^"]*"/g, (m) => {
      hrefs.push(m);
      return `__HREF_${hrefs.length - 1}__`;
    });
    cleaned = decodeEntities(cleaned);
    cleaned = cleaned.replace(/__HREF_(\d+)__/g, (_, i) => hrefs[parseInt(i)]);
  }

  // 9. EMPTY_TAGS: 빈 태그 제거
  if (issueTypes.has("EMPTY_TAGS")) {
    cleaned = cleaned.replace(/<p>\s*<\/p>/g, '');
    cleaned = cleaned.replace(/<p>&nbsp;<\/p>/g, '');
    cleaned = cleaned.replace(/<strong>\s*<\/strong>/g, '');
    cleaned = cleaned.replace(/<em>\s*<\/em>/g, '');
    cleaned = cleaned.replace(/<span[^>]*>\s*<\/span>/g, '');
    cleaned = cleaned.replace(/(<br\s*\/?>){3,}/g, '<br><br>');
  }

  // 10. HTML_CLASS: figure 외부의 class 속성 제거
  if (issueTypes.has("HTML_CLASS")) {
    // figure 태그를 보존하면서 figure 밖의 class 제거
    const figureBlocks = [];
    cleaned = cleaned.replace(/<figure[\s\S]*?<\/figure>/gi, (m) => {
      figureBlocks.push(m);
      return `__FIGURE_${figureBlocks.length - 1}__`;
    });
    cleaned = cleaned.replace(/\s+class="[^"]*"/g, '');
    cleaned = cleaned.replace(/__FIGURE_(\d+)__/g, (_, i) => figureBlocks[parseInt(i)]);
  }

  // 11. EXTERNAL_LINK: 외부 링크 텍스트만 보존
  if (issueTypes.has("EXTERNAL_LINK")) {
    cleaned = cleaned.replace(/<a\s+href="https?:\/\/(?!ifducnfrjarmlpktrjkj\.supabase|culturepeople)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, '$1');
  }

  // 12. AD_PROMO + TITLE_MEDIA
  if (issueTypes.has("AD_PROMO")) {
    cleaned = cleaned.replace(/<p>[^<]*(?:관련\s*기사\s*[:·]|구독\s*(?:신청|하기|안내)|(?:네이버|다음|카카오)\s*(?:구독|채널|뉴스))[^<]*<\/p>/gi, '');
  }

  // 공통 후처리: 연속 빈 줄 정리
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.trim();

  return cleaned;
}

// ============================================================
// Supabase API 헬퍼
// ============================================================

async function fetchArticleById(id) {
  const res = await fetch(
    `${SB_URL}/rest/v1/articles?id=eq.${id}&select=id,no,title,body,summary,author,status,thumbnail`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

async function patchArticle(id, updates) {
  if (DRY_RUN) return true;
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

async function softDelete(id) {
  return patchArticle(id, { status: "삭제" });
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function stripHtml(html) {
  return html
    .replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// 메인 실행
// ============================================================

async function run() {
  let deleted = 0, fixed = 0, failed = 0;
  const total = deleteArticles.length + fixArticles.length;
  let current = 0;

  // === 1단계: 삭제 처리 ===
  console.log("--- 삭제 처리 ---");
  for (const art of deleteArticles) {
    current++;
    const issueTypes = art.issues.map(i => i.type).join(", ");
    console.log(`[${current}/${total}] #${art.no} "${art.title.substring(0, 40)}" (${issueTypes})`);

    if (DRY_RUN) {
      console.log(`  -> [DRY] 소프트 삭제 예정`);
      deleted++;
    } else {
      const ok = await softDelete(art.id);
      if (ok) {
        console.log(`  -> 삭제 완료`);
        deleted++;
      } else {
        console.log(`  -> 삭제 실패!`);
        failed++;
      }
    }
    await delay(DELAY_MS);
  }

  // === 2단계: 수정 처리 ===
  console.log("\n--- 수정 처리 ---");
  for (const art of fixArticles) {
    current++;
    const issueTypes = art.issues.map(i => i.type).join(", ");
    console.log(`[${current}/${total}] #${art.no} "${art.title.substring(0, 40)}" (${issueTypes})`);

    // 현재 body 가져오기
    const currentArt = await fetchArticleById(art.id);
    if (!currentArt) {
      console.log(`  -> 기사 없음 (건너뜀)`);
      failed++;
      continue;
    }

    const updates = {};
    let changes = [];

    // 본문 수정
    const newBody = fixBody(currentArt.body, art.issues);
    if (newBody !== currentArt.body) {
      updates.body = newBody;
      changes.push("body");
    }

    // RISKY_IMAGE: thumbnail 필드도 확인
    if (art.issues.some(i => i.type === "RISKY_IMAGE") && currentArt.thumbnail) {
      if (isRiskyDomain(currentArt.thumbnail)) {
        updates.thumbnail = "";
        changes.push("thumbnail");
      }
    }

    // WRONG_AUTHOR: 작성자 수정
    if (art.issues.some(i => i.type === "WRONG_AUTHOR")) {
      updates.author = "박영래 기자";
      changes.push("author");
    }

    // TITLE_MEDIA: 제목에서 매체명 제거
    if (art.issues.some(i => i.type === "TITLE_MEDIA")) {
      const cleanedTitle = currentArt.title.replace(/\[([^\]]*(?:뉴스|일보|신문|통신|경제|투데이|데일리|타임즈|헤럴드|매일|포스트|저널|방송|TV)[^\]]*)\]/g, '').trim();
      if (cleanedTitle !== currentArt.title) {
        updates.title = cleanedTitle;
        changes.push("title");
      }
    }

    // SUMMARY_ENTITY: 요약 엔티티 디코딩
    if (art.issues.some(i => i.type === "SUMMARY_ENTITY") && currentArt.summary) {
      const cleanedSummary = decodeEntities(currentArt.summary).trim();
      if (cleanedSummary !== currentArt.summary) {
        updates.summary = cleanedSummary;
        changes.push("summary");
      }
    }

    // 이미지 제거 후 본문 비어버리면 소프트 삭제
    if (updates.body) {
      const plainAfter = stripHtml(updates.body);
      if (plainAfter.length < 30) {
        console.log(`  -> 수정 후 본문 ${plainAfter.length}자 (너무 짧음) -> 소프트 삭제`);
        if (DRY_RUN) {
          console.log(`  -> [DRY] 소프트 삭제 예정`);
          deleted++;
        } else {
          const ok = await softDelete(art.id);
          console.log(`  -> ${ok ? "삭제 완료" : "삭제 실패"}`);
          ok ? deleted++ : failed++;
        }
        await delay(DELAY_MS);
        continue;
      }
    }

    if (changes.length === 0) {
      console.log(`  -> 변경 없음 (건너뜀)`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`  -> [DRY] 수정 예정: ${changes.join(", ")}`);
      fixed++;
    } else {
      const ok = await patchArticle(art.id, updates);
      if (ok) {
        console.log(`  -> 수정 완료: ${changes.join(", ")}`);
        fixed++;
      } else {
        console.log(`  -> 수정 실패!`);
        failed++;
      }
    }
    await delay(DELAY_MS);
  }

  // === 최종 요약 ===
  console.log(`\n========================================`);
  console.log(`  수정 완료 요약 ${DRY_RUN ? "(DRY RUN)" : ""}`);
  console.log(`========================================`);
  console.log(`삭제: ${deleted}건`);
  console.log(`수정: ${fixed}건`);
  console.log(`실패: ${failed}건`);
  console.log(`총계: ${deleted + fixed + failed}/${total}건`);
}

run().catch(err => {
  console.error("수정 실행 오류:", err);
  process.exit(1);
});
