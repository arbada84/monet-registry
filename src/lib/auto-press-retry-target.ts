import type { AutoPressRetryQueueEntry, AutoPressRetryTargetType } from "@/types/article";

function getPayloadType(payload?: Record<string, unknown>): string {
  const nested = payload?.result as { retryPayload?: { type?: unknown } } | undefined;
  const type = nested?.retryPayload?.type ?? payload?.type;
  return typeof type === "string" ? type : "";
}

function hasCompleteUnpublishedPayload(payload?: Record<string, unknown>): boolean {
  const nested = payload?.result as { retryPayload?: Record<string, unknown> } | undefined;
  const retryPayload = nested?.retryPayload ?? payload;
  return getPayloadType(payload) === "auto_press_unpublished"
    && typeof retryPayload?.sourceUrl === "string"
    && retryPayload.sourceUrl.trim().length > 0
    && typeof retryPayload.bodyText === "string"
    && retryPayload.bodyText.trim().length > 0
    && typeof retryPayload.bodyHtml === "string"
    && retryPayload.bodyHtml.trim().length > 0;
}

export function getAutoPressRetryTargetType(
  entry: Pick<AutoPressRetryQueueEntry, "articleId" | "articleNo" | "payload">,
): AutoPressRetryTargetType {
  if (entry.articleId || entry.articleNo) return "existing_article";
  if (hasCompleteUnpublishedPayload(entry.payload)) return "unpublished";
  return "unknown";
}

export function isUnpublishedAutoPressRetryQueueEntry(
  entry: Pick<AutoPressRetryQueueEntry, "articleId" | "articleNo" | "payload">,
): boolean {
  return getAutoPressRetryTargetType(entry) === "unpublished";
}

export function getAutoPressRetryTargetLabel(targetType: AutoPressRetryTargetType | undefined): string {
  if (targetType === "unpublished") return "신규 등록 대기";
  if (targetType === "existing_article") return "기존 기사 재편집";
  return "대상 확인 필요";
}
