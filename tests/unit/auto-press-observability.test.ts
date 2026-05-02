import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const d1HttpQueryMock = vi.fn();
const d1HttpFirstMock = vi.fn();

vi.mock("@/lib/d1-http-client", () => ({
  d1HttpQuery: d1HttpQueryMock,
  d1HttpFirst: d1HttpFirstMock,
}));

describe("auto-press observability store", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("maps article result failures to stable reason codes", async () => {
    const { autoPressReasonCodeFromResult } = await import("@/lib/auto-press-observability");

    expect(autoPressReasonCodeFromResult({
      title: "No image",
      sourceUrl: "https://example.com/a",
      wrId: "1",
      boTable: "rss",
      status: "no_image",
      error: "본문 이미지 없음",
    })).toBe("NO_IMAGE");

    expect(autoPressReasonCodeFromResult({
      title: "Old",
      sourceUrl: "https://example.com/b",
      wrId: "2",
      boTable: "rss",
      status: "old",
      error: "날짜 제한",
    })).toBe("OLD_DATE");

    expect(autoPressReasonCodeFromResult({
      title: "AI queued",
      sourceUrl: "https://example.com/c",
      wrId: "3",
      boTable: "rss",
      status: "ok",
      warnings: ["AI 편집 실패로 임시저장 처리되었습니다."],
    })).toBe("AI_RETRY_PENDING");
  });

  it("starts an observed run in D1", async () => {
    d1HttpQueryMock.mockResolvedValue({ rows: [] });
    const { createAutoPressObservedRun } = await import("@/lib/auto-press-observability");

    await expect(createAutoPressObservedRun({
      id: "press_1",
      source: "manual",
      preview: false,
      requestedCount: 5,
      triggeredBy: "관리자",
      options: { count: 5 },
      startedAt: "2026-05-03T00:00:00.000Z",
    })).resolves.toBeUndefined();

    expect(d1HttpQueryMock.mock.calls[0][0]).toContain("INSERT INTO auto_press_runs");
    expect(d1HttpQueryMock.mock.calls[0][1]).toEqual([
      "press_1",
      "manual",
      0,
      5,
      "2026-05-03T00:00:00.000Z",
      "2026-05-03T00:00:00.000Z",
      "관리자",
      JSON.stringify({ count: 5 }),
      "2026-05-03T00:00:00.000Z",
      "2026-05-03T00:00:00.000Z",
    ]);
  });

  it("saves a completed run, item rows, and AI retry queue entries", async () => {
    d1HttpQueryMock.mockResolvedValue({ rows: [] });
    d1HttpFirstMock.mockImplementation(async (sql: string, params: unknown[]) => {
      if (String(sql).includes("auto_press_items")) {
        return {
          id: params[0],
          run_id: "press_2",
          title: "AI fallback",
          status: "ok",
          source_url: "https://example.com/ai",
          article_id: "7",
          article_no: 7,
          retryable: 1,
          retry_count: 0,
          reason_code: "AI_RETRY_PENDING",
          next_retry_at: "2026-05-03T01:00:00.000Z",
          warnings_json: JSON.stringify(["AI 편집 실패로 임시저장 처리되었습니다."]),
          raw_json: "{}",
        };
      }
      return null;
    });
    const { saveAutoPressRunSnapshot } = await import("@/lib/auto-press-observability");

    await expect(saveAutoPressRunSnapshot({
      id: "press_2",
      source: "manual",
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:00:10.000Z",
      articlesPublished: 1,
      articlesSkipped: 0,
      articlesFailed: 0,
      articles: [{
        title: "AI fallback",
        sourceUrl: "https://example.com/ai",
        wrId: "ai",
        boTable: "rss",
        status: "ok",
        articleId: "7",
        warnings: ["AI 편집 실패로 임시저장 처리되었습니다."],
      }],
    }, { requestedCount: 1 })).resolves.toBeUndefined();

    expect(d1HttpQueryMock.mock.calls[0][0]).toContain("INSERT INTO auto_press_runs");
    expect(d1HttpQueryMock.mock.calls[1][0]).toContain("INSERT INTO auto_press_items");
    expect(d1HttpQueryMock.mock.calls[2][0]).toContain("INSERT INTO auto_press_retry_queue");
  });

  it("lists observed runs with parsed JSON fields", async () => {
    d1HttpQueryMock.mockResolvedValueOnce({
      rows: [{
        id: "press_3",
        source: "cron",
        status: "completed",
        preview: 0,
        requested_count: 10,
        processed_count: 2,
        published_count: 1,
        previewed_count: 0,
        skipped_count: 1,
        failed_count: 0,
        queued_count: 0,
        started_at: "2026-05-03T00:00:00.000Z",
        completed_at: "2026-05-03T00:00:10.000Z",
        duration_ms: 10000,
        options_json: JSON.stringify({ count: 10 }),
        warnings_json: JSON.stringify(["warn"]),
        media_storage_json: JSON.stringify({ provider: "r2" }),
        summary_json: "{}",
      }],
    });
    const { listAutoPressObservedRuns } = await import("@/lib/auto-press-observability");

    await expect(listAutoPressObservedRuns({ limit: 5 })).resolves.toMatchObject([{
      id: "press_3",
      source: "cron",
      status: "completed",
      requestedCount: 10,
      processedCount: 2,
      publishedCount: 1,
      skippedCount: 1,
      options: { count: 10 },
      warnings: ["warn"],
      mediaStorage: { provider: "r2" },
    }]);
  });
});
