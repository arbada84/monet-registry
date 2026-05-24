import "server-only";

import { serverGetPublishedArticles, serverGetSetting, serverGetViewLogs } from "@/lib/db-server";
import { buildCloudflareUsageReportSection } from "@/lib/cloudflare-usage-report";
import { buildSupabaseRecoveryReportSection } from "@/lib/supabase-recovery-status";
import { escapeTelegramHtml, sendTelegramMessage } from "@/lib/telegram-notify";
import { getAutoPressDeadLetterSummary, getAutoPressObservedSummary, listAutoPressSourceQuality } from "@/lib/auto-press-observability";
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

function formatPercent(value: number): string {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function observedRunStatusLabel(status?: string): string {
  const labels: Record<string, string> = {
    queued: "대기",
    running: "실행 중",
    completed: "완료",
    failed: "실패",
    cancelled: "취소",
    timeout: "시간 초과",
  };
  return labels[String(status || "")] || String(status || "확인 필요");
}

function deadLetterSummaryLine(summary: Awaited<ReturnType<typeof getAutoPressDeadLetterSummary>>): string {
  return [
    `전체 ${formatNumber(summary.total)}`,
    `AI ${formatNumber(summary.aiIssue)}`,
    `이미지 ${formatNumber(summary.imageUploadFailed)}`,
    `본문 ${formatNumber(summary.bodyIssue)}`,
    `Worker ${formatNumber(summary.workerProcessFailed)}`,
    summary.other > 0 ? `기타 ${formatNumber(summary.other)}` : "",
  ].filter(Boolean).join(" / ");
}

export async function buildTelegramDailyReport(now = new Date()): Promise<string> {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = kstDateKey(yesterday);
  const monthKey = kstMonthKey(now);

  const [logs, articles, pressHistory, observedSummary, deadLetterSummary, sourceQuality] = await Promise.all([
    serverGetViewLogs(),
    serverGetPublishedArticles(),
    serverGetSetting<AutoPressRun[]>("cp-auto-press-history", []),
    getAutoPressObservedSummary().catch(() => null),
    getAutoPressDeadLetterSummary().catch(() => null),
    listAutoPressSourceQuality({ days: 30, limit: 5 }).catch(() => []),
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
  const sourceQualityLines = sourceQuality.length > 0
    ? sourceQuality.slice(0, 3).map((source) => `${escapeTelegramHtml(source.sourceName)} ${formatPercent(source.publishRate)} (${formatNumber(source.publishedCount)}/${formatNumber(source.processedCount)})`)
    : [];
  const sourceRiskLines = sourceQuality
    .filter((source) => source.recommendation !== "keep")
    .slice(0, 3)
    .map((source) => `${escapeTelegramHtml(source.sourceName)}: ${escapeTelegramHtml(source.recommendationLabel)}`);

  const topLines = monthlyTop.length > 0
    ? monthlyTop.map((article, index) => `${index + 1}. ${escapeTelegramHtml(article.title)} - 조회 ${formatNumber(article.views || 0)}회`)
    : ["아직 이번 달 기사 조회 데이터가 없습니다."];
  const [cloudflareUsage, supabaseRecovery] = await Promise.all([
    buildCloudflareUsageReportSection(now),
    buildSupabaseRecoveryReportSection().catch((error: Error) => [
      "<b>Supabase 복구 감시</b>",
      `상태: 확인 실패 - ${escapeTelegramHtml(error.message)}`,
    ].join("\n")),
  ]);

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
    observedSummary ? `보도자료 Worker 대기: ${formatNumber(observedSummary.queuedItemCount || 0)} / AI 재시도 대기: ${formatNumber(observedSummary.pendingRetryCount || 0)} / 멈춤 의심: ${formatNumber(observedSummary.staleRunningCount || 0)}` : "",
    observedSummary?.latestRun ? `최근 D1 실행: ${escapeTelegramHtml(observedRunStatusLabel(observedSummary.latestRun.status))} / 등록 ${formatNumber(observedSummary.latestRun.publishedCount)} / 실패 ${formatNumber(observedSummary.latestRun.failedCount)}` : "",
    deadLetterSummary ? `실패함(DLQ): ${deadLetterSummaryLine(deadLetterSummary)}` : "",
    sourceQualityLines.length > 0 ? `소스 등록률 TOP: ${sourceQualityLines.join(" · ")}` : "",
    sourceRiskLines.length > 0 ? `점검 소스: ${sourceRiskLines.join(" · ")}` : "",
    (deadLetterSummary?.total || 0) > 0 || (observedSummary?.staleRunningCount || 0) > 0
      ? "조치: /auto_press_dlq, /retry_queue, /auto_press_sources로 원인 확인 후 재시도 또는 제외 처리"
      : "",
    "",
    `<b>이번 달 인기 기사 (${monthlyTop.length || 0}건)</b>`,
    ...topLines,
  ];

  if (cloudflareUsage) {
    lines.push("", cloudflareUsage);
  }
  if (supabaseRecovery) {
    lines.push("", supabaseRecovery);
  }

  return lines.join("\n");
}

export async function sendTelegramDailyReport(now = new Date()): Promise<boolean> {
  const report = await buildTelegramDailyReport(now);
  return sendTelegramMessage({ text: report, level: "info", disableWebPagePreview: true });
}
