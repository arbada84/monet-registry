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
import { serverCreateArticle, serverFindArticleDuplicate, serverGetArticleById, serverGetArticleByNo, serverGetSetting, serverSaveSetting, serverUpdateArticle } from "@/lib/db-server";
import { resolveAiApiKey, serverGetAiSettings } from "@/lib/ai-settings-server";
import { serverUploadImageUrl } from "@/lib/server-upload-image";
import { filterPressImageUrls, getPressImageLimit, isManagedPressImageUrl, isNoisyPressImageUrl } from "@/lib/press-image-policy";
import { ensurePressBodyImage, getPressImageCandidates, hasPressBodyImage, promoteFirstPressBodyImage } from "@/lib/auto-press-image-guard";
import { ArticleDuplicateError, isSubstantiallyEdited } from "@/lib/article-dedupe";
import { DEFAULT_GEMINI_TEXT_MODEL } from "@/lib/ai-model-options";
import { getAutoPressRetryTargetType } from "@/lib/auto-press-retry-target";
import type {
  Article,
  AutoPressRetryProcessResult,
  AutoPressRetryProcessSummary,
  AutoPressRetryPayload,
  AutoPressRetryQueueEntry,
  AutoPressSettings,
} from "@/types/article";

const TIMEOUT_MS = 50_000;
const DEFAULT_BATCH_LIMIT = 3;
const MIN_AI_EDIT_TIMEOUT_MS = 8_000;
const MAX_AI_EDIT_TIMEOUT_MS = 25_000;
const AI_EDIT_TIMEOUT_RESERVE_MS = 8_000;
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
  const delayIndex = Math.max(0, Math.min(attempts, RETRY_DELAYS_HOURS.length - 1));
  const delayHours = RETRY_DELAYS_HOURS[delayIndex];
  return new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString();
}

function getRemainingAiTimeoutMs(deadlineAt?: number): number {
  if (!deadlineAt) return MAX_AI_EDIT_TIMEOUT_MS;
  const remaining = deadlineAt - Date.now() - AI_EDIT_TIMEOUT_RESERVE_MS;
  if (remaining < MIN_AI_EDIT_TIMEOUT_MS) return 0;
  return Math.max(MIN_AI_EDIT_TIMEOUT_MS, Math.min(MAX_AI_EDIT_TIMEOUT_MS, remaining));
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

function getAutoPressImageLimit(): number {
  return getPressImageLimit(process.env.AUTO_PRESS_IMAGE_MAX_PER_ARTICLE);
}

function getUnpublishedRetryPayload(entry: AutoPressRetryQueueEntry): AutoPressRetryPayload | null {
  const directPayload = entry.payload as Partial<AutoPressRetryPayload> | undefined;
  const nestedPayload = (entry.payload?.result as { retryPayload?: Partial<AutoPressRetryPayload> } | undefined)?.retryPayload;
  const payload = (nestedPayload || directPayload) as Partial<AutoPressRetryPayload> | undefined;
  if (!payload || payload.type !== "auto_press_unpublished") return null;
  if (!payload.bodyText || !payload.bodyHtml || !payload.sourceUrl) return null;
  return {
    type: "auto_press_unpublished",
    title: String(payload.title || entry.title || ""),
    sourceUrl: String(payload.sourceUrl || entry.sourceUrl || ""),
    wrId: payload.wrId ? String(payload.wrId) : undefined,
    boTable: payload.boTable ? String(payload.boTable) : undefined,
    sourceName: payload.sourceName ? String(payload.sourceName) : entry.sourceName,
    bodyText: String(payload.bodyText || ""),
    bodyHtml: String(payload.bodyHtml || ""),
    images: Array.isArray(payload.images) ? payload.images.map(String).filter(Boolean) : [],
    thumbnail: payload.thumbnail ? String(payload.thumbnail) : undefined,
    category: payload.category ? String(payload.category) : undefined,
    publishStatus: payload.publishStatus === "임시저장" ? "임시저장" : "게시",
    author: payload.author ? String(payload.author) : undefined,
    date: payload.date ? String(payload.date) : undefined,
    keywords: Array.isArray(payload.keywords) ? payload.keywords.map(String).filter(Boolean) : undefined,
    aiProvider: payload.aiProvider === "openai" ? "openai" : "gemini",
    aiModel: payload.aiModel ? String(payload.aiModel) : undefined,
    reasonCode: payload.reasonCode ? String(payload.reasonCode) : entry.reasonCode,
    createdAt: payload.createdAt ? String(payload.createdAt) : undefined,
  };
}

async function reuploadPressBodyImages(html: string): Promise<string> {
  const imgRegex = /<img([^>]*)src=["'](https?:\/\/[^"']+)["']([^>]*)>/gi;
  const matches = [...String(html || "").matchAll(imgRegex)];
  const uploadTargets = filterPressImageUrls(
    matches.map((match) => match[2]).filter((url) => !isManagedPressImageUrl(url)),
    { maxImages: getAutoPressImageLimit(), keepManaged: false },
  );
  const uploadTargetSet = new Set(uploadTargets);
  const urlMap = new Map<string, string>();

  for (const originalUrl of uploadTargets) {
    const uploaded = await serverUploadImageUrl(originalUrl);
    if (uploaded) urlMap.set(originalUrl, uploaded);
  }

  let result = String(html || "");
  for (const match of matches) {
    const originalUrl = match[2];
    if (isManagedPressImageUrl(originalUrl)) continue;
    if (isNoisyPressImageUrl(originalUrl) || !uploadTargetSet.has(originalUrl)) {
      result = result.replace(match[0], "");
      continue;
    }
    const uploaded = urlMap.get(originalUrl);
    result = uploaded ? result.replace(originalUrl, uploaded) : result.replace(match[0], "");
  }
  return result.trim();
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

async function processUnpublishedPayload(
  running: AutoPressRetryQueueEntry,
  payload: AutoPressRetryPayload,
  settings: AutoPressSettings,
  aiProvider: AutoPressSettings["aiProvider"],
  aiModel: string,
  apiKey: string,
  deadlineAt: number | undefined,
  fail: (error: string, gaveUp?: boolean) => Promise<AutoPressRetryProcessResult>,
): Promise<AutoPressRetryProcessResult> {
  const duplicate = await serverFindArticleDuplicate({
    title: payload.title,
    sourceUrl: payload.sourceUrl,
  });
  if (duplicate) {
    return fail(`이미 등록된 기사와 중복되어 재시도를 중단했습니다. (${duplicate.reason})`, true);
  }

  const bodyText = stripHtmlToText(payload.bodyText || payload.bodyHtml || "");
  if (bodyText.length < 50) {
    return fail("대기열 원문 본문이 너무 짧아 AI 편집을 진행할 수 없습니다.", running.attempts >= running.maxAttempts);
  }

  const aiTimeoutMs = getRemainingAiTimeoutMs(deadlineAt);
  if (aiTimeoutMs === 0) {
    return fail("남은 실행 시간이 부족해 원문 후보 AI 편집을 다음 재시도로 넘겼습니다.", false);
  }

  const edited = await aiEditArticle(aiProvider, aiModel, apiKey, payload.title, bodyText.slice(0, 3000), payload.bodyHtml, {
    maxAttempts: 1,
    timeoutMs: aiTimeoutMs,
    retryDelayMs: 0,
    maxOutputTokens: 3072,
  });
  if (!edited) {
    return fail("AI가 원문 후보의 유효한 편집 결과를 반환하지 않았습니다.", running.attempts >= running.maxAttempts);
  }

  const editQuality = isSubstantiallyEdited({
    sourceText: bodyText,
    editedHtml: edited.body,
  });
  if (!editQuality.ok) {
    return fail(`${editQuality.reason || "AI 편집 결과가 원문과 너무 유사합니다."} 원문 그대로 등록하지 않고 다시 시도합니다.`, running.attempts >= running.maxAttempts);
  }

  const title = edited.title || payload.title;
  const category = edited.category && VALID_CATEGORIES.includes(edited.category)
    ? edited.category
    : payload.category || settings.category || "공공";
  const sourceImages = getPressImageCandidates({
    bodyHtml: payload.bodyHtml,
    images: [payload.thumbnail || "", ...(payload.images || [])],
    bodyText,
    maxImages: getAutoPressImageLimit(),
  });

  const restoredBeforeUpload = ensurePressBodyImage({
    bodyHtml: edited.body,
    candidateImages: sourceImages,
    altText: title,
  });
  if (!restoredBeforeUpload.ok) {
    return fail("AI 편집은 성공했지만 복원 가능한 원문 이미지가 없어 기사로 등록하지 않았습니다.", running.attempts >= running.maxAttempts);
  }

  let finalBody = await reuploadPressBodyImages(restoredBeforeUpload.bodyHtml);
  const managedImages = getPressImageCandidates({
    bodyHtml: finalBody,
    maxImages: getAutoPressImageLimit(),
  }).filter(isManagedPressImageUrl);
  const restoredAfterUpload = ensurePressBodyImage({
    bodyHtml: finalBody,
    candidateImages: managedImages,
    altText: title,
  });
  finalBody = restoredAfterUpload.bodyHtml;
  if (!restoredAfterUpload.ok) {
    return fail("이미지 업로드 후 본문 이미지가 없어 기사로 등록하지 않았습니다.", running.attempts >= running.maxAttempts);
  }

  const promoted = promoteFirstPressBodyImage(finalBody);
  finalBody = promoted.bodyHtml;
  let thumbnail = promoted.thumbnailUrl || payload.thumbnail || "";
  if (thumbnail && !isManagedPressImageUrl(thumbnail) && !isNoisyPressImageUrl(thumbnail)) {
    thumbnail = await serverUploadImageUrl(thumbnail).catch(() => "") || "";
  }
  if (!thumbnail) {
    thumbnail = getPressImageCandidates({ bodyHtml: finalBody, maxImages: 1 })[0] ?? "";
  }

  const finalGuard = ensurePressBodyImage({
    bodyHtml: finalBody,
    candidateImages: getPressImageCandidates({
      bodyHtml: finalBody,
      images: thumbnail ? [thumbnail] : [],
      maxImages: getAutoPressImageLimit(),
    }).filter(isManagedPressImageUrl),
    altText: title,
  });
  finalBody = finalGuard.bodyHtml;
  if (!finalGuard.ok || !hasPressBodyImage(finalBody)) {
    return fail("저장 직전 본문 이미지가 없어 기사로 등록하지 않았습니다.", running.attempts >= running.maxAttempts);
  }

  const article: Article = {
    id: "",
    title,
    category,
    date: new Date().toISOString().slice(0, 10),
    status: payload.publishStatus || settings.publishStatus || "게시",
    views: 0,
    body: finalBody,
    thumbnail: thumbnail || undefined,
    tags: edited.tags || payload.keywords?.join(","),
    author: payload.author || settings.author,
    summary: edited.summary || undefined,
    sourceUrl: payload.sourceUrl,
    updatedAt: new Date().toISOString(),
    aiGenerated: true,
    reviewNote: "AI 재시도 대기열에서 편집 후 자동 등록되었습니다.",
  };

  try {
    const savedNo = await serverCreateArticle(article);
    const articleId = String(savedNo || "");
    await completeAutoPressRetryQueueEntry(running.id, {
      articleId,
      articleNo: savedNo,
      attempts: running.attempts,
      title,
      createdFromPayload: true,
      completedAt: new Date().toISOString(),
    });
    if (running.runId) {
      await appendAutoPressObservedEvent({
        runId: running.runId,
        itemId: running.itemId,
        level: "info",
        code: "AI_RETRY_CREATED_ARTICLE",
        message: `AI 재시도 원문 후보 등록 성공: ${title}`,
        metadata: { queueId: running.id, articleId, articleNo: savedNo, sourceUrl: payload.sourceUrl },
      }).catch(() => undefined);
    }
    try { revalidateTag("articles"); } catch { /* 캐시 무효화 실패는 무시 */ }
    return {
      id: running.id,
      title,
      articleId,
      targetType: "unpublished",
      retryCount: running.attempts,
      status: "success",
    };
  } catch (error) {
    if (error instanceof ArticleDuplicateError) {
      return fail(error.message.replace(/^DUPLICATE_ARTICLE:\s*/, ""), true);
    }
    throw error;
  }
}

async function processOneQueueEntry(entry: AutoPressRetryQueueEntry, deadlineAt?: number): Promise<AutoPressRetryProcessResult> {
  const running = await markAutoPressRetryQueueRunning(entry.id);
  if (!running) {
    return { id: entry.id, title: entry.title, targetType: getAutoPressRetryTargetType(entry), status: "skipped", error: "이미 처리 중이거나 처리 대상 상태가 아닙니다." };
  }
  const targetType = getAutoPressRetryTargetType(running);

  const fail = async (error: string, gaveUp = false): Promise<AutoPressRetryProcessResult> => {
    const next = gaveUp ? null : nextRetryAt(Math.max(0, running.attempts - 1));
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
      targetType,
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
  const aiModel = settings.aiModel ?? DEFAULT_GEMINI_TEXT_MODEL;
  const apiKey = resolveAiApiKey(aiSettings, aiProvider);

  if (!apiKey) {
    return fail("AI API 키가 설정되어 있지 않습니다.", false);
  }

  const unpublishedPayload = getUnpublishedRetryPayload(running);
  if (unpublishedPayload && !running.articleId && !running.articleNo) {
    return processUnpublishedPayload(running, unpublishedPayload, settings, aiProvider, aiModel, apiKey, deadlineAt, fail);
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

  const aiTimeoutMs = getRemainingAiTimeoutMs(deadlineAt);
  if (aiTimeoutMs === 0) {
    return fail("남은 실행 시간이 부족해 AI 재편집을 다음 재시도로 넘겼습니다.", false);
  }

  const edited = await aiEditArticle(aiProvider, aiModel, apiKey, article.title, bodyText.slice(0, 3000), article.body, {
    maxAttempts: 1,
    timeoutMs: aiTimeoutMs,
    retryDelayMs: 0,
    maxOutputTokens: 3072,
  });
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
    targetType: "existing_article",
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
  const deadlineAt = startTime + TIMEOUT_MS;
  const limit = Math.max(1, Math.min(Math.trunc(Number(options.limit || DEFAULT_BATCH_LIMIT)), 10));

  if (options.queueId && options.force) {
    await resetAutoPressRetryQueueEntry(options.queueId, null);
  }

  const entries = options.queueId
    ? [await getAutoPressRetryQueueEntry(options.queueId)].filter(Boolean) as AutoPressRetryQueueEntry[]
    : await listDueAutoPressRetryQueue({ limit });

  if (entries.length === 0) {
    return {
      message: "AI 편집 대기열에 처리할 항목이 없습니다.",
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
      results.push({ id: entry.id, title: entry.title, targetType: getAutoPressRetryTargetType(entry), status: "skipped", error: "실행 시간 제한으로 다음 처리로 넘겼습니다." });
      break;
    }
    if (!["pending", "failed"].includes(entry.status)) {
      results.push({ id: entry.id, title: entry.title, targetType: getAutoPressRetryTargetType(entry), status: "skipped", error: `현재 상태(${entry.status})에서는 처리하지 않습니다.` });
      continue;
    }
    try {
      results.push(await processOneQueueEntry(entry, deadlineAt));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await failAutoPressRetryQueueEntry(entry.id, {
        status: "failed",
        error: message,
        nextAttemptAt: nextRetryAt(entry.attempts),
        result: { error: message },
      }).catch(() => undefined);
      results.push({ id: entry.id, title: entry.title, status: "failed", error: message });
    }
  }

  const summary: AutoPressRetryProcessSummary = {
    message: `AI 편집 처리 완료: 성공 ${results.filter((r) => r.status === "success").length}, 실패 ${results.filter((r) => r.status === "failed").length}, 포기 ${results.filter((r) => r.status === "give_up").length}`,
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
