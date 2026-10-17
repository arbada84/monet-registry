#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_BACKUP_ROOT } from "./lib/backup-root.mjs";
const DEFAULT_PORTAL_RUNS_DIR = path.resolve(".portal-backfill-runs");

function parseArgs(argv) {
  const flags = new Set();
  const values = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (!arg.startsWith("--")) continue;

    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      values[key] = inlineValue;
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      values[key] = next;
      i += 1;
    } else {
      flags.add(key);
    }
  }

  return { flags, values };
}

function printHelp() {
  console.log(`Usage: node scripts/culturepeople-ops-audit.mjs [options]

Builds a low-load CulturePeople operations audit from local backup status,
latest IndexNow backfill evidence, and optional portal surface checks.

Options:
  --root <dir>              Backup root. Default: ${DEFAULT_BACKUP_ROOT}
  --portal-runs-dir <dir>   Portal backfill evidence directory. Default: ${DEFAULT_PORTAL_RUNS_DIR}
  --base <url>              Run small live portal surface checks against this base URL.
  --indexnow-key <key>      Include the IndexNow key txt route in --base checks.
  --run-indexnow-dry-run    Run backfill-portal-publication dry-run to refresh candidate counts.
  --source <kind>           Backfill dry-run source: auto|d1|supabase|api. Default: d1
  --json                    Print machine-readable JSON only.
`);
}

function expandHome(value) {
  const text = String(value || "");
  if (text === "~") return os.homedir();
  if (text.startsWith("~/")) return path.join(os.homedir(), text.slice(2));
  return text;
}

function runNodeJson(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0 && !result.stdout.trim()) {
    return {
      ok: false,
      error: result.stderr.trim() || `command failed: ${args.join(" ")}`,
      status: result.status,
    };
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    return {
      ok: false,
      error: `could not parse JSON from ${args.join(" ")}: ${error instanceof Error ? error.message : String(error)}`,
      status: result.status,
      stdout: result.stdout.slice(0, 1000),
      stderr: result.stderr.slice(0, 1000),
    };
  }
}

function runNodeText(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function latestJsonFile(dirPath, pattern) {
  if (!fs.existsSync(dirPath)) return "";
  return fs.readdirSync(dirPath)
    .filter((name) => pattern.test(name))
    .map((name) => path.join(dirPath, name))
    .filter((filePath) => fs.statSync(filePath).isFile())
    .sort()
    .at(-1) || "";
}

function readJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

export function summarizePortalEvidence(dirPath, { now = Date.now(), maxAgeHours = 24 } = {}) {
  const latestApply = latestJsonFile(dirPath, /^portal-backfill-apply-.*\.json$/);
  const latestDryRun = latestJsonFile(dirPath, /^portal-backfill-dry-run-.*\.json$/);
  const latestBlocked = latestJsonFile(dirPath, /^portal-backfill-blocked-.*\.json$/);
  const latestEvidence = [
    latestApply ? { kind: "apply", file: latestApply } : null,
    latestDryRun ? { kind: "dry-run", file: latestDryRun } : null,
    latestBlocked ? { kind: "blocked", file: latestBlocked } : null,
  ].filter(Boolean)
    .sort((a, b) => path.basename(a.file).replace(/^portal-backfill-(apply|dry-run|blocked)-/, "")
      .localeCompare(path.basename(b.file).replace(/^portal-backfill-(apply|dry-run|blocked)-/, "")))
    .at(-1);
  const latest = latestEvidence?.file || "";
  const latestKind = latestEvidence?.kind || null;
  const blocked = latestKind === "blocked";
  const report = readJson(latest);
  const resultCounts = report?.resultCounts || report?.results || {};
  const summary = report?.summary || report || {};
  const count = (...values) => {
    const value = values.find((candidate) => candidate !== undefined && candidate !== null);
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
  };
  const generatedAt = report?.generatedAt || report?.generated_at || null;
  const timestamp = typeof generatedAt === "string" ? Date.parse(generatedAt) : NaN;
  const ageHours = Number.isFinite(timestamp) ? (now - timestamp) / 3_600_000 : null;
  const freshness = ageHours === null || ageHours < -5 / 60 ? "invalid" : ageHours > maxAgeHours ? "stale" : "fresh";
  const published = count(summary.publishedArticles, summary.published, summary.totalPublished);
  const successfulLogs = count(summary.successfulLogs, summary.indexNowSuccess, summary.visibleSuccessLogs, summary.successfulIndexNowLogsVisible);
  const candidates = count(summary.candidates, summary.candidatesWithoutVisibleSuccessLog, summary.toSubmit);
  // A dry-run with no submissions cannot prove that historical auth failures are zero.
  const authFailed = count(summary.authFailed, summary.auth_failed, resultCounts.auth_failed);
  const countsKnown = [published, successfulLogs, candidates, authFailed].every((value) => value !== null);

  return {
    ok: Boolean(report) && report.ok !== false && !blocked && freshness === "fresh" && countsKnown,
    latestFile: latest || null,
    latestKind,
    generatedAt,
    ageHours,
    maxAgeHours,
    freshness,
    countsKnown,
    scope: report?.scope || "backfill-report",
    failedLast24h: count(report?.failedLast24h),
    queryMetrics: report?.queryMetrics || null,
    published,
    successfulLogs,
    candidates,
    authFailed,
    resultCounts,
    blocked: blocked ? report?.blocked || report : null,
  };
}

function printHuman(report) {
  console.log("CulturePeople operations audit");
  console.log(`- ok: ${report.ok}`);
  console.log(`- generated at: ${report.generatedAt}`);
  console.log(`- backup: ${report.backup?.ok ? "ok" : "check"} ${report.backup?.latestBackupDir || "(none)"}`);
  if (report.backup?.health) {
    console.log(`- backup health: freshness=${report.backup.health.backupFreshness.status}, supabase=${report.backup.health.supabaseFallback.status}, disk=${report.backup.health.disk.status}, image=${report.backup.health.imageBackfill.status}`);
  }
  console.log(`- portal evidence: ${report.portalEvidence.latestKind || "none"} ${report.portalEvidence.latestFile || ""}`);
  console.log(`- portal evidence freshness: ${report.portalEvidence.freshness}, generated=${report.portalEvidence.generatedAt || "unknown"}`);
  console.log(`- IndexNow candidates/authFailed: ${report.portalEvidence.candidates ?? "unknown"}/${report.portalEvidence.authFailed ?? "unknown"}`);
  console.log(`- IndexNow evidence scope: ${report.portalEvidence.scope}`);
  if (report.portalSurface) {
    console.log(`- portal surface: ${report.portalSurface.ok ? "ok" : "fail"} ${report.portalSurface.baseUrl}`);
  }
  if (report.indexNowDryRun) {
    console.log(`- IndexNow dry-run: ${report.indexNowDryRun.ok ? "ok" : "check"}`);
  }
  for (const warning of report.warnings) console.log(`- warning: ${warning}`);
  for (const error of report.errors) console.log(`- error: ${error}`);
}

export function buildAuditReport({
  root = DEFAULT_BACKUP_ROOT,
  portalRunsDir = DEFAULT_PORTAL_RUNS_DIR,
  baseUrl = "",
  indexNowKey = "",
  runIndexNowDryRun = false,
  source = "d1",
} = {}) {
  const backup = runNodeJson([
    path.resolve("scripts/local-culturepeople-backup-status.mjs"),
    "--root", root,
    "--json",
  ]);
  let portalEvidence = summarizePortalEvidence(portalRunsDir);
  const warnings = [];
  const errors = [];

  if (!backup.ok) {
    const backupErrors = backup.errors?.length ? backup.errors : [backup.error || "backup status could not be verified."];
    for (const error of backupErrors) errors.push(`backup: ${error}`);
  }
  for (const warning of backup.warnings || []) warnings.push(`backup: ${warning}`);

  let portalSurface = null;
  if (baseUrl) {
    portalSurface = runNodeJson([
      path.resolve("scripts/verify-portal-surface.mjs"),
      "--base", baseUrl,
      "--json",
      ...(indexNowKey ? ["--indexnow-key", indexNowKey] : []),
    ]);
    if (!portalSurface.ok) errors.push("portal surface verification failed.");
  }

  let indexNowDryRun = null;
  if (runIndexNowDryRun) {
    const dryRun = runNodeText([
      path.resolve("scripts/backfill-portal-publication.mjs"),
      "--source", source,
      ...(baseUrl ? ["--base", baseUrl] : []),
      "--log-preview", "3",
      "--batch-size", "50",
    ]);
    const reportMatch = `${dryRun.stdout}\n${dryRun.stderr}`.match(/- report:\s+(.+\.json)/);
    const reportPath = reportMatch ? path.resolve(reportMatch[1].trim()) : "";
    indexNowDryRun = {
      ...dryRun,
      reportPath: reportPath || null,
      report: readJson(reportPath),
    };
    if (indexNowDryRun.ok && indexNowDryRun.report) {
      portalEvidence = summarizePortalEvidence(path.dirname(reportPath));
    }
    if (!indexNowDryRun.ok) warnings.push("IndexNow dry-run returned a non-ok result.");
  }

  if (!portalEvidence.latestFile) errors.push("portal: no local IndexNow backfill evidence file found; current status is unknown.");
  else if (!portalEvidence.ok) errors.push(`portal: evidence is not sufficient for a current health verdict (freshness=${portalEvidence.freshness}, countsKnown=${portalEvidence.countsKnown}).`);
  if (portalEvidence.candidates > 0) warnings.push(`portal: ${portalEvidence.candidates} published URLs still lack visible IndexNow success evidence.`);
  if (portalEvidence.authFailed > 0) errors.push(`portal: ${portalEvidence.authFailed} IndexNow auth failures were reported.`);
  if (portalEvidence.blocked) errors.push("portal: latest backfill evidence is blocked.");

  return {
    ok: errors.length === 0,
    generatedAt: new Date().toISOString(),
    root,
    portalRunsDir,
    backup,
    portalEvidence,
    portalSurface,
    indexNowDryRun,
    warnings,
    errors,
  };
}

function runCli() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  if (flags.has("help") || flags.has("h")) {
    printHelp();
    return;
  }

  const report = buildAuditReport({
    root: path.resolve(expandHome(values.root || DEFAULT_BACKUP_ROOT)),
    portalRunsDir: path.resolve(expandHome(values["portal-runs-dir"] || DEFAULT_PORTAL_RUNS_DIR)),
    baseUrl: values.base || values.url || "",
    indexNowKey: values["indexnow-key"] || values.key || "",
    runIndexNowDryRun: flags.has("run-indexnow-dry-run"),
    source: values.source || "d1",
  });

  if (flags.has("json")) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);

  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
