import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import blockedSubjectsConfig from "../../config/auto-press-blocked-subjects.json";
import {
  getAutoPressBlockedSubjectMatch,
} from "@/lib/auto-press-content-policy";

describe("auto-press blocked subject policy", () => {
  it.each([
    { title: "만민중앙교회 해외 지교회 기념예배" },
    { bodyText: "행사는 밀양만민교회에서 열렸다." },
    { title: "Manmin Central Church event" },
    { sourceUrl: "https://news.manmin.org/article/1" },
    { sourceUrl: "https://manmin.or.kr/07_news/content" },
  ])("blocks Manmin-related press content: %#", (input) => {
    expect(getAutoPressBlockedSubjectMatch(input)).toMatchObject({
      blocked: true,
      subjectId: "manmin-central-church",
    });
  });

  it("does not block unrelated cultural or church coverage", () => {
    expect(getAutoPressBlockedSubjectMatch({
      title: "지역 문화재단, 시민 공연 프로그램 공개",
      bodyText: "지역 주민을 위한 문화 행사다.",
      sourceUrl: "https://example.com/press/1",
    })).toEqual({ blocked: false });
  });

  it.each([
    ["shincheonji", { title: "신천지예수교 증거장막성전 문화행사" }],
    ["world-mission-society-church-of-god", { sourceUrl: "https://news.watv.org/press/1" }],
    ["christian-gospel-mission-jms", { title: "정명석 JMS 관련 홍보행사" }],
    ["family-federation-unification", { title: "세계평화통일가정연합 기념식" }],
    ["church-of-almighty-god", { title: "전능하신하나님교회 온라인 행사" }],
    ["good-news-mission", { title: "기쁜소식선교회 국제행사" }],
    ["intercp", { title: "인터콥선교회 선교 캠프" }],
    ["seventh-day-adventist", { title: "제칠일안식일예수재림교회 총회" }],
    ["jehovahs-witnesses", { title: "여호와의 증인 대회" }],
    ["latter-day-saints", { title: "예수그리스도후기성도교회 봉사활동" }],
    ["dahnworld-brain-education", { title: "단월드 창립 기념행사" }],
    ["daesoon-jinrihoe", { title: "대순진리회 지역 봉사" }],
    ["korea-sgi", { title: "한국SGI 문화축제" }],
  ])("blocks expanded editorial-policy subject %s", (subjectId, input) => {
    expect(getAutoPressBlockedSubjectMatch(input)).toMatchObject({
      blocked: true,
      subjectId,
    });
  });

  it("requires all terms in an ambiguity-safe term group", () => {
    expect(getAutoPressBlockedSubjectMatch({ title: "지역 사회의 섭리와 문화" })).toEqual({ blocked: false });
    expect(getAutoPressBlockedSubjectMatch({ title: "정명석 섭리사 홍보행사" })).toMatchObject({
      blocked: true,
      subjectId: "christian-gospel-mission-jms",
      matchType: "term-group",
    });
  });

  it("enforces every configured subject through its primary exact term", () => {
    expect(blockedSubjectsConfig.subjects).toHaveLength(34);
    for (const subject of blockedSubjectsConfig.subjects) {
      expect(getAutoPressBlockedSubjectMatch({ title: subject.terms[0] })).toMatchObject({
        blocked: true,
        subjectId: subject.id,
      });
    }
  });

  it("keeps the block enforced in queue, retry, and Cloudflare Worker paths", () => {
    const route = readFileSync("src/app/api/cron/auto-press/route.ts", "utf8");
    const retry = readFileSync("src/lib/auto-press-retry-queue.ts", "utf8");
    const worker = readFileSync("cloudflare/auto-press-worker/src/index.js", "utf8");
    const workerPolicy = readFileSync("cloudflare/auto-press-worker/src/blocked-subject-policy.js", "utf8");

    expect(route).toContain("getAutoPressBlockedSubjectMatch");
    expect(retry).toContain("getAutoPressBlockedSubjectMatch");
    expect(worker).toContain("loadWorkerBlockedSubjectPolicy");
    expect(worker).toContain("matchWorkerBlockedSubject");
    expect(workerPolicy).toContain("auto-press-blocked-subjects.json");
    expect(workerPolicy).toContain('source: "static-fallback"');
    expect(worker).toContain("SKIPPED_BLOCKED_SUBJECT");
  });
});
