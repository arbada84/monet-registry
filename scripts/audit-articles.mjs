#!/usr/bin/env node
/**
 * 기사 전수 검수 스크립트
 * - 타 언론사 바이라인/출처
 * - 무단전재/재배포 금지 문구
 * - HTML 엔티티 잔재
 * - 빈 HTML 태그
 * - 인코딩 깨짐
 * - 본문 부족
 * - 광고/프로모션 잔재
 * - 저작권 문구
 * - 타 매체 기자명
 * - 관련 기사 링크 잔재
 */

const SB_URL = "https://ifducnfrjarmlpktrjkj.supabase.co";
const SB_KEY = "" + process.env.SUPABASE_SERVICE_KEY + "";

const PAGE_SIZE = 500;

// 타 언론사/매체명 패턴 (기사 제목+본문에서 검출)
const OTHER_MEDIA_PATTERNS = [
  // 바이라인 패턴
  /(?:기자|특파원|통신원)\s*[=@]\s*\S+(?:뉴스|일보|신문|타임즈|투데이|경제|미디어|저널|포스트|데일리|매일|헤럴드|한겨레|조선|중앙|동아|국민|세계|서울|부산|대구|광주|대전|인천|강원|제주|연합)/i,
  // 출처 패턴
  /(?:출처|제공|사진제공|자료제공)\s*[=:]\s*\S+(?:뉴스|일보|신문|통신|방송|TV|라디오)/i,
  // 언론사명 직접 언급 (본문 끝부분)
  /[ⓒ©]\s*\d{4}\s*.+(?:뉴스|일보|신문|통신|방송|미디어|경제|투데이|데일리|타임즈|헤럴드|매일|포스트|저널)/i,
  // 이메일 바이라인
  /[a-zA-Z0-9._%+-]+@(?!culturepeople)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
];

// 무단전재/재배포 금지 패턴
const COPYRIGHT_PATTERNS = [
  /무단\s*전재/,
  /재배포\s*금지/,
  /무단\s*복제/,
  /저작권자/,
  /All\s*[Rr]ights?\s*[Rr]eserved/i,
  /ⓒ\s*\d{4}/,
  /©\s*\d{4}/,
];

// HTML 엔티티 잔재
const HTML_ENTITY_PATTERNS = [
  /&nbsp;/g,
  /&amp;(?!amp;|lt;|gt;|quot;)/g,
  /&middot;/g,
  /&hellip;/g,
  /&lsquo;|&rsquo;|&ldquo;|&rdquo;/g,
  /&#\d{2,5};/g,
  /&[a-zA-Z]+;/g,
];

// 빈 태그 패턴
const EMPTY_TAG_PATTERNS = [
  /<p>\s*<\/p>/g,
  /<strong>\s*<\/strong>/g,
  /<em>\s*<\/em>/g,
  /<span[^>]*>\s*<\/span>/g,
  /(<br\s*\/?>){3,}/g,
];

// 타 매체 기자명 패턴 — 바이라인 형태만 (본문 맥락 내 매체명 언급은 제외)
const OTHER_REPORTER_PATTERNS = [
  // "OO기자 = OO뉴스" 형태의 바이라인
  /\S{2,4}\s+기자\s*[=@]\s*\S+(?:뉴스|일보|신문)/,
  // "출처: OO뉴스" 형태
  /(?:^|\n)\s*(?:출처|제공)\s*[:=]\s*(?:연합뉴스|뉴시스|뉴스1|이데일리|머니투데이|헤럴드경제|아시아경제|파이낸셜뉴스|한국경제|매일경제|서울경제)/,
];

// 광고/프로모션 잔재 (본문 맥락 내 "카카오" 등 일반 사용은 제외)
const AD_PROMO_PATTERNS = [
  /관련\s*기사\s*[:·]/,
  /구독\s*(?:신청|안내)/,
  // 트래킹 링크만 (일반 외부 링크는 이미지/참조일 수 있으므로 제외)
  /<a\s+href="https?:\/\/track\./i,
];

// 인코딩 깨짐
const ENCODING_BROKEN = /[\ufffd\ufffc]/;

// strip HTML for text analysis
function stripHtml(html) {
  return html
    .replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, '') // figure 제거 (이미지)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchAllArticles() {
  let allArticles = [];
  let offset = 0;

  while (true) {
    const url = `${SB_URL}/rest/v1/articles?select=id,no,title,body,author,status,date,source_url,summary&status=eq.${encodeURIComponent("게시")}&order=no.asc&limit=${PAGE_SIZE}&offset=${offset}`;
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

function auditArticle(article) {
  const issues = [];
  const { title, body, author, no, summary } = article;

  if (!body || !title) {
    issues.push({ type: "MISSING", detail: !body ? "본문 없음" : "제목 없음" });
    return issues;
  }

  const plainBody = stripHtml(body);
  const fullText = `${title} ${plainBody}`;

  // 1. 인코딩 깨짐
  if (ENCODING_BROKEN.test(fullText)) {
    issues.push({ type: "ENCODING", detail: "인코딩 깨짐 문자(�) 발견" });
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
      // &amp; in href는 정상이므로 제외
      const realMatches = matches.filter(m => {
        // href 내부의 &amp;는 정상
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
      // 외부 링크는 source_url과 다른 도메인인 경우만
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

  // 9. author가 "박영래 기자"가 아닌 경우
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
  // figure/img의 style/class는 정상이므로 figure 외부만 체크
  if (classMatches && classMatches.length > 3) {
    // figure 내부가 아닌 class만 카운트
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

  return issues;
}

async function runAudit() {
  console.log("=== 기사 전수 검수 시작 ===");
  console.log(`시작: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`);
  console.log("");

  console.error("기사 로드 중...");
  const articles = await fetchAllArticles();
  console.log(`총 ${articles.length}건 로드 완료\n`);

  const issuesByType = {};
  const problemArticles = [];

  for (const article of articles) {
    const issues = auditArticle(article);
    if (issues.length > 0) {
      problemArticles.push({ no: article.no, title: article.title, date: article.date, issues });
      for (const issue of issues) {
        if (!issuesByType[issue.type]) issuesByType[issue.type] = [];
        issuesByType[issue.type].push({ no: article.no, detail: issue.detail });
      }
    }
  }

  // 결과 출력
  console.log("========================================");
  console.log("         검수 결과 요약");
  console.log("========================================");
  console.log(`검사 기사: ${articles.length}건`);
  console.log(`문제 기사: ${problemArticles.length}건`);
  console.log(`정상 기사: ${articles.length - problemArticles.length}건`);
  console.log("");

  // 유형별 통계
  console.log("--- 유형별 통계 ---");
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
    MISSING: "제목/본문 누락",
  };

  for (const [type, items] of Object.entries(issuesByType).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${typeLabels[type] || type}: ${items.length}건`);
  }

  console.log("\n--- 문제 기사 상세 ---");
  for (const art of problemArticles.sort((a, b) => a.no - b.no)) {
    console.log(`\n[#${art.no}] ${art.title} (${art.date})`);
    for (const issue of art.issues) {
      console.log(`  ⚠ ${typeLabels[issue.type] || issue.type}: ${issue.detail}`);
    }
  }

  // JSON 결과도 저장
  const result = {
    timestamp: new Date().toISOString(),
    total: articles.length,
    problems: problemArticles.length,
    clean: articles.length - problemArticles.length,
    byType: Object.fromEntries(
      Object.entries(issuesByType).map(([k, v]) => [k, v.length])
    ),
    articles: problemArticles,
  };

  const fs = await import("fs");
  fs.writeFileSync("scripts/audit-result.json", JSON.stringify(result, null, 2));
  console.log("\n\n결과 저장: scripts/audit-result.json");

  return result;
}

runAudit().catch(console.error);
