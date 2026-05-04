import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/cookie-auth";
import { getAutoPressObservedSummary, listAutoPressRetryQueue } from "@/lib/auto-press-observability";
import { resolveAiApiKey, serverGetAiSettings } from "@/lib/ai-settings-server";
import { getDatabaseProviderStatus } from "@/lib/database-provider";
import { checkMediaStorageHealth, summarizeMediaStorageHealth } from "@/lib/media-storage-health";
import { serverGetSetting } from "@/lib/db-server";
import type { AutoPressSettings } from "@/types/article";

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

  try {
    const settings = await serverGetSetting<Partial<AutoPressSettings>>("cp-auto-press-settings", {});
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
      },
    };

    const aiSettings = await serverGetAiSettings();
    const aiProvider = settings.aiProvider || "gemini";
    const hasAiKey = Boolean(resolveAiApiKey(aiSettings, aiProvider));
    checks.ai = {
      ok: hasAiKey,
      level: hasAiKey ? "ok" : "error",
      message: hasAiKey
        ? `${aiProvider} API 키가 설정되어 AI 편집을 실행할 수 있습니다.`
        : `${aiProvider} API 키가 없어 자동등록 시 AI 편집이 실패합니다.`,
      detail: { provider: aiProvider, model: settings.aiModel || null, hasKey: hasAiKey },
    };
  } catch (error) {
    checks.settings = {
      ok: false,
      level: "error",
      message: "자동등록 설정 또는 AI 설정을 읽지 못했습니다.",
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
  }, { status: status === "error" ? 503 : 200 });
}
