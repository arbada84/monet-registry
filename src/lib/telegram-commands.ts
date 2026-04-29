import "server-only";

import { serverGetPublishedArticles, serverGetSetting, serverGetViewLogs } from "@/lib/db-server";
import { buildCloudflareUsageReportSection } from "@/lib/cloudflare-usage-report";
import { buildTelegramDailyReport } from "@/lib/telegram-report";
import {
  buildArticleDeleteRequest,
  buildArticleOffRequest,
  buildGrantTempLoginRequest,
  buildMaintenanceOffRequest,
  buildMaintenanceOnRequest,
  buildRunAutoPressRequest,
  cancelTelegramAction,
  confirmTelegramAction,
} from "@/lib/telegram-command-actions";
import { escapeTelegramHtml, getTelegramStatus } from "@/lib/telegram-notify";
import type { Article, AutoNewsSettings, AutoPressSettings } from "@/types/article";

interface StoredMailLite {
  from: string;
  subject: string;
  date: string;
  hasAttachments: boolean;
  attachmentNames: string[];
  status: string;
}

function kstDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function kstMonthKey(date = new Date()): string {
  return kstDateKey(date).slice(0, 7);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function getArticleUrl(article: Article): string {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://culturepeople.co.kr").replace(/\/+$/, "");
  return `${siteUrl}/article/${encodeURIComponent(String(article.no ?? article.id))}`;
}

function commandName(text: string): string {
  const first = text.trim().split(/\s+/)[0] || "/help";
  return first.split("@")[0].toLowerCase();
}

function commandArgs(text: string): string[] {
  return text.trim().split(/\s+/).slice(1).filter(Boolean);
}

function helpText(): string {
  return [
    "<b>CulturePeople Telegram commands</b>",
    "/status - automation and Telegram status",
    "/today - articles published today",
    "/top - top articles this month",
    "/mails - recently synced mail",
    "/report - generate the daily report now",
    "/cf_usage - Cloudflare Workers/D1/R2 usage guard",
    "/run_auto_press [count] - request manual auto-press run",
    "/article_off <id> - request article deactivation",
    "/article_delete <id> - request article soft delete",
    "/maintenance_on [minutes] [message] - request maintenance mode",
    "/maintenance_off - request maintenance mode off",
    "/grant_temp_login [minutes] - request one-time admin recovery link",
    "/confirm <code> - confirm a pending action",
    "/cancel <code> - cancel a pending action",
    "/help - show this command list",
    "",
    "Mutating commands require a second /confirm step.",
  ].join("\n");
}

async function statusText(): Promise<string> {
  const [press, news, logs] = await Promise.all([
    serverGetSetting<Partial<AutoPressSettings>>("cp-auto-press-settings", {}),
    serverGetSetting<Partial<AutoNewsSettings>>("cp-auto-news-settings", {}),
    serverGetViewLogs(),
  ]);
  const telegram = getTelegramStatus();

  return [
    "<b>CulturePeople status</b>",
    `Telegram: ${telegram.enabled ? "enabled" : "disabled"} / chats ${telegram.chatCount}`,
    `Auto press: ${press.enabled ? "ON" : "OFF"} / cron ${press.cronEnabled ? "ON" : "OFF"}`,
    `Auto news: ${news.enabled ? "ON" : "OFF"} / cron ${news.cronEnabled ? "ON" : "OFF"}`,
    `Recent view logs: ${formatNumber(logs.length)}`,
    `Current time: ${escapeTelegramHtml(new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }))}`,
  ].join("\n");
}

async function todayText(): Promise<string> {
  const today = kstDateKey();
  const articles = (await serverGetPublishedArticles())
    .filter((article) => article.date === today)
    .sort((a, b) => String(b.updatedAt || b.createdAt || b.date).localeCompare(String(a.updatedAt || a.createdAt || a.date)))
    .slice(0, 10);

  if (articles.length === 0) {
    return `<b>Articles published today</b>\nNo published articles found for ${escapeTelegramHtml(today)} KST.`;
  }

  return [
    `<b>Articles published today (${articles.length})</b>`,
    ...articles.map((article, index) => `${index + 1}. ${escapeTelegramHtml(article.title)}\n${escapeTelegramHtml(getArticleUrl(article))}`),
  ].join("\n\n");
}

async function topText(): Promise<string> {
  const month = kstMonthKey();
  const articles = (await serverGetPublishedArticles())
    .filter((article) => (article.date || "").startsWith(month))
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 10);

  if (articles.length === 0) {
    return `<b>Top articles this month</b>\nNo view data found for ${escapeTelegramHtml(month)}.`;
  }

  return [
    `<b>Top articles this month (${articles.length})</b>`,
    ...articles.map((article, index) => `${index + 1}. ${escapeTelegramHtml(article.title)} - ${formatNumber(article.views || 0)} views\n${escapeTelegramHtml(getArticleUrl(article))}`),
  ].join("\n\n");
}

async function mailsText(): Promise<string> {
  const mails = await serverGetSetting<StoredMailLite[]>("cp-mail-press-data", []);
  const recent = mails.slice(0, 10);

  if (recent.length === 0) {
    return "<b>Recently synced mail</b>\nNo stored mail found.";
  }

  return [
    `<b>Recently synced mail (${recent.length})</b>`,
    ...recent.map((mail, index) => {
      const attachments = mail.hasAttachments ? ` / attachments ${mail.attachmentNames.length}` : "";
      return [
        `${index + 1}. ${escapeTelegramHtml(mail.subject || "(no subject)")}`,
        `from: ${escapeTelegramHtml(mail.from)}${escapeTelegramHtml(attachments)}`,
        `status: ${escapeTelegramHtml(mail.status || "pending")}`,
      ].join("\n");
    }),
  ].join("\n\n");
}

function commandRequiresChatMessage(): string {
  return "This command can only run from an authorized Telegram webhook chat.";
}

export async function buildTelegramCommandResponse(text: string, chatId?: string): Promise<string> {
  const command = commandName(text);
  const args = commandArgs(text);

  switch (command) {
    case "/status":
      return statusText();
    case "/today":
      return todayText();
    case "/top":
      return topText();
    case "/mails":
    case "/mail":
      return mailsText();
    case "/report":
      return buildTelegramDailyReport();
    case "/cf_usage":
    case "/cloudflare":
      return buildCloudflareUsageReportSection(new Date(), { force: true });
    case "/run_auto_press":
      return chatId ? buildRunAutoPressRequest(chatId, args) : commandRequiresChatMessage();
    case "/article_off":
      return chatId ? buildArticleOffRequest(chatId, args) : commandRequiresChatMessage();
    case "/article_delete":
      return chatId ? buildArticleDeleteRequest(chatId, args) : commandRequiresChatMessage();
    case "/maintenance_on":
      return chatId ? buildMaintenanceOnRequest(chatId, args) : commandRequiresChatMessage();
    case "/maintenance_off":
      return chatId ? buildMaintenanceOffRequest(chatId) : commandRequiresChatMessage();
    case "/grant_temp_login":
      return chatId ? buildGrantTempLoginRequest(chatId, args) : commandRequiresChatMessage();
    case "/confirm":
      if (!chatId) return commandRequiresChatMessage();
      if (!args[0]) return "Usage: <code>/confirm CODE</code>";
      return confirmTelegramAction(chatId, args[0]);
    case "/cancel":
      if (!chatId) return commandRequiresChatMessage();
      if (!args[0]) return "Usage: <code>/cancel CODE</code>";
      return cancelTelegramAction(chatId, args[0]);
    case "/help":
    case "/start":
      return helpText();
    default:
      return `${helpText()}\n\nUnknown command: <code>${escapeTelegramHtml(text.trim().slice(0, 80))}</code>`;
  }
}
