#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_BACKUP_ROOT = path.join(os.homedir(), "culturepeople-backups");
const DEFAULT_BACKUP_VALUES = {
  "media-concurrency": "1",
  "media-delay-ms": "1500",
  "media-timeout-ms": "90000",
  "media-retries": "1",
  "media-retry-delay-ms": "5000",
  "max-new-media": "300",
  "min-free-gb": "10",
  "retention-days": "90",
};
const BACKUP_VALUE_KEYS = new Set([
  "all-tables",
  "d1-database",
  "d1-delay-ms",
  "d1-page-size",
  "lock-stale-minutes",
  "max-media",
  "max-media-bytes",
  "max-new-media",
  "max-rows",
  "media-concurrency",
  "media-delay-ms",
  "media-failure-cooldown-hours",
  "media-failure-seed-backups",
  "media-retries",
  "media-retry-delay-ms",
  "media-timeout-ms",
  "min-free-gb",
  "retention-days",
  "supabase-delay-ms",
  "supabase-fallback-dir",
  "supabase-page-size",
]);
const BACKUP_FLAG_KEYS = new Set([
  "all-tables",
  "include-external-media",
  "no-env-files",
  "no-lock",
  "no-media",
  "no-supabase-fallback",
  "sample",
  "strict",
]);

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
  console.log(`Usage: node scripts/run-local-backup-quiet.mjs [options]

Runs the local CulturePeople backup chain with concise console output.
Full command output is saved under <backup-root>/_logs so chat/systemd logs stay small.

Options:
  --root <dir>        Backup root. Default: ${DEFAULT_BACKUP_ROOT}
  --log-dir <dir>     Log directory. Default: <root>/_logs
  --json              Print concise machine-readable JSON.
  --status-only       Only print current local status; no remote backup.

Common backup options are forwarded to backup:local. Defaults match the
low-load systemd run: 1 media request at a time, 1500ms media delay, 300 new
media files per run, 10GB disk guard, and 90-day retention.
`);
}

function expandHome(value) {
  const text = String(value || "");
  if (text === "~") return os.homedir();
  if (text.startsWith("~/")) return path.join(os.homedir(), text.slice(2));
  return text;
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function scriptPath(name) {
  return path.resolve("scripts", name);
}

function appendCommandLog(logFile, step, result) {
  const lines = [
    "",
    `===== ${step.name} =====`,
    `started_at=${step.startedAt}`,
    `duration_ms=${step.durationMs}`,
    `exit_status=${result.status ?? ""}`,
    `signal=${result.signal ?? ""}`,
    `$ ${[process.execPath, ...step.args].join(" ")}`,
    "",
    "--- stdout ---",
    result.stdout || "",
    "--- stderr ---",
    result.stderr || "",
  ];
  fs.appendFileSync(logFile, `${lines.join("\n")}\n`, "utf8");
}

function runNodeStep({ name, args, logFile }) {
  const startedAt = new Date();
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const durationMs = Date.now() - startedAt.getTime();
  const step = {
    name,
    args,
    startedAt: startedAt.toISOString(),
    durationMs,
  };
  appendCommandLog(logFile, step, result);

  if (result.error) {
    const error = new Error(`${name} failed to start: ${result.error.message}`);
    error.step = name;
    throw error;
  }
  if (result.status !== 0) {
    const error = new Error(`${name} exited with status ${result.status}. Full log: ${logFile}`);
    error.step = name;
    error.status = result.status;
    throw error;
  }

  return {
    ...step,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function parseJson(stdout, label) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function buildBackupArgs({ root, flags, values }) {
  const backupValues = {
    ...DEFAULT_BACKUP_VALUES,
  };

  for (const [key, value] of Object.entries(values)) {
    if (BACKUP_VALUE_KEYS.has(key)) backupValues[key] = value;
  }

  const args = [
    scriptPath("local-culturepeople-backup.mjs"),
    "--out",
    root,
  ];
  for (const [key, value] of Object.entries(backupValues)) {
    if (value === "" || value === null || value === undefined) continue;
    if (BACKUP_FLAG_KEYS.has(key)) continue;
    args.push(`--${key}`, String(value));
  }
  for (const key of BACKUP_FLAG_KEYS) {
    if (flags.has(key)) args.push(`--${key}`);
  }
  return args;
}

function uniq(items) {
  return [...new Set(items.filter(Boolean))];
}

function warningsFrom(...reports) {
  return uniq(reports.flatMap((report) => (
    Array.isArray(report?.warnings) ? report.warnings : []
  )));
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function summarize({ beforeStatus, backup, sqlite, verify, status, logFile, statusOnly }) {
  const beforeMedia = beforeStatus?.media || {};
  const afterMedia = status?.media || {};
  const latest = status?.latestBackup || {};
  const beforeBackedUp = number(beforeMedia.materializedUrls);
  const afterBackedUp = number(afterMedia.materializedUrls);
  const warnings = warningsFrom(backup, verify, status);

  return {
    ok: Boolean(status?.ok && (statusOnly || backup?.ok) && (statusOnly || verify?.ok)),
    mode: statusOnly ? "status-only" : "backup",
    backupDir: status?.latestBackupDir || backup?.backupDir || null,
    completedAt: latest.completedAt || null,
    media: {
      beforeBackedUp,
      afterBackedUp,
      delta: afterBackedUp - beforeBackedUp,
      total: number(afterMedia.downloadable),
      coveragePercent: number(afterMedia.coveragePercent),
      remaining: number(afterMedia.remainingUrls),
      estimatedRunsRemaining: afterMedia.estimatedRunsRemaining ?? null,
      latestDownloaded: number(afterMedia.latestRunDownloaded),
      latestReused: number(afterMedia.latestRunReused),
      latestFailed: number(afterMedia.latestRunFailed),
      latestDeferredRecentFailures: number(afterMedia.latestRunDeferredRecentFailures),
    },
    data: {
      d1Rows: number(latest.d1Rows),
      supabaseRows: number(latest.supabaseRows),
      supabaseSource: latest.supabaseSource || null,
      mergedArticles: number(latest.mergedArticles),
      duplicateArticles: number(latest.duplicateArticles),
    },
    sqlite: {
      present: Boolean(latest.sqlite?.present || sqlite?.ok),
      file: latest.sqlite?.file || sqlite?.sqliteFile || null,
      bytes: number(latest.sqlite?.bytes),
      integrityOk: verify?.summary?.sqlite ? Boolean(verify.summary.sqlite.integrityOk) : null,
    },
    lock: status?.lock || null,
    warnings,
    logFile,
  };
}

function printText(summary) {
  console.log("CulturePeople quiet local backup");
  console.log(`- ok: ${summary.ok}`);
  console.log(`- mode: ${summary.mode}`);
  console.log(`- backup: ${summary.backupDir || "(none)"}`);
  console.log(`- media: ${summary.media.beforeBackedUp} -> ${summary.media.afterBackedUp}/${summary.media.total} (${summary.media.coveragePercent}%), +${summary.media.delta}, remaining ${summary.media.remaining}`);
  console.log(`- latest run: downloaded/reused/failed ${summary.media.latestDownloaded}/${summary.media.latestReused}/${summary.media.latestFailed}`);
  if (summary.media.latestDeferredRecentFailures > 0) {
    console.log(`- deferred recent media failures: ${summary.media.latestDeferredRecentFailures}`);
  }
  console.log(`- estimated runs remaining: ${summary.media.estimatedRunsRemaining}`);
  console.log(`- rows D1/Supabase: ${summary.data.d1Rows}/${summary.data.supabaseRows} (${summary.data.supabaseSource || "unknown"})`);
  console.log(`- SQLite: ${summary.sqlite.present ? summary.sqlite.file : "missing"}`);
  console.log(`- lock: ${summary.lock?.present ? `present running=${summary.lock.running} stale=${summary.lock.stale}` : "clear"}`);
  console.log(`- full log: ${summary.logFile}`);
  if (summary.warnings.length) {
    console.log(`- warnings: ${summary.warnings.length} (${summary.warnings[0]})`);
  }
}

function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  if (flags.has("help") || flags.has("h")) {
    printHelp();
    return;
  }

  const root = path.resolve(expandHome(values.root || values.out || DEFAULT_BACKUP_ROOT));
  const logDir = path.resolve(expandHome(values["log-dir"] || path.join(root, "_logs")));
  ensureDir(logDir);
  const logFile = path.join(logDir, `local-backup-quiet-${timestampForFile()}.log`);
  fs.writeFileSync(logFile, `CulturePeople quiet local backup log\nroot=${root}\nstarted_at=${new Date().toISOString()}\n`, "utf8");

  const beforeStatus = parseJson(runNodeStep({
    name: "status-before",
    args: [scriptPath("local-culturepeople-backup-status.mjs"), "--root", root, "--json"],
    logFile,
  }).stdout, "status-before");

  let backup = null;
  let sqlite = null;
  let verify = null;
  if (!flags.has("status-only")) {
    backup = parseJson(runNodeStep({
      name: "backup",
      args: buildBackupArgs({ root, flags, values }),
      logFile,
    }).stdout, "backup");
    sqlite = parseJson(runNodeStep({
      name: "sqlite",
      args: [scriptPath("create-local-backup-sqlite.mjs"), "--latest", "--root", root],
      logFile,
    }).stdout, "sqlite");
    verify = parseJson(runNodeStep({
      name: "verify",
      args: [scriptPath("verify-local-culturepeople-backup.mjs"), "--latest", "--root", root, "--require-sqlite", "--json"],
      logFile,
    }).stdout, "verify");
  }

  const status = parseJson(runNodeStep({
    name: "status-after",
    args: [scriptPath("local-culturepeople-backup-status.mjs"), "--root", root, "--json"],
    logFile,
  }).stdout, "status-after");
  const summary = summarize({
    beforeStatus,
    backup,
    sqlite,
    verify,
    status,
    logFile,
    statusOnly: flags.has("status-only"),
  });

  if (flags.has("json")) console.log(JSON.stringify(summary, null, 2));
  else printText(summary);

  if (!summary.ok) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(`quiet local backup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
