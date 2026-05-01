import "server-only";

import { serverGetPublishedArticles, serverGetSetting, serverGetViewLogs } from "@/lib/db-server";
import { buildCloudflareUsageReportSection } from "@/lib/cloudflare-usage-report";
import { escapeTelegramHtml, sendTelegramMessage } from "@/lib/telegram-notify";
import type { AutoPressRun, ViewLogEntry } from "@/types/article";

function kstDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function kstMonthKey(date: Date): string {
  return kstDateKey(date).slice(0, 7);
}

function isSameKstDate(timestamp: string, dateKey: string): boolean {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return false;
  return kstDateKey(date) === dateKey;
}

function isAiBot(log: ViewLogEntry): boolean {
  const name = log.botName || "";
  return /gpt|chatgpt|claude|perplexity|google-extended|cohere|bytespider|ccbot/i.test(name);
}

function uniqueVisitorCount(logs: ViewLogEntry[]): number {
  const keys = logs.map((log) => log.visitorKey).filter((key): key is string => Boolean(key));
  if (keys.length > 0) return new Set(keys).size;
  return logs.length;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export async function buildTelegramDailyReport(now = new Date()): Promise<string> {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = kstDateKey(yesterday);
  const monthKey = kstMonthKey(now);

  const [logs, articles, pressHistory] = await Promise.all([
    serverGetViewLogs(),
    serverGetPublishedArticles(),
    serverGetSetting<AutoPressRun[]>("cp-auto-press-history", []),
  ]);

  const dayLogs = logs.filter((log) => isSameKstDate(log.timestamp, yesterdayKey));
  const humanLogs = dayLogs.filter((log) => !log.isAdmin && !log.isBot);
  const botLogs = dayLogs.filter((log) => log.isBot);
  const aiBotLogs = botLogs.filter(isAiBot);
  const adminLogs = dayLogs.filter((log) => log.isAdmin);

  const monthlyTop = articles
    .filter((article) => (article.date || "").startsWith(monthKey))
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 10);

  const dayPressRuns = pressHistory.filter((run) => isSameKstDate(run.completedAt || run.startedAt, yesterdayKey));
  const pressPublished = dayPressRuns.reduce((sum, run) => sum + (run.articlesPublished || 0), 0);
  const pressSkipped = dayPressRuns.reduce((sum, run) => sum + (run.articlesSkipped || 0), 0);
  const pressFailed = dayPressRuns.reduce((sum, run) => sum + (run.articlesFailed || 0), 0);

  const topLines = monthlyTop.length > 0
    ? monthlyTop.map((article, index) => `${index + 1}. ${escapeTelegramHtml(article.title)} - 조회 ${formatNumber(article.views || 0)}회`)
    : ["아직 이번 달 기사 조회 데이터가 없습니다."];
  const cloudflareUsage = await buildCloudflareUsageReportSection(now);

  const lines = [
    "<b>[일일 리포트] 컬처피플 운영 요약</b>",
    `기준일: ${escapeTelegramHtml(yesterdayKey)} KST`,
    "",
    "<b>방문</b>",
    `순수 방문자: ${formatNumber(uniqueVisitorCount(humanLogs))}`,
    `사람 기사 조회 로그: ${formatNumber(humanLogs.length)}`,
    `AI 봇 방문: ${formatNumber(aiBotLogs.length)}`,
    `전체 봇 방문: ${formatNumber(botLogs.length)}`,
    `관리자 조회: ${formatNumber(adminLogs.length)}`,
    "",
    "<b>자동화</b>",
    `보도자료 등록: ${formatNumber(pressPublished)}`,
    `보도자료 건너뜀: ${formatNumber(pressSkipped)}`,
    `보도자료 실패: ${formatNumber(pressFailed)}`,
    "",
    `<b>이번 달 인기 기사 (${monthlyTop.length || 0}건)</b>`,
    ...topLines,
  ];

  if (cloudflareUsage) {
    lines.push("", cloudflareUsage);
  }

  return lines.join("\n");
}

export async function sendTelegramDailyReport(now = new Date()): Promise<boolean> {
  const report = await buildTelegramDailyReport(now);
  return sendTelegramMessage({ text: report, level: "info", disableWebPagePreview: true });
}
