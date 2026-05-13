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

  it("chunks queued candidate inserts below the D1 HTTP variable limit", async () => {
    d1HttpQueryMock.mockResolvedValue({ rows: [] });
    const { queueAutoPressObservedCandidates } = await import("@/lib/auto-press-observability");

    const count = await queueAutoPressObservedCandidates({
      run: {
        id: "press_queue_chunk",
        source: "manual",
        startedAt: "2026-05-03T00:00:00.000Z",
      },
      requestedCount: 10,
      candidates: Array.from({ length: 10 }, (_, index) => ({
        title: `Candidate ${index + 1}`,
        sourceId: "newswire",
        sourceName: "Newswire",
        sourceUrl: `https://example.com/press/${index + 1}`,
        sourceItemId: String(index + 1),
        boTable: "rss",
        imageCount: 1,
      })),
    });

    const itemInserts = d1HttpQueryMock.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO auto_press_items"));
    expect(count).toBe(10);
    expect(itemInserts).toHaveLength(2);
    expect(itemInserts.every(([, params]) => Array.isArray(params) && params.length <= 70)).toBe(true);
  });

  it("marks queue-only runs with no candidates as completed instead of stuck queued", async () => {
    d1HttpQueryMock.mockResolvedValue({ rows: [] });
    const { queueAutoPressObservedCandidates } = await import("@/lib/auto-press-observability");

    const count = await queueAutoPressObservedCandidates({
      run: {
        id: "press_queue_empty",
        source: "manual",
        startedAt: "2026-05-03T00:00:00.000Z",
      },
      requestedCount: 2,
      candidates: [],
      message: "예약 가능한 보도자료 후보가 없습니다.",
    });

    expect(count).toBe(0);
    const runInsert = d1HttpQueryMock.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO auto_press_runs"));
    expect(runInsert?.[1]?.[2]).toBe("completed");
    expect(d1HttpQueryMock.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO auto_press_items"))).toBe(false);
    const eventInsert = d1HttpQueryMock.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO auto_press_events"));
    expect(eventInsert?.[1]).toEqual(expect.arrayContaining(["press_queue_empty", "info", "QUEUE_NO_CANDIDATES"]));
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
    expect(d1HttpQueryMock.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO auto_press_events"))).toBe(true);
    expect(d1HttpQueryMock.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO auto_press_items"))).toBe(true);
    expect(d1HttpQueryMock.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO auto_press_retry_queue"))).toBe(true);
  });

  it("records preview runs with explicit preview completion wording", async () => {
    d1HttpQueryMock.mockResolvedValue({ rows: [] });
    d1HttpFirstMock.mockResolvedValue(null);
    const { saveAutoPressRunSnapshot } = await import("@/lib/auto-press-observability");

    await expect(saveAutoPressRunSnapshot({
      id: "press_preview",
      source: "manual",
      preview: true,
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:00:02.000Z",
      articlesPublished: 0,
      articlesPreviewed: 2,
      articlesSkipped: 0,
      articlesFailed: 0,
      articles: [
        {
          title: "Preview 1",
          sourceUrl: "https://example.com/preview-1",
          wrId: "preview-1",
          boTable: "rss",
          status: "preview",
        },
        {
          title: "Preview 2",
          sourceUrl: "https://example.com/preview-2",
          wrId: "preview-2",
          boTable: "rss",
          status: "preview",
        },
      ],
    }, { requestedCount: 2 })).resolves.toBeUndefined();

    const runInsert = d1HttpQueryMock.mock.calls[0];
    expect(runInsert?.[1]?.[7]).toBe(2);

    const eventInsert = d1HttpQueryMock.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO auto_press_events"));
    expect(eventInsert?.[1]).toEqual(expect.arrayContaining([
      "press_preview",
      "info",
      "RUN_COMPLETED",
      expect.stringContaining("미리보기 2건"),
    ]));
  });

  it("does not persist timeout marker rows as retryable articles", async () => {
    d1HttpQueryMock.mockResolvedValue({ rows: [] });
    d1HttpFirstMock.mockImplementation(async (sql: string, params: unknown[]) => {
      if (String(sql).includes("auto_press_items")) {
        return {
          id: params[0],
          run_id: "press_timeout",
          title: "Registered",
          status: "ok",
          source_url: "https://example.com/registered",
          article_id: "11",
          article_no: 11,
          retryable: 0,
          retry_count: 0,
          warnings_json: "[]",
          raw_json: "{}",
        };
      }
      return null;
    });
    const { saveAutoPressRunSnapshot } = await import("@/lib/auto-press-observability");

    await expect(saveAutoPressRunSnapshot({
      id: "press_timeout",
      source: "manual",
      startedAt: "2026-05-05T00:00:00.000Z",
      completedAt: "2026-05-05T00:00:50.000Z",
      articlesPublished: 1,
      articlesSkipped: 0,
      articlesFailed: 0,
      timedOut: true,
      continuation: {
        shouldContinue: true,
        nextDelayMs: 2000,
        processedInRun: 1,
        message: "50초 안전 마진에 도달해 현재 배치를 안전 종료했습니다.",
      },
      articles: [
        {
          title: "Registered",
          sourceUrl: "https://example.com/registered",
          wrId: "registered",
          boTable: "rss",
          status: "ok",
          articleId: "11",
        },
        {
          title: "시간 초과 안전 종료",
          sourceUrl: "",
          wrId: "",
          boTable: "",
          status: "skip",
          error: "50초 안전 마진 도달, 1건 등록 후 조기 종료.",
        },
      ],
    }, { requestedCount: 3, status: "timeout" })).resolves.toBeUndefined();

    const runParams = d1HttpQueryMock.mock.calls[0][1];
    expect(runParams[5]).toBe(1);
    expect(runParams[10]).toBe(0);
    expect(runParams).toContain("TIME_BUDGET_EXCEEDED");

    const itemInserts = d1HttpQueryMock.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO auto_press_items"));
    const retryInserts = d1HttpQueryMock.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO auto_press_retry_queue"));
    expect(itemInserts).toHaveLength(1);
    expect(retryInserts).toHaveLength(0);
  });

  it("lists observed runs with parsed JSON fields", async () => {
    d1HttpQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
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

  it("reconciles orphaned queued runs without candidate items", async () => {
    d1HttpQueryMock
      .mockResolvedValueOnce({ rows: [{ id: "press_orphaned" }] })
      .mockResolvedValue({ rows: [] });
    const { reconcileAutoPressObservedRuns } = await import("@/lib/auto-press-observability");

    await expect(reconcileAutoPressObservedRuns({ graceMinutes: 1 })).resolves.toBe(1);

    expect(d1HttpQueryMock.mock.calls[0][0]).toContain("NOT EXISTS");
    const updateCall = d1HttpQueryMock.mock.calls.find(([sql]) => String(sql).includes("SET status = 'failed'"));
    expect(updateCall?.[1]).toEqual(expect.arrayContaining([
      "QUEUE_ITEMS_MISSING",
      expect.stringContaining("기사 후보"),
      "press_orphaned",
    ]));
    const eventCall = d1HttpQueryMock.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO auto_press_events"));
    expect(eventCall?.[1]).toEqual(expect.arrayContaining([
      "press_orphaned",
      "error",
      "QUEUE_ITEMS_MISSING",
    ]));
  });

  it("summarizes running, stale running, and retry queue counts", async () => {
    d1HttpFirstMock
      .mockResolvedValueOnce({ total: 2 })
      .mockResolvedValueOnce({ total: 1 })
      .mockResolvedValueOnce({ total: 4 })
      .mockResolvedValueOnce({ total: 19 })
      .mockResolvedValueOnce({ total: 2 })
      .mockResolvedValueOnce({ total: 17 })
      .mockResolvedValueOnce({ total: 17 })
      .mockResolvedValueOnce({ next_retry_at: "2026-05-13T23:01:04.150Z" });
    d1HttpQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "press_latest",
          source: "manual",
          status: "running",
          preview: 0,
          requested_count: 5,
          processed_count: 1,
          published_count: 1,
          skipped_count: 0,
          failed_count: 0,
          queued_count: 0,
          started_at: "2026-05-05T00:00:00.000Z",
          last_event_at: "2026-05-05T00:01:00.000Z",
          options_json: "{}",
          warnings_json: "[]",
          media_storage_json: "{}",
          summary_json: "{}",
        }],
      });
    const { getAutoPressObservedSummary } = await import("@/lib/auto-press-observability");

    await expect(getAutoPressObservedSummary()).resolves.toMatchObject({
      runningCount: 2,
      staleRunningCount: 1,
      pendingRetryCount: 4,
      queuedItemCount: 19,
      queuedDueCount: 2,
      queuedDelayedCount: 17,
      queuedDailyLimitCount: 17,
      nextQueuedRetryAt: "2026-05-13T23:01:04.150Z",
      latestRun: {
        id: "press_latest",
        status: "running",
        lastEventAt: "2026-05-05T00:01:00.000Z",
      },
    });
    expect(d1HttpFirstMock.mock.calls[1][0]).toContain("COALESCE(last_event_at, started_at)");
  });

  it("lists observed run events for the execution timeline", async () => {
    d1HttpQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 12,
        run_id: "press_events",
        item_id: "press_events_0001",
        level: "warn",
        code: "TIME_BUDGET_EXCEEDED",
        message: "50초 안전 마진에 도달해 현재 배치를 안전 종료했습니다.",
        metadata_json: JSON.stringify({ processedCount: 4 }),
        created_at: "2026-05-05T00:02:00.000Z",
      }],
    });
    const { listAutoPressObservedEvents } = await import("@/lib/auto-press-observability");

    await expect(listAutoPressObservedEvents({ runId: "press_events", limit: 20 })).resolves.toMatchObject([{
      id: 12,
      runId: "press_events",
      itemId: "press_events_0001",
      level: "warn",
      code: "TIME_BUDGET_EXCEEDED",
      message: "50초 안전 마진에 도달해 현재 배치를 안전 종료했습니다.",
      metadata: { processedCount: 4 },
      createdAt: "2026-05-05T00:02:00.000Z",
    }]);
    expect(d1HttpQueryMock.mock.calls[0][0]).toContain("ORDER BY created_at DESC");
    expect(d1HttpQueryMock.mock.calls[0][1]).toEqual(["press_events", 20]);
  });

  it("lists observed items in recent-first order for the article result screen", async () => {
    d1HttpQueryMock.mockResolvedValueOnce({
      rows: [{
        id: "press_items_0001",
        run_id: "press_items",
        title: "최근 처리 기사",
        status: "fail",
        reason_code: "NO_IMAGE",
        reason_message: "본문 이미지 없음",
        retryable: 0,
        retry_count: 0,
        warnings_json: "[]",
        raw_json: "{}",
        created_at: "2026-05-05T00:03:00.000Z",
      }],
    });
    const { listAutoPressObservedItems } = await import("@/lib/auto-press-observability");

    await expect(listAutoPressObservedItems({ limit: 50, order: "desc" })).resolves.toMatchObject([{
      id: "press_items_0001",
      runId: "press_items",
      title: "최근 처리 기사",
      status: "fail",
      reasonCode: "NO_IMAGE",
      reasonMessage: "본문 이미지 없음",
    }]);
    expect(d1HttpQueryMock.mock.calls[0][0]).toContain("ORDER BY created_at DESC");
    expect(d1HttpQueryMock.mock.calls[0][1]).toEqual([50]);
  });

  it("marks a running observed run as cancelled", async () => {
    d1HttpFirstMock
      .mockResolvedValueOnce({
        id: "press_cancel",
        source: "manual",
        status: "running",
        preview: 0,
        requested_count: 10,
        processed_count: 4,
        published_count: 2,
        skipped_count: 1,
        failed_count: 1,
        queued_count: 0,
        started_at: "2026-05-05T00:00:00.000Z",
        options_json: "{}",
        warnings_json: "[]",
        media_storage_json: "{}",
        summary_json: "{}",
      })
      .mockResolvedValueOnce({
        id: "press_cancel",
        source: "manual",
        status: "cancelled",
        preview: 0,
        requested_count: 10,
        processed_count: 4,
        published_count: 2,
        skipped_count: 1,
        failed_count: 1,
        queued_count: 0,
        started_at: "2026-05-05T00:00:00.000Z",
        completed_at: "2026-05-05T00:05:00.000Z",
        error_code: "MANUAL_CANCELLED",
        error_message: "운영자 중단",
        options_json: "{}",
        warnings_json: "[]",
        media_storage_json: "{}",
        summary_json: "{}",
      });
    d1HttpQueryMock.mockResolvedValue({ rows: [] });
    const { cancelAutoPressObservedRun } = await import("@/lib/auto-press-observability");

    await expect(cancelAutoPressObservedRun("press_cancel", "운영자 중단")).resolves.toMatchObject({
      id: "press_cancel",
      status: "cancelled",
      errorCode: "MANUAL_CANCELLED",
      errorMessage: "운영자 중단",
    });
    expect(d1HttpQueryMock.mock.calls.some(([sql]) => String(sql).includes("SET status = 'cancelled'"))).toBe(true);
    expect(d1HttpQueryMock.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO auto_press_events"))).toBe(true);
  });

  it("queues an observed item for immediate AI retry", async () => {
    d1HttpQueryMock.mockResolvedValue({ rows: [] });
    d1HttpFirstMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes("auto_press_items")) {
        return {
          id: "press_retry_0001",
          run_id: "press_retry",
          title: "Retry target",
          status: "ok",
          source_url: "https://example.com/retry",
          source_name: "Newswire",
          article_id: "21",
          article_no: 21,
          retryable: 0,
          retry_count: 0,
          warnings_json: "[]",
          raw_json: "{}",
        };
      }
      if (String(sql).includes("auto_press_retry_queue")) {
        return {
          id: "press_retry_0001_retry",
          run_id: "press_retry",
          item_id: "press_retry_0001",
          article_id: "21",
          article_no: 21,
          title: "Retry target",
          status: "pending",
          reason_code: "AI_RETRY_PENDING",
          reason_message: "manual retry",
          attempts: 0,
          max_attempts: 6,
          payload_json: "{}",
          result_json: "{}",
        };
      }
      return null;
    });
    const { enqueueAutoPressObservedItemRetry } = await import("@/lib/auto-press-observability");

    await expect(enqueueAutoPressObservedItemRetry("press_retry_0001", { reason: "manual retry" })).resolves.toMatchObject({
      id: "press_retry_0001_retry",
      itemId: "press_retry_0001",
      articleId: "21",
      status: "pending",
    });

    expect(d1HttpQueryMock.mock.calls.some(([sql]) => String(sql).includes("UPDATE auto_press_items"))).toBe(true);
    expect(d1HttpQueryMock.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO auto_press_retry_queue"))).toBe(true);
    expect(d1HttpQueryMock.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO auto_press_events"))).toBe(true);
  });

  it("rejects observed item retry when no article exists yet", async () => {
    d1HttpFirstMock.mockResolvedValueOnce({
      id: "press_retry_0002",
      run_id: "press_retry",
      title: "No article",
      status: "fail",
      retryable: 0,
      retry_count: 0,
      warnings_json: "[]",
      raw_json: "{}",
    });
    const { enqueueAutoPressObservedItemRetry } = await import("@/lib/auto-press-observability");

    await expect(enqueueAutoPressObservedItemRetry("press_retry_0002")).rejects.toThrow("기사 ID");
    expect(d1HttpQueryMock).not.toHaveBeenCalled();
  });
});
