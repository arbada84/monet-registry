import "server-only";

import type { AutoPressRetryProcessSummary } from "@/types/article";

const API_BASE = "https://api.cloudflare.com/client/v4";
const DEFAULT_SCRIPT_NAME = "culturepeople-auto-press-retry-scheduler";
const DEFAULT_SCHEDULE = "0 * * * *";
const DEFAULT_LIMIT = 2;

export type AutoPressRetrySchedulerLevel = "ok" | "warning" | "error";

export interface AutoPressRetrySchedulerHealth {
  ok: boolean;
  level: AutoPressRetrySchedulerLevel;
  message: string;
  scriptName: string;
  expectedSchedule: string;
  configured: {
    accountId: boolean;
    apiToken: boolean;
    cronSecret: boolean;
    workerUrl: boolean;
    directFallback: boolean;
  };
  remote?: {
    checked: boolean;
    scriptFound?: boolean;
    schedules?: string[];
    expectedScheduleFound?: boolean;
    error?: string;
  };
  recommendations: string[];
}

export interface AutoPressRetrySchedulerRunResult {
  ok: boolean;
  mode: "worker" | "direct" | "blocked";
  message: string;
  status?: number;
  workerUrlConfigured: boolean;
  directFallbackEnabled?: boolean;
  worker?: unknown;
  summary?: AutoPressRetryProcessSummary;
}

function env(name: string, fallback = ""): string {
  return String(process.env[name] || fallback).trim();
}

function envFlag(name: string, fallback = false): boolean {
  const raw = env(name).replace(/^["']|["']$/g, "").toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "y", "on", "enabled"].includes(raw)) return true;
  if (["0", "false", "no", "n", "off", "disabled"].includes(raw)) return false;
  return fallback;
}

function clampLimit(value: unknown): number {
  const parsed = Number(value ?? env("CLOUDFLARE_RETRY_SCHEDULER_LIMIT", String(DEFAULT_LIMIT)));
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.trunc(parsed), 5));
}

function getConfig() {
  return {
    accountId: env("CLOUDFLARE_ACCOUNT_ID"),
    apiToken: env("CLOUDFLARE_API_TOKEN"),
    cronSecret: env("CRON_SECRET"),
    scriptName: env("CLOUDFLARE_RETRY_SCHEDULER_SCRIPT_NAME", DEFAULT_SCRIPT_NAME),
    expectedSchedule: env("CLOUDFLARE_RETRY_SCHEDULER_CRON", DEFAULT_SCHEDULE).replace(/^["']|["']$/g, ""),
    workerUrl: env("CLOUDFLARE_RETRY_SCHEDULER_URL").replace(/\/+$/, ""),
    directFallbackEnabled: envFlag("AUTO_PRESS_DIRECT_AI_RETRY_ENABLED", false),
  };
}

async function cfGet(path: string, token: string): Promise<unknown> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || (data as { success?: boolean }).success === false) {
    const errors = Array.isArray((data as { errors?: Array<{ message?: string }> }).errors)
      ? (data as { errors?: Array<{ message?: string }> }).errors?.map((error) => error.message).filter(Boolean).join(" / ")
      : "";
    throw new Error(errors || `Cloudflare API ${response.status}`);
  }
  return data;
}

function extractSchedules(data: unknown): string[] {
  const result = (data as { result?: Array<{ cron?: string }> | { schedules?: Array<{ cron?: string }> } }).result;
  const schedules = Array.isArray(result) ? result : result?.schedules;
  if (!Array.isArray(schedules)) return [];
  return schedules.map((item) => item.cron).filter((cron): cron is string => Boolean(cron));
}

function extractRetrySummary(data: unknown): AutoPressRetryProcessSummary | undefined {
  const payload = data as { data?: unknown; summary?: unknown };
  const candidate = (payload?.summary || payload?.data) as Partial<AutoPressRetryProcessSummary> | undefined;
  if (!candidate || typeof candidate !== "object") return undefined;
  if (typeof candidate.processed !== "number") return undefined;
  return candidate as AutoPressRetryProcessSummary;
}

export async function getAutoPressRetrySchedulerHealth(options: {
  remote?: boolean;
} = {}): Promise<AutoPressRetrySchedulerHealth> {
  const config = getConfig();
  const recommendations: string[] = [];
  const baseConfigured = Boolean(config.accountId && config.apiToken && config.cronSecret);

  if (!config.accountId) recommendations.push("CLOUDFLARE_ACCOUNT_ID를 설정하세요.");
  if (!config.apiToken) recommendations.push("CLOUDFLARE_API_TOKEN을 설정하세요.");
  if (!config.cronSecret) recommendations.push("CRON_SECRET을 Vercel과 Worker에 동일하게 설정하세요.");
  if (!config.workerUrl) recommendations.push("관리자 화면에서 Worker 직접 실행을 쓰려면 CLOUDFLARE_RETRY_SCHEDULER_URL을 설정하세요.");

  const health: AutoPressRetrySchedulerHealth = {
    ok: baseConfigured,
    level: baseConfigured ? "ok" : "warning",
    message: baseConfigured
      ? "Cloudflare 재시도 스케줄러 기본 설정이 준비되어 있습니다."
      : "Cloudflare 재시도 스케줄러 기본 설정이 일부 비어 있습니다.",
    scriptName: config.scriptName,
    expectedSchedule: config.expectedSchedule,
    configured: {
      accountId: Boolean(config.accountId),
      apiToken: Boolean(config.apiToken),
      cronSecret: Boolean(config.cronSecret),
      workerUrl: Boolean(config.workerUrl),
      directFallback: config.directFallbackEnabled,
    },
    recommendations,
  };

  if (!options.remote) return health;

  health.remote = { checked: true };
  if (!config.accountId || !config.apiToken) {
    health.ok = false;
    health.level = "warning";
    health.message = "Cloudflare 원격 스케줄러 상태를 확인하려면 계정 ID와 API 토큰이 필요합니다.";
    return health;
  }

  try {
    await cfGet(`/accounts/${config.accountId}/workers/scripts/${config.scriptName}`, config.apiToken);
    const schedulesData = await cfGet(`/accounts/${config.accountId}/workers/scripts/${config.scriptName}/schedules`, config.apiToken);
    const schedules = extractSchedules(schedulesData);
    const expectedScheduleFound = schedules.includes(config.expectedSchedule);
    health.remote = {
      checked: true,
      scriptFound: true,
      schedules,
      expectedScheduleFound,
    };
    health.ok = baseConfigured && expectedScheduleFound;
    health.level = health.ok ? "ok" : "warning";
    health.message = expectedScheduleFound
      ? "Cloudflare Worker 스케줄이 정상 등록되어 있습니다."
      : "Cloudflare Worker는 있으나 기대한 cron 스케줄이 없습니다.";
    if (!expectedScheduleFound) {
      health.recommendations.push("pnpm cloudflare:worker:deploy-retry-scheduler로 Worker 스케줄을 다시 배포하세요.");
    }
  } catch (error) {
    health.ok = false;
    health.level = "warning";
    health.message = "Cloudflare 원격 스케줄러 상태 확인에 실패했습니다.";
    health.remote = {
      checked: true,
      scriptFound: false,
      error: error instanceof Error ? error.message : String(error),
    };
    health.recommendations.push("Cloudflare API 토큰 권한과 Worker 배포 상태를 확인하세요.");
  }

  return health;
}

export async function runAutoPressRetryScheduler(options: {
  limit?: number;
  preferWorker?: boolean;
  queueId?: string;
  force?: boolean;
  allowDirectFallback?: boolean;
} = {}): Promise<AutoPressRetrySchedulerRunResult> {
  const config = getConfig();
  const limit = clampLimit(options.limit);

  const allowDirectFallback = config.directFallbackEnabled && options.allowDirectFallback === true;

  if (options.preferWorker && config.workerUrl && config.cronSecret && allowDirectFallback) {
    const response = await fetch(`${config.workerUrl}/run`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.cronSecret}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        limit,
        queueId: options.queueId,
        force: options.force,
        allowDirectProcessing: options.allowDirectFallback === true,
      }),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    const ok = response.ok && (data as { ok?: boolean }).ok !== false;
    const summary = extractRetrySummary(data);
    return {
      ok,
      mode: "worker",
      status: response.status,
      workerUrlConfigured: true,
      directFallbackEnabled: config.directFallbackEnabled,
      worker: data,
      summary,
      message: ok ? "Cloudflare Worker를 통해 AI 재시도 대기열을 실행했습니다." : "Cloudflare Worker 재시도 실행에 실패했습니다.",
    };
  }

  if (!allowDirectFallback) {
    return {
      ok: false,
      mode: "blocked",
      status: 409,
      workerUrlConfigured: Boolean(config.workerUrl),
      directFallbackEnabled: config.directFallbackEnabled,
      message: "Vercel CPU 보호를 위해 서버 직접 AI 재시도 처리를 차단했습니다. Cloudflare Worker 재시도 URL을 설정하거나, 긴급 복구 시에만 AUTO_PRESS_DIRECT_AI_RETRY_ENABLED=true와 allowDirectFallback=true를 함께 사용하세요.",
    };
  }

  const { processAutoPressRetryQueue } = await import("@/lib/auto-press-retry-queue");
  const summary = await processAutoPressRetryQueue({
    limit,
    queueId: options.queueId,
    force: options.force,
  });
  return {
    ok: true,
    mode: "direct",
    workerUrlConfigured: Boolean(config.workerUrl),
    directFallbackEnabled: config.directFallbackEnabled,
    summary,
    message: config.workerUrl
      ? "Worker 직접 실행 대신 서버에서 AI 재시도 대기열을 실행했습니다."
      : "Worker URL이 없어 서버에서 AI 재시도 대기열을 직접 실행했습니다.",
  };
}
