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
    ? monthlyTop.map((article, index) => `${index + 1}. ${escapeTelegramHtml(article.title)} - ${formatNumber(article.views || 0)} views`)
    : ["No monthly article view data yet."];
  const cloudflareUsage = await buildCloudflareUsageReportSection(now);

  const lines = [
    "<b>[Daily Report] CulturePeople operations summary</b>",
    `Date: ${escapeTelegramHtml(yesterdayKey)} KST`,
    "",
    "<b>Traffic</b>",
    `Unique human visitors: ${formatNumber(uniqueVisitorCount(humanLogs))}`,
    `Human article view logs: ${formatNumber(humanLogs.length)}`,
    `AI bot visits: ${formatNumber(aiBotLogs.length)}`,
    `All bot visits: ${formatNumber(botLogs.length)}`,
    `Admin views: ${formatNumber(adminLogs.length)}`,
    "",
    "<b>Automation</b>",
    `Auto press published: ${formatNumber(pressPublished)}`,
    `Auto press skipped: ${formatNumber(pressSkipped)}`,
    `Auto press failed: ${formatNumber(pressFailed)}`,
    "",
    `<b>Monthly top articles (${monthlyTop.length || 0})</b>`,
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
