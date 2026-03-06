#!/usr/bin/env node
/**
 * 컬처피플 보도자료 자동 수집·편집·등록 CLI
 * ────────────────────────────────────────
 * 사용법:
 *   node scripts/auto-press.mjs [옵션]
 *
 * 옵션:
 *   --count <n>          기사 수 (기본: 5, 최대 20)
 *   --status <s>         발행 상태: 임시저장|게시 (기본: 임시저장)
 *   --category <c>       카테고리 (기본: 설정값)
 *   --keywords <k,k>     쉼표 구분 키워드 (기본: 설정값)
 *   --preview            저장 없이 수집 목록만 확인
 *   --url <base_url>     사이트 URL (기본: .env의 NEXT_PUBLIC_SITE_URL)
 *   --help               도움말 표시
 *
 * 예시:
 *   node scripts/auto-press.mjs
 *   node scripts/auto-press.mjs --count 10 --status 게시
 *   node scripts/auto-press.mjs --keywords "정책,경제" --count 5
 *   node scripts/auto-press.mjs --preview
 *
 * 규칙:
 *   - 본문에 이미지 없는 보도자료는 건너뜁니다
 *   - 평일: 오늘/어제 자료만, 주말: 직전 금요일까지만 허용
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── .env.local 파싱 ────────────────────────────────────────
function loadEnv() {
  const envFiles = [".env.local", ".env"];
  for (const file of envFiles) {
    const p = resolve(ROOT, file);
    if (!existsSync(p)) continue;
    const content = readFileSync(p, "utf-8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
    break;
  }
}
loadEnv();

// ── CLI 인자 파싱 ───────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    count: null, status: null, category: null,
    keywords: null, preview: false, url: null, help: false,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--count":      opts.count    = args[++i]; break;
      case "--status":     opts.status   = args[++i]; break;
      case "--category":   opts.category = args[++i]; break;
      case "--keywords":   opts.keywords = args[++i]; break;
      case "--url":        opts.url      = args[++i]; break;
      case "--preview":    opts.preview  = true;      break;
      case "--help": case "-h": opts.help = true;     break;
    }
  }
  return opts;
}

// ── 도움말 ──────────────────────────────────────────────────
function printHelp() {
  console.log(`
컬처피플 보도자료 자동 수집·편집·등록 CLI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

사용법:
  node scripts/auto-press.mjs [옵션]

옵션:
  --count <n>       기사 수 (기본: 5, 최대 20)
  --status <s>      발행 상태: 임시저장 | 게시 (기본: 임시저장)
  --category <c>    카테고리 (기본: 설정값)
  --keywords <k>    쉼표 구분 키워드 (예: 정책,경제,문화)
  --preview         저장 없이 수집 목록만 확인
  --url <url>       사이트 URL (기본: .env의 NEXT_PUBLIC_SITE_URL)
  --help            이 도움말 표시

예시:
  node scripts/auto-press.mjs
  node scripts/auto-press.mjs --count 10 --status 게시
  node scripts/auto-press.mjs --keywords "정책,문화" --preview

규칙:
  - 본문에 이미지 없는 보도자료는 건너뜁니다
  - 평일: 오늘/어제 자료만, 주말: 직전 금요일까지만 허용
`);
}

// ── 색상 출력 헬퍼 ──────────────────────────────────────────
const c = {
  reset: "\x1b[0m", bold: "\x1b[1m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  blue: "\x1b[34m", cyan: "\x1b[36m", gray: "\x1b[90m", magenta: "\x1b[35m",
};

function log(msg) { process.stdout.write(msg + "\n"); }
function ok(msg)  { log(`${c.green}v${c.reset} ${msg}`); }
function err(msg) { log(`${c.red}x${c.reset} ${msg}`); }
function info(msg){ log(`${c.cyan}i${c.reset} ${msg}`); }
function warn(msg){ log(`${c.yellow}!${c.reset} ${msg}`); }

const STATUS_ICON = {
  ok: c.green + "v",
  fail: c.red + "x",
  dup: c.yellow + "=",
  skip: c.gray + "-",
  no_image: c.magenta + "~",
  old: c.yellow + "o",
};

// ── 메인 ────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs();
  if (opts.help) { printHelp(); process.exit(0); }

  const baseUrl = opts.url
    || process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "")
    || "http://localhost:3001";

  const secret = process.env.CRON_SECRET || "";

  log(`\n${c.bold}컬처피플 보도자료 자동 수집·편집·등록${c.reset}`);
  log(`${"─".repeat(44)}`);
  info(`서버: ${baseUrl}`);
  if (opts.preview) warn("미리보기 모드 — 기사가 저장되지 않습니다.");

  const payload = { source: "cli" };
  if (opts.count)    payload.count = parseInt(opts.count);
  if (opts.status)   payload.publishStatus = opts.status;
  if (opts.category) payload.category = opts.category;
  if (opts.keywords) payload.keywords = opts.keywords.split(",").map((k) => k.trim()).filter(Boolean);
  if (opts.preview)  payload.preview = true;

  log("");
  info(`요청: count=${payload.count ?? "설정값"}, status=${payload.publishStatus ?? "설정값"}, preview=${!!opts.preview}`);
  log("  실행 중... (최대 3분 소요)\n");

  const startAt = Date.now();

  let res;
  try {
    res = await fetch(`${baseUrl}/api/cron/auto-press`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "Authorization": `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    err(`서버 연결 실패: ${e.message}`);
    err("서버가 실행 중인지 확인하세요 (pnpm dev)");
    process.exit(1);
  }

  const elapsed = ((Date.now() - startAt) / 1000).toFixed(1);

  let data;
  try { data = await res.json(); }
  catch { err(`응답 파싱 실패 (HTTP ${res.status})`); process.exit(1); }

  if (!res.ok || !data.success) {
    err(`오류: ${data.error || `HTTP ${res.status}`}`);
    if (res.status === 401) warn("인증 실패. .env.local에 CRON_SECRET 값을 확인하세요.");
    process.exit(1);
  }

  const run = data.run;
  log(`${"─".repeat(44)}`);
  log(`${c.bold}실행 완료 (${elapsed}초)${c.reset}`);
  log(`${c.green}등록: ${run.articlesPublished}건${c.reset}  실패: ${run.articlesFailed}건  스킵: ${run.articlesSkipped}건`);
  log("");

  if (run.articles?.length > 0) {
    log(`${c.bold}결과 목록:${c.reset}`);
    for (const a of run.articles) {
      const icon = STATUS_ICON[a.status] ?? "-";
      const label = { ok: "등록", fail: "실패", dup: "중복", skip: "스킵", no_image: "이미지없음", old: "날짜초과" }[a.status] ?? a.status;
      const link = a.articleId ? ` ${c.gray}[/admin/articles/${a.articleId}/edit]${c.reset}` : "";
      log(`  ${icon}${c.reset} [${label}] ${a.title.slice(0, 55)}${a.title.length > 55 ? "…" : ""}${link}`);
      if (a.error) log(`     ${c.gray}  ${a.error}${c.reset}`);
    }
  }

  log("");
  if (run.articlesPublished > 0 && !opts.preview) {
    ok(`보도자료 ${run.articlesPublished}개가 등록되었습니다.`);
    info(`관리자 > 기사 관리에서 확인: ${baseUrl}/admin/articles`);
  }
  log("");
}

main().catch((e) => { console.error(e); process.exit(1); });
