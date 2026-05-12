import type { AutoPressRetryQueueEntry, AutoPressRetryTargetType } from "@/types/article";

function getPayloadType(payload?: Record<string, unknown>): string {
  const nested = payload?.result as { retryPayload?: { type?: unknown } } | undefined;
  const type = nested?.retryPayload?.type ?? payload?.type;
  return typeof type === "string" ? type : "";
}

export function getAutoPressRetryTargetType(
  entry: Pick<AutoPressRetryQueueEntry, "articleId" | "articleNo" | "payload">,
): AutoPressRetryTargetType {
  if (!entry.articleId && !entry.articleNo && getPayloadType(entry.payload) === "auto_press_unpublished") {
    return "unpublished";
  }
  if (entry.articleId || entry.articleNo) return "existing_article";
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
