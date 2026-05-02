import "server-only";

import { revalidateTag } from "next/cache";
import { aiEditArticle, VALID_CATEGORIES } from "@/lib/ai-prompt";
import {
  appendAutoPressObservedEvent,
  completeAutoPressRetryQueueEntry,
  failAutoPressRetryQueueEntry,
  getAutoPressRetryQueueEntry,
  listDueAutoPressRetryQueue,
  markAutoPressRetryQueueRunning,
  resetAutoPressRetryQueueEntry,
} from "@/lib/auto-press-observability";
import { serverGetArticleById, serverGetArticleByNo, serverGetSetting, serverSaveSetting, serverUpdateArticle } from "@/lib/db-server";
import { serverGetAiSettings } from "@/lib/ai-settings-server";
import { serverUploadImageUrl } from "@/lib/server-upload-image";
import { isManagedPressImageUrl, isNoisyPressImageUrl } from "@/lib/press-image-policy";
import type {
  Article,
  AutoPressRetryProcessResult,
  AutoPressRetryProcessSummary,
  AutoPressRetryQueueEntry,
  AutoPressSettings,
} from "@/types/article";

const TIMEOUT_MS = 50_000;
const DEFAULT_BATCH_LIMIT = 3;
const RETRY_DELAYS_HOURS = [1, 6, 12, 24, 48, 70];
const MAX_ATTEMPTS = RETRY_DELAYS_HOURS.length;

function stripHtmlToText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function nextRetryAt(attempts: number): string | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  const delayHours = RETRY_DELAYS_HOURS[Math.min(attempts, RETRY_DELAYS_HOURS.length - 1)];
  return new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString();
}

function restoreFirstImageIfNeeded(finalBody: string, originalBody: string, title: string): string {
  if (/<img[^>]+src=/i.test(finalBody)) return finalBody;
  const origImgMatch = originalBody.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
  if (!origImgMatch?.[1]) return finalBody;

  const imgHtml = `<figure style="margin:1.5em 0;text-align:center;"><img src="${origImgMatch[1]}" alt="${title.replace(/"/g, "&quot;")}" style="max-width:100%;height:auto;border-radius:6px;" /></figure>`;
  let pCount = 0;
  let insertIdx = -1;
  let pos = 0;
  while (pos < finalBody.length) {
    const found = finalBody.indexOf("</p>", pos);
    if (found === -1) break;
    pCount += 1;
    if (pCount === 2) {
      insertIdx = found + 4;
      break;
    }
    pos = found + 4;
  }
  return insertIdx === -1 ? `${finalBody}${imgHtml}` : finalBody.slice(0, insertIdx) + imgHtml + finalBody.slice(insertIdx);
}

async function promoteFirstBodyImage(finalBody: string, fallbackThumbnail?: string): Promise<{ body: string; thumbnail?: string }> {
  let body = finalBody;
  let thumbnail = fallbackThumbnail || "";
  const firstImgMatch = body.match(/<(?:figure[^>]*>)?\s*<img[^>]+src=["']([^"']+)["'][^>]*>\s*(?:<\/figure>)?/i);
  if (firstImgMatch?.[1]) {
    thumbnail = firstImgMatch[1];
    if (thumbnail && !isManagedPressImageUrl(thumbnail) && !isNoisyPressImageUrl(thumbnail)) {
      try {
        const uploaded = await serverUploadImageUrl(thumbnail);
        if (uploaded) thumbnail = uploaded;
      } catch {
        // 대표이미지 업로드 실패는 재편집 전체 실패로 보지 않는다.
      }
    }
    body = body.replace(firstImgMatch[0], "").trim();
  }
  return { body, thumbnail: thumbnail || undefined };
}

async function loadArticleForQueue(entry: AutoPressRetryQueueEntry): Promise<Article | null> {
  if (entry.articleId) {
    const article = await serverGetArticleById(entry.articleId);
    if (article) return article;
  }
  if (entry.articleNo) return serverGetArticleByNo(entry.articleNo);
  return null;
}

async function recordActivityLog(summary: AutoPressRetryProcessSummary): Promise<void> {
  if (summary.processed === 0) return;
  try {
    const logs = await serverGetSetting<Array<{ action: string; target: string; detail: string; timestamp: string; user: string }>>("cp-activity-logs", []);
    logs.unshift({
      action: "AI재편집",
      target: `${summary.processed}건 처리`,
      detail: `성공 ${summary.success}건, 실패 ${summary.failed}건, 포기 ${summary.gaveUp}건, 대기 ${summary.waiting}건`,
      timestamp: new Date().toISOString(),
      user: "시스템",
    });
    await serverSaveSetting("cp-activity-logs", logs.slice(0, 1000));
  } catch {
    // 운영 로그 실패가 기사 재처리를 막으면 안 된다.
  }
}

async function processOneQueueEntry(entry: AutoPressRetryQueueEntry): Promise<AutoPressRetryProcessResult> {
  const running = await markAutoPressRetryQueueRunning(entry.id);
  if (!running) {
    return { id: entry.id, title: entry.title, status: "skipped", error: "이미 처리 중이거나 처리 대상 상태가 아닙니다." };
  }

  const fail = async (error: string, gaveUp = false): Promise<AutoPressRetryProcessResult> => {
    const next = gaveUp ? null : nextRetryAt(running.attempts);
    await failAutoPressRetryQueueEntry(running.id, {
      status: gaveUp ? "gave_up" : "failed",
      error,
      nextAttemptAt: next,
      result: { error, attempts: running.attempts },
    });
    if (running.runId) {
      await appendAutoPressObservedEvent({
        runId: running.runId,
        itemId: running.itemId,
        level: gaveUp ? "error" : "warn",
        code: gaveUp ? "AI_RETRY_GIVE_UP" : "AI_RETRY_FAILED",
        message: error,
        metadata: { queueId: running.id, attempts: running.attempts, nextAttemptAt: next },
      }).catch(() => undefined);
    }
    return {
      id: running.id,
      title: running.title,
      articleId: running.articleId,
      retryCount: running.attempts,
      nextRetryAt: next || undefined,
      status: gaveUp ? "give_up" : "failed",
      error,
    };
  };

  if (running.attempts > running.maxAttempts) {
    return fail(`최대 재시도 횟수(${running.maxAttempts}회)를 초과했습니다.`, true);
  }

  const settings = await serverGetSetting<AutoPressSettings>("cp-auto-press-settings", {} as AutoPressSettings);
  const aiSettings = await serverGetAiSettings();
  const aiProvider = settings.aiProvider ?? "gemini";
  const aiModel = settings.aiModel ?? "gemini-2.0-flash";
  const apiKey = aiProvider === "openai"
    ? (aiSettings.openaiApiKey ?? process.env.OPENAI_API_KEY ?? "")
    : (aiSettings.geminiApiKey ?? process.env.GEMINI_API_KEY ?? "");

  if (!apiKey) {
    return fail("AI API 키가 설정되어 있지 않습니다.", false);
  }

  const article = await loadArticleForQueue(running);
  if (!article) {
    return fail("재편집 대상 기사를 찾을 수 없습니다.", true);
  }

  const bodyText = stripHtmlToText(article.body || "");
  if (bodyText.length < 50) {
    await serverUpdateArticle(article.id, {
      reviewNote: `AI 편집 실패 — 자동 재시도 대기 (${running.attempts}/${running.maxAttempts}) [본문 부족]`,
      updatedAt: new Date().toISOString(),
    }).catch(() => undefined);
    return fail("본문이 너무 짧아 AI 재편집을 진행할 수 없습니다.", running.attempts >= running.maxAttempts);
  }

  const edited = await aiEditArticle(aiProvider, aiModel, apiKey, article.title, bodyText.slice(0, 3000), article.body);
  if (!edited) {
    await serverUpdateArticle(article.id, {
      reviewNote: `AI 편집 실패 — 자동 재시도 대기 (${running.attempts}/${running.maxAttempts})`,
      updatedAt: new Date().toISOString(),
    }).catch(() => undefined);
    return fail("AI가 유효한 편집 결과를 반환하지 않았습니다.", running.attempts >= running.maxAttempts);
  }

  const finalCategory = edited.category && VALID_CATEGORIES.includes(edited.category)
    ? edited.category
    : article.category;
  const restoredBody = restoreFirstImageIfNeeded(edited.body, article.body, edited.title);
  const promoted = await promoteFirstBodyImage(restoredBody, article.thumbnail);

  await serverUpdateArticle(article.id, {
    title: edited.title,
    body: promoted.body,
    summary: edited.summary || undefined,
    tags: edited.tags || undefined,
    category: finalCategory,
    status: "게시",
    aiGenerated: true,
    reviewNote: `AI 재편집 성공 (${running.attempts}회차)`,
    thumbnail: promoted.thumbnail,
    updatedAt: new Date().toISOString(),
  });
  await completeAutoPressRetryQueueEntry(running.id, {
    articleId: article.id,
    attempts: running.attempts,
    title: edited.title,
    completedAt: new Date().toISOString(),
  });
  if (running.runId) {
    await appendAutoPressObservedEvent({
      runId: running.runId,
      itemId: running.itemId,
      level: "info",
      code: "AI_RETRY_SUCCESS",
      message: `AI 재편집 성공: ${edited.title}`,
      metadata: { queueId: running.id, articleId: article.id, attempts: running.attempts },
    }).catch(() => undefined);
  }

  try { revalidateTag("articles"); } catch { /* 캐시 무효화 실패는 무시 */ }

  return {
    id: running.id,
    title: edited.title,
    articleId: article.id,
    retryCount: running.attempts,
    status: "success",
  };
}

export async function processAutoPressRetryQueue(options: {
  limit?: number;
  queueId?: string;
  force?: boolean;
} = {}): Promise<AutoPressRetryProcessSummary> {
  const startTime = Date.now();
  const limit = Math.max(1, Math.min(Math.trunc(Number(options.limit || DEFAULT_BATCH_LIMIT)), 10));

  if (options.queueId && options.force) {
    await resetAutoPressRetryQueueEntry(options.queueId, null);
  }

  const entries = options.queueId
    ? [await getAutoPressRetryQueueEntry(options.queueId)].filter(Boolean) as AutoPressRetryQueueEntry[]
    : await listDueAutoPressRetryQueue({ limit });

  if (entries.length === 0) {
    return {
      message: "AI 재편집 대기열에 처리할 항목이 없습니다.",
      processed: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      gaveUp: 0,
      waiting: 0,
      results: [],
    };
  }

  const results: AutoPressRetryProcessResult[] = [];
  for (const entry of entries) {
    if (Date.now() - startTime > TIMEOUT_MS) {
      results.push({ id: entry.id, title: entry.title, status: "skipped", error: "실행 시간 제한으로 다음 처리로 넘겼습니다." });
      break;
    }
    if (!["pending", "failed"].includes(entry.status)) {
      results.push({ id: entry.id, title: entry.title, status: "skipped", error: `현재 상태(${entry.status})에서는 처리하지 않습니다.` });
      continue;
    }
    try {
      results.push(await processOneQueueEntry(entry));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await failAutoPressRetryQueueEntry(entry.id, {
        status: "failed",
        error: message,
        nextAttemptAt: nextRetryAt(entry.attempts + 1),
        result: { error: message },
      }).catch(() => undefined);
      results.push({ id: entry.id, title: entry.title, status: "failed", error: message });
    }
  }

  const summary: AutoPressRetryProcessSummary = {
    message: `AI 재편집 처리 완료: 성공 ${results.filter((r) => r.status === "success").length}, 실패 ${results.filter((r) => r.status === "failed").length}, 포기 ${results.filter((r) => r.status === "give_up").length}`,
    processed: results.length,
    success: results.filter((r) => r.status === "success").length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    gaveUp: results.filter((r) => r.status === "give_up").length,
    waiting: Math.max(0, entries.length - results.length),
    results,
  };
  await recordActivityLog(summary);
  return summary;
}

export async function cancelAutoPressRetryQueueItem(id: string, reason?: string) {
  const { cancelAutoPressRetryQueueEntry } = await import("@/lib/auto-press-observability");
  await cancelAutoPressRetryQueueEntry(id, reason);
}
