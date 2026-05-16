// @ts-nocheck
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  classifySourceEligibility,
  isKoreaPolicyRelevant,
  isMostlyEnglish,
  nextKstDailyRetryIso,
} from "../../cloudflare/auto-press-worker/src/index.js";

function makeNewswireItem(overrides = {}) {
  const source = {
    id: "nwrss_cult",
    name: "뉴스와이어 문화",
    boTable: "rss",
    rssUrl: "https://api.newswire.co.kr/rss/industry/1200",
  };
  return {
    id: "item-1",
    title: "국내 문화 행사 보도자료",
    source_id: source.id,
    source_name: source.name,
    source_url: "https://www.newswire.co.kr/newsRead.php?no=1034597&sourceType=rss",
    canonical_url: "",
    raw_json: JSON.stringify({ source }),
    ...overrides,
  };
}

function makeSource(overrides = {}) {
  return {
    title: "국내 문화 행사 보도자료",
    bodyText: "서울에서 열린 문화 행사와 국내 관객 반응을 소개합니다.",
    sourceUrl: "https://www.newswire.co.kr/newsRead.php?no=1034597&sourceType=rss",
    author: "국내문화재단",
    keywords: ["문화", "서울"],
    ...overrides,
  };
}

describe("auto-press worker source scope guard", () => {
  it("blocks mostly English global commercial Newswire items before AI work", () => {
    const decision = classifySourceEligibility(
      makeNewswireItem({
        title: "Omdia: Social media advertising to command nearly half of global online ad revenue by 2030",
      }),
      makeSource({
        title: "Omdia: Social media advertising to command nearly half of global online ad revenue by 2030",
        bodyText: "The global online advertising market is expected to reach $640 billion by 2030.",
        author: "Omdia",
        keywords: ["Media", "Overseas"],
      }),
    );

    expect(decision).toMatchObject({
      allowed: false,
      tier: "blocked_overseas",
    });
  });

  it("blocks global entertainment launches without a domestic signal", () => {
    const decision = classifySourceEligibility(
      makeNewswireItem({
        source_id: "nwrss_music",
        title: "Netflix KPop Demon Hunters Announce Official Global World Tour",
      }),
      makeSource({
        title: "Netflix KPop Demon Hunters Announce Official Global World Tour",
        bodyText: "Netflix announced an official global world tour for its entertainment property.",
        author: "Netflix",
        keywords: ["Music", "Entertainment"],
      }),
    );

    expect(decision).toMatchObject({
      allowed: false,
      tier: "blocked_global_commercial",
    });
  });

  it("does not treat topic words in Korean titles as a domestic provider", () => {
    const decision = classifySourceEligibility(
      makeNewswireItem({
        title: "옴디아 ‘소셜미디어 광고 시장, 2030년 6400억달러 규모로 성장’ 보고서 발간… 글로벌 온라인 광고 매출의 절반 가까이 차지할 것",
      }),
      makeSource({
        title: "옴디아 ‘소셜미디어 광고 시장, 2030년 6400억달러 규모로 성장’ 보고서 발간… 글로벌 온라인 광고 매출의 절반 가까이 차지할 것 - 뉴스와이어",
        bodyText: "Korean English 뉴스 제공 옴디아 2026-05-15 글로벌 시장조사기관 옴디아 보고서. 소셜미디어 광고 시장은 2030년 6400억달러 규모로 성장한다. 뉴스와이어는 한국 기업의 보도자료도 배포한다.",
        author: "",
        keywords: [],
      }),
    );

    expect(decision).toMatchObject({
      allowed: false,
      tier: "blocked_global_commercial",
    });
  });

  it("blocks translated global commercial Newswire pages even with boilerplate domestic text", () => {
    const decision = classifySourceEligibility(
      makeNewswireItem({
        source_id: "nwrss_exhibit",
        title: "바이스프링, 125주년 맞아 밀라노 디자인 위크에서 영국 대표 디자이너 톰 딕슨 협업 컬렉션 선보여",
      }),
      makeSource({
        title: "바이스프링, 125주년 맞아 밀라노 디자인 위크에서 영국 대표 디자이너 톰 딕슨 협업 컬렉션 선보여 - 뉴스와이어",
        bodyText: "뉴스 제공 인피니 2026-05-15 영국 대표 디자이너 톰 딕슨과 바이스프링이 밀라노 디자인 위크에서 협업 컬렉션을 선보였다. 뉴스와이어는 한국과 전 세계 미디어에 보도자료를 배포한다.",
        author: "",
        keywords: [],
      }),
    );

    expect(decision).toMatchObject({
      allowed: false,
      tier: "blocked_global_commercial",
    });
  });

  it("allows curated Korean culture foundation company feeds", () => {
    const source = {
      id: "nwrss_company_geumcheon",
      name: "뉴스와이어 금천문화재단",
      boTable: "rss",
      rssUrl: "https://www.newswire.co.kr/companyNews?content=rss&no=38856",
    };
    const decision = classifySourceEligibility(
      makeNewswireItem({
        source_id: source.id,
        source_name: source.name,
        raw_json: JSON.stringify({ source }),
        source_url: "https://www.newswire.co.kr/newsRead.php?no=1034513",
        title: "금천구립가산도서관 영화와 인문학으로 만나는 프랑스 문화예술 운영",
      }),
      makeSource({
        title: "금천구립가산도서관 영화와 인문학으로 만나는 프랑스 문화예술 운영",
        bodyText: "금천문화재단은 서울 금천구 지역 주민을 대상으로 문화예술 프로그램을 운영한다.",
        author: "금천문화재단",
        keywords: ["문화예술", "도서관", "서울"],
      }),
    );

    expect(decision).toMatchObject({
      allowed: true,
      tier: "allowed",
    });
  });

  it("allows domestic company providers discovered in Newswire article bodies", () => {
    const decision = classifySourceEligibility(
      makeNewswireItem({
        title: "아하, 장도연과 함께 ‘전국민 지식 앱테크’ 캠페인 온에어",
      }),
      makeSource({
        title: "아하, 장도연과 함께 ‘전국민 지식 앱테크’ 캠페인 온에어 - 뉴스와이어",
        bodyText: "뉴스 제공 아하 2026-05-13 아하앤컴퍼니는 방송인 장도연과 함께 지식 공유 캠페인을 진행한다고 밝혔다.",
        author: "",
        keywords: [],
      }),
    );

    expect(decision).toMatchObject({
      allowed: true,
      tier: "allowed",
    });
  });

  it("keeps domestic exhibition/company items that include Korean market context", () => {
    const decision = classifySourceEligibility(
      makeNewswireItem({
        source_id: "nwrss_exhibit",
        title: "독일 WISKA, KIMEX 2026 참가",
      }),
      makeSource({
        title: "독일 WISKA, KIMEX 2026 참가",
        bodyText: "KIMEX 2026에서 한국 시장을 겨냥한 산업용 정션박스 제품을 소개한다.",
        author: "WISKA",
        keywords: ["전시", "KIMEX"],
      }),
    );

    expect(decision).toMatchObject({
      allowed: true,
      tier: "allowed",
    });
  });

  it("allows culture-related government press releases", () => {
    const decision = classifySourceEligibility(
      makeNewswireItem({
        source_id: "kr_mcst",
        source_url: "https://www.korea.kr/news/policyNewsView.do?newsId=148964458&call_from=rsslink",
      }),
      makeSource({
        sourceUrl: "https://www.korea.kr/news/policyNewsView.do?newsId=148964458&call_from=rsslink",
        title: "한글날 지정 100주년 행사",
        bodyText: "문화체육관광부는 한글날 지정 100주년 행사를 소개했다.",
      }),
    );

    expect(decision).toMatchObject({
      allowed: true,
      tier: "allowed_korea_policy",
    });
  });

  it("blocks government policy items that are unrelated to CulturePeople scope", () => {
    const blocked = [
      "MZ세대가 말하는 산재 해법 \"처벌보다 중요한 건 재발 방지\"",
      "산사태 위험 정보, 미리 알고 대피는 빠르게",
      "고유가 피해지원금 2차 신청(5/18~)",
    ];

    for (const title of blocked) {
      const decision = classifySourceEligibility(
        makeNewswireItem({
          source_id: "kr_mcst",
          source_url: "https://www.korea.kr/news/policyNewsView.do?newsId=148964000&call_from=rsslink",
          title,
        }),
        makeSource({
          sourceUrl: "https://www.korea.kr/news/policyNewsView.do?newsId=148964000&call_from=rsslink",
          title,
          bodyText: `${title}에 대한 정부 정책뉴스입니다. 문화체육관광부 제공.`,
        }),
      );

      expect(decision).toMatchObject({
        allowed: false,
        tier: "blocked_korea_policy_unrelated",
      });
    }
  });

  it("keeps tourism, sports, copyright, and cinema policy items in scope", () => {
    const allowed = [
      "크루즈 관광의 열기를 지역 관광으로 확산",
      "6천원 영화 할인권, 225만 장 배포",
      "저작권침해 사이트 34개에 대한 최초 긴급차단 명령 통지",
      "프로축구 현장 목소리 듣고 성장 정책과제 만든다",
      "코리아넷 명예기자단 106개국 1543명 세계에 한국 알린다",
      "'동학농민혁명' 132주년, 오늘의 빛이 되다",
      "할인받고 촌캉스 가기 딱 좋은 5월",
    ];

    for (const title of allowed) {
      expect(isKoreaPolicyRelevant(
        { title },
        { title, bodyText: `${title} 관련 문화체육관광 정책입니다.`, keywords: [] },
      )).toBe(true);
    }
  });

  it("schedules daily limit retries at the next KST day boundary", () => {
    expect(nextKstDailyRetryIso(10, new Date("2026-05-15T00:40:00.000Z"))).toBe("2026-05-15T15:10:00.000Z");
    expect(nextKstDailyRetryIso(10, new Date("2026-05-15T18:40:00.000Z"))).toBe("2026-05-16T15:10:00.000Z");
  });

  it("detects mostly English titles", () => {
    expect(isMostlyEnglish("Omdia social media advertising report")).toBe(true);
    expect(isMostlyEnglish("금천문화재단 지역 문화예술 프로그램")).toBe(false);
  });

  it("keeps Korean operator messages free from common mojibake fragments", () => {
    const workerSource = readFileSync("cloudflare/auto-press-worker/src/index.js", "utf8");

    expect(workerSource).not.toMatch(/깅줉|以묐|蹂대룄|吏|먮|濡\?/);
  });
});
