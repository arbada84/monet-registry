import "server-only";

import { revalidateTag } from "next/cache";
import { randomUUID } from "node:crypto";
import { createAdminRecoveryLink } from "@/lib/admin-recovery-token";
import {
  serverDeleteArticle,
  serverGetArticleById,
  serverGetArticleByNo,
  serverGetSetting,
  serverSaveSetting,
  serverUpdateArticle,
} from "@/lib/db-server";
import {
  DEFAULT_MAINTENANCE_MESSAGE,
  MAINTENANCE_SETTING_KEY,
  type MaintenanceModeSettings,
} from "@/lib/maintenance-mode";
import { escapeTelegramHtml } from "@/lib/telegram-notify";
import type { Article } from "@/types/article";

type PendingActionType =
  | "run_auto_press"
  | "article_off"
  | "article_delete"
  | "maintenance_on"
  | "maintenance_off"
  | "grant_temp_login";

type AuditStatus = "requested" | "confirmed" | "cancelled" | "expired" | "failed";

interface PendingTelegramAction {
  id: string;
  action: PendingActionType;
  chatId: string;
  requestedAt: string;
  expiresAt: string;
  summary: string;
  payload: Record<string, unknown>;
}

interface TelegramCommandAudit {
  id: string;
  action: PendingActionType;
  chatId: string;
  status: AuditStatus;
  summary: string;
  at: string;
  error?: string;
}

const PENDING_KEY = "cp-telegram-command-pending";
const AUDIT_KEY = "cp-telegram-command-audit";
const CONFIRM_TTL_MS = 2 * 60 * 1000;

function nowIso(): string {
  return new Date().toISOString();
}

function shortId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 8);
}

function maskChatId(chatId: string): string {
  return chatId.length <= 4 ? "****" : `${chatId.slice(0, 2)}***${chatId.slice(-2)}`;
}

async function getPendingActions(): Promise<PendingTelegramAction[]> {
  return serverGetSetting<PendingTelegramAction[]>(PENDING_KEY, []);
}

async function savePendingActions(actions: PendingTelegramAction[]): Promise<void> {
  const now = Date.now();
  const active = actions.filter((action) => new Date(action.expiresAt).getTime() > now).slice(0, 20);
  await serverSaveSetting(PENDING_KEY, active);
}

async function appendAudit(entry: TelegramCommandAudit): Promise<void> {
  try {
    const audit = await serverGetSetting<TelegramCommandAudit[]>(AUDIT_KEY, []);
    await serverSaveSetting(AUDIT_KEY, [entry, ...audit].slice(0, 100));
  } catch (error) {
    console.warn("[telegram-command] audit write failed:", error instanceof Error ? error.message : error);
  }
}

async function requestAction(
  chatId: string,
  action: PendingActionType,
  summary: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const id = shortId();
  const requestedAt = nowIso();
  const expiresAt = new Date(Date.now() + CONFIRM_TTL_MS).toISOString();
  const pending = await getPendingActions();
  const nextAction = { id, action, chatId, requestedAt, expiresAt, summary, payload };

  await savePendingActions([nextAction, ...pending]);
  await appendAudit({ id, action, chatId: maskChatId(chatId), status: "requested", summary, at: requestedAt });

  return [
    "<b>Confirmation required</b>",
    escapeTelegramHtml(summary),
    "",
    "Confirm within 2 minutes:",
    `<code>/confirm ${id}</code>`,
    `Cancel: <code>/cancel ${id}</code>`,
  ].join("\n");
}

function parseCount(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const count = Number(raw);
  if (!Number.isInteger(count) || count < 1) return undefined;
  return Math.min(count, 10);
}

async function resolveArticle(articleRef: string): Promise<Article | null> {
  const byId = await serverGetArticleById(articleRef);
  if (byId) return byId;

  const maybeNo = Number(articleRef);
  if (Number.isInteger(maybeNo) && maybeNo > 0) {
    return serverGetArticleByNo(maybeNo);
  }

  return null;
}

export function buildRunAutoPressRequest(chatId: string, args: string[]): Promise<string> {
  const count = parseCount(args[0]);
  return requestAction(
    chatId,
    "run_auto_press",
    `Run auto press manually${count ? ` (${count} items)` : ""}`,
    count ? { count } : {},
  );
}

export async function buildArticleOffRequest(chatId: string, args: string[]): Promise<string> {
  const articleRef = args[0]?.trim();
  if (!articleRef) return "Usage: <code>/article_off ARTICLE_ID_OR_NO</code>";

  const article = await resolveArticle(articleRef);
  if (!article) return `Article not found: <code>${escapeTelegramHtml(articleRef)}</code>`;

  return requestAction(
    chatId,
    "article_off",
    `Deactivate article: ${article.title} (#${article.no ?? article.id})`,
    { articleId: article.id },
  );
}

export async function buildArticleDeleteRequest(chatId: string, args: string[]): Promise<string> {
  const articleRef = args[0]?.trim();
  if (!articleRef) return "Usage: <code>/article_delete ARTICLE_ID_OR_NO</code>";

  const article = await resolveArticle(articleRef);
  if (!article) return `Article not found: <code>${escapeTelegramHtml(articleRef)}</code>`;

  return requestAction(
    chatId,
    "article_delete",
    `Move article to trash: ${article.title} (#${article.no ?? article.id})`,
    { articleId: article.id },
  );
}

export function buildMaintenanceOnRequest(chatId: string, args: string[]): Promise<string> {
  const maybeMinutes = Number(args[0]);
  const hasMinutes = Number.isInteger(maybeMinutes) && maybeMinutes > 0;
  const minutes = Math.min(hasMinutes ? maybeMinutes : 30, 1440);
  const message = (hasMinutes ? args.slice(1) : args).join(" ").trim() || DEFAULT_MAINTENANCE_MESSAGE;

  return requestAction(
    chatId,
    "maintenance_on",
    `Maintenance mode ON (${minutes} min): ${message}`,
    { minutes, message },
  );
}

export function buildMaintenanceOffRequest(chatId: string): Promise<string> {
  return requestAction(chatId, "maintenance_off", "Maintenance mode OFF", {});
}

export function buildGrantTempLoginRequest(chatId: string, args: string[]): Promise<string> {
  const minutesRaw = Number(args[0]);
  const minutes = Number.isInteger(minutesRaw) && minutesRaw > 0 ? Math.min(minutesRaw, 10) : 5;

  return requestAction(
    chatId,
    "grant_temp_login",
    `Issue one-time admin recovery link (${minutes} min)`,
    { minutes },
  );
}

export async function cancelTelegramAction(chatId: string, id: string): Promise<string> {
  const pending = await getPendingActions();
  const target = pending.find((action) => action.id === id && action.chatId === chatId);

  if (!target) {
    return `Pending command not found: <code>${escapeTelegramHtml(id)}</code>`;
  }

  await savePendingActions(pending.filter((action) => action.id !== id));
  await appendAudit({ id, action: target.action, chatId: maskChatId(chatId), status: "cancelled", summary: target.summary, at: nowIso() });

  return `Pending command cancelled: <code>${escapeTelegramHtml(id)}</code>`;
}

async function executeRunAutoPress(action: PendingTelegramAction): Promise<string> {
  const { runAutoPress } = await import("@/app/api/cron/auto-press/route");
  const count = typeof action.payload.count === "number" ? action.payload.count : undefined;
  const run = await runAutoPress({ source: "manual", countOverride: count });

  return [
    "<b>Auto press run completed</b>",
    `Published: ${run.articlesPublished}`,
    `Skipped: ${run.articlesSkipped}`,
    `Failed: ${run.articlesFailed}`,
  ].join("\n");
}

async function executeArticleOff(action: PendingTelegramAction): Promise<string> {
  const articleId = String(action.payload.articleId || "");
  const article = await serverGetArticleById(articleId);
  if (!article) throw new Error("article not found");

  await serverUpdateArticle(article.id, {
    status: "임시저장" as Article["status"],
    updatedAt: nowIso(),
    reviewNote: "Telegram command: article_off",
  });
  revalidateTag("articles");

  return `<b>Article deactivated</b>\n${escapeTelegramHtml(article.title)} (#${escapeTelegramHtml(article.no ?? article.id)})`;
}

async function executeArticleDelete(action: PendingTelegramAction): Promise<string> {
  const articleId = String(action.payload.articleId || "");
  const article = await serverGetArticleById(articleId);
  if (!article) throw new Error("article not found");

  await serverDeleteArticle(article.id);
  revalidateTag("articles");

  return [
    "<b>Article moved to trash</b>",
    `${escapeTelegramHtml(article.title)} (#${escapeTelegramHtml(article.no ?? article.id)})`,
    "This is a soft delete. The article can be restored from the admin trash view.",
  ].join("\n");
}

async function executeMaintenanceOn(action: PendingTelegramAction): Promise<string> {
  const minutes = typeof action.payload.minutes === "number" ? action.payload.minutes : 30;
  const message = String(action.payload.message || DEFAULT_MAINTENANCE_MESSAGE).slice(0, 300);
  const settings: MaintenanceModeSettings = {
    enabled: true,
    message,
    enabledAt: nowIso(),
    enabledBy: "telegram",
    expiresAt: new Date(Date.now() + minutes * 60 * 1000).toISOString(),
  };

  await serverSaveSetting(MAINTENANCE_SETTING_KEY, settings);
  revalidateTag(`setting:${MAINTENANCE_SETTING_KEY}`);

  return [
    "<b>Maintenance mode is ON</b>",
    escapeTelegramHtml(message),
    `Auto-off: ${escapeTelegramHtml(settings.expiresAt)}`,
  ].join("\n");
}

async function executeMaintenanceOff(): Promise<string> {
  const current = await serverGetSetting<MaintenanceModeSettings>(MAINTENANCE_SETTING_KEY, { enabled: false });

  await serverSaveSetting(MAINTENANCE_SETTING_KEY, {
    ...current,
    enabled: false,
    enabledBy: "telegram",
    expiresAt: undefined,
  });
  revalidateTag(`setting:${MAINTENANCE_SETTING_KEY}`);

  return "<b>Maintenance mode is OFF</b>";
}

async function executeGrantTempLogin(action: PendingTelegramAction): Promise<string> {
  if (process.env.TELEGRAM_ALLOW_TEMP_LOGIN !== "true") {
    throw new Error("TELEGRAM_ALLOW_TEMP_LOGIN is not enabled");
  }

  const minutes = typeof action.payload.minutes === "number" ? Math.min(action.payload.minutes, 10) : 5;
  const link = await createAdminRecoveryLink({
    minutes,
    role: "superadmin",
    name: "Telegram Recovery",
    createdBy: `telegram:${action.chatId.slice(0, 4)}***`,
  });

  return [
    "<b>One-time admin recovery link issued</b>",
    `Expires: ${escapeTelegramHtml(link.expiresAt)}`,
    "This link can be used once and expires automatically.",
    escapeTelegramHtml(link.url),
  ].join("\n");
}

async function executeAction(action: PendingTelegramAction): Promise<string> {
  if (action.action === "run_auto_press") return executeRunAutoPress(action);
  if (action.action === "article_off") return executeArticleOff(action);
  if (action.action === "article_delete") return executeArticleDelete(action);
  if (action.action === "maintenance_on") return executeMaintenanceOn(action);
  if (action.action === "maintenance_off") return executeMaintenanceOff();
  if (action.action === "grant_temp_login") return executeGrantTempLogin(action);
  throw new Error("unsupported action");
}

export async function confirmTelegramAction(chatId: string, id: string): Promise<string> {
  const pending = await getPendingActions();
  const target = pending.find((action) => action.id === id && action.chatId === chatId);

  if (!target) {
    return `Pending command not found: <code>${escapeTelegramHtml(id)}</code>`;
  }

  const expired = new Date(target.expiresAt).getTime() <= Date.now();
  await savePendingActions(pending.filter((action) => action.id !== id));

  if (expired) {
    await appendAudit({ id, action: target.action, chatId: maskChatId(chatId), status: "expired", summary: target.summary, at: nowIso() });
    return `Pending command expired. Please request it again: <code>${escapeTelegramHtml(id)}</code>`;
  }

  try {
    const result = await executeAction(target);
    await appendAudit({ id, action: target.action, chatId: maskChatId(chatId), status: "confirmed", summary: target.summary, at: nowIso() });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    await appendAudit({ id, action: target.action, chatId: maskChatId(chatId), status: "failed", summary: target.summary, at: nowIso(), error: message });
    return `<b>Command failed</b>\n${escapeTelegramHtml(message)}`;
  }
}
