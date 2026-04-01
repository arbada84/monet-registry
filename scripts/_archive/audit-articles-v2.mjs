#!/usr/bin/env node
/**
 * 기사 전수 검수 스크립트 v2
 * 기존 audit-articles.mjs 14유형 + 신규 9유형 = 23유형 검사
 *
 * 유형 목록:
 *   기존: ENCODING, SHORT_BODY, OTHER_MEDIA, COPYRIGHT, HTML_ENTITY, EMPTY_TAGS,
 *         OTHER_REPORTER, AD_PROMO, WRONG_AUTHOR, TITLE_MEDIA, HTML_CLASS,
 *         SUMMARY_ENTITY, EXTERNAL_LINK, MISSING_CONTENT
 *   신규: RISKY_IMAGE, DUPLICATE_SOURCE_URL, DUPLICATE_TITLE, DUPLICATE_TITLE_DIFF_DATE,
 *         NEWSWIRE, UI_REMNANT, NAMECARD, BASE64_IMG, TRACKING_PIXEL,
 *         BLOCKED_KEYWORD, FORBIDDEN_EXPR
 */

import { writeFileSync } from "fs";

const SB_URL = "https://ifducnfrjarmlpktrjkj.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SB_KEY) {
  console.error("SUPABASE_SERVICE_KEY 환경변수가 설정되지 않았습니다.");
  process.exit(1);
}

const PAGE_SIZE = 500;

// ============================================================
// 기존 패턴 (audit-articles.mjs 그대로)
// ============================================================

const OTHER_MEDIA_PATTERNS = [
  /(?:기자|특파원|통신원)\s*[=@]\s*\S+(?:뉴스|일보|신문|타임즈|투데이|경제|미디어|저널|포스트|데일리|매일|헤럴드|한겨레|조선|중앙|동아|국민|세계|서울|부산|대구|광주|대전|인천|강원|제주|연합)/i,
  /(?:출처|제공|사진제공|자료제공)\s*[=:]\s*\S+(?:뉴스|일보|신문|통신|방송|TV|라디오)/i,
  /[ⓒ©]\s*\d{4}\s*.+(?:뉴스|일보|신문|통신|방송|미디어|경제|투데이|데일리|타임즈|헤럴드|매일|포스트|저널)/i,
  /[a-zA-Z0-9._%+-]+@(?!culturepeople)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
];

const COPYRIGHT_PATTERNS = [
  /무단\s*전재/,
  /재배포\s*금지/,
  /무단\s*복제/,
  /저작권자/,
  /All\s*[Rr]ights?\s*[Rr]eserved/i,
  /ⓒ\s*\d{4}/,
  /©\s*\d{4}/,
];

const HTML_ENTITY_PATTERNS = [
  /&nbsp;/g,
  /&amp;(?!amp;|lt;|gt;|quot;)/g,
  /&middot;/g,
  /&hellip;/g,
  /&lsquo;|&rsquo;|&ldquo;|&rdquo;/g,
  /&#\d{2,5};/g,
  /&[a-zA-Z]+;/g,
];

const EMPTY_TAG_PATTERNS = [
  /<p>\s*<\/p>/g,
  /<strong>\s*<\/strong>/g,
  /<em>\s*<\/em>/g,
  /<span[^>]*>\s*<\/span>/g,
  /(<br\s*\/?>){3,}/g,
];

const OTHER_REPORTER_PATTERNS = [
  /\S{2,4}\s+기자\s*[=@]\s*\S+(?:뉴스|일보|신문)/,
  /(?:^|\n)\s*(?:출처|제공)\s*[:=]\s*(?:연합뉴스|뉴시스|뉴스1|이데일리|머니투데이|헤럴드경제|아시아경제|파이낸셜뉴스|한국경제|매일경제|서울경제)/,
];

const AD_PROMO_PATTERNS = [
  /관련\s*기사\s*[:·]/,
  /구독\s*(?:신청|안내)/,
  /<a\s+href="https?:\/\/track\./i,
];

const ENCODING_BROKEN = /[\ufffd\ufffc]/;

// ============================================================
// 신규 패턴 (07-RESEARCH.md 기반)
// ============================================================

// 저작권 위험 이미지 도메인 (48개)
const RISKY_DOMAINS = [
  // 통신사
  'yonhapnews', 'yna.co.kr', 'apimages', 'ap.org',
  'afp.com', 'reuters.com', 'gettyimages', 'epa.eu', 'shutterstock',
  // 종합일간지
  'chosun.com', 'joongang', 'joins.com', 'donga.com',
  'hani.co.kr', 'khan.co.kr', 'hankookilbo', 'kmib.co.kr',
  'segye.com', 'seoul.co.kr', 'munhwa.com',
  // 경제지
  'mk.co.kr', 'hankyung.com', 'sedaily.com', 'asiae.co.kr',
  'mt.co.kr', 'fnnews.com', 'heraldcorp', 'edaily.co.kr',
  // 방송사
  'kbs.co.kr', 'imbc.com', 'sbs.co.kr', 'jtbc',
  'tvchosun', 'ichannela', 'mbn.co.kr', 'ytn.co.kr',
  // 스포츠/연예
  'sportschosun', 'sportsdonga', 'isplus.com',
  'osen', 'starnewskorea', 'news1.kr', 'newsis.com', 'xportsnews',
  // 해외
  'nytimes.com', 'washingtonpost', 'bbc.co', 'cnn.com',
  'bloomberg.com', 'nhk.or.jp',
];

function isRiskyDomain(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (lower.includes('ifducnfrjarmlpktrjkj.supabase')) return false;
  if (lower.includes('culturepeople.co.kr')) return false;
  return RISKY_DOMAINS.some(d => lower.includes(d));
}

// 뉴스와이어 잔재
const NEWSWIRE_PATTERNS = [
  /뉴스와이어/,
  /뉴스\s*제공/,
  /배포\s*서비스/,
  /국내\s*최대\s*배포/,
  /--\s*\(뉴스와이어\)\s*--/,
  /\S+--\(뉴스와이어\)/,
  /보도자료\s*배포/,
  /newswire/i,
];

// UI 잔재
const UI_REMNANT_PATTERNS = [
  /(?:공유|스크랩|인쇄|글씨크기)\s*(?:하기|버튼|조절)/,
  /(?:페이스북|트위터|카카오)\s*공유/,
  /기사\s*(?:입력|수정)\s*\d{4}/,
  /관련\s*보도자료/,
];

// 명함/연락처 블록
const NAMECARD_PATTERNS = [
  /(?:담당|문의|연락처|홍보|PR)\s*[:：]\s*\S+\s*(?:\/|\|)\s*\d{2,4}[-.]?\d{3,4}[-.]?\d{4}/,
  /(?:전화|TEL|Tel)\s*[:：]?\s*\d{2,4}[-.]?\d{3,4}[-.]?\d{4}\s*(?:\/|\||\n)\s*(?:팩스|FAX|Fax)\s*[:：]?\s*\d{2,4}[-.]?\d{3,4}[-.]?\d{4}/i,
  /\S+@\S+\.\S+\s*(?:\/|\|)\s*\d{2,4}[-.]?\d{3,4}[-.]?\d{4}/,
];

// 금지 표현
const FORBIDDEN_EXPRESSIONS = [
  /에\s*대해\s*알아보겠습니다/,
  /를?\s*살펴보겠습니다/,
  /에\s*대해\s*살펴보겠습니다/,
  /알아보도록\s*하겠습니다/,
  /살펴보도록\s*하겠습니다/,
  /함께\s*알아볼까요/,
];

// ============================================================
// 유틸리티
// ============================================================

function stripHtml(html) {
  return html
    .replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTitle(t) {
  return t.replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase()
    .normalize("NFC");
}

// ============================================================
// 데이터 로드
// ============================================================

async function fetchAllArticles() {
  let allArticles = [];
  let offset = 0;

  while (true) {
    const url = `${SB_URL}/rest/v1/articles?select=id,no,title,body,author,status,date,source_url,summary,created_at&status=eq.${encodeURIComponent("게시")}&order=no.asc&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
      },
    });

    if (!res.ok) {
      console.error(`HTTP ${res.status} at offset ${offset}`);
      break;
    }

    const rows = await res.json();
    if (rows.length === 0) break;

    allArticles.push(...rows);
    console.error(`  로드: ${allArticles.length}건...`);
    offset += PAGE_SIZE;

    if (rows.length < PAGE_SIZE) break;
  }

  return allArticles;
}

// ============================================================
// 개별 기사 감사 (기존 14유형)
// ============================================================

function auditArticleSingle(article) {
  const issues = [];
  const { title, body, author, summary } = article;

  if (!body || !title) {
    issues.push({ type: "MISSING_CONTENT", detail: !body ? "본문 없음" : "제목 없음" });
    return issues;
  }

  const plainBody = stripHtml(body);
  const fullText = `${title} ${plainBody}`;

  // 1. 인코딩 깨짐
  if (ENCODING_BROKEN.test(fullText)) {
    issues.push({ type: "ENCODING", detail: "인코딩 깨짐 문자 발견" });
  }

  // 2. 본문 부족
  if (plainBody.length < 50) {
    issues.push({ type: "SHORT_BODY", detail: `본문 ${plainBody.length}자 (50자 미만)` });
  }

  // 3. 타 언론사 바이라인/출처
  for (const pat of OTHER_MEDIA_PATTERNS) {
    const match = fullText.match(pat);
    if (match) {
      issues.push({ type: "OTHER_MEDIA", detail: `타 매체 정보: "${match[0].substring(0, 60)}"` });
      break;
    }
  }

  // 4. 무단전재/재배포 금지
  for (const pat of COPYRIGHT_PATTERNS) {
    const match = body.match(pat);
    if (match) {
      issues.push({ type: "COPYRIGHT", detail: `저작권 문구: "${match[0]}"` });
      break;
    }
  }

  // 5. HTML 엔티티 잔재
  for (const pat of HTML_ENTITY_PATTERNS) {
    const matches = body.match(pat);
    if (matches && matches.length > 0) {
      const realMatches = matches.filter(m => {
        return !/&amp;/.test(m) || !/href=/.test(body.substring(Math.max(0, body.indexOf(m) - 30), body.indexOf(m)));
      });
      if (realMatches.length > 2) {
        issues.push({ type: "HTML_ENTITY", detail: `HTML 엔티티 ${realMatches.length}개: ${realMatches.slice(0, 3).join(", ")}` });
        break;
      }
    }
  }

  // 6. 빈 태그
  for (const pat of EMPTY_TAG_PATTERNS) {
    const matches = body.match(pat);
    if (matches && matches.length > 2) {
      issues.push({ type: "EMPTY_TAGS", detail: `빈 태그 ${matches.length}개` });
      break;
    }
  }

  // 7. 타 매체 기자명
  for (const pat of OTHER_REPORTER_PATTERNS) {
    const match = plainBody.match(pat);
    if (match) {
      issues.push({ type: "OTHER_REPORTER", detail: `타 매체 기자: "${match[0].substring(0, 40)}"` });
      break;
    }
  }

  // 8. 광고/프로모션 잔재
  for (const pat of AD_PROMO_PATTERNS) {
    const match = body.match(pat);
    if (match) {
      if (pat.source.includes('href')) {
        const hrefMatch = body.match(/<a\s+href="(https?:\/\/(?!ifducnfrjarmlpktrjkj\.supabase|culturepeople)[^"]+)"/i);
        if (hrefMatch) {
          issues.push({ type: "EXTERNAL_LINK", detail: `외부 링크: ${hrefMatch[1].substring(0, 60)}` });
        }
      } else {
        issues.push({ type: "AD_PROMO", detail: `광고/프로모션: "${match[0].substring(0, 40)}"` });
      }
      break;
    }
  }

  // 9. 작성자 불일치
  if (author && author !== "박영래 기자" && author !== "박영래") {
    issues.push({ type: "WRONG_AUTHOR", detail: `작성자: "${author}" (규정: 박영래 기자)` });
  }

  // 10. 제목에 타 매체명
  const titleMediaMatch = title.match(/\[([^\]]*(?:뉴스|일보|신문|통신|경제|투데이|데일리|타임즈|헤럴드|매일|포스트|저널|방송|TV)[^\]]*)\]/);
  if (titleMediaMatch) {
    issues.push({ type: "TITLE_MEDIA", detail: `제목에 매체명: [${titleMediaMatch[1]}]` });
  }

  // 11. 본문에 class 속성 (HTML 잔재)
  const classMatches = body.match(/class="[^"]*"/g);
  if (classMatches && classMatches.length > 3) {
    const nonFigureHtml = body.replace(/<figure[\s\S]*?<\/figure>/gi, '');
    const realClassMatches = nonFigureHtml.match(/class="[^"]*"/g);
    if (realClassMatches && realClassMatches.length > 2) {
      issues.push({ type: "HTML_CLASS", detail: `HTML class 속성 ${realClassMatches.length}개 (원본 사이트 잔재)` });
    }
  }

  // 12. 요약에 HTML 엔티티
  if (summary) {
    const summaryEntityMatch = summary.match(/&[a-zA-Z]+;|&#\d+;/g);
    if (summaryEntityMatch && summaryEntityMatch.length > 0) {
      issues.push({ type: "SUMMARY_ENTITY", detail: `요약에 HTML 엔티티: ${summaryEntityMatch.slice(0, 3).join(", ")}` });
    }
  }

  // ============================================================
  // 신규 9유형 (v2 추가)
  // ============================================================

  // 13. 저작권 위험 이미지
  const imgSrcMatches = body.match(/src="(https?:\/\/[^"]+)"/gi) || [];
  for (const imgTag of imgSrcMatches) {
    const urlMatch = imgTag.match(/src="([^"]+)"/i);
    if (urlMatch && isRiskyDomain(urlMatch[1])) {
      issues.push({ type: "RISKY_IMAGE", detail: `저작권 위험: ${urlMatch[1].substring(0, 80)}` });
      break; // 1건만 리포트 (중복 방지)
    }
  }

  // 14. 뉴스와이어 잔재
  for (const pat of NEWSWIRE_PATTERNS) {
    const match = body.match(pat);
    if (match) {
      issues.push({ type: "NEWSWIRE", detail: `뉴스와이어: "${match[0].substring(0, 40)}"` });
      break;
    }
  }

  // 15. UI 잔재
  for (const pat of UI_REMNANT_PATTERNS) {
    const match = plainBody.match(pat);
    if (match) {
      issues.push({ type: "UI_REMNANT", detail: `UI 잔재: "${match[0].substring(0, 40)}"` });
      break;
    }
  }

  // 16. 명함/연락처 블록
  for (const pat of NAMECARD_PATTERNS) {
    const match = plainBody.match(pat);
    if (match) {
      issues.push({ type: "NAMECARD", detail: `명함/연락처: "${match[0].substring(0, 60)}"` });
      break;
    }
  }

  // 17. base64 이미지
  if (/src="data:image\//.test(body)) {
    issues.push({ type: "BASE64_IMG", detail: "base64 이미지 포함" });
  }

  // 18. 추적 픽셀
  if (/<img[^>]*(?:width="1"|height="1"|width='1'|height='1')[^>]*>/i.test(body)) {
    issues.push({ type: "TRACKING_PIXEL", detail: "1x1 추적 픽셀 포함" });
  }

  // 19. 금지 표현
  for (const pat of FORBIDDEN_EXPRESSIONS) {
    const match = plainBody.match(pat);
    if (match) {
      issues.push({ type: "FORBIDDEN_EXPR", detail: `금지 표현: "${match[0]}"` });
      break;
    }
  }

  // 20. "전대통령" 금지 키워드
  if (/전대통령/.test(fullText)) {
    issues.push({ type: "BLOCKED_KEYWORD", detail: "전대통령 키워드 포함" });
  }

  return issues;
}

// ============================================================
// 중복 검사 (전체 기사 로드 후 메모리에서 수행)
// ============================================================

function detectDuplicates(articles) {
  const duplicateIssues = new Map(); // id -> issues[]

  // 방법 1: source_url 기준 중복
  const sourceUrlMap = new Map();
  for (const art of articles) {
    if (art.source_url && art.source_url.trim()) {
      const key = art.source_url.trim();
      if (!sourceUrlMap.has(key)) sourceUrlMap.set(key, []);
      sourceUrlMap.get(key).push(art);
    }
  }

  for (const [url, group] of sourceUrlMap.entries()) {
    if (group.length > 1) {
      // 가장 오래된(no 작은) 1건 제외
      const sorted = group.sort((a, b) => a.no - b.no);
      for (let i = 1; i < sorted.length; i++) {
        const art = sorted[i];
        if (!duplicateIssues.has(art.id)) duplicateIssues.set(art.id, []);
        duplicateIssues.get(art.id).push({
          type: "DUPLICATE_SOURCE_URL",
          detail: `source_url 중복 (원본: #${sorted[0].no}, URL: ${url.substring(0, 60)})`,
        });
      }
    }
  }

  // 방법 2: 정규화 제목 + 날짜 기준 중복
  const titleDateMap = new Map();
  for (const art of articles) {
    if (!art.title) continue;
    const normTitle = normalizeTitle(art.title);
    const dateStr = (art.created_at || "").substring(0, 10); // YYYY-MM-DD
    const key = `${normTitle}|${dateStr}`;
    if (!titleDateMap.has(key)) titleDateMap.set(key, []);
    titleDateMap.get(key).push(art);
  }

  // 같은 제목 (날짜 무관) 그룹도 만들어서 DIFF_DATE 체크
  const titleOnlyMap = new Map();
  for (const art of articles) {
    if (!art.title) continue;
    const normTitle = normalizeTitle(art.title);
    if (!titleOnlyMap.has(normTitle)) titleOnlyMap.set(normTitle, []);
    titleOnlyMap.get(normTitle).push(art);
  }

  // 같은 제목 + 같은 날짜 중복
  for (const [, group] of titleDateMap.entries()) {
    if (group.length > 1) {
      const sorted = group.sort((a, b) => a.no - b.no);
      for (let i = 1; i < sorted.length; i++) {
        const art = sorted[i];
        if (!duplicateIssues.has(art.id)) duplicateIssues.set(art.id, []);
        // source_url 중복과 겹칠 수 있으므로 DUPLICATE_TITLE이 이미 없는 경우만
        const existing = duplicateIssues.get(art.id);
        if (!existing.some(e => e.type === "DUPLICATE_TITLE")) {
          existing.push({
            type: "DUPLICATE_TITLE",
            detail: `제목+날짜 중복 (원본: #${sorted[0].no}, 제목: "${art.title.substring(0, 40)}")`,
          });
        }
      }
    }
  }

  // 같은 제목 + 다른 날짜 (플래그만)
  for (const [, group] of titleOnlyMap.entries()) {
    if (group.length > 1) {
      // 날짜가 다른 조합이 있는지 확인
      const dates = new Set(group.map(a => (a.created_at || "").substring(0, 10)));
      if (dates.size > 1) {
        const sorted = group.sort((a, b) => a.no - b.no);
        for (let i = 1; i < sorted.length; i++) {
          const art = sorted[i];
          if (!duplicateIssues.has(art.id)) duplicateIssues.set(art.id, []);
          const existing = duplicateIssues.get(art.id);
          if (!existing.some(e => e.type === "DUPLICATE_TITLE_DIFF_DATE")) {
            existing.push({
              type: "DUPLICATE_TITLE_DIFF_DATE",
              detail: `같은 제목, 다른 날짜 (원본: #${sorted[0].no}, 날짜 ${(sorted[0].created_at || "").substring(0, 10)} vs ${(art.created_at || "").substring(0, 10)})`,
            });
          }
        }
      }
    }
  }

  return duplicateIssues;
}

// ============================================================
// 메인 감사 실행
// ============================================================

async function runAudit() {
  console.log("=== 기사 전수 검수 v2 시작 ===");
  console.log(`시작: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`);
  console.log(`검사 유형: 23개 (기존 14 + 신규 9)\n`);

  console.error("기사 로드 중...");
  const articles = await fetchAllArticles();
  console.log(`총 ${articles.length}건 로드 완료\n`);

  // 중복 검사 (전체 기사 대상)
  console.log("중복 검사 중...");
  const duplicateIssues = detectDuplicates(articles);
  console.log(`중복 검사 완료: ${duplicateIssues.size}건 탐지\n`);

  const issuesByType = {};
  const problemArticles = [];
  const total = articles.length;

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];

    if ((i + 1) % 500 === 0 || i === total - 1) {
      process.stderr.write(`\r  [${i + 1}/${total}] 검사 중...`);
    }

    // 개별 기사 감사 (기존 14 + 신규 단일 기사 검사)
    const issues = auditArticleSingle(article);

    // 중복 이슈 병합
    if (duplicateIssues.has(article.id)) {
      issues.push(...duplicateIssues.get(article.id));
    }

    if (issues.length > 0) {
      problemArticles.push({
        id: article.id,
        no: article.no,
        title: article.title,
        issues,
      });
      for (const issue of issues) {
        if (!issuesByType[issue.type]) issuesByType[issue.type] = [];
        issuesByType[issue.type].push({ no: article.no, detail: issue.detail });
      }
    }
  }

  console.error("\n");

  // 유형별 레이블
  const typeLabels = {
    ENCODING: "인코딩 깨짐",
    SHORT_BODY: "본문 부족",
    OTHER_MEDIA: "타 언론사 정보",
    COPYRIGHT: "저작권/무단전재 문구",
    HTML_ENTITY: "HTML 엔티티 잔재",
    EMPTY_TAGS: "빈 HTML 태그",
    OTHER_REPORTER: "타 매체 기자명",
    AD_PROMO: "광고/프로모션 잔재",
    EXTERNAL_LINK: "외부 링크",
    WRONG_AUTHOR: "작성자 불일치",
    TITLE_MEDIA: "제목 내 매체명",
    HTML_CLASS: "HTML class 잔재",
    SUMMARY_ENTITY: "요약 HTML 엔티티",
    MISSING_CONTENT: "제목/본문 누락",
    RISKY_IMAGE: "저작권 위험 이미지",
    DUPLICATE_SOURCE_URL: "source_url 중복",
    DUPLICATE_TITLE: "제목+날짜 중복",
    DUPLICATE_TITLE_DIFF_DATE: "제목 같음(다른 날짜)",
    NEWSWIRE: "뉴스와이어 잔재",
    UI_REMNANT: "UI 잔재",
    NAMECARD: "명함/연락처 블록",
    BASE64_IMG: "base64 이미지",
    TRACKING_PIXEL: "추적 픽셀",
    BLOCKED_KEYWORD: "전대통령 키워드",
    FORBIDDEN_EXPR: "금지 표현",
  };

  // 결과 출력
  console.log("========================================");
  console.log("       기사 전수 검수 v2 결과");
  console.log("========================================");
  console.log(`검사 기사: ${articles.length}건`);
  console.log(`문제 기사: ${problemArticles.length}건`);
  console.log(`정상 기사: ${articles.length - problemArticles.length}건`);
  console.log(`총 문제:   ${Object.values(issuesByType).reduce((s, v) => s + v.length, 0)}건`);
  console.log("");

  console.log("--- 유형별 통계 (건수 내림차순) ---");
  const sortedTypes = Object.entries(issuesByType).sort((a, b) => b[1].length - a[1].length);
  for (const [type, items] of sortedTypes) {
    console.log(`  ${(typeLabels[type] || type).padEnd(20)} ${String(items.length).padStart(5)}건`);
  }

  // 누락된 유형 (0건) 표시
  const allTypes = [
    "ENCODING", "SHORT_BODY", "OTHER_MEDIA", "COPYRIGHT", "HTML_ENTITY",
    "EMPTY_TAGS", "OTHER_REPORTER", "AD_PROMO", "EXTERNAL_LINK", "WRONG_AUTHOR",
    "TITLE_MEDIA", "HTML_CLASS", "SUMMARY_ENTITY", "MISSING_CONTENT",
    "RISKY_IMAGE", "DUPLICATE_SOURCE_URL", "DUPLICATE_TITLE", "DUPLICATE_TITLE_DIFF_DATE",
    "NEWSWIRE", "UI_REMNANT", "NAMECARD", "BASE64_IMG", "TRACKING_PIXEL",
    "BLOCKED_KEYWORD", "FORBIDDEN_EXPR",
  ];
  const missingTypes = allTypes.filter(t => !issuesByType[t]);
  if (missingTypes.length > 0) {
    console.log("\n  (0건 유형)");
    for (const t of missingTypes) {
      console.log(`  ${(typeLabels[t] || t).padEnd(20)}     0건`);
    }
  }

  // JSON 결과 저장
  const summary = {};
  for (const t of allTypes) {
    summary[t] = issuesByType[t] ? issuesByType[t].length : 0;
  }

  const result = {
    timestamp: new Date().toISOString(),
    totalArticles: articles.length,
    totalProblems: problemArticles.length,
    totalIssues: Object.values(issuesByType).reduce((s, v) => s + v.length, 0),
    summary,
    articles: problemArticles,
  };

  writeFileSync("scripts/audit-result-v2.json", JSON.stringify(result, null, 2));
  console.log("\n결과 저장: scripts/audit-result-v2.json");

  return result;
}

runAudit().catch(err => {
  console.error("감사 실행 오류:", err);
  process.exit(1);
});
