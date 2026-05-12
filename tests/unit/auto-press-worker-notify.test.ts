import { describe, expect, it } from "vitest";
import {
  buildAutoPressRunFromObservedRun,
  hasAutoPressTelegramResultSent,
  isAutoPressRunTerminalForTelegram,
} from "@/lib/auto-press-worker-notify";
import type { AutoPressObservedRun } from "@/types/article";

function runFixture(overrides: Partial<AutoPressObservedRun> = {}): AutoPressObservedRun {
  return {
    id: "press_1",
    source: "manual",
    status: "completed",
    preview: false,
    requestedCount: 2,
    processedCount: 2,
    publishedCount: 1,
    previewedCount: 0,
    skippedCount: 1,
    failedCount: 0,
    queuedCount: 0,
    startedAt: "2026-05-12T09:00:00.000Z",
    completedAt: "2026-05-12T09:03:00.000Z",
    items: [
      {
        id: "item_1",
        runId: "press_1",
        sourceItemId: "100",
        boTable: "rss",
        title: "등록 기사",
        sourceUrl: "https://example.com/a",
        status: "ok",
        articleId: "article_1",
        articleNo: 301,
        retryable: false,
        retryCount: 1,
        bodyChars: 1200,
        imageCount: 3,
      },
      {
        id: "item_2",
        runId: "press_1",
        sourceItemId: "101",
        boTable: "rss",
        title: "이미지 없는 기사",
        sourceUrl: "https://example.com/b",
        status: "no_image",
        reasonCode: "NO_IMAGE",
        reasonMessage: "이미지가 없어 제외했습니다.",
        retryable: false,
        retryCount: 1,
        bodyChars: 800,
        imageCount: 0,
      },
    ],
    ...overrides,
  };
}

describe("auto-press worker result notifications", () => {
  it("detects terminal observed runs only after every item leaves the queue", () => {
    expect(isAutoPressRunTerminalForTelegram(runFixture())).toBe(true);
    expect(isAutoPressRunTerminalForTelegram(runFixture({
      status: "queued",
      queuedCount: 1,
      items: [
        ...(runFixture().items || []),
        {
          id: "item_3",
          runId: "press_1",
          title: "대기 기사",
          status: "queued",
          retryable: false,
          retryCount: 0,
          bodyChars: 0,
          imageCount: 0,
        },
      ],
    }))).toBe(false);
    expect(isAutoPressRunTerminalForTelegram(runFixture({ items: [] }))).toBe(false);
  });

  it("maps observed items into a Telegram auto-press run summary model", () => {
    const run = buildAutoPressRunFromObservedRun(runFixture());

    expect(run).toMatchObject({
      id: "press_1",
      source: "manual",
      articlesPublished: 1,
      articlesSkipped: 1,
      articlesFailed: 0,
    });
    expect(run.articles).toEqual([
      expect.objectContaining({ title: "등록 기사", status: "ok", articleId: "301" }),
      expect.objectContaining({ title: "이미지 없는 기사", status: "no_image", error: "이미지가 없어 제외했습니다." }),
    ]);
  });

  it("uses the observed event code as the idempotency guard", () => {
    expect(hasAutoPressTelegramResultSent([{ code: "ARTICLE_PUBLISHED" }])).toBe(false);
    expect(hasAutoPressTelegramResultSent([{ code: "TELEGRAM_RUN_RESULT_SENT" }])).toBe(true);
  });
});
