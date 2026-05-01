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
import { getTelegramRuntimeConfig } from "@/lib/telegram-settings";
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
    "<b>승인이 필요합니다</b>",
    escapeTelegramHtml(summary),
    "",
    "2분 안에 승인하세요:",
    `<code>/confirm ${id}</code>`,
    `취소: <code>/cancel ${id}</code>`,
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
    `보도자료 자동등록 수동 실행${count ? ` (${count}건)` : ""}`,
    count ? { count } : {},
  );
}

export async function buildArticleOffRequest(chatId: string, args: string[]): Promise<string> {
  const articleRef = args[0]?.trim();
  if (!articleRef) return "사용법: <code>/article_off 기사ID또는번호</code>";

  const article = await resolveArticle(articleRef);
  if (!article) return `기사를 찾을 수 없습니다: <code>${escapeTelegramHtml(articleRef)}</code>`;

  return requestAction(
    chatId,
    "article_off",
    `기사 비활성 요청: ${article.title} (#${article.no ?? article.id})`,
    { articleId: article.id },
  );
}

export async function buildArticleDeleteRequest(chatId: string, args: string[]): Promise<string> {
  const articleRef = args[0]?.trim();
  if (!articleRef) return "사용법: <code>/article_delete 기사ID또는번호</code>";

  const article = await resolveArticle(articleRef);
  if (!article) return `기사를 찾을 수 없습니다: <code>${escapeTelegramHtml(articleRef)}</code>`;

  return requestAction(
    chatId,
    "article_delete",
    `기사 삭제 요청: ${article.title} (#${article.no ?? article.id})`,
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
    `임시 점검 모드 켜기 (${minutes}분): ${message}`,
    { minutes, message },
  );
}

export function buildMaintenanceOffRequest(chatId: string): Promise<string> {
  return requestAction(chatId, "maintenance_off", "임시 점검 모드 끄기", {});
}

export function buildGrantTempLoginRequest(chatId: string, args: string[]): Promise<string> {
  const minutesRaw = Number(args[0]);
  const minutes = Number.isInteger(minutesRaw) && minutesRaw > 0 ? Math.min(minutesRaw, 10) : 5;

  return requestAction(
    chatId,
    "grant_temp_login",
    `일회성 관리자 복구 링크 발급 (${minutes}분)`,
    { minutes },
  );
}

export async function cancelTelegramAction(chatId: string, id: string): Promise<string> {
  const pending = await getPendingActions();
  const target = pending.find((action) => action.id === id && action.chatId === chatId);

  if (!target) {
    return `대기 명령을 찾을 수 없습니다: <code>${escapeTelegramHtml(id)}</code>`;
  }

  await savePendingActions(pending.filter((action) => action.id !== id));
  await appendAudit({ id, action: target.action, chatId: maskChatId(chatId), status: "cancelled", summary: target.summary, at: nowIso() });

  return `대기 명령을 취소했습니다: <code>${escapeTelegramHtml(id)}</code>`;
}

async function executeRunAutoPress(action: PendingTelegramAction): Promise<string> {
  const { runAutoPress } = await import("@/app/api/cron/auto-press/route");
  const count = typeof action.payload.count === "number" ? action.payload.count : undefined;
  const run = await runAutoPress({ source: "manual", countOverride: count });

  return [
    "<b>보도자료 자동등록 실행 완료</b>",
    `등록: ${run.articlesPublished}`,
    `건너뜀: ${run.articlesSkipped}`,
    `실패: ${run.articlesFailed}`,
  ].join("\n");
}

async function executeArticleOff(action: PendingTelegramAction): Promise<string> {
  const articleId = String(action.payload.articleId || "");
  const article = await serverGetArticleById(articleId);
  if (!article) throw new Error("기사를 찾을 수 없습니다.");

  await serverUpdateArticle(article.id, {
    status: "임시저장" as Article["status"],
    updatedAt: nowIso(),
    reviewNote: "텔레그램 명령: 기사 비활성",
  });
  revalidateTag("articles");

  return `<b>기사를 비활성 처리했습니다</b>\n${escapeTelegramHtml(article.title)} (#${escapeTelegramHtml(article.no ?? article.id)})`;
}

async function executeArticleDelete(action: PendingTelegramAction): Promise<string> {
  const articleId = String(action.payload.articleId || "");
  const article = await serverGetArticleById(articleId);
  if (!article) throw new Error("기사를 찾을 수 없습니다.");

  await serverDeleteArticle(article.id);
  revalidateTag("articles");

  return [
    "<b>기사를 삭제 처리했습니다</b>",
    `${escapeTelegramHtml(article.title)} (#${escapeTelegramHtml(article.no ?? article.id)})`,
    "관리자 휴지통에서 복구할 수 있는 소프트 삭제입니다.",
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
    "<b>임시 점검 모드를 켰습니다</b>",
    escapeTelegramHtml(message),
    `자동 해제: ${escapeTelegramHtml(settings.expiresAt)}`,
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

  return "<b>임시 점검 모드를 껐습니다</b>";
}

async function executeGrantTempLogin(action: PendingTelegramAction): Promise<string> {
  const telegram = await getTelegramRuntimeConfig();
  if (!telegram.allowTempLogin) {
    throw new Error("텔레그램 임시 로그인 명령이 비활성화되어 있습니다.");
  }

  const minutes = typeof action.payload.minutes === "number" ? Math.min(action.payload.minutes, 10) : 5;
  const link = await createAdminRecoveryLink({
    minutes,
    role: "superadmin",
    name: "Telegram Recovery",
    createdBy: `telegram:${action.chatId.slice(0, 4)}***`,
  });

  return [
    "<b>일회성 관리자 복구 링크를 발급했습니다</b>",
    `만료: ${escapeTelegramHtml(link.expiresAt)}`,
    "이 링크는 한 번만 사용할 수 있고 자동 만료됩니다.",
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
  throw new Error("지원하지 않는 명령입니다.");
}

export async function confirmTelegramAction(chatId: string, id: string): Promise<string> {
  const pending = await getPendingActions();
  const target = pending.find((action) => action.id === id && action.chatId === chatId);

  if (!target) {
    return `대기 명령을 찾을 수 없습니다: <code>${escapeTelegramHtml(id)}</code>`;
  }

  const expired = new Date(target.expiresAt).getTime() <= Date.now();
  await savePendingActions(pending.filter((action) => action.id !== id));

  if (expired) {
    await appendAudit({ id, action: target.action, chatId: maskChatId(chatId), status: "expired", summary: target.summary, at: nowIso() });
    return `대기 명령이 만료되었습니다. 다시 요청하세요: <code>${escapeTelegramHtml(id)}</code>`;
  }

  try {
    const result = await executeAction(target);
    await appendAudit({ id, action: target.action, chatId: maskChatId(chatId), status: "confirmed", summary: target.summary, at: nowIso() });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    await appendAudit({ id, action: target.action, chatId: maskChatId(chatId), status: "failed", summary: target.summary, at: nowIso(), error: message });
    return `<b>명령 실행 실패</b>\n${escapeTelegramHtml(message)}`;
  }
}
