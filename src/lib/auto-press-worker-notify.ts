import type { AutoPressArticleResult, AutoPressObservedEvent, AutoPressObservedRun, AutoPressRun } from "@/types/article";

const TERMINAL_ITEM_STATUSES = new Set(["ok", "fail", "dup", "skip", "no_image", "old"]);
const TELEGRAM_RESULT_SENT_CODE = "TELEGRAM_RUN_RESULT_SENT";
const TELEGRAM_DAILY_LIMIT_WAITING_SENT_CODE = "TELEGRAM_DAILY_LIMIT_WAITING_SENT";
const TELEGRAM_ARTICLE_REGISTERED_SENT_CODE = "TELEGRAM_ARTICLE_REGISTERED_SENT";

function normalizeRunSource(source: AutoPressObservedRun["source"]): AutoPressRun["source"] {
  return source === "cron" || source === "manual" || source === "cli" ? source : "manual";
}

function normalizeItemStatus(status: string): AutoPressArticleResult["status"] {
  if (status === "ok" || status === "preview" || status === "queued" || status === "fail" || status === "dup" || status === "skip" || status === "no_image" || status === "old") {
    return status;
  }
  return "fail";
}

export function hasAutoPressTelegramResultSent(events: Pick<AutoPressObservedEvent, "code">[]): boolean {
  return events.some((event) => event.code === TELEGRAM_RESULT_SENT_CODE);
}

export function hasAutoPressDailyLimitWaitingSent(events: Pick<AutoPressObservedEvent, "code">[]): boolean {
  return events.some((event) => event.code === TELEGRAM_DAILY_LIMIT_WAITING_SENT_CODE);
}

export function hasAutoPressArticleRegisteredSent(
  events: Pick<AutoPressObservedEvent, "code" | "itemId">[],
  itemId?: string,
): boolean {
  if (!itemId) return false;
  return events.some((event) => event.code === TELEGRAM_ARTICLE_REGISTERED_SENT_CODE && event.itemId === itemId);
}

export function isAutoPressRunTerminalForTelegram(run: AutoPressObservedRun): boolean {
  const items = run.items || [];
  if (items.length === 0) return false;
  if (run.status === "queued" || run.status === "running") return false;
  return items.every((item) => TERMINAL_ITEM_STATUSES.has(String(item.status)));
}

export function getAutoPressDailyLimitWaitingItems(run: AutoPressObservedRun) {
  return (run.items || []).filter((item) => (
    String(item.status || "") === "queued"
    && item.reasonCode === "DAILY_LIMIT_REACHED"
  ));
}

export function isAutoPressRunWaitingForDailyLimit(run: AutoPressObservedRun): boolean {
  return getAutoPressDailyLimitWaitingItems(run).length > 0;
}

export function buildAutoPressRunFromObservedRun(run: AutoPressObservedRun): AutoPressRun {
  const items = run.items || [];
  const articles = items.map((item): AutoPressArticleResult => ({
    title: item.title || "(제목 없음)",
    sourceUrl: item.sourceUrl || "",
    wrId: item.sourceItemId || item.id,
    boTable: item.boTable || "rss",
    status: normalizeItemStatus(String(item.status)),
    articleId: item.articleNo ? String(item.articleNo) : item.articleId,
    error: item.reasonMessage || item.reasonCode || undefined,
    warnings: item.warnings,
    retryReasonCode: item.reasonCode,
    nextRetryAt: item.nextRetryAt,
  }));

  return {
    id: run.id,
    startedAt: run.startedAt,
    completedAt: run.completedAt || run.updatedAt || new Date().toISOString(),
    source: normalizeRunSource(run.source),
    preview: run.preview,
    articlesPublished: run.publishedCount,
    articlesPreviewed: run.previewedCount,
    articlesSkipped: run.skippedCount,
    articlesFailed: run.failedCount,
    articles,
    warnings: run.warnings,
    mediaStorage: run.mediaStorage as AutoPressRun["mediaStorage"],
  };
}

export { TELEGRAM_ARTICLE_REGISTERED_SENT_CODE, TELEGRAM_DAILY_LIMIT_WAITING_SENT_CODE, TELEGRAM_RESULT_SENT_CODE };
