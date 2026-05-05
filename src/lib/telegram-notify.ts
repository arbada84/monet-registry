import "server-only";

import { readSiteSetting, writeSiteSetting } from "@/lib/site-settings-store";
import { getTelegramRuntimeConfig, type TelegramRuntimeConfig } from "@/lib/telegram-settings";
import { getAutoPressRetryTargetLabel } from "@/lib/auto-press-retry-target";
import type {
  AutoNewsArticleResult,
  AutoNewsRun,
  AutoPressArticleResult,
  AutoPressRetryProcessSummary,
  AutoPressRun,
} from "@/types/article";

type TelegramLevel = "critical" | "warning" | "info";

interface TelegramSendOptions {
  text: string;
  level?: TelegramLevel;
  disableWebPagePreview?: boolean;
  chatIds?: string[];
}

interface TelegramPhotoOptions extends TelegramSendOptions {
  photoUrl?: string;
}

export interface TelegramArticleNotification {
  kind: "auto_press" | "auto_news";
  title: string;
  source?: string;
  registeredAt?: string;
  status?: string;
  articleId?: string;
  articleNo?: number | string;
  sourceUrl?: string;
  summary?: string;
  thumbnail?: string;
}

export type TelegramAutoPublishKind = "auto_press" | "auto_news";
export type TelegramAutoPublishRun = AutoPressRun | AutoNewsRun;

export interface TelegramMailSummary {
  uid: number;
  accountEmail: string;
  folder: string;
  from: string;
  subject: string;
  date: string;
  hasAttachments: boolean;
  attachmentNames: string[];
}

export interface TelegramWebhookInfo {
  url?: string;
  has_custom_certificate?: boolean;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
  allowed_updates?: string[];
}

export interface TelegramDeliveryLog {
  id: string;
  at: string;
  action: string;
  ok: boolean;
  method?: string;
  chatCount?: number;
  preview?: string;
  error?: string;
}

interface TelegramApiResult<T> {
  ok: boolean;
  result?: T;
  error?: string;
}

interface TelegramPostResult {
  ok: boolean;
  error?: string;
}

const TELEGRAM_API_BASE = "https://api.telegram.org";
const DELIVERY_LOG_KEY = "cp-telegram-delivery-log";
const MAX_DELIVERY_LOGS = 200;
const BOT_SELF_CHAT_ID_ERROR = "현재 채팅 ID가 봇 자신의 ID입니다. 텔레그램에서 봇에게 /start를 보낸 뒤 실제 사용자 채팅 ID를 찾아 저장하세요.";

function isTelegramEnabled(config: TelegramRuntimeConfig): boolean {
  return config.enabledFlag && Boolean(config.botToken) && config.chatIds.length > 0;
}

function getTargetChatIds(config: TelegramRuntimeConfig, chatIds?: string[]): string[] {
  if (!chatIds || chatIds.length === 0) return config.chatIds;
  const allowed = new Set(config.chatIds);
  return chatIds.map((id) => String(id).trim()).filter((id) => allowed.has(id));
}

function getBotIdFromToken(token: string): string {
  const botId = token.split(":", 1)[0]?.trim() || "";
  return /^\d+$/.test(botId) ? botId : "";
}

function splitUsableChatIds(config: TelegramRuntimeConfig, chatIds: string[]): {
  usableChatIds: string[];
  rejectedSelfIds: string[];
} {
  const botId = getBotIdFromToken(config.botToken);
  if (!botId) return { usableChatIds: chatIds, rejectedSelfIds: [] };

  return {
    usableChatIds: chatIds.filter((chatId) => chatId !== botId),
    rejectedSelfIds: chatIds.filter((chatId) => chatId === botId),
  };
}

function normalizeTelegramError(method: string, status?: number, description?: string): string {
  const raw = String(description || "").trim();
  const lower = raw.toLowerCase();

  if (lower.includes("bots can't send messages to bots")) return BOT_SELF_CHAT_ID_ERROR;
  if (lower.includes("can't use getupdates method while webhook is active")) {
    return "웹훅이 활성화되어 있어 최근 업데이트 방식으로 채팅 ID를 조회할 수 없습니다. 봇에게 /start를 보내면 웹훅 후보 목록에 표시됩니다.";
  }
  if (lower.includes("chat not found")) {
    return "채팅을 찾을 수 없습니다. 텔레그램에서 사용자가 봇에게 /start를 먼저 보냈는지 확인하세요.";
  }
  if (lower.includes("bot was blocked by the user")) {
    return "사용자가 텔레그램 봇을 차단해 메시지를 보낼 수 없습니다.";
  }
  if (lower.includes("unauthorized")) {
    return "텔레그램 봇 토큰 인증에 실패했습니다. 봇 토큰 값을 다시 확인하세요.";
  }
  if (lower.includes("not found")) {
    return "텔레그램 API 요청 경로를 찾을 수 없습니다. 봇 토큰 형식을 확인하세요.";
  }
  if (lower.includes("aborted") || lower.includes("timeout")) {
    return "텔레그램 요청 시간이 초과되었습니다. 네트워크 상태를 확인한 뒤 다시 시도하세요.";
  }

  return `텔레그램 ${method} 요청이 실패했습니다${status ? `(${status})` : ""}. 봇 토큰, 채팅 ID, 웹훅 상태를 확인하세요.`;
}

function summarizeDeliveryErrors(results: TelegramPostResult[], rejectedSelfIds: string[]): string | undefined {
  const errors = [
    ...(rejectedSelfIds.length > 0 ? [BOT_SELF_CHAT_ID_ERROR] : []),
    ...results.map((result) => result.error).filter((error): error is string => Boolean(error)),
  ];
  const unique = [...new Set(errors)];
  return unique.length > 0 ? unique.join(" / ") : undefined;
}

export async function getTelegramStatus() {
  const config = await getTelegramRuntimeConfig();
  const botId = getBotIdFromToken(config.botToken);
  return {
    enabled: isTelegramEnabled(config),
    hasToken: Boolean(config.botToken),
    hasWebhookSecret: Boolean(config.webhookSecret),
    hasWebhookHeaderSecret: Boolean(config.webhookHeaderSecret),
    tempLoginEnabled: config.allowTempLogin,
    chatCount: config.chatIds.length,
    chatIds: config.chatIds.map(maskChatId),
    botSelfChatIdConfigured: botId ? config.chatIds.includes(botId) : false,
    source: config.source,
  };
}

export async function isAllowedTelegramChatId(chatId: string | number): Promise<boolean> {
  const config = await getTelegramRuntimeConfig();
  return config.chatIds.includes(String(chatId));
}

function maskChatId(chatId: string): string {
  if (chatId.length <= 4) return "****";
  return `${chatId.slice(0, 2)}***${chatId.slice(-2)}`;
}

export function escapeTelegramHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function isHttpUrl(value?: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`.replace(/\/+$/, "");
  return "https://culturepeople.co.kr";
}

function getArticlePublicUrl(article: TelegramArticleNotification): string {
  const id = article.articleNo || article.articleId;
  return id ? `${getSiteUrl()}/article/${encodeURIComponent(String(id))}` : "";
}

function levelPrefix(level: TelegramLevel): string {
  if (level === "critical") return "[긴급]";
  if (level === "warning") return "[주의]";
  return "[정보]";
}

function runKindLabel(kind: TelegramAutoPublishKind): string {
  return kind === "auto_press" ? "보도자료 자동등록" : "자동 뉴스 발행";
}

function runSourceLabel(source: TelegramAutoPublishRun["source"]): string {
  if (source === "cron") return "예약 실행";
  if (source === "cli") return "CLI 실행";
  return "수동 실행";
}

function runStatusLabel(status: AutoPressArticleResult["status"] | AutoNewsArticleResult["status"]): string {
  const labels: Record<string, string> = {
    ok: "등록",
    preview: "미리보기",
    fail: "실패",
    dup: "중복",
    skip: "건너뜀",
    no_image: "이미지 없음",
    old: "기간 제외",
  };
  return labels[status] || status;
}

function articleIdLabel(article: AutoPressArticleResult | AutoNewsArticleResult): string {
  if (article.articleId) return `#${article.articleId}`;
  if ("wrId" in article && article.wrId) return article.wrId;
  return "";
}

function retryResultStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    success: "성공",
    failed: "실패",
    skipped: "건너뜀",
    give_up: "포기",
    cancelled: "취소",
  };
  return labels[status] || status;
}

export function buildTelegramAutoPublishRunSummary(
  kind: TelegramAutoPublishKind,
  run: TelegramAutoPublishRun,
): string {
  const hasFailure = run.articlesFailed > 0;
  const hasWarnings = (run.warnings?.length || 0) > 0 || run.mediaStorage?.ok === false;
  const level: TelegramLevel = hasFailure ? "critical" : hasWarnings ? "warning" : "info";
  const previewCount = run.articlesPreviewed || 0;
  const mode = run.preview ? "미리보기" : "실행";
  const headline = `${runKindLabel(kind)} ${mode}현황`;
  const shownArticles = run.articles.slice(0, 6);
  const remaining = Math.max(0, run.articles.length - shownArticles.length);
  const aiRetryQueued = kind === "auto_press"
    ? run.articles.filter((article) => article.warnings?.some((warning) => warning.includes("AI 편집 실패"))).length
    : 0;

  const lines = [
    `<b>${escapeTelegramHtml(levelPrefix(level))} ${escapeTelegramHtml(headline)}</b>`,
    `실행 방식: ${escapeTelegramHtml(runSourceLabel(run.source))}`,
    `등록: ${run.articlesPublished}건 / 미리보기: ${previewCount}건 / 건너뜀: ${run.articlesSkipped}건 / 실패: ${run.articlesFailed}건`,
    aiRetryQueued > 0 ? `AI 편집 대기: ${aiRetryQueued}건` : "",
    run.mediaStorage ? `미디어 저장소: ${run.mediaStorage.ok ? "정상" : "조치 필요"} (${escapeTelegramHtml(run.mediaStorage.provider)})` : "",
    run.warnings?.[0] ? `주의: ${escapeTelegramHtml(truncate(stripHtml(run.warnings[0]), 220))}` : "",
    "",
    shownArticles.length > 0 ? "<b>처리 기사</b>" : "",
    ...shownArticles.map((article, index) => {
      const ref = articleIdLabel(article);
      const error = article.error ? ` - ${truncate(stripHtml(article.error), 100)}` : "";
      return `${index + 1}. ${escapeTelegramHtml(runStatusLabel(article.status))}${ref ? ` ${escapeTelegramHtml(ref)}` : ""}: ${escapeTelegramHtml(truncate(article.title || "(제목 없음)", 120))}${escapeTelegramHtml(error)}`;
    }),
    remaining > 0 ? `외 ${remaining}건` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

export function buildTelegramAutoPressRetryQueueSummary(summary: AutoPressRetryProcessSummary): string {
  const level: TelegramLevel = summary.gaveUp > 0 || summary.failed > 0 ? "warning" : "info";
  const shownResults = summary.results.slice(0, 8);
  const remaining = Math.max(0, summary.results.length - shownResults.length);

  const lines = [
    `<b>${escapeTelegramHtml(levelPrefix(level))} AI 편집 대기열 처리현황</b>`,
    `처리: ${summary.processed}건 / 성공: ${summary.success}건 / 실패: ${summary.failed}건 / 포기: ${summary.gaveUp}건 / 건너뜀: ${summary.skipped}건`,
    summary.waiting > 0 ? `다음 처리 대기: ${summary.waiting}건` : "",
    summary.message ? `메시지: ${escapeTelegramHtml(truncate(stripHtml(summary.message), 240))}` : "",
    "",
    shownResults.length > 0 ? "<b>처리 결과</b>" : "",
    ...shownResults.map((result, index) => {
      const ref = result.articleId ? ` #${result.articleId}` : "";
      const target = result.targetType ? ` · ${getAutoPressRetryTargetLabel(result.targetType)}` : "";
      const retry = result.retryCount ? ` (${result.retryCount}회차)` : "";
      const next = result.nextRetryAt ? ` / 다음: ${result.nextRetryAt}` : "";
      const error = result.error ? ` - ${truncate(stripHtml(result.error), 120)}` : "";
      return `${index + 1}. ${escapeTelegramHtml(retryResultStatusLabel(result.status))}${escapeTelegramHtml(target)}${escapeTelegramHtml(ref)}${escapeTelegramHtml(retry)}: ${escapeTelegramHtml(truncate(result.title || "(제목 없음)", 120))}${escapeTelegramHtml(error)}${escapeTelegramHtml(next)}`;
    }),
    remaining > 0 ? `외 ${remaining}건` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

async function readDeliveryLogs(): Promise<TelegramDeliveryLog[]> {
  const logs = await readSiteSetting<TelegramDeliveryLog[]>(DELIVERY_LOG_KEY, [], { useServiceKey: true });
  return Array.isArray(logs) ? logs : [];
}

async function writeDeliveryLogs(logs: TelegramDeliveryLog[]): Promise<void> {
  await writeSiteSetting(DELIVERY_LOG_KEY, logs.slice(0, MAX_DELIVERY_LOGS), { bestEffort: true });
}

async function appendDeliveryLog(entry: Omit<TelegramDeliveryLog, "id" | "at">): Promise<void> {
  const log: TelegramDeliveryLog = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    at: new Date().toISOString(),
    ...entry,
    preview: entry.preview ? truncate(stripHtml(entry.preview), 220) : undefined,
    error: entry.error ? truncate(stripHtml(entry.error), 300) : undefined,
  };

  const logs = await readDeliveryLogs();
  await writeDeliveryLogs([log, ...logs].slice(0, MAX_DELIVERY_LOGS));
}

export async function getTelegramDeliveryLogs(limit = 50): Promise<TelegramDeliveryLog[]> {
  const logs = await readDeliveryLogs();
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), MAX_DELIVERY_LOGS);
  return logs.slice(0, safeLimit);
}

async function postTelegram(
  method: string,
  payload: Record<string, unknown>,
  config?: TelegramRuntimeConfig,
): Promise<TelegramPostResult> {
  const runtime = config || await getTelegramRuntimeConfig();
  if (!runtime.botToken) return { ok: false, error: "텔레그램 봇 토큰이 설정되지 않았습니다." };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), runtime.timeoutMs);
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${runtime.botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!res.ok || data.ok === false) {
      const error = normalizeTelegramError(method, res.status, data.description);
      console.warn(`[telegram] ${method} failed: ${(data.description || error).slice(0, 180)}`);
      return { ok: false, error };
    }
    return { ok: true };
  } catch (error) {
    const message = normalizeTelegramError(method, undefined, error instanceof Error ? error.message : undefined);
    console.warn("[telegram] request failed:", message);
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

async function callTelegram<T>(
  method: string,
  payload: Record<string, unknown> = {},
  config?: TelegramRuntimeConfig,
): Promise<TelegramApiResult<T>> {
  const runtime = config || await getTelegramRuntimeConfig();
  if (!runtime.botToken) return { ok: false, error: "텔레그램 봇 토큰이 설정되지 않았습니다." };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), runtime.timeoutMs);
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${runtime.botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: normalizeTelegramError(method, res.status, data.description) };
    }
    return { ok: true, result: data.result };
  } catch (error) {
    return { ok: false, error: normalizeTelegramError(method, undefined, error instanceof Error ? error.message : undefined) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function buildTelegramWebhookUrl(config?: TelegramRuntimeConfig): Promise<string | null> {
  const runtime = config || await getTelegramRuntimeConfig();
  if (!runtime.webhookSecret) return null;
  return `${getSiteUrl()}/api/telegram/webhook/${encodeURIComponent(runtime.webhookSecret)}`;
}

export async function getTelegramWebhookInfo(): Promise<TelegramApiResult<TelegramWebhookInfo>> {
  const config = await getTelegramRuntimeConfig();
  return callTelegram<TelegramWebhookInfo>("getWebhookInfo", {}, config);
}

export async function setTelegramWebhook(options?: { dropPendingUpdates?: boolean }): Promise<TelegramApiResult<boolean> & { url?: string }> {
  const config = await getTelegramRuntimeConfig();
  const url = await buildTelegramWebhookUrl(config);
  if (!url) {
    await appendDeliveryLog({
      action: "set_webhook",
      ok: false,
      method: "setWebhook",
      error: "텔레그램 웹훅 비밀값이 설정되지 않았습니다.",
    });
    return { ok: false, error: "텔레그램 웹훅 비밀값이 설정되지 않았습니다." };
  }

  const result = await callTelegram<boolean>("setWebhook", {
    url,
    allowed_updates: ["message"],
    drop_pending_updates: options?.dropPendingUpdates ?? false,
    ...(config.webhookHeaderSecret ? { secret_token: config.webhookHeaderSecret } : {}),
  }, config);

  await appendDeliveryLog({
    action: "set_webhook",
    ok: result.ok,
    method: "setWebhook",
    preview: url,
    error: result.error,
  });

  return { ...result, url };
}

export async function deleteTelegramWebhook(options?: { dropPendingUpdates?: boolean }): Promise<TelegramApiResult<boolean>> {
  const config = await getTelegramRuntimeConfig();
  const result = await callTelegram<boolean>("deleteWebhook", {
    drop_pending_updates: options?.dropPendingUpdates ?? false,
  }, config);

  await appendDeliveryLog({
    action: "delete_webhook",
    ok: result.ok,
    method: "deleteWebhook",
    error: result.error,
  });

  return result;
}

export async function sendTelegramMessage(options: TelegramSendOptions): Promise<boolean> {
  const config = await getTelegramRuntimeConfig();
  const preview = options.text;

  if (!isTelegramEnabled(config)) {
    await appendDeliveryLog({
      action: "send_message",
      ok: false,
      method: "sendMessage",
      chatCount: 0,
      preview,
      error: "텔레그램이 비활성화되었거나 봇 토큰/채팅 ID 설정이 없습니다.",
    });
    return false;
  }

  const chatIds = getTargetChatIds(config, options.chatIds);
  if (chatIds.length === 0) {
    await appendDeliveryLog({
      action: "send_message",
      ok: false,
      method: "sendMessage",
      chatCount: 0,
      preview,
      error: "허용된 대상 채팅 ID가 없습니다.",
    });
    return false;
  }

  const { usableChatIds, rejectedSelfIds } = splitUsableChatIds(config, chatIds);
  if (usableChatIds.length === 0) {
    await appendDeliveryLog({
      action: "send_message",
      ok: false,
      method: "sendMessage",
      chatCount: chatIds.length,
      preview,
      error: BOT_SELF_CHAT_ID_ERROR,
    });
    return false;
  }

  const text = truncate(options.text, 4000);
  const results = await Promise.all(
    usableChatIds.map((chatId) =>
      postTelegram("sendMessage", {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: options.disableWebPagePreview ?? false,
      }, config),
    ),
  );
  const ok = results.some((result) => result.ok);

  await appendDeliveryLog({
    action: "send_message",
    ok,
    method: "sendMessage",
    chatCount: usableChatIds.length,
    preview,
    error: summarizeDeliveryErrors(ok ? results.filter((result) => !result.ok) : results, rejectedSelfIds),
  });

  return ok;
}

export async function sendTelegramPhoto(options: TelegramPhotoOptions): Promise<boolean> {
  const config = await getTelegramRuntimeConfig();
  if (!isTelegramEnabled(config) || !isHttpUrl(options.photoUrl)) {
    return sendTelegramMessage(options);
  }

  const chatIds = getTargetChatIds(config, options.chatIds);
  if (chatIds.length === 0) {
    await appendDeliveryLog({
      action: "send_photo",
      ok: false,
      method: "sendPhoto",
      chatCount: 0,
      preview: options.text,
      error: "허용된 대상 채팅 ID가 없습니다.",
    });
    return false;
  }

  const { usableChatIds, rejectedSelfIds } = splitUsableChatIds(config, chatIds);
  if (usableChatIds.length === 0) {
    await appendDeliveryLog({
      action: "send_photo",
      ok: false,
      method: "sendPhoto",
      chatCount: chatIds.length,
      preview: options.text,
      error: BOT_SELF_CHAT_ID_ERROR,
    });
    return false;
  }

  const caption = truncate(options.text, 1000);
  const results = await Promise.all(
    usableChatIds.map((chatId) =>
      postTelegram("sendPhoto", {
        chat_id: chatId,
        photo: options.photoUrl,
        caption,
        parse_mode: "HTML",
      }, config),
    ),
  );
  const ok = results.some((result) => result.ok);

  await appendDeliveryLog({
    action: "send_photo",
    ok,
    method: "sendPhoto",
    chatCount: usableChatIds.length,
    preview: options.text,
    error: summarizeDeliveryErrors(ok ? results.filter((result) => !result.ok) : results, rejectedSelfIds),
  });

  if (ok) return true;
  return sendTelegramMessage({ ...options, chatIds: usableChatIds });
}

export async function notifyTelegramDbNotification(
  type: string,
  title: string,
  message = "",
  metadata: Record<string, unknown> = {},
): Promise<boolean> {
  const config = await getTelegramRuntimeConfig();
  const defaultTypes = new Set(["cron_failure", "ai_failure", "security", "mail_failure", "media_storage"]);
  const allowed = config.notificationTypes
    ? config.notificationTypes === "*" || config.notificationTypes.split(",").map((value) => value.trim()).includes(type)
    : defaultTypes.has(type);
  if (!allowed) return false;

  const route = typeof metadata.route === "string" ? metadata.route : "";
  const lines = [
    `<b>${escapeTelegramHtml(levelPrefix(type.includes("failure") ? "critical" : "warning"))} ${escapeTelegramHtml(title)}</b>`,
    message ? escapeTelegramHtml(truncate(stripHtml(message), 800)) : "",
    route ? `경로: <code>${escapeTelegramHtml(route)}</code>` : "",
  ].filter(Boolean);

  return sendTelegramMessage({ text: lines.join("\n"), level: type.includes("failure") ? "critical" : "warning" });
}

export async function notifyTelegramArticleRegistered(article: TelegramArticleNotification): Promise<boolean> {
  const kindLabel = article.kind === "auto_press" ? "보도자료 자동등록" : "자동 뉴스 등록";
  const publicUrl = getArticlePublicUrl(article);
  const adminUrl = `${getSiteUrl()}/cam/articles`;
  const source = article.source || "미확인";
  const summary = article.summary ? truncate(stripHtml(article.summary), 500) : "";
  const registeredAt = article.registeredAt || new Date().toISOString();

  const lines = [
    `<b>${escapeTelegramHtml(levelPrefix("info"))} ${escapeTelegramHtml(kindLabel)}</b>`,
    `<b>${escapeTelegramHtml(article.title)}</b>`,
    `출처: ${escapeTelegramHtml(source)}`,
    `등록일: ${escapeTelegramHtml(registeredAt)}`,
    article.status ? `상태: ${escapeTelegramHtml(article.status)}` : "",
    summary ? `요약: ${escapeTelegramHtml(summary)}` : "",
    publicUrl ? `기사: ${escapeTelegramHtml(publicUrl)}` : "",
    `관리자: ${escapeTelegramHtml(adminUrl)}`,
    article.sourceUrl ? `원문: ${escapeTelegramHtml(article.sourceUrl)}` : "",
  ].filter(Boolean);

  return sendTelegramPhoto({
    text: lines.join("\n"),
    photoUrl: article.thumbnail,
    level: "info",
  });
}

export async function notifyTelegramAutoPublishRun(
  kind: TelegramAutoPublishKind,
  run: TelegramAutoPublishRun,
): Promise<boolean> {
  return sendTelegramMessage({
    text: buildTelegramAutoPublishRunSummary(kind, run),
    level: run.articlesFailed > 0 ? "critical" : (run.warnings?.length || 0) > 0 || run.mediaStorage?.ok === false ? "warning" : "info",
    disableWebPagePreview: true,
  });
}

export async function notifyTelegramAutoPressRetryQueue(
  summary: AutoPressRetryProcessSummary,
): Promise<boolean> {
  return sendTelegramMessage({
    text: buildTelegramAutoPressRetryQueueSummary(summary),
    level: summary.failed > 0 || summary.gaveUp > 0 ? "warning" : "info",
    disableWebPagePreview: true,
  });
}

export async function notifyTelegramMailSync(mails: TelegramMailSummary[]): Promise<boolean> {
  if (mails.length === 0) return false;
  const shown = mails.slice(0, 5);
  const lines = [
    `<b>${escapeTelegramHtml(levelPrefix("info"))} 새 메일 수신: ${mails.length}건</b>`,
    ...shown.map((mail, index) => {
      const attachments = mail.hasAttachments
        ? ` / 첨부: ${mail.attachmentNames.slice(0, 3).map((value) => truncate(value, 40)).join(", ")}`
        : "";
      return `${index + 1}. ${escapeTelegramHtml(truncate(mail.subject || "(제목 없음)", 120))}\n보낸사람: ${escapeTelegramHtml(truncate(mail.from, 120))}${escapeTelegramHtml(attachments)}`;
    }),
    mails.length > shown.length ? `외 ${mails.length - shown.length}건` : "",
    `관리자: ${escapeTelegramHtml(`${getSiteUrl()}/cam/mail-press`)}`,
  ].filter(Boolean);

  return sendTelegramMessage({ text: lines.join("\n\n"), level: "info" });
}

export async function getTelegramUpdatesForSetup(): Promise<{ ok: boolean; updates?: unknown[]; error?: string }> {
  const config = await getTelegramRuntimeConfig();
  if (!config.botToken) return { ok: false, error: "텔레그램 봇 토큰이 설정되지 않았습니다." };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${config.botToken}/getUpdates`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    const data = (await res.json()) as { ok?: boolean; result?: unknown[]; description?: string };
    if (!res.ok || !data.ok) return { ok: false, error: normalizeTelegramError("getUpdates", res.status, data.description) };
    return { ok: true, updates: data.result || [] };
  } catch (error) {
    return { ok: false, error: normalizeTelegramError("getUpdates", undefined, error instanceof Error ? error.message : undefined) };
  } finally {
    clearTimeout(timeout);
  }
}
