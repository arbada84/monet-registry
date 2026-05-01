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
    "<b>컬처피플 텔레그램 명령</b>",
    "/status - 자동화와 텔레그램 상태",
    "/today - 오늘 발행 기사",
    "/top - 이번 달 인기 기사",
    "/mails - 최근 수집 메일",
    "/report - 일일 리포트 즉시 생성",
    "/cf_usage - Cloudflare Workers/D1/R2 사용량 점검",
    "/run_auto_press [건수] - 보도자료 자동등록 수동 실행 요청",
    "/article_off <id> - 기사 비활성 요청",
    "/article_delete <id> - 기사 삭제 요청",
    "/maintenance_on [분] [문구] - 임시 점검 모드 요청",
    "/maintenance_off - 임시 점검 모드 해제 요청",
    "/grant_temp_login [분] - 일회성 관리자 복구 링크 요청",
    "/confirm <코드> - 대기 명령 승인",
    "/cancel <코드> - 대기 명령 취소",
    "/help - 명령 목록 보기",
    "",
    "변경 작업은 /confirm으로 한 번 더 승인해야 실행됩니다.",
  ].join("\n");
}

async function statusText(): Promise<string> {
  const [press, news, logs] = await Promise.all([
    serverGetSetting<Partial<AutoPressSettings>>("cp-auto-press-settings", {}),
    serverGetSetting<Partial<AutoNewsSettings>>("cp-auto-news-settings", {}),
    serverGetViewLogs(),
  ]);
  const telegram = await getTelegramStatus();

  return [
    "<b>컬처피플 상태</b>",
    `텔레그램: ${telegram.enabled ? "사용 중" : "비활성"} / 채팅 ${telegram.chatCount}개`,
    `보도자료 자동등록: ${press.enabled ? "켜짐" : "꺼짐"} / 예약 ${press.cronEnabled ? "켜짐" : "꺼짐"}`,
    `자동 뉴스: ${news.enabled ? "켜짐" : "꺼짐"} / 예약 ${news.cronEnabled ? "켜짐" : "꺼짐"}`,
    `최근 방문 로그: ${formatNumber(logs.length)}건`,
    `현재 시각: ${escapeTelegramHtml(new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }))}`,
  ].join("\n");
}

async function todayText(): Promise<string> {
  const today = kstDateKey();
  const articles = (await serverGetPublishedArticles())
    .filter((article) => article.date === today)
    .sort((a, b) => String(b.updatedAt || b.createdAt || b.date).localeCompare(String(a.updatedAt || a.createdAt || a.date)))
    .slice(0, 10);

  if (articles.length === 0) {
    return `<b>오늘 발행 기사</b>\n${escapeTelegramHtml(today)} 기준 발행 기사가 없습니다.`;
  }

  return [
    `<b>오늘 발행 기사 (${articles.length}건)</b>`,
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
    return `<b>이번 달 인기 기사</b>\n${escapeTelegramHtml(month)} 기준 조회 데이터가 없습니다.`;
  }

  return [
    `<b>이번 달 인기 기사 (${articles.length}건)</b>`,
    ...articles.map((article, index) => `${index + 1}. ${escapeTelegramHtml(article.title)} - 조회 ${formatNumber(article.views || 0)}회\n${escapeTelegramHtml(getArticleUrl(article))}`),
  ].join("\n\n");
}

async function mailsText(): Promise<string> {
  const mails = await serverGetSetting<StoredMailLite[]>("cp-mail-press-data", []);
  const recent = mails.slice(0, 10);

  if (recent.length === 0) {
    return "<b>최근 수집 메일</b>\n저장된 메일이 없습니다.";
  }

  return [
    `<b>최근 수집 메일 (${recent.length}건)</b>`,
    ...recent.map((mail, index) => {
      const attachments = mail.hasAttachments ? ` / 첨부 ${mail.attachmentNames.length}개` : "";
      return [
        `${index + 1}. ${escapeTelegramHtml(mail.subject || "(제목 없음)")}`,
        `보낸사람: ${escapeTelegramHtml(mail.from)}${escapeTelegramHtml(attachments)}`,
        `상태: ${escapeTelegramHtml(mail.status || "대기")}`,
      ].join("\n");
    }),
  ].join("\n\n");
}

function commandRequiresChatMessage(): string {
  return "이 명령은 허용된 텔레그램 웹훅 채팅에서만 실행할 수 있습니다.";
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
      if (!args[0]) return "사용법: <code>/confirm 코드</code>";
      return confirmTelegramAction(chatId, args[0]);
    case "/cancel":
      if (!chatId) return commandRequiresChatMessage();
      if (!args[0]) return "사용법: <code>/cancel 코드</code>";
      return cancelTelegramAction(chatId, args[0]);
    case "/help":
    case "/start":
      return helpText();
    default:
      return `${helpText()}\n\n알 수 없는 명령: <code>${escapeTelegramHtml(text.trim().slice(0, 80))}</code>`;
  }
}
