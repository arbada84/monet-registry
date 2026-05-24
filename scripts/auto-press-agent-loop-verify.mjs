import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();

const planFiles = [
  "docs/auto-press-vercel-cpu-distribution-plan.json",
  "docs/auto-press-phase1-vercel-cpu-defense-plan.json",
  "docs/auto-press-phase2-d1-observability-plan.json",
  "docs/auto-press-phase3-cloudflare-worker-queue-plan.json",
  "docs/auto-press-phase4-telegram-ops-plan.json",
  "docs/auto-press-phase5-public-page-cpu-cache-plan.json",
  "docs/auto-press-phase6-ops-rollout-validation-plan.json",
];

const requiredFiles = [
  "cloudflare/d1/migrations/0002_auto_press_observability.sql",
  "cloudflare/d1/migrations/0003_auto_press_queue_controls.sql",
  "cloudflare/d1/migrations/0004_auto_press_duplicate_guards.sql",
  "cloudflare/d1/migrations/0005_auto_press_observability_indexes.sql",
  "cloudflare/auto-press-worker/wrangler.toml",
  "cloudflare/auto-press-worker/src/index.js",
  "src/lib/auto-press-observability.ts",
  "src/lib/auto-press-worker-dispatch.ts",
  "src/app/api/cron/auto-press/route.ts",
  "src/app/api/auto-press/runs/route.ts",
  "src/app/api/auto-press/runs/[id]/route.ts",
  "src/app/api/auto-press/runs/[id]/events/route.ts",
  "src/app/api/auto-press/runs/[id]/process/route.ts",
  "src/app/api/auto-press/runs/[id]/cancel/route.ts",
  "src/app/api/auto-press/items/route.ts",
  "src/app/api/auto-press/items/[id]/retry/route.ts",
  "src/app/api/auto-press/retry-queue/route.ts",
  "src/app/api/auto-press/dlq/route.ts",
  "src/app/api/auto-press/dlq/[id]/route.ts",
  "src/app/api/auto-press/source-quality/route.ts",
  "src/app/api/auto-press/health/route.ts",
  "src/app/cam/auto-press/page.tsx",
  "src/app/api/db/article-view/route.ts",
  "src/app/article/[id]/components/ArticleViewTracker.tsx",
  "src/lib/telegram-commands.ts",
  "src/lib/telegram-command-actions.ts",
];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readMigrationSet() {
  return [
    "cloudflare/d1/migrations/0001_initial_schema.sql",
    "cloudflare/d1/migrations/0002_auto_press_observability.sql",
    "cloudflare/d1/migrations/0003_auto_press_queue_controls.sql",
    "cloudflare/d1/migrations/0004_auto_press_duplicate_guards.sql",
    "cloudflare/d1/migrations/0005_auto_press_observability_indexes.sql",
  ].map(read).join("\n");
}

function assertMigrationColumn(migrations, table, column) {
  const createTableMatch = migrations.match(new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\s*\\(([\\s\\S]*?)\\);`, "i"));
  const createTableHasColumn = createTableMatch
    ? new RegExp(`(^|\\n)\\s*${column}\\s+`, "i").test(createTableMatch[1])
    : false;
  const alterTableHasColumn = new RegExp(`ALTER TABLE\\s+${table}\\s+ADD COLUMN\\s+${column}\\b`, "i").test(migrations);
  assert(createTableHasColumn || alterTableHasColumn, `${table}.${column} is missing from D1 migrations`);
}

function checkJsonPlans() {
  for (const file of planFiles) {
    JSON.parse(read(file));
  }
  return `${planFiles.length}개 기획서 JSON 파싱 성공`;
}

function checkRequiredFiles() {
  for (const file of requiredFiles) {
    assert(fs.existsSync(path.join(root, file)), `필수 파일 없음: ${file}`);
  }
  return `${requiredFiles.length}개 필수 파일 존재 확인`;
}

function checkMigrationGuardrails() {
  const phase2 = read("docs/auto-press-phase2-d1-observability-plan.json");
  const migration = read("cloudflare/d1/migrations/0003_auto_press_queue_controls.sql");
  const migration5 = read("cloudflare/d1/migrations/0005_auto_press_observability_indexes.sql");
  assert(phase2.includes("현재 D1 migration을 재사용"), "Phase2 기획서에 migration 재사용 원칙이 없습니다.");
  assert(migration.includes("ALTER TABLE auto_press_runs ADD COLUMN execution_mode"), "0003 migration execution_mode 추가 누락");
  assert(!migration.match(/DROP\s+TABLE/i), "0003 migration에 DROP TABLE이 포함되어 있습니다.");
  assert(!migration5.match(/DROP\s+TABLE/i), "0005 migration에 DROP TABLE이 포함되어 있습니다.");
  assert(migration5.includes("ALTER TABLE articles ADD COLUMN auto_press_item_id"), "0005 migration article auto_press_item_id trace column missing");
  assert(!migration.match(/CREATE\s+TABLE\s+auto_press_jobs/i), "auto_press_jobs 신규 테이블 생성 금지 원칙 위반");
  return "additive migration 가드레일 확인";
}

function checkD1ObservabilitySchemaCoverage() {
  const migrations = readMigrationSet();
  const expectedColumns = {
    auto_press_runs: [
      "id", "source", "status", "preview", "requested_count", "processed_count",
      "published_count", "previewed_count", "skipped_count", "failed_count",
      "queued_count", "started_at", "completed_at", "last_event_at",
      "duration_ms", "triggered_by", "options_json", "warnings_json",
      "media_storage_json", "summary_json", "error_code", "error_message",
      "execution_mode", "candidate_count", "message", "created_at", "updated_at",
    ],
    auto_press_items: [
      "id", "run_id", "source_id", "source_name", "source_url", "source_item_id",
      "bo_table", "title", "status", "reason_code", "reason_message",
      "article_id", "article_no", "retryable", "retry_count", "next_retry_at",
      "body_chars", "image_count", "warnings_json", "raw_json", "priority",
      "attempt_count", "max_attempts", "lease_until", "canonical_url",
      "normalized_title", "published_at", "image_url", "image_check_json",
      "ai_provider", "ai_model", "started_at", "completed_at", "created_at", "updated_at",
    ],
    auto_press_events: [
      "id", "run_id", "item_id", "level", "code", "message", "metadata_json", "created_at",
    ],
    auto_press_retry_queue: [
      "id", "run_id", "item_id", "article_id", "article_no", "title",
      "source_url", "source_name", "status", "reason_code", "reason_message",
      "attempts", "max_attempts", "next_attempt_at", "last_attempt_at",
      "payload_json", "result_json", "created_at", "updated_at",
    ],
    auto_press_source_stats: [
      "id", "date", "source_id", "source_name", "candidate_count", "queued_count",
      "processed_count", "published_count", "skipped_duplicate_count",
      "skipped_no_image_count", "failed_count", "ai_call_count",
      "image_upload_count", "consecutive_failures", "last_failure_code",
      "last_failure_message", "created_at", "updated_at",
    ],
    auto_press_daily_usage: [
      "date", "jobs_processed", "ai_calls", "publishes", "image_uploads",
      "source_fetch_failures", "created_at", "updated_at",
    ],
    articles: ["auto_press_item_id"],
  };

  for (const [table, columns] of Object.entries(expectedColumns)) {
    for (const column of columns) assertMigrationColumn(migrations, table, column);
  }

  for (const indexName of [
    "idx_auto_press_runs_reconcile",
    "idx_auto_press_items_dead_letter",
    "idx_auto_press_items_source_quality",
    "idx_auto_press_retry_due",
    "idx_articles_auto_press_item_id_unique",
  ]) {
    assert(migrations.includes(indexName), `${indexName} index missing from D1 migrations`);
  }

  const worker = read("cloudflare/auto-press-worker/src/index.js");
  const observability = read("src/lib/auto-press-observability.ts");
  const runsRoute = read("src/app/api/auto-press/runs/route.ts");
  const itemsRoute = read("src/app/api/auto-press/items/route.ts");
  const retryQueueRoute = read("src/app/api/auto-press/retry-queue/route.ts");
  const dlqRoute = read("src/app/api/auto-press/dlq/route.ts");
  const sourceQualityRoute = read("src/app/api/auto-press/source-quality/route.ts");

  assert(worker.includes("auto_press_item_id"), "Worker article inserts must persist auto_press_item_id");
  assert(worker.includes("auto_press_daily_usage"), "Worker daily usage path missing");
  assert(observability.includes("createAutoPressObservedRun"), "D1 observed run create helper missing");
  assert(observability.includes("queueAutoPressObservedCandidates"), "D1 observed item queue helper missing");
  assert(observability.includes("appendAutoPressObservedEvent"), "D1 observed event helper missing");
  assert(observability.includes("listAutoPressRetryQueue"), "D1 retry queue read helper missing");
  assert(observability.includes("listAutoPressDeadLetterItems"), "D1 DLQ item helper missing");
  assert(observability.includes("listAutoPressSourceQuality"), "D1 source quality helper missing");
  assert(observability.includes("QUEUE_ITEMS_STUCK"), "stuck queue reconciliation reason missing");
  assert(observability.includes("WORKER_LEASE_EXPIRED"), "expired Worker lease reconciliation reason missing");
  assert(observability.includes("refreshAutoPressObservedRunCounters(runId)"), "reconciliation must refresh run counters");
  assert(runsRoute.includes("listAutoPressObservedRuns"), "runs route must use D1 observed runs");
  assert(runsRoute.includes("runId: run.id"), "manual run creation must expose runId for polling");
  assert(itemsRoute.includes("listAutoPressObservedItems"), "items route must use D1 observed items");
  assert(retryQueueRoute.includes("listAutoPressRetryQueue"), "retry queue route must use D1 retry queue");
  assert(dlqRoute.includes("listAutoPressDeadLetterItems"), "DLQ route must use D1 observed failed items");
  assert(sourceQualityRoute.includes("listAutoPressSourceQuality"), "source quality route must use D1 observed items");
  return "D1 auto-press observability schema/provider coverage verified";
}

function checkQueueOnlyPath() {
  const route = read("src/app/api/cron/auto-press/route.ts");
  const observability = read("src/lib/auto-press-observability.ts");
  const page = read("src/app/cam/auto-press/page.tsx");
  assert(route.includes("executionMode === \"queue_only\""), "auto-press route queue_only 분기 누락");
  assert(route.includes("dispatchAutoPressWorker"), "Worker dispatch 호출 누락");
  assert(observability.includes("queueAutoPressObservedCandidates"), "D1 후보 큐 저장 함수 누락");
  assert(page.includes("executionMode: queueOnlyMode ? \"queue_only\""), "관리자 UI queue_only 요청 누락");
  return "queue_only 실행 경로 확인";
}

function checkManualRunApiContract() {
  const runsRoute = read("src/app/api/auto-press/runs/route.ts");
  const runDetailRoute = read("src/app/api/auto-press/runs/[id]/route.ts");
  const processRoute = read("src/app/api/auto-press/runs/[id]/process/route.ts");
  const cancelRoute = read("src/app/api/auto-press/runs/[id]/cancel/route.ts");
  const itemRetryRoute = read("src/app/api/auto-press/items/[id]/retry/route.ts");

  assert(runsRoute.includes("runId: run.id"), "manual run creation must return runId");
  assert(runDetailRoute.includes("getAutoPressObservedRunDetail"), "manual run polling detail route missing D1 detail read");
  assert(processRoute.includes("previousRunId: run.id"), "manual run continuation must return previousRunId");
  assert(processRoute.includes("runId: continuedRun.id"), "manual run continuation must return new runId");
  assert(processRoute.includes("executionMode: asExecutionMode"), "manual run continuation must preserve executionMode");
  assert(processRoute.includes("maxCandidates: asPositiveNumber"), "manual run continuation must preserve maxCandidates");
  assert(cancelRoute.includes("runId: run.id"), "manual run cancellation must return runId");
  assert(itemRetryRoute.includes("queueId: queue.id"), "observed item retry must return queueId");
  return "manual run API contract verified";
}

function checkAutoPressDashboardCoverage() {
  const page = read("src/app/cam/auto-press/page.tsx");
  const requiredSnippets = [
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
    "const handleProcessObservedRun",
    "const handleCancelObservedRun",
    "const handleObservedItemRetry",
    "const handleRetryQueueAction",
    "const handleDeadLetterAction",
    "사유 요약",
    "실행 타임라인",
    "기사별 처리 결과",
    "수집 소스 품질 리포트",
    "전체 실패",
    "빠른 점검",
    "원격 저장소 포함",
    "업로드 쓰기 테스트",
    "formatHealthDetail(check.detail)",
  ];
  for (const snippet of requiredSnippets) {
    assert(page.includes(snippet), `/cam/auto-press dashboard coverage missing: ${snippet}`);
  }

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
    assert(!page.includes(forbidden), `/cam/auto-press client dashboard must not reference ${forbidden}`);
  }

  return "/cam/auto-press dashboard coverage verified";
}

function checkAutoPressHealthReadinessCoverage() {
  const route = read("src/app/api/auto-press/health/route.ts");
  const requiredSnippets = [
    "getDatabaseProviderStatus",
    "serverGetAiSettings",
    "resolveAiApiKey",
    "checkMediaStorageHealth",
    "summarizeMediaStorageHealth",
    "fetchAutoPressWorkerHealth",
    "getAutoPressRetrySchedulerHealth",
    "getAutoPressObservedSummary",
    "listAutoPressRetryQueue",
    "assessAutoPressSourceReadiness",
    "checks.database",
    "checks.settings",
    "checks.sources",
    "checks.ai",
    "checks.mediaStorage",
    "checks.observability",
    "checks.retryScheduler",
    "checks.workerRuntime",
    "status === \"error\" ? 503 : 200",
  ];
  for (const snippet of requiredSnippets) {
    assert(route.includes(snippet), `/api/auto-press/health readiness coverage missing: ${snippet}`);
  }
  assert(route.includes("enabledSourceCount"), "health source readiness must expose enabled source count");
  assert(route.includes("readySourceCount"), "health source readiness must expose ready source count");
  assert(route.includes("missingFetchTarget"), "health source readiness must expose missing source fetch targets");
  return "/api/auto-press/health readiness coverage verified";
}

function checkWorkerSyntax() {
  const result = spawnSync(process.execPath, ["--check", "cloudflare/auto-press-worker/src/index.js"], {
    cwd: root,
    encoding: "utf8",
  });
  assert(result.status === 0, result.stderr || result.stdout || "Worker syntax check failed");
  return "Cloudflare Worker 문법 확인";
}

function checkWorkerRuntimeControls() {
  const worker = read("cloudflare/auto-press-worker/src/index.js");
  const wrangler = read("cloudflare/auto-press-worker/wrangler.toml");
  const dispatch = read("src/lib/auto-press-worker-dispatch.ts");
  assert(worker.includes("AUTO_PRESS_WORKER_ENABLED"), "Worker enabled flag missing");
  assert(worker.includes("AUTO_PRESS_WORKER_DRY_RUN"), "Worker dry-run flag missing");
  assert(worker.includes("AUTO_PRESS_AUTO_PUBLISH_ENABLED"), "Worker auto-publish gate missing");
  assert(worker.includes('envFlag(env, "AUTO_PRESS_WORKER_ENABLED", false)'), "Worker enabled fallback must be safe-off");
  assert(worker.includes('envFlag(env, "AUTO_PRESS_WORKER_DRY_RUN", true)'), "Worker dry-run fallback must be safe-on");
  assert(worker.includes('envFlag(env, "AUTO_PRESS_AUTO_PUBLISH_ENABLED", false)'), "Worker auto-publish fallback must be safe-off");
  assert(worker.includes("WORKER_DRY_RUN"), "Worker dry-run item result missing");
  assert(worker.includes("controls: workerRuntimeControls(env)"), "Worker health controls missing");
  assert(worker.includes("AUTO_PRESS_TELEGRAM_DAILY_REPORT_ENABLED"), "Worker Telegram daily report flag missing");
  assert(worker.includes("sendDailyTelegramReport"), "Worker daily Telegram report sender missing");
  assert(worker.includes("SUPABASE_RECOVERY_REPORT_ENABLED"), "Worker Supabase recovery report flag missing");
  assert(worker.includes("fetchSupabaseRecoveryReportSection"), "Worker Supabase recovery report section missing");
  assert(worker.includes("/api/cron/supabase-recovery-check?requireStorage=1"), "Worker Supabase recovery route call missing");
  assert(worker.includes("decryptStoredSecret"), "Worker cannot read encrypted admin Telegram settings");
  assert(worker.includes("COOKIE_SECRET"), "Worker encrypted Telegram settings require COOKIE_SECRET support");
  assert(wrangler.includes("AUTO_PRESS_WORKER_ENABLED"), "wrangler worker enabled var missing");
  assert(wrangler.includes("AUTO_PRESS_WORKER_DRY_RUN"), "wrangler worker dry-run var missing");
  assert(wrangler.includes("AUTO_PRESS_AUTO_PUBLISH_ENABLED"), "wrangler auto-publish var missing");
  assert(wrangler.includes("AUTO_PRESS_TELEGRAM_DAILY_REPORT_ENABLED"), "wrangler daily Telegram report var missing");
  assert(wrangler.includes("SUPABASE_RECOVERY_REPORT_ENABLED"), "wrangler Supabase recovery report var missing");
  assert(dispatch.includes("AUTO_PRESS_WORKER_DISPATCH_ENABLED"), "Vercel dispatch enable flag missing");
  return "Worker runtime controls verified";
}

function checkTelegramDailyReportCronOwner() {
  const vercel = JSON.parse(read("vercel.json"));
  const wrangler = read("cloudflare/auto-press-worker/wrangler.toml");
  const cronPaths = Array.isArray(vercel.crons) ? vercel.crons.map((cron) => cron.path) : [];
  assert(!cronPaths.includes("/api/cron/telegram-daily-report"), "Telegram daily report still runs from Vercel cron");
  assert(!cronPaths.includes("/api/cron/retry-ai-edit"), "AI retry still runs from Vercel cron");
  assert(wrangler.includes("\"0 0 * * *\""), "Worker 09:00 KST daily report cron missing");
  return "Telegram daily report cron ownership verified";
}

function checkAiRetryDirectProcessingGuard() {
  const retryCron = read("src/app/api/cron/retry-ai-edit/route.ts");
  const retryScheduler = read("src/lib/auto-press-retry-scheduler.ts");
  const retryProcessRoute = read("src/app/api/auto-press/retry-queue/process/route.ts");
  assert(retryCron.includes("AUTO_PRESS_DIRECT_AI_RETRY_ENABLED"), "retry-ai cron direct processing guard missing");
  assert(retryCron.includes("directProcessingBlocked"), "retry-ai cron blocked response missing");
  assert(retryScheduler.includes("mode: \"blocked\""), "retry scheduler blocked mode missing");
  assert(retryScheduler.includes("allowDirectFallback"), "retry scheduler explicit direct fallback option missing");
  assert(retryProcessRoute.includes("runAutoPressRetryScheduler"), "retry queue process route must route through scheduler guard");
  return "AI retry direct-processing guard verified";
}

function checkWorkerDuplicateGuards() {
  const worker = read("cloudflare/auto-press-worker/src/index.js");
  const observability = read("src/lib/auto-press-observability.ts");
  assert(worker.includes("normalizeTitle(row.title) === normalizedTitle"), "Worker same-title article duplicate guard missing");
  assert(!worker.includes("!canonicalUrl\n      && normalizedTitle"), "Worker queue duplicate guard still skips title checks when URL exists");
  assert(observability.includes("seenTitles"), "Queue candidate same-title batch duplicate guard missing");
  assert(!observability.includes("!candidate.canonicalUrl && candidate.normalizedTitle"), "Queue candidate duplicate guard still skips title checks when URL exists");
  return "Worker duplicate guards verified";
}

function checkNetproOriginAuth() {
  const route = read("src/app/api/netpro/origin/route.ts");
  assert(route.includes("AUTO_PRESS_WORKER_SECRET"), "netpro origin worker-secret auth missing");
  assert(route.includes("timingSafeEqual"), "netpro origin timing-safe auth missing");
  return "netpro origin auth verified";
}

function checkWorkerNotifyRevalidation() {
  const route = read("src/app/api/auto-press/worker-notify/route.ts");
  assert(route.includes("revalidateTag(\"articles\")"), "worker notify article cache revalidation missing");
  return "Worker notify cache revalidation verified";
}

function checkDeadLetterOps() {
  const observability = read("src/lib/auto-press-observability.ts");
  const route = read("src/app/api/auto-press/dlq/route.ts");
  const actionRoute = read("src/app/api/auto-press/dlq/[id]/route.ts");
  const page = read("src/app/cam/auto-press/page.tsx");
  assert(observability.includes("listAutoPressDeadLetterItems"), "DLQ item list helper missing");
  assert(observability.includes("requeueAutoPressDeadLetterItem"), "DLQ requeue helper missing");
  assert(observability.includes("discardAutoPressDeadLetterItem"), "DLQ discard helper missing");
  assert(route.includes("getAutoPressDeadLetterSummary"), "DLQ summary API missing");
  assert(actionRoute.includes("dispatchAutoPressWorker"), "DLQ retry does not dispatch Worker");
  assert(page.includes('tab === "dlq"'), "Admin DLQ tab missing");
  assert(page.includes("실패함"), "Admin DLQ Korean label missing");
  return "DLQ operations verified";
}

function checkPublicPageSingleCall() {
  const tracker = read("src/app/article/[id]/components/ArticleViewTracker.tsx");
  const route = read("src/app/api/db/article-view/route.ts");
  assert(tracker.includes("/api/db/article-view"), "ArticleViewTracker가 통합 article-view API를 사용하지 않습니다.");
  assert(!tracker.includes("/api/db/view-logs"), "ArticleViewTracker에 기존 view-logs 직접 호출이 남아 있습니다.");
  assert(!tracker.includes("/api/db/articles/views"), "ArticleViewTracker에 기존 views 직접 호출이 남아 있습니다.");
  assert(route.includes("isBot: true"), "article-view API가 봇 방문 로그를 리포트용으로 남기지 않습니다.");
  assert(route.includes("counted: false"), "article-view API의 봇/관리자 조회수 제외 응답이 없습니다.");
  return "공개 기사 조회 API 단일화 확인";
}

function main() {
  const checks = [
    checkJsonPlans,
    checkRequiredFiles,
    checkMigrationGuardrails,
    checkD1ObservabilitySchemaCoverage,
    checkQueueOnlyPath,
    checkManualRunApiContract,
    checkAutoPressDashboardCoverage,
    checkAutoPressHealthReadinessCoverage,
    checkWorkerSyntax,
    checkWorkerRuntimeControls,
    checkTelegramDailyReportCronOwner,
    checkAiRetryDirectProcessingGuard,
    checkWorkerDuplicateGuards,
    checkNetproOriginAuth,
    checkWorkerNotifyRevalidation,
    checkDeadLetterOps,
    checkPublicPageSingleCall,
  ];
  const results = checks.map((check) => check());
  console.log(JSON.stringify({ success: true, checkedAt: new Date().toISOString(), results }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    success: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
}
