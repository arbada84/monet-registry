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
  buildProcessAutoPressWorkerRequest,
  buildRunAiRetryRequest,
  buildRunAutoNewsRequest,
  buildRunAutoPressRequest,
  cancelTelegramAction,
  confirmTelegramAction,
} from "@/lib/telegram-command-actions";
import { escapeTelegramHtml, getTelegramStatus } from "@/lib/telegram-notify";
import { getAutoPressObservedSummary, listAutoPressObservedItems, listAutoPressRetryQueue, listAutoPressSourceQuality } from "@/lib/auto-press-observability";
import { getAutoPressRetryTargetLabel, getAutoPressRetryTargetType, isUnpublishedAutoPressRetryQueueEntry } from "@/lib/auto-press-retry-target";
import type { Article, AutoNewsRun, AutoNewsSettings, AutoPressRun, AutoPressSettings } from "@/types/article";

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

function formatPercent(value: number): string {
  return `${Math.round(Number(value || 0) * 100)}%`;
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
    "/publish_status - 최근 자동발행 실행현황",
    "/today - 오늘 발행 기사",
    "/top - 이번 달 인기 기사",
    "/mails - 최근 수집 메일",
    "/report - 일일 리포트 즉시 생성",
    "/cf_usage - Cloudflare Workers/D1/R2 사용량 점검",
    "/run_auto_press [건수] [preview|draft|publish] - 보도자료 자동등록 실행 요청",
    "/run_auto_press_preview [건수] - 보도자료 자동등록 미리보기 요청",
    "/retry_queue - AI 편집 대기열 조회",
    "/auto_press_queue - 보도자료 자동등록 예약 대기열 조회",
    "/auto_press_sources - 보도자료 수집 소스 품질 조회",
    "/process_auto_press [건수] - 보도자료 Worker 대기열 즉시 처리 요청",
    "/retry_ai [건수] - AI 편집 대기열 처리 요청",
    "/run_auto_news_preview [건수] - 자동 뉴스 미리보기 요청",
    "/run_auto_news [건수] [preview] - 자동 뉴스 점검 요청(실제 발행은 기본 잠금)",
    "/article_off &lt;id&gt; - 기사 비활성 요청",
    "/article_delete &lt;id&gt; - 기사 삭제 요청",
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
  const [press, news, logs, pressHistory, newsHistory] = await Promise.all([
    serverGetSetting<Partial<AutoPressSettings>>("cp-auto-press-settings", {}),
    serverGetSetting<Partial<AutoNewsSettings>>("cp-auto-news-settings", {}),
    serverGetViewLogs(),
    serverGetSetting<AutoPressRun[]>("cp-auto-press-history", []),
    serverGetSetting<AutoNewsRun[]>("cp-auto-news-history", []),
  ]);
  const telegram = await getTelegramStatus();
  const lastPress = pressHistory[0];
  const lastNews = newsHistory[0];

  return [
    "<b>컬처피플 상태</b>",
    `텔레그램: ${telegram.enabled ? "사용 중" : "비활성"} / 채팅 ${telegram.chatCount}개`,
    `보도자료 자동등록: ${press.enabled ? "켜짐" : "꺼짐"} / 예약 ${press.cronEnabled ? "켜짐" : "꺼짐"}`,
    `자동 뉴스: ${news.enabled ? "켜짐" : "꺼짐"} / 예약 ${news.cronEnabled ? "켜짐" : "꺼짐"}`,
    lastPress ? `최근 보도자료 실행: ${escapeTelegramHtml(formatRunLine(lastPress))}` : "최근 보도자료 실행: 없음",
    lastNews ? `최근 자동 뉴스 실행: ${escapeTelegramHtml(formatRunLine(lastNews))}` : "최근 자동 뉴스 실행: 없음",
    `최근 방문 로그: ${formatNumber(logs.length)}건`,
    `현재 시각: ${escapeTelegramHtml(new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }))}`,
  ].join("\n");
}

function formatRunLine(run: Pick<AutoPressRun | AutoNewsRun, "completedAt" | "articlesPublished" | "articlesPreviewed" | "articlesSkipped" | "articlesFailed" | "source" | "preview">): string {
  const completedAt = new Date(run.completedAt);
  const time = Number.isNaN(completedAt.getTime())
    ? run.completedAt
    : completedAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const mode = run.preview ? "미리보기" : run.source === "cron" ? "예약" : "수동";
  return `${time} / ${mode} / 등록 ${run.articlesPublished} / 미리보기 ${run.articlesPreviewed || 0} / 건너뜀 ${run.articlesSkipped} / 실패 ${run.articlesFailed}`;
}

async function publishStatusText(): Promise<string> {
  const [pressHistory, newsHistory] = await Promise.all([
    serverGetSetting<AutoPressRun[]>("cp-auto-press-history", []),
    serverGetSetting<AutoNewsRun[]>("cp-auto-news-history", []),
  ]);

  const formatGroup = (title: string, runs: Array<AutoPressRun | AutoNewsRun>) => {
    if (runs.length === 0) return [`<b>${escapeTelegramHtml(title)}</b>`, "실행 이력이 없습니다."].join("\n");
    return [
      `<b>${escapeTelegramHtml(title)}</b>`,
      ...runs.slice(0, 5).map((run, index) => {
        const failedTitles = run.articles
          .filter((article) => article.status === "fail")
          .slice(0, 2)
          .map((article) => article.title)
          .join(", ");
        return [
          `${index + 1}. ${escapeTelegramHtml(formatRunLine(run))}`,
          failedTitles ? `실패 기사: ${escapeTelegramHtml(failedTitles)}` : "",
        ].filter(Boolean).join("\n");
      }),
    ].join("\n\n");
  };

  return [
    "<b>자동발행 실행현황</b>",
    formatGroup("보도자료 자동등록", pressHistory),
    formatGroup("자동 뉴스", newsHistory),
  ].join("\n\n");
}

function retryQueueStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "대기",
    running: "처리 중",
    completed: "완료",
    failed: "실패",
    gave_up: "포기",
    cancelled: "취소",
  };
  return labels[status] || status;
}

async function retryQueueText(): Promise<string> {
  const queue = await listAutoPressRetryQueue({ limit: 12 });
  const counts = queue.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const active = queue.filter((item) => ["pending", "failed", "running"].includes(item.status));

  if (queue.length === 0) {
    return "<b>AI 편집 대기열</b>\n현재 대기열이 비어 있습니다.";
  }

  const unpublishedCount = queue.filter(isUnpublishedAutoPressRetryQueueEntry).length;
  const existingCount = queue.filter((item) => item.articleId || item.articleNo).length;

  return [
    "<b>AI 편집 대기열</b>",
    `대기 ${counts.pending || 0}건 / 실패 ${counts.failed || 0}건 / 처리 중 ${counts.running || 0}건 / 완료 ${counts.completed || 0}건 / 포기 ${counts.gave_up || 0}건`,
    `신규 등록 대기 ${unpublishedCount}건 / 기존 기사 재편집 ${existingCount}건`,
    active.length > 0 ? "" : "현재 즉시 처리할 항목은 없습니다.",
    ...active.slice(0, 8).map((item, index) => {
      const next = item.nextAttemptAt ? ` / 다음: ${item.nextAttemptAt}` : "";
      const reason = item.reasonMessage ? ` - ${item.reasonMessage}` : "";
      const target = getAutoPressRetryTargetLabel(getAutoPressRetryTargetType(item));
      return `${index + 1}. ${escapeTelegramHtml(retryQueueStatusLabel(item.status))} · ${escapeTelegramHtml(target)}: ${escapeTelegramHtml(item.title || "(제목 없음)")}${escapeTelegramHtml(reason)}${escapeTelegramHtml(next)}`;
    }),
    active.length > 8 ? `외 ${active.length - 8}건` : "",
    "",
    "처리 요청: <code>/retry_ai 3</code>",
  ].filter(Boolean).join("\n");
}

async function autoPressQueueText(): Promise<string> {
  const [summary, items] = await Promise.all([
    getAutoPressObservedSummary(),
    listAutoPressObservedItems({ status: "queued", limit: 12, order: "asc" }),
  ]);

  if (items.length === 0) {
    return [
      "<b>보도자료 자동등록 예약 대기열</b>",
      `예약 대기: ${summary.queuedItemCount ?? 0}건`,
      "현재 표시할 대기 항목이 없습니다.",
    ].join("\n");
  }

  return [
    "<b>보도자료 자동등록 예약 대기열</b>",
    `예약 대기: ${summary.queuedItemCount ?? items.length}건 / 실행 중: ${summary.runningCount}건 / 멈춤 의심: ${summary.staleRunningCount}건`,
    "",
    ...items.slice(0, 10).map((item, index) => {
      const source = item.sourceName ? ` · ${item.sourceName}` : "";
      const reason = item.reasonMessage ? ` - ${item.reasonMessage}` : "";
      return `${index + 1}. ${escapeTelegramHtml(item.title || "(제목 없음)")}${escapeTelegramHtml(source)}${escapeTelegramHtml(reason)}`;
    }),
    items.length > 10 ? `외 ${items.length - 10}건` : "",
    "",
    "즉시 처리 요청: <code>/process_auto_press 3</code>",
  ].filter(Boolean).join("\n");
}

async function autoPressSourcesText(): Promise<string> {
  const sources = await listAutoPressSourceQuality({ days: 30, limit: 8 });

  if (sources.length === 0) {
    return "<b>보도자료 수집 소스 품질</b>\n최근 30일 기준으로 집계할 처리 기록이 없습니다.";
  }

  return [
    "<b>보도자료 수집 소스 품질</b>",
    "최근 30일 실제 처리 기준입니다.",
    "",
    ...sources.map((source, index) => {
      const bodyProblemCount = source.bodyUnavailableCount + source.bodyTooShortCount;
      return [
        `${index + 1}. ${escapeTelegramHtml(source.sourceName)} (${escapeTelegramHtml(source.sourceId)})`,
        `처리 ${formatNumber(source.processedCount)}건 / 등록 ${formatNumber(source.publishedCount)}건 (${formatPercent(source.publishRate)}) / 이미지 없음 ${formatNumber(source.noImageCount)}건 / 본문 문제 ${formatNumber(bodyProblemCount)}건`,
        `권장: ${escapeTelegramHtml(source.recommendationLabel)} - ${escapeTelegramHtml(source.recommendationReason)}`,
      ].join("\n");
    }),
    "",
    "관리자 화면: <code>/cam/auto-press</code>의 기사별 결과 탭에서도 확인할 수 있습니다.",
  ].join("\n\n");
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
    case "/publish_status":
    case "/runs":
    case "/발행현황":
      return publishStatusText();
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
    case "/retry_queue":
    case "/ai_queue":
      return retryQueueText();
    case "/auto_press_queue":
    case "/press_queue":
    case "/보도자료대기":
      return autoPressQueueText();
    case "/auto_press_sources":
    case "/press_sources":
    case "/소스품질":
      return autoPressSourcesText();
    case "/process_auto_press":
    case "/run_press_worker":
      return chatId ? buildProcessAutoPressWorkerRequest(chatId, args) : commandRequiresChatMessage();
    case "/retry_ai":
    case "/run_ai_retry":
      return chatId ? buildRunAiRetryRequest(chatId, args) : commandRequiresChatMessage();
    case "/run_auto_press":
      return chatId ? buildRunAutoPressRequest(chatId, args) : commandRequiresChatMessage();
    case "/run_auto_press_preview":
      return chatId ? buildRunAutoPressRequest(chatId, ["preview", ...args]) : commandRequiresChatMessage();
    case "/run_auto_news":
      return chatId ? buildRunAutoNewsRequest(chatId, args) : commandRequiresChatMessage();
    case "/run_auto_news_preview":
      return chatId ? buildRunAutoNewsRequest(chatId, ["preview", ...args]) : commandRequiresChatMessage();
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
