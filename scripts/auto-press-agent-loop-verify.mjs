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

function checkPublicPageSingleCall() {
  const tracker = read("src/app/article/[id]/components/ArticleViewTracker.tsx");
  assert(tracker.includes("/api/db/article-view"), "ArticleViewTracker가 통합 article-view API를 사용하지 않습니다.");
  assert(!tracker.includes("/api/db/view-logs"), "ArticleViewTracker에 기존 view-logs 직접 호출이 남아 있습니다.");
  assert(!tracker.includes("/api/db/articles/views"), "ArticleViewTracker에 기존 views 직접 호출이 남아 있습니다.");
  return "공개 기사 조회 API 단일화 확인";
}

function main() {
  const checks = [
    checkJsonPlans,
    checkRequiredFiles,
    checkMigrationGuardrails,
    checkQueueOnlyPath,
    checkWorkerSyntax,
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
