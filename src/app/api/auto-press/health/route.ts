import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/cookie-auth";
import { getAutoPressObservedSummary, listAutoPressRetryQueue } from "@/lib/auto-press-observability";
import { resolveAiApiKey, serverGetAiSettings } from "@/lib/ai-settings-server";
import { getDatabaseProviderStatus } from "@/lib/database-provider";
import { checkMediaStorageHealth, summarizeMediaStorageHealth } from "@/lib/media-storage-health";
import { serverGetSetting } from "@/lib/db-server";
import { getAutoPressRetrySchedulerHealth } from "@/lib/auto-press-retry-scheduler";
import { DEFAULT_AUTO_PRESS_SETTINGS } from "@/lib/auto-defaults";
import type { AutoPressSettings, AutoPressSource } from "@/types/article";

type AutoPressHealthLevel = "ok" | "warning" | "error";

interface AutoPressHealthCheck {
  ok: boolean;
  level: AutoPressHealthLevel;
  message: string;
  detail?: unknown;
}

function checkLevel(checks: Record<string, AutoPressHealthCheck>): AutoPressHealthLevel {
  if (Object.values(checks).some((check) => check.level === "error")) return "error";
  if (Object.values(checks).some((check) => check.level === "warning")) return "warning";
  return "ok";
}

function isDue(nextAttemptAt?: string): boolean {
  if (!nextAttemptAt) return true;
  const time = new Date(nextAttemptAt).getTime();
  return Number.isFinite(time) ? time <= Date.now() : true;
}

function sourceHasFetchTarget(source: AutoPressSource): boolean {
  const fetchType = source.fetchType || "rss";
  if (fetchType === "rss") return Boolean(source.rssUrl?.trim());
  return false;
}

function assessAutoPressSourceReadiness(settings: Partial<AutoPressSettings>): AutoPressHealthCheck {
  const sources = Array.isArray(settings.sources) ? settings.sources : [];
  const enabledSources = sources.filter((source) => source.enabled);
  const readySources = enabledSources.filter(sourceHasFetchTarget);
  const missingFetchTarget = enabledSources.filter((source) => !sourceHasFetchTarget(source));

  if (readySources.length === 0) {
    return {
      ok: false,
      level: "error",
      message: "활성화된 보도자료 수집 소스에 RSS 피드 URL이 없어 자동등록 후보를 수집할 수 없습니다.",
      detail: {
        totalSourceCount: sources.length,
        enabledSourceCount: enabledSources.length,
        readySourceCount: readySources.length,
        disabledSourceCount: Math.max(0, sources.length - enabledSources.length),
        missingFetchTarget: missingFetchTarget.map((source) => ({ id: source.id, name: source.name, fetchType: source.fetchType || "rss" })),
      },
    };
  }

  if (missingFetchTarget.length > 0) {
    return {
      ok: false,
      level: "warning",
      message: "일부 활성화된 보도자료 수집 소스에 RSS 피드 URL이 없습니다.",
      detail: {
        totalSourceCount: sources.length,
        enabledSourceCount: enabledSources.length,
        readySourceCount: readySources.length,
        disabledSourceCount: Math.max(0, sources.length - enabledSources.length),
        missingFetchTarget: missingFetchTarget.map((source) => ({ id: source.id, name: source.name, fetchType: source.fetchType || "rss" })),
        readySources: readySources.slice(0, 10).map((source) => ({ id: source.id, name: source.name, fetchType: source.fetchType || "rss" })),
      },
    };
  }

  return {
    ok: true,
    level: "ok",
    message: `활성화된 보도자료 수집 소스 ${readySources.length}개가 후보 수집에 필요한 RSS 피드 URL을 갖고 있습니다.`,
    detail: {
      totalSourceCount: sources.length,
      enabledSourceCount: enabledSources.length,
      readySourceCount: readySources.length,
      disabledSourceCount: Math.max(0, sources.length - enabledSources.length),
      readySources: readySources.slice(0, 10).map((source) => ({ id: source.id, name: source.name, fetchType: source.fetchType || "rss" })),
    },
  };
}

async function fetchAutoPressWorkerHealth(remote: boolean): Promise<AutoPressHealthCheck> {
  const url = (process.env.AUTO_PRESS_WORKER_HEALTH_URL || "https://culturepeople-auto-press-worker.curpy.workers.dev/health").trim();
  if (!url) {
    return {
      ok: false,
      level: "warning",
      message: "Cloudflare 보도자료 Worker 상태 확인 URL이 설정되어 있지 않습니다.",
    };
  }
  if (!remote) {
    return {
      ok: true,
      level: "ok",
      message: "Cloudflare 보도자료 Worker 원격 점검 URL이 준비되어 있습니다. 원격 점검 버튼으로 실제 상태를 확인할 수 있습니다.",
      detail: { url, remoteProbe: false },
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    const controls = data?.controls || {};
    const bindings = data?.bindings || {};
    const telegram = data?.telegram || {};
    const telegramOk = telegram.dailyReportEnabled === false
      || (telegram.botTokenConfigured === true && Number(telegram.chatIdCount || 0) > 0 && telegram.settingsEnabled !== false);
    const ok = response.ok
      && data?.success === true
      && controls.enabled !== false
      && bindings.d1 === true
      && bindings.queue === true
      && bindings.r2 === true
      && bindings.mediaBaseUrl === true
      && bindings.geminiKey === true
      && telegramOk;
    return {
      ok,
      level: ok ? "ok" : "warning",
      message: ok
        ? "Cloudflare 보도자료 Worker가 정상 응답하고 필수 바인딩이 연결되어 있습니다."
        : "Cloudflare 보도자료 Worker 상태 또는 바인딩 점검이 필요합니다.",
      detail: {
        url,
        status: response.status,
        version: data?.version || null,
        controls,
        bindings,
        telegram,
      },
    };
  } catch (error) {
    return {
      ok: false,
      level: "warning",
      message: "Cloudflare 보도자료 Worker 상태 확인에 실패했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  const searchParams = new URL(req.url).searchParams;
  const remote = searchParams.get("remote") === "1";
  const writeProbe = searchParams.get("writeProbe") === "1";
  const generatedAt = new Date().toISOString();
  const checks: Record<string, AutoPressHealthCheck> = {};

  const databaseProvider = getDatabaseProviderStatus();
  checks.database = {
    ok: databaseProvider.configured && (databaseProvider.runtimeReady || databaseProvider.d1.httpApiReady),
    level: databaseProvider.configured && (databaseProvider.runtimeReady || databaseProvider.d1.httpApiReady) ? "ok" : "error",
    message: databaseProvider.provider === "d1"
      ? "D1 데이터베이스 연결 설정을 확인했습니다."
      : "Supabase 데이터베이스 연결 설정을 확인했습니다.",
    detail: {
      provider: databaseProvider.provider,
      runtimeReady: databaseProvider.runtimeReady,
      d1HttpApiReady: databaseProvider.d1.httpApiReady,
    },
  };

  let autoPressSettings: AutoPressSettings | null = null;
  try {
    const settings = await serverGetSetting<AutoPressSettings>("cp-auto-press-settings", DEFAULT_AUTO_PRESS_SETTINGS);
    autoPressSettings = settings;
    checks.settings = {
      ok: Boolean(settings.enabled),
      level: settings.enabled ? "ok" : "warning",
      message: settings.enabled ? "보도자료 자동등록이 활성화되어 있습니다." : "보도자료 자동등록이 꺼져 있습니다.",
      detail: {
        enabled: Boolean(settings.enabled),
        cronEnabled: Boolean(settings.cronEnabled),
        requireImage: settings.requireImage !== false,
        aiProvider: settings.aiProvider || "gemini",
        aiModel: settings.aiModel || null,
        count: settings.count || null,
        sourceCount: Array.isArray(settings.sources) ? settings.sources.length : 0,
        enabledSourceCount: Array.isArray(settings.sources) ? settings.sources.filter((source) => source.enabled).length : 0,
      },
    };
    checks.sources = assessAutoPressSourceReadiness(settings);
  } catch (error) {
    checks.settings = {
      ok: false,
      level: "error",
      message: "자동등록 설정을 읽지 못했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    };
    checks.sources = {
      ok: false,
      level: "error",
      message: "보도자료 수집 소스 설정을 읽지 못했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    const aiSettings = await serverGetAiSettings();
    const aiProvider = autoPressSettings?.aiProvider || "gemini";
    const hasAiKey = Boolean(resolveAiApiKey(aiSettings, aiProvider));
    checks.ai = {
      ok: hasAiKey,
      level: hasAiKey ? "ok" : "error",
      message: hasAiKey
        ? `${aiProvider} API 키가 설정되어 AI 편집을 실행할 수 있습니다.`
        : `${aiProvider} API 키가 없어 자동등록 시 AI 편집이 실패합니다.`,
      detail: { provider: aiProvider, model: autoPressSettings?.aiModel || null, hasKey: hasAiKey },
    };
  } catch (error) {
    checks.ai = {
      ok: false,
      level: "error",
      message: "AI 설정을 읽지 못해 자동등록 전 AI 편집 준비 상태를 확인할 수 없습니다.",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    const mediaReport = await checkMediaStorageHealth({ remote, writeProbe });
    checks.mediaStorage = {
      ok: mediaReport.ok,
      level: mediaReport.ok ? "ok" : "error",
      message: mediaReport.ok
        ? `미디어 저장소(${mediaReport.provider}) 설정이 정상입니다.`
        : `미디어 저장소(${mediaReport.provider}) 점검이 필요합니다.`,
      detail: summarizeMediaStorageHealth(mediaReport),
    };
  } catch (error) {
    checks.mediaStorage = {
      ok: false,
      level: "error",
      message: "미디어 저장소 상태 확인에 실패했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  let summary = null;
  let retryQueue = null;
  let retryScheduler = null;
  try {
    const [observedSummary, queue] = await Promise.all([
      getAutoPressObservedSummary(),
      listAutoPressRetryQueue({ limit: 100 }),
    ]);
    summary = observedSummary;
    retryQueue = {
      total: queue.length,
      due: queue.filter((entry) => ["pending", "failed"].includes(entry.status) && isDue(entry.nextAttemptAt)).length,
      pending: queue.filter((entry) => entry.status === "pending").length,
      running: queue.filter((entry) => entry.status === "running").length,
      failed: queue.filter((entry) => entry.status === "failed").length,
      gaveUp: queue.filter((entry) => entry.status === "gave_up").length,
      cancelled: queue.filter((entry) => entry.status === "cancelled").length,
    };
    checks.observability = {
      ok: observedSummary.staleRunningCount === 0,
      level: observedSummary.staleRunningCount > 0 ? "warning" : "ok",
      message: observedSummary.staleRunningCount > 0
        ? "멈춘 것으로 보이는 자동등록 실행이 있습니다."
        : "자동등록 실행 관측성 테이블을 읽을 수 있습니다.",
      detail: { summary: observedSummary, retryQueue },
    };
  } catch (error) {
    checks.observability = {
      ok: false,
      level: "error",
      message: "자동등록 실행 이력 또는 AI 대기열을 읽지 못했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    retryScheduler = await getAutoPressRetrySchedulerHealth({ remote });
    checks.retryScheduler = {
      ok: retryScheduler.ok,
      level: retryScheduler.level,
      message: retryScheduler.message,
      detail: retryScheduler,
    };
  } catch (error) {
    checks.retryScheduler = {
      ok: false,
      level: "warning",
      message: "Cloudflare AI 재시도 스케줄러 상태 확인에 실패했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    checks.workerRuntime = await fetchAutoPressWorkerHealth(remote);
  } catch (error) {
    checks.workerRuntime = {
      ok: false,
      level: "warning",
      message: "Cloudflare 보도자료 Worker 상태 확인에 실패했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const status = checkLevel(checks);
  return NextResponse.json({
    success: true,
    status,
    generatedAt,
    remoteProbe: remote,
    writeProbe,
    checks,
    summary,
    retryQueue,
    retryScheduler,
  }, { status: status === "error" ? 503 : 200 });
}
