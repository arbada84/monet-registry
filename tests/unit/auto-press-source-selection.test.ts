import { describe, expect, it } from "vitest";
import {
  getAutoPressCandidateLimit,
  getAutoPressRssFetchLimit,
  getNewswireDbFallbackLimit,
  interleaveSourceItems,
  isNewswireAutoPressSource,
  shouldBackfillNewswireDbCandidates,
} from "@/lib/auto-press-source-selection";

describe("auto-press source selection", () => {
  it("interleaves source items so the first RSS source cannot dominate all candidates", () => {
    expect(interleaveSourceItems([
      ["gov-1", "gov-2", "gov-3"],
      ["newswire-1", "newswire-2"],
      ["mcst-1"],
    ])).toEqual(["gov-1", "newswire-1", "mcst-1", "gov-2", "newswire-2", "gov-3"]);
  });

  it("recognizes current Newswire source ids and labels", () => {
    expect(isNewswireAutoPressSource({ id: "nwrss_all", name: "뉴스와이어 전체", rssUrl: "https://api.newswire.co.kr/rss/all" })).toBe(true);
    expect(isNewswireAutoPressSource({ id: "kr_press", name: "정부 보도자료", rssUrl: "https://www.korea.kr/rss/pressrelease.xml" })).toBe(false);
  });

  it("scans a wider candidate pool when image-required publishing skips many items", () => {
    expect(getAutoPressCandidateLimit({ count: 100, requireImage: true, preview: false })).toBe(1000);
    expect(getAutoPressCandidateLimit({ count: 100, requireImage: false, preview: false })).toBe(300);
    expect(getAutoPressCandidateLimit({ count: 100, requireImage: true, preview: true })).toBe(300);
    expect(getAutoPressCandidateLimit({ count: 250, requireImage: true, preview: false })).toBe(2500);
    expect(getAutoPressCandidateLimit({ count: 250, requireImage: true, preview: true })).toBe(750);
  });

  it("keeps small live runs from starving after duplicate-heavy RSS heads", () => {
    expect(getAutoPressRssFetchLimit({
      count: 2,
      targetLimit: 2,
      requireImage: true,
      preview: false,
    })).toBe(100);
    expect(getAutoPressRssFetchLimit({
      count: 2,
      targetLimit: getAutoPressCandidateLimit({ count: 2, requireImage: true, preview: false }),
      requireImage: true,
      preview: false,
    })).toBe(200);
    expect(getAutoPressRssFetchLimit({
      count: 1000,
      targetLimit: 100,
      requireImage: true,
      preview: false,
    })).toBe(300);
  });

  it("backfills Newswire DB candidates after RSS exclusions shrink the real candidate pool", () => {
    expect(shouldBackfillNewswireDbCandidates({
      hasNewswireSource: true,
      candidateCount: 0,
      targetLimit: 30,
    })).toBe(true);
    expect(shouldBackfillNewswireDbCandidates({
      hasNewswireSource: true,
      candidateCount: 30,
      targetLimit: 30,
    })).toBe(false);
    expect(shouldBackfillNewswireDbCandidates({
      hasNewswireSource: false,
      candidateCount: 0,
      targetLimit: 30,
    })).toBe(false);
    expect(getNewswireDbFallbackLimit({ count: 3, targetLimit: 30 })).toBe(30);
    expect(getNewswireDbFallbackLimit({ count: 25, targetLimit: 10 })).toBe(50);
  });
});
