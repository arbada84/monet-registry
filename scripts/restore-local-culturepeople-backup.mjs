#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_BACKUP_ROOT } from "./lib/backup-root.mjs";
const DEFAULT_SQLITE_FILE = path.join("merged", "culturepeople.sqlite");
const DEFAULT_SUPABASE_FALLBACK_MAX_AGE_DAYS = 3;
const DEFAULT_MAX_MEDIA_FILE_CHECKS = 50;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseArgs(argv) {
  const flags = new Set();
  const values = {};
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

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

  return { flags, values, positionals };
}

function printHelp() {
  console.log(`Usage: node scripts/restore-local-culturepeople-backup.mjs [backup-dir] [options]

Runs a read-only local restore rehearsal for a CulturePeople backup. It copies
the unified SQLite snapshot into a temporary restore directory, opens that copy,
and cross-checks it against the JSON manifests. It never writes to production.

Options:
  --root <dir>                Backup root. Default: ${DEFAULT_BACKUP_ROOT}
  --latest                    Rehearse the newest timestamped backup under --root.
  --json                      Print machine-readable JSON only.
  --sqlite-bin <cmd>          sqlite3 command for read checks. Default: sqlite3
  --skip-sqlite-cli           Only verify the SQLite file header and copy.
  --keep-temp                 Keep the temporary restore directory for inspection.
  --max-media-file-checks <n> Check at most this many materialized media files. Default: ${DEFAULT_MAX_MEDIA_FILE_CHECKS}
  --supabase-fallback-max-age-days <n>
                              Warn when local Supabase fallback is older than this. Default: ${DEFAULT_SUPABASE_FALLBACK_MAX_AGE_DAYS}
  --fail-stale-supabase-fallback
                              Fail if local fallback is older than the threshold.
`);
}

function expandHome(value) {
  const text = String(value || "");
  if (text === "~") return os.homedir();
  if (text.startsWith("~/")) return path.join(os.homedir(), text.slice(2));
  return text;
}

function toPositiveInt(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.floor(number);
}

function latestBackupDir(root) {
  if (!fs.existsSync(root)) return "";
  return fs.readdirSync(root)
    .filter((name) => /^\d{4}-\d{2}-\d{2}T/.test(name))
    .map((name) => path.join(root, name))
    .filter((item) => fs.existsSync(path.join(item, "backup-manifest.json")))
    .sort()
    .at(-1) || "";
}

function readJson(filePath, report, label) {
  if (!fs.existsSync(filePath)) {
    report.errors.push(`${label} missing: ${filePath}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    report.errors.push(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function requireArray(value, report, label) {
  if (!Array.isArray(value)) {
    report.errors.push(`${label} must be a JSON array.`);
    return [];
  }
  return value;
}

function ageDaysFromNow(value) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, (Date.now() - timestamp) / MS_PER_DAY);
}

function formatDays(value) {
  const days = Number(value);
  if (!Number.isFinite(days)) return "unknown";
  return `${Math.round(days * 10) / 10}d`;
}

function relativeFile(baseDir, filePath) {
  const text = String(filePath || "");
  return path.isAbsolute(text) ? text : path.join(baseDir, text);
}

function readFileHeader(filePath, bytes) {
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const read = fs.readSync(fd, buffer, 0, bytes, 0);
    return buffer.subarray(0, read).toString("binary");
  } finally {
    fs.closeSync(fd);
  }
}

function sqliteQuery({ sqliteBin, sqliteFile, sql }) {
  return execFileSync(sqliteBin, [sqliteFile, sql], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  }).trim();
}

function inspectSqliteCopy({ sqliteBin, sqliteFile, report }) {
  const tables = sqliteQuery({
    sqliteBin,
    sqliteFile,
    sql: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;",
  }).split(/\r?\n/).filter(Boolean);
  const requiredTables = [
    "article_duplicate_sources",
    "articles",
    "media_candidates",
    "media_files",
    "metadata",
    "raw_rows",
  ];
  const missingTables = requiredTables.filter((table) => !tables.includes(table));
  for (const table of missingTables) report.errors.push(`SQLite table missing in restore copy: ${table}`);

  const integrity = sqliteQuery({ sqliteBin, sqliteFile, sql: "PRAGMA integrity_check;" });
  const counts = {};
  for (const table of ["articles", "raw_rows", "media_candidates", "media_files"]) {
    if (tables.includes(table)) {
      counts[table] = Number(sqliteQuery({ sqliteBin, sqliteFile, sql: `SELECT COUNT(*) FROM ${table};` }));
    }
  }

  const latestArticleLine = tables.includes("articles")
    ? sqliteQuery({
      sqliteBin,
      sqliteFile,
      sql: "SELECT COALESCE(no, '') || char(9) || COALESCE(title, '') || char(9) || COALESCE(date, '') FROM articles ORDER BY COALESCE(no, 0) DESC, date DESC LIMIT 1;",
    })
    : "";
  const [latestNo, latestTitle, latestDate] = latestArticleLine.split("\t");

  if (integrity !== "ok") report.errors.push(`SQLite restore copy integrity_check failed: ${integrity || "(empty)"}`);

  return {
    inspectedWithCli: true,
    integrity,
    integrityOk: integrity === "ok",
    tables,
    missingTables,
    counts,
    latestArticle: latestArticleLine ? {
      no: latestNo === "" ? null : Number(latestNo),
      title: latestTitle || "",
      date: latestDate || "",
    } : null,
  };
}

function buildSupabaseFallbackStatus(source, maxAgeDays) {
  const used = source?.fallback_used === true;
  const generatedAt = source?.fallback_generated_at || null;
  const ageDays = used ? ageDaysFromNow(generatedAt) : null;
  const remoteErrors = Array.isArray(source?.remote_errors)
    ? source.remote_errors.filter(Boolean)
    : [];

  return {
    used,
    generatedAt,
    ageDays,
    maxAgeDays,
    stale: used && (ageDays == null || ageDays > maxAgeDays),
    remoteErrors,
  };
}

function checkSampleMediaFiles({ backupDir, mediaManifest, maxChecks, report }) {
  const files = Array.isArray(mediaManifest?.files) ? mediaManifest.files : [];
  const materialized = files.filter((file) => ["downloaded", "reused"].includes(file?.status));
  const sample = materialized.slice(0, maxChecks);
  let present = 0;
  let missing = 0;

  for (const file of sample) {
    const filePath = relativeFile(backupDir, file.file);
    if (fs.existsSync(filePath)) {
      present += 1;
    } else {
      missing += 1;
      report.errors.push(`sampled media file missing in restore rehearsal: ${filePath}`);
    }
  }

  return {
    totalManifestFiles: files.length,
    materializedFiles: materialized.length,
    sampled: sample.length,
    present,
    missing,
  };
}

export function buildRestoreCheckReport({
  backupDir,
  sqliteBin = "sqlite3",
  skipSqliteCli = false,
  keepTemp = false,
  maxMediaFileChecks = DEFAULT_MAX_MEDIA_FILE_CHECKS,
  supabaseFallbackMaxAgeDays = DEFAULT_SUPABASE_FALLBACK_MAX_AGE_DAYS,
  failStaleSupabaseFallback = false,
} = {}) {
  const report = {
    ok: false,
    generatedAt: new Date().toISOString(),
    backupDir: backupDir || "",
    restoreDir: null,
    keepTemp,
    errors: [],
    warnings: [],
    summary: {
      d1Articles: 0,
      supabaseArticles: 0,
      mergedArticles: 0,
      rawRowsExpected: 0,
      mediaCandidates: 0,
      media: null,
      supabaseFallback: null,
      sqlite: null,
    },
  };

  if (!backupDir || !fs.existsSync(backupDir)) {
    report.errors.push(`backup directory missing: ${backupDir || "(empty)"}`);
    return report;
  }

  const manifest = readJson(path.join(backupDir, "backup-manifest.json"), report, "backup manifest");
  const d1Manifest = readJson(path.join(backupDir, "raw", "d1", "export-manifest.json"), report, "D1 export manifest");
  const supabaseManifest = readJson(path.join(backupDir, "raw", "supabase", "export-manifest.json"), report, "Supabase export manifest");
  const d1Articles = requireArray(readJson(path.join(backupDir, "raw", "d1", "tables", "articles.json"), report, "D1 articles"), report, "D1 articles");
  const supabaseArticles = requireArray(readJson(path.join(backupDir, "raw", "supabase", "tables", "articles.json"), report, "Supabase articles"), report, "Supabase articles");
  const mergedArticles = requireArray(readJson(path.join(backupDir, "merged", "articles.json"), report, "merged articles"), report, "merged articles");
  const mediaCandidates = requireArray(readJson(path.join(backupDir, "merged", "media-candidates.json"), report, "media candidates"), report, "media candidates");
  const mediaManifest = readJson(path.join(backupDir, "media", "media-manifest.json"), report, "media manifest");

  report.summary.d1Articles = d1Articles.length;
  report.summary.supabaseArticles = supabaseArticles.length;
  report.summary.mergedArticles = mergedArticles.length;
  report.summary.mediaCandidates = mediaCandidates.length;
  report.summary.rawRowsExpected = Number(d1Manifest?.tables?.reduce?.((sum, table) => sum + Number(table.rows || 0), 0) || 0)
    + Number(supabaseManifest?.tables?.reduce?.((sum, table) => sum + Number(table.rows || 0), 0) || 0);

  if (manifest?.ok === false) report.errors.push("backup-manifest.ok is false.");
  if (d1Manifest?.ok !== true) report.errors.push("D1 export manifest is not ok.");
  if (supabaseManifest?.ok !== true) report.errors.push("Supabase export manifest is not ok.");
  if (mergedArticles.length === 0) report.errors.push("merged articles are empty.");

  const fallback = buildSupabaseFallbackStatus(
    manifest?.sources?.supabase || supabaseManifest,
    supabaseFallbackMaxAgeDays,
  );
  report.summary.supabaseFallback = fallback;
  if (fallback.used) {
    report.warnings.push(`Supabase restore rehearsal is using local fallback from ${fallback.generatedAt || "unknown time"}; age=${formatDays(fallback.ageDays)}.`);
    if (fallback.stale) {
      const message = `Supabase fallback snapshot is stale: age=${formatDays(fallback.ageDays)}, threshold=${fallback.maxAgeDays}d.`;
      if (failStaleSupabaseFallback) report.errors.push(message);
      else report.warnings.push(message);
    }
    if (fallback.remoteErrors.length) report.warnings.push(`Supabase live export error: ${fallback.remoteErrors.join("; ")}`);
  }

  report.summary.media = checkSampleMediaFiles({
    backupDir,
    mediaManifest,
    maxChecks: maxMediaFileChecks,
    report,
  });

  const sqliteFile = path.join(backupDir, DEFAULT_SQLITE_FILE);
  if (!fs.existsSync(sqliteFile)) {
    report.errors.push(`SQLite snapshot missing: ${sqliteFile}`);
    report.ok = report.errors.length === 0;
    return report;
  }

  const header = readFileHeader(sqliteFile, 16);
  if (header !== "SQLite format 3\u0000") {
    report.errors.push(`SQLite snapshot has an invalid header: ${sqliteFile}`);
    report.ok = report.errors.length === 0;
    return report;
  }

  const restoreDir = fs.mkdtempSync(path.join(os.tmpdir(), "culturepeople-restore-check-"));
  report.restoreDir = restoreDir;
  const restoreSqliteFile = path.join(restoreDir, "culturepeople.sqlite");
  fs.copyFileSync(sqliteFile, restoreSqliteFile);

  const copiedBytes = fs.statSync(restoreSqliteFile).size;
  report.summary.sqlite = {
    sourceFile: sqliteFile,
    restoreFile: restoreSqliteFile,
    bytes: copiedBytes,
    copied: true,
    inspectedWithCli: false,
    integrityOk: null,
    tables: [],
    missingTables: [],
    counts: {},
    latestArticle: null,
  };

  if (!skipSqliteCli) {
    try {
      report.summary.sqlite = {
        ...report.summary.sqlite,
        ...inspectSqliteCopy({ sqliteBin, sqliteFile: restoreSqliteFile, report }),
      };
      const counts = report.summary.sqlite.counts || {};
      if (counts.articles !== mergedArticles.length) {
        report.errors.push(`SQLite restore article count mismatch: sqlite=${counts.articles}, merged=${mergedArticles.length}`);
      }
      if (counts.raw_rows !== report.summary.rawRowsExpected) {
        report.errors.push(`SQLite restore raw row count mismatch: sqlite=${counts.raw_rows}, expected=${report.summary.rawRowsExpected}`);
      }
      if (counts.media_candidates !== mediaCandidates.length) {
        report.errors.push(`SQLite restore media candidate count mismatch: sqlite=${counts.media_candidates}, expected=${mediaCandidates.length}`);
      }
      if (counts.media_files !== report.summary.media.totalManifestFiles) {
        report.errors.push(`SQLite restore media file count mismatch: sqlite=${counts.media_files}, expected=${report.summary.media.totalManifestFiles}`);
      }
    } catch (error) {
      report.warnings.push(`SQLite restore copy could not be inspected with ${sqliteBin}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!keepTemp) {
    fs.rmSync(restoreDir, { recursive: true, force: true });
    report.restoreDir = null;
  }

  report.ok = report.errors.length === 0;
  return report;
}

function printHuman(report) {
  console.log("CulturePeople local backup restore rehearsal");
  console.log(`- ok: ${report.ok}`);
  console.log(`- backup: ${report.backupDir}`);
  console.log(`- restore temp: ${report.restoreDir || "(removed)"}`);
  console.log(`- D1/Supabase articles: ${report.summary.d1Articles}/${report.summary.supabaseArticles}`);
  console.log(`- merged articles: ${report.summary.mergedArticles}`);
  console.log(`- raw rows expected: ${report.summary.rawRowsExpected}`);
  console.log(`- media candidates: ${report.summary.mediaCandidates}`);
  if (report.summary.media) {
    console.log(`- sampled media files: ${report.summary.media.present}/${report.summary.media.sampled} present`);
  }
  if (report.summary.sqlite) {
    const sqlite = report.summary.sqlite;
    console.log(`- SQLite copy: ${sqlite.copied ? sqlite.restoreFile : "missing"} (${sqlite.bytes || 0} bytes)`);
    console.log(`- SQLite inspected: ${sqlite.inspectedWithCli} integrity=${sqlite.integrityOk}`);
    if (sqlite.latestArticle) {
      console.log(`- latest SQLite article: ${sqlite.latestArticle.no ?? "(no no)"} ${sqlite.latestArticle.title}`);
    }
  }
  if (report.summary.supabaseFallback?.used) {
    const fallback = report.summary.supabaseFallback;
    console.log(`- Supabase fallback age: ${formatDays(fallback.ageDays)} (threshold ${fallback.maxAgeDays}d, stale=${fallback.stale})`);
  }
  for (const warning of report.warnings) console.log(`- warning: ${warning}`);
  for (const error of report.errors) console.log(`- error: ${error}`);
}

function runCli() {
  const { flags, values, positionals } = parseArgs(process.argv.slice(2));
  if (flags.has("help") || flags.has("h")) {
    printHelp();
    return;
  }

  const root = path.resolve(expandHome(values.root || DEFAULT_BACKUP_ROOT));
  const backupDir = path.resolve(expandHome(positionals[0] || (flags.has("latest") ? latestBackupDir(root) : latestBackupDir(root))));
  const report = buildRestoreCheckReport({
    backupDir,
    sqliteBin: values["sqlite-bin"] || "sqlite3",
    skipSqliteCli: flags.has("skip-sqlite-cli"),
    keepTemp: flags.has("keep-temp"),
    maxMediaFileChecks: toPositiveInt(values["max-media-file-checks"], DEFAULT_MAX_MEDIA_FILE_CHECKS),
    supabaseFallbackMaxAgeDays: toPositiveInt(values["supabase-fallback-max-age-days"], DEFAULT_SUPABASE_FALLBACK_MAX_AGE_DAYS),
    failStaleSupabaseFallback: flags.has("fail-stale-supabase-fallback"),
  });

  if (flags.has("json")) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);

  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
