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
  "cloudflare/auto-press-worker/wrangler.toml",
  "cloudflare/auto-press-worker/src/index.js",
  "src/lib/auto-press-observability.ts",
  "src/lib/auto-press-worker-dispatch.ts",
  "src/app/api/cron/auto-press/route.ts",
  "src/app/api/auto-press/dlq/route.ts",
  "src/app/api/auto-press/dlq/[id]/route.ts",
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
  assert(phase2.includes("현재 D1 migration을 재사용"), "Phase2 기획서에 migration 재사용 원칙이 없습니다.");
  assert(migration.includes("ALTER TABLE auto_press_runs ADD COLUMN execution_mode"), "0003 migration execution_mode 추가 누락");
  assert(!migration.match(/DROP\s+TABLE/i), "0003 migration에 DROP TABLE이 포함되어 있습니다.");
  assert(!migration.match(/CREATE\s+TABLE\s+auto_press_jobs/i), "auto_press_jobs 신규 테이블 생성 금지 원칙 위반");
  return "additive migration 가드레일 확인";
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
    checkQueueOnlyPath,
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
