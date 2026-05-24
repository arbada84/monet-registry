import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync("src/app/cam/auto-press/page.tsx", "utf8");

function expectSourceToContainAll(values: string[]) {
  for (const value of values) {
    expect(pageSource).toContain(value);
  }
}

describe("/cam/auto-press dashboard", () => {
  it("keeps the operator observability tabs and loaders wired", () => {
    expectSourceToContainAll([
      'type AutoPressTab = "settings" | "run" | "runs" | "items" | "queue" | "dlq" | "health" | "history"',
      'runs: "실행 현황"',
      'items: "기사별 결과"',
      'queue: "AI 대기열"',
      'dlq: "실패함"',
      'health: "시스템 점검"',
      'fetch("/api/auto-press/runs?limit=30")',
      'fetch(`/api/auto-press/runs/${encodeURIComponent(runId)}/events?limit=80`)',
      'fetch("/api/auto-press/items?limit=300&order=desc")',
      'fetch("/api/auto-press/source-quality?days=30&limit=30")',
      'fetch("/api/auto-press/retry-queue?limit=50")',
      'fetch("/api/auto-press/dlq?limit=100")',
      'fetch(`/api/auto-press/health${qs ? `?${qs}` : ""}`)',
    ]);
  });

  it("keeps manual run, item retry, retry queue, and DLQ actions reachable", () => {
    expectSourceToContainAll([
      "const handleProcessObservedRun",
      'fetch(`/api/auto-press/runs/${encodeURIComponent(id)}/process`',
      "const handleCancelObservedRun",
      'fetch(`/api/auto-press/runs/${encodeURIComponent(id)}/cancel`',
      "const handleObservedItemRetry",
      'fetch(`/api/auto-press/items/${encodeURIComponent(id)}/retry`',
      "processNow: true",
      "const handleRetryQueueAction",
      'fetch(`/api/auto-press/retry-queue/${encodeURIComponent(id)}`',
      "const handleDeadLetterAction",
      'fetch(`/api/auto-press/dlq/${encodeURIComponent(id)}`',
      'body: JSON.stringify({ action, dispatch: action === "retry" })',
    ]);
  });

  it("shows the run summary, event timeline, item results, queues, source quality, and health controls", () => {
    expectSourceToContainAll([
      "사유 요약",
      "실행 타임라인",
      "기사별 처리 결과",
      "수집 소스 품질 리포트",
      "AI 대기열",
      "실패함",
      "전체 실패",
      "시스템 점검",
      "빠른 점검",
      "원격 저장소 포함",
      "업로드 쓰기 테스트",
      "AI 재시도 스케줄러 실행",
    ]);
  });

  it("does not reference secret fields or environment secrets in the client dashboard", () => {
    for (const forbidden of [
      "geminiApiKey",
      "openaiApiKey",
      "AUTO_PRESS_WORKER_SECRET",
      "TELEGRAM_BOT_TOKEN",
      "R2_SECRET_ACCESS_KEY",
      "CLOUDFLARE_API_TOKEN",
      "COOKIE_SECRET",
      "process.env",
    ]) {
      expect(pageSource).not.toContain(forbidden);
    }

    expectSourceToContainAll([
      'API 키는 <Link href="/cam/ai-settings"',
      "formatHealthDetail(check.detail)",
    ]);
  });
});
