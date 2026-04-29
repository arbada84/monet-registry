import "server-only";

import { readSiteSetting, writeSiteSetting } from "@/lib/site-settings-store";

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
const DEFAULT_TIMEOUT_MS = 3500;
const DELIVERY_LOG_KEY = "cp-telegram-delivery-log";
const MAX_DELIVERY_LOGS = 200;

function getBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
}

function getChatIds(): string[] {
  const raw = process.env.TELEGRAM_ALLOWED_CHAT_IDS || process.env.TELEGRAM_CHAT_ID || "";
  return raw
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter((value) => /^-?\d+$/.test(value));
}

function getTargetChatIds(chatIds?: string[]): string[] {
  if (!chatIds || chatIds.length === 0) return getChatIds();
  const allowed = new Set(getChatIds());
  return chatIds.map((id) => String(id).trim()).filter((id) => allowed.has(id));
}

function isTelegramEnabled(): boolean {
  return process.env.TELEGRAM_ENABLED !== "false" && Boolean(getBotToken()) && getChatIds().length > 0;
}

export function getTelegramStatus() {
  const token = getBotToken();
  const chatIds = getChatIds();
  return {
    enabled: isTelegramEnabled(),
    hasToken: Boolean(token),
    hasWebhookSecret: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET?.trim()),
    hasWebhookHeaderSecret: Boolean(process.env.TELEGRAM_WEBHOOK_HEADER_SECRET?.trim()),
    tempLoginEnabled: process.env.TELEGRAM_ALLOW_TEMP_LOGIN === "true",
    chatCount: chatIds.length,
    chatIds: chatIds.map(maskChatId),
  };
}

export function isAllowedTelegramChatId(chatId: string | number): boolean {
  return getChatIds().includes(String(chatId));
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
  if (level === "critical") return "[CRITICAL]";
  if (level === "warning") return "[WARNING]";
  return "[INFO]";
}

function getTimeoutMs(): number {
  const timeoutMs = Number(process.env.TELEGRAM_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
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

async function postTelegram(method: string, payload: Record<string, unknown>): Promise<TelegramPostResult> {
  const token = getBotToken();
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN is not configured" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!res.ok || data.ok === false) {
      const error = data.description || `Telegram ${method} failed: ${res.status}`;
      console.warn(`[telegram] ${method} failed: ${error.slice(0, 180)}`);
      return { ok: false, error };
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : `Telegram ${method} failed`;
    console.warn("[telegram] request failed:", message);
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

async function callTelegram<T>(method: string, payload: Record<string, unknown> = {}): Promise<TelegramApiResult<T>> {
  const token = getBotToken();
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN is not configured" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.description || `Telegram ${method} failed: ${res.status}` };
    }
    return { ok: true, result: data.result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : `Telegram ${method} failed` };
  } finally {
    clearTimeout(timeout);
  }
}

export function buildTelegramWebhookUrl(): string | null {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret) return null;
  return `${getSiteUrl()}/api/telegram/webhook/${encodeURIComponent(secret)}`;
}

export async function getTelegramWebhookInfo(): Promise<TelegramApiResult<TelegramWebhookInfo>> {
  return callTelegram<TelegramWebhookInfo>("getWebhookInfo");
}

export async function setTelegramWebhook(options?: { dropPendingUpdates?: boolean }): Promise<TelegramApiResult<boolean> & { url?: string }> {
  const url = buildTelegramWebhookUrl();
  if (!url) {
    await appendDeliveryLog({
      action: "set_webhook",
      ok: false,
      method: "setWebhook",
      error: "TELEGRAM_WEBHOOK_SECRET is not configured",
    });
    return { ok: false, error: "TELEGRAM_WEBHOOK_SECRET is not configured" };
  }

  const headerSecret = process.env.TELEGRAM_WEBHOOK_HEADER_SECRET?.trim();
  const result = await callTelegram<boolean>("setWebhook", {
    url,
    allowed_updates: ["message"],
    drop_pending_updates: options?.dropPendingUpdates ?? false,
    ...(headerSecret ? { secret_token: headerSecret } : {}),
  });

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
  const result = await callTelegram<boolean>("deleteWebhook", {
    drop_pending_updates: options?.dropPendingUpdates ?? false,
  });

  await appendDeliveryLog({
    action: "delete_webhook",
    ok: result.ok,
    method: "deleteWebhook",
    error: result.error,
  });

  return result;
}

export async function sendTelegramMessage(options: TelegramSendOptions): Promise<boolean> {
  const preview = options.text;

  if (!isTelegramEnabled()) {
    await appendDeliveryLog({
      action: "send_message",
      ok: false,
      method: "sendMessage",
      chatCount: 0,
      preview,
      error: "Telegram is disabled or missing token/chat id configuration",
    });
    return false;
  }

  const chatIds = getTargetChatIds(options.chatIds);
  if (chatIds.length === 0) {
    await appendDeliveryLog({
      action: "send_message",
      ok: false,
      method: "sendMessage",
      chatCount: 0,
      preview,
      error: "No target chat id is allowed",
    });
    return false;
  }

  const text = truncate(options.text, 4000);
  const results = await Promise.all(
    chatIds.map((chatId) =>
      postTelegram("sendMessage", {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: options.disableWebPagePreview ?? false,
      }),
    ),
  );
  const ok = results.some((result) => result.ok);

  await appendDeliveryLog({
    action: "send_message",
    ok,
    method: "sendMessage",
    chatCount: chatIds.length,
    preview,
    error: ok ? undefined : results.map((result) => result.error).filter(Boolean).join(" / "),
  });

  return ok;
}

export async function sendTelegramPhoto(options: TelegramPhotoOptions): Promise<boolean> {
  if (!isTelegramEnabled() || !isHttpUrl(options.photoUrl)) {
    return sendTelegramMessage(options);
  }

  const chatIds = getTargetChatIds(options.chatIds);
  if (chatIds.length === 0) {
    await appendDeliveryLog({
      action: "send_photo",
      ok: false,
      method: "sendPhoto",
      chatCount: 0,
      preview: options.text,
      error: "No target chat id is allowed",
    });
    return false;
  }

  const caption = truncate(options.text, 1000);
  const results = await Promise.all(
    chatIds.map((chatId) =>
      postTelegram("sendPhoto", {
        chat_id: chatId,
        photo: options.photoUrl,
        caption,
        parse_mode: "HTML",
      }),
    ),
  );
  const ok = results.some((result) => result.ok);

  await appendDeliveryLog({
    action: "send_photo",
    ok,
    method: "sendPhoto",
    chatCount: chatIds.length,
    preview: options.text,
    error: ok ? undefined : results.map((result) => result.error).filter(Boolean).join(" / "),
  });

  if (ok) return true;
  return sendTelegramMessage(options);
}

export async function notifyTelegramDbNotification(
  type: string,
  title: string,
  message = "",
  metadata: Record<string, unknown> = {},
): Promise<boolean> {
  const configuredTypes = process.env.TELEGRAM_NOTIFICATION_TYPES?.trim();
  const defaultTypes = new Set(["cron_failure", "ai_failure", "security", "mail_failure"]);
  const allowed = configuredTypes
    ? configuredTypes === "*" || configuredTypes.split(",").map((value) => value.trim()).includes(type)
    : defaultTypes.has(type);
  if (!allowed) return false;

  const route = typeof metadata.route === "string" ? metadata.route : "";
  const lines = [
    `<b>${escapeTelegramHtml(levelPrefix(type.includes("failure") ? "critical" : "warning"))} ${escapeTelegramHtml(title)}</b>`,
    message ? escapeTelegramHtml(truncate(stripHtml(message), 800)) : "",
    route ? `route: <code>${escapeTelegramHtml(route)}</code>` : "",
  ].filter(Boolean);

  return sendTelegramMessage({ text: lines.join("\n"), level: type.includes("failure") ? "critical" : "warning" });
}

export async function notifyTelegramArticleRegistered(article: TelegramArticleNotification): Promise<boolean> {
  const kindLabel = article.kind === "auto_press" ? "Auto press registration" : "Auto news registration";
  const publicUrl = getArticlePublicUrl(article);
  const adminUrl = `${getSiteUrl()}/cam/articles`;
  const source = article.source || "unknown";
  const summary = article.summary ? truncate(stripHtml(article.summary), 500) : "";
  const registeredAt = article.registeredAt || new Date().toISOString();

  const lines = [
    `<b>${escapeTelegramHtml(levelPrefix("info"))} ${escapeTelegramHtml(kindLabel)}</b>`,
    `<b>${escapeTelegramHtml(article.title)}</b>`,
    `source: ${escapeTelegramHtml(source)}`,
    `registered_at: ${escapeTelegramHtml(registeredAt)}`,
    article.status ? `status: ${escapeTelegramHtml(article.status)}` : "",
    summary ? `summary: ${escapeTelegramHtml(summary)}` : "",
    publicUrl ? `article: ${escapeTelegramHtml(publicUrl)}` : "",
    `admin: ${escapeTelegramHtml(adminUrl)}`,
    article.sourceUrl ? `source_url: ${escapeTelegramHtml(article.sourceUrl)}` : "",
  ].filter(Boolean);

  return sendTelegramPhoto({
    text: lines.join("\n"),
    photoUrl: article.thumbnail,
    level: "info",
  });
}

export async function notifyTelegramMailSync(mails: TelegramMailSummary[]): Promise<boolean> {
  if (mails.length === 0) return false;
  const shown = mails.slice(0, 5);
  const lines = [
    `<b>${escapeTelegramHtml(levelPrefix("info"))} New mail received: ${mails.length}</b>`,
    ...shown.map((mail, index) => {
      const attachments = mail.hasAttachments
        ? ` / attachments: ${mail.attachmentNames.slice(0, 3).map((value) => truncate(value, 40)).join(", ")}`
        : "";
      return `${index + 1}. ${escapeTelegramHtml(truncate(mail.subject || "(no subject)", 120))}\nfrom: ${escapeTelegramHtml(truncate(mail.from, 120))}${escapeTelegramHtml(attachments)}`;
    }),
    mails.length > shown.length ? `and ${mails.length - shown.length} more` : "",
    `admin: ${escapeTelegramHtml(`${getSiteUrl()}/cam/mail-press`)}`,
  ].filter(Boolean);

  return sendTelegramMessage({ text: lines.join("\n\n"), level: "info" });
}

export async function getTelegramUpdatesForSetup(): Promise<{ ok: boolean; updates?: unknown[]; error?: string }> {
  const token = getBotToken();
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN is not configured" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/getUpdates`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: `Telegram getUpdates failed: ${res.status}` };
    const data = (await res.json()) as { ok?: boolean; result?: unknown[]; description?: string };
    if (!data.ok) return { ok: false, error: data.description || "Telegram getUpdates returned ok=false" };
    return { ok: true, updates: data.result || [] };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Telegram getUpdates failed" };
  } finally {
    clearTimeout(timeout);
  }
}
