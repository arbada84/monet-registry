/**
 * Cafe24 배포 패키징 스크립트
 * 실행: node scripts/package-cafe24.mjs
 *
 * 역할:
 * 1. .next/ 빌드 결과물 → deploy-package/.next/ 복사
 * 2. public/ → deploy-package/public/ 동기화
 * 3. 배포 준비 완료 메시지 출력
 *
 * 사전 조건: pnpm build (또는 npm run build:cafe24) 가 완료되어 있어야 함
 */

import { existsSync, rmSync, cpSync, statSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../");
const NEXT_DIR = join(ROOT, ".next");
const PUBLIC_DIR = join(ROOT, "public");
const OUT_DIR = join(ROOT, "deploy-package");
const OUT_NEXT = join(OUT_DIR, ".next");
const OUT_PUBLIC = join(OUT_DIR, "public");

// ── 유틸 ──────────────────────────────────────────────────────────────
function sizeMB(dir) {
  // 디렉토리 크기 간단 추정 (재귀 X — 속도 우선)
  try {
    return (statSync(dir).size / 1024 / 1024).toFixed(1) + " MB";
  } catch {
    return "?";
  }
}

function log(msg) {
  console.log(`[cafe24-package] ${msg}`);
}

// ── 검증 ───────────────────────────────────────────────────────────────
if (!existsSync(NEXT_DIR)) {
  console.error("❌ .next/ 폴더가 없습니다. 먼저 pnpm build 를 실행하세요.");
  process.exit(1);
}
if (!existsSync(join(NEXT_DIR, "BUILD_ID"))) {
  console.error("❌ 빌드가 완료되지 않은 것 같습니다. pnpm build 를 다시 실행하세요.");
  process.exit(1);
}

// ── .next/ 복사 ────────────────────────────────────────────────────────
log(".next/ 복사 시작...");
if (existsSync(OUT_NEXT)) {
  rmSync(OUT_NEXT, { recursive: true, force: true });
}
cpSync(NEXT_DIR, OUT_NEXT, {
  recursive: true,
  filter: (src) => {
    // 캐시는 제외 (용량 절약) — Windows/Unix 경로 모두 처리
    const normalized = src.replace(/\\/g, "/");
    const cacheDir = NEXT_DIR.replace(/\\/g, "/") + "/cache";
    if (normalized === cacheDir || normalized.startsWith(cacheDir + "/")) return false;
    return true;
  },
});
log(".next/ 복사 완료");

// ── public/ 복사 ───────────────────────────────────────────────────────
log("public/ 동기화...");
if (existsSync(OUT_PUBLIC)) {
  rmSync(OUT_PUBLIC, { recursive: true, force: true });
}
cpSync(PUBLIC_DIR, OUT_PUBLIC, { recursive: true });
log("public/ 복사 완료");

// ── 완료 ───────────────────────────────────────────────────────────────
console.log("");
console.log("✅ 패키징 완료! deploy-package/ 폴더를 Cafe24에 업로드하세요.");
console.log("");
console.log("📁 업로드 대상: deploy-package/");
console.log("   ├─ .next/          (Next.js 빌드)");
console.log("   ├─ public/         (정적 에셋)");
console.log("   ├─ package.json    (최소 의존성)");
console.log("   ├─ bootstrap.js    (자동 npm install + 서버 시작)");
console.log("   ├─ server.js       (대안 시작 스크립트)");
console.log("   └─ ecosystem.config.js  (PM2 설정)");
console.log("");
console.log("⚙️  Cafe24 Node.js 앱 설정:");
console.log("   실행 파일: bootstrap.js  (또는 ecosystem.config.js 로 PM2)");
console.log("");
console.log("🔑 환경변수 필수 확인:");
console.log("   MYSQL_HOST / MYSQL_DATABASE / MYSQL_USER / MYSQL_PASSWORD");
console.log("   NEXT_PUBLIC_SITE_URL  (예: https://curpy.cafe24.com)");
console.log("   (.env.production.local 파일 또는 Cafe24 환경변수 설정)");
