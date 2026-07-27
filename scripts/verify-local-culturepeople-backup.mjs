#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_BACKUP_ROOT } from "./lib/backup-root.mjs";
const DEFAULT_SQLITE_FILE = path.join("merged", "culturepeople.sqlite");
const DEFAULT_SUPABASE_FALLBACK_MAX_AGE_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseArgs(argv) {
  const flags = new Set();
  const values = {};
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
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
  console.log(`Usage: node scripts/verify-local-culturepeople-backup.mjs [backup-dir] [options]

Verifies a local CulturePeople backup directory created by backup:local.

Options:
  --root <dir>                Backup root. Default: ${DEFAULT_BACKUP_ROOT}
  --latest                    Verify the newest timestamped backup under --root.
  --json                      Print machine-readable JSON only.
  --require-live-supabase     Fail if Supabase was backed up from local fallback.
  --require-sqlite            Fail if the unified SQLite snapshot is missing.
  --skip-sqlite               Do not inspect the unified SQLite snapshot.
  --sqlite-bin <cmd>          sqlite3 command for integrity checks. Default: sqlite3
  --supabase-fallback-max-age-days <n>
                              Warn when local Supabase fallback is older than this. Default: ${DEFAULT_SUPABASE_FALLBACK_MAX_AGE_DAYS}
  --fail-stale-supabase-fallback
                              Fail if local fallback is older than the threshold.
  --allow-not-ok              Do not fail solely because backup-manifest.ok is false.
`);
}

function expandHome(value) {
  const text = String(value || "");
  if (text === "~") return os.homedir();
  if (text.startsWith("~/")) return path.join(os.homedir(), text.slice(2));
  return text;
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

function latestBackupDir(root) {
  if (!fs.existsSync(root)) return "";
  return fs.readdirSync(root)
    .filter((name) => /^\d{4}-\d{2}-\d{2}T/.test(name))
    .map((name) => path.join(root, name))
    .filter((item) => fs.existsSync(path.join(item, "backup-manifest.json")))
    .sort()
    .at(-1) || "";
}

function requireArray(value, report, label) {
  if (!Array.isArray(value)) {
    report.errors.push(`${label} must be a JSON array.`);
    return [];
  }
  return value;
}

function relativeFile(backupDir, file) {
  const text = String(file || "");
  return path.isAbsolute(text) ? text : path.join(backupDir, text);
}

function countByStatus(files) {
  return files.reduce((counts, file) => {
    const status = String(file?.status || "unknown");
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
}

function toPositiveInt(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.floor(number);
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

function buildSupabaseFallbackStatus(supabaseManifest, maxAgeDays) {
  const used = supabaseManifest?.fallback_used === true;
  const generatedAt = supabaseManifest?.fallback_generated_at || null;
  const ageDays = used ? ageDaysFromNow(generatedAt) : null;
  const remoteErrors = Array.isArray(supabaseManifest?.remote_errors)
    ? supabaseManifest.remote_errors.filter(Boolean)
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

function verifyMediaFiles({ backupDir, mediaManifest, report }) {
  const files = Array.isArray(mediaManifest?.files) ? mediaManifest.files : [];
  const materialized = files.filter((file) => ["downloaded", "reused"].includes(file?.status));
  let checked = 0;
  let bytes = 0;

  for (const file of materialized) {
    const filePath = relativeFile(backupDir, file.file);
    if (!fs.existsSync(filePath)) {
      report.errors.push(`media file missing for ${file.status}: ${filePath}`);
      continue;
    }
    const stat = fs.statSync(filePath);
    checked += 1;
    bytes += stat.size;
    if (Number(file.bytes || 0) > 0 && stat.size !== Number(file.bytes)) {
      report.errors.push(`media file size mismatch: ${filePath} expected ${file.bytes}, got ${stat.size}`);
    }
  }

  return {
    checked,
    expected: materialized.length,
    bytes,
    statusCounts: countByStatus(files),
  };
}

function readSqliteCounts({ sqliteBin, sqliteFile }) {
  const output = execFileSync(sqliteBin, [
    sqliteFile,
    [
      "PRAGMA integrity_check;",
      "SELECT COUNT(*) FROM articles;",
      "SELECT COUNT(*) FROM raw_rows;",
      "SELECT COUNT(*) FROM media_candidates;",
      "SELECT COUNT(*) FROM media_files;",
    ].join(" "),
  ], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  }).trim();
  const [integrity, articles, rawRows, mediaCandidates, mediaFiles] = output.split(/\r?\n/);
  return {
    integrity,
    articles: Number(articles),
    rawRows: Number(rawRows),
    mediaCandidates: Number(mediaCandidates),
    mediaFiles: Number(mediaFiles),
  };
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

function verifySqliteSnapshot({ backupDir, flags, options, expected, report }) {
  const sqliteFile = path.join(backupDir, DEFAULT_SQLITE_FILE);
  const summary = {
    present: false,
    file: sqliteFile,
    bytes: 0,
    integrityOk: false,
    articles: null,
    rawRows: null,
    mediaCandidates: null,
    mediaFiles: null,
  };

  if (flags.has("skip-sqlite")) return summary;

  if (!fs.existsSync(sqliteFile)) {
    const message = `SQLite snapshot missing: ${sqliteFile}`;
    if (flags.has("require-sqlite")) report.errors.push(message);
    else report.warnings.push(message);
    return summary;
  }

  summary.present = true;
  summary.bytes = fs.statSync(sqliteFile).size;

  const header = readFileHeader(sqliteFile, 16);
  if (header !== "SQLite format 3\u0000") {
    report.errors.push(`SQLite snapshot has an invalid header: ${sqliteFile}`);
    return summary;
  }

  try {
    const counts = readSqliteCounts({
      sqliteBin: options.sqliteBin,
      sqliteFile,
    });
    summary.integrityOk = counts.integrity === "ok";
    summary.articles = counts.articles;
    summary.rawRows = counts.rawRows;
    summary.mediaCandidates = counts.mediaCandidates;
    summary.mediaFiles = counts.mediaFiles;

    if (!summary.integrityOk) {
      report.errors.push(`SQLite integrity_check failed: ${counts.integrity || "(empty)"}`);
    }
    if (summary.articles !== expected.articles) {
      report.errors.push(`SQLite article count mismatch: sqlite=${summary.articles}, expected=${expected.articles}`);
    }
    if (summary.rawRows !== expected.rawRows) {
      report.errors.push(`SQLite raw row count mismatch: sqlite=${summary.rawRows}, expected=${expected.rawRows}`);
    }
    if (summary.mediaCandidates !== expected.mediaCandidates) {
      report.errors.push(`SQLite media candidate count mismatch: sqlite=${summary.mediaCandidates}, expected=${expected.mediaCandidates}`);
    }
    if (summary.mediaFiles !== expected.mediaFiles) {
      report.errors.push(`SQLite media file count mismatch: sqlite=${summary.mediaFiles}, expected=${expected.mediaFiles}`);
    }
  } catch (error) {
    const message = `SQLite snapshot could not be inspected with ${options.sqliteBin}: ${error instanceof Error ? error.message : String(error)}`;
    if (flags.has("require-sqlite")) report.errors.push(message);
    else report.warnings.push(message);
  }

  return summary;
}

function verifyBackup({ backupDir, flags, options }) {
  const report = {
    ok: false,
    backupDir,
    generatedAt: new Date().toISOString(),
    errors: [],
    warnings: [],
    summary: {
      d1Rows: 0,
      supabaseRows: 0,
      mergedArticles: 0,
      duplicateArticles: 0,
      mediaCandidates: 0,
      mediaDownloaded: 0,
      mediaReused: 0,
      mediaFilesChecked: 0,
      sqlite: null,
      supabaseFallback: null,
    },
  };

  if (!backupDir || !fs.existsSync(backupDir)) {
    report.errors.push(`backup directory missing: ${backupDir || "(empty)"}`);
    return report;
  }

  const manifest = readJson(path.join(backupDir, "backup-manifest.json"), report, "backup manifest");
  const d1Manifest = readJson(path.join(backupDir, "raw", "d1", "export-manifest.json"), report, "D1 export manifest");
  const supabaseManifest = readJson(path.join(backupDir, "raw", "supabase", "export-manifest.json"), report, "Supabase export manifest");
  const d1Articles = requireArray(
    readJson(path.join(backupDir, "raw", "d1", "tables", "articles.json"), report, "D1 articles"),
    report,
    "D1 articles",
  );
  const supabaseArticles = requireArray(
    readJson(path.join(backupDir, "raw", "supabase", "tables", "articles.json"), report, "Supabase articles"),
    report,
    "Supabase articles",
  );
  const mergedArticles = requireArray(
    readJson(path.join(backupDir, "merged", "articles.json"), report, "merged articles"),
    report,
    "merged articles",
  );
  const mergeReport = readJson(path.join(backupDir, "merged", "merge-report.json"), report, "merge report");
  const mediaCandidates = requireArray(
    readJson(path.join(backupDir, "merged", "media-candidates.json"), report, "media candidates"),
    report,
    "media candidates",
  );
  const mediaManifest = readJson(path.join(backupDir, "media", "media-manifest.json"), report, "media manifest");

  report.summary.d1Rows = Number(d1Manifest?.tables?.reduce?.((sum, table) => sum + Number(table.rows || 0), 0) || 0);
  report.summary.supabaseRows = Number(supabaseManifest?.tables?.reduce?.((sum, table) => sum + Number(table.rows || 0), 0) || 0);
  report.summary.mergedArticles = mergedArticles.length;
  report.summary.duplicateArticles = Number(mergeReport?.duplicates?.length || 0);
  report.summary.mediaCandidates = mediaCandidates.length;
  report.summary.mediaDownloaded = Number(mediaManifest?.downloaded || 0);
  report.summary.mediaReused = Number(mediaManifest?.reused || 0);

  if (manifest && manifest.ok === false && !flags.has("allow-not-ok")) {
    report.errors.push("backup-manifest.ok is false.");
  }
  if (d1Manifest && d1Manifest.ok !== true) {
    report.errors.push("D1 export manifest is not ok.");
  }
  if (supabaseManifest && supabaseManifest.ok !== true) {
    report.errors.push("Supabase export manifest is not ok.");
  }
  if (supabaseManifest?.fallback_used) {
    const fallback = buildSupabaseFallbackStatus(supabaseManifest, options.supabaseFallbackMaxAgeDays);
    report.summary.supabaseFallback = fallback;
    const message = `Supabase used local fallback snapshot from ${fallback.generatedAt || "unknown time"}; age=${formatDays(fallback.ageDays)}.`;
    if (flags.has("require-live-supabase")) report.errors.push(message);
    else report.warnings.push(message);
    if (fallback.stale) {
      const staleMessage = `Supabase fallback snapshot is stale: age=${formatDays(fallback.ageDays)}, threshold=${fallback.maxAgeDays}d.`;
      if (flags.has("fail-stale-supabase-fallback")) report.errors.push(staleMessage);
      else report.warnings.push(staleMessage);
    }
    if (fallback.remoteErrors.length) {
      report.warnings.push(`Supabase live export error: ${fallback.remoteErrors.join("; ")}`);
    }
  }

  if (manifest?.merge?.kept?.total != null && Number(manifest.merge.kept.total) !== mergedArticles.length) {
    report.errors.push(`merged article count mismatch: manifest=${manifest.merge.kept.total}, file=${mergedArticles.length}`);
  }
  if (mergeReport?.raw?.d1 != null && Number(mergeReport.raw.d1) !== d1Articles.length) {
    report.errors.push(`D1 raw article count mismatch: merge-report=${mergeReport.raw.d1}, file=${d1Articles.length}`);
  }
  if (mergeReport?.raw?.supabase != null && Number(mergeReport.raw.supabase) !== supabaseArticles.length) {
    report.errors.push(`Supabase raw article count mismatch: merge-report=${mergeReport.raw.supabase}, file=${supabaseArticles.length}`);
  }
  if (manifest?.media?.candidates != null && Number(manifest.media.candidates) !== mediaCandidates.length) {
    report.errors.push(`media candidate count mismatch: manifest=${manifest.media.candidates}, file=${mediaCandidates.length}`);
  }
  if (mediaManifest?.candidates != null && Number(mediaManifest.candidates) !== mediaCandidates.length) {
    report.errors.push(`media manifest candidate count mismatch: manifest=${mediaManifest.candidates}, file=${mediaCandidates.length}`);
  }

  const mediaCheck = verifyMediaFiles({ backupDir, mediaManifest, report });
  report.summary.mediaFilesChecked = mediaCheck.checked;
  report.summary.mediaFilesExpected = mediaCheck.expected;
  report.summary.mediaBytesChecked = mediaCheck.bytes;
  report.summary.mediaStatusCounts = mediaCheck.statusCounts;
  report.summary.sqlite = verifySqliteSnapshot({
    backupDir,
    flags,
    options,
    expected: {
      articles: mergedArticles.length,
      rawRows: report.summary.d1Rows + report.summary.supabaseRows,
      mediaCandidates: mediaCandidates.length,
      mediaFiles: Array.isArray(mediaManifest?.files) ? mediaManifest.files.length : 0,
    },
    report,
  });

  const indexPath = manifest?.media?.media_url_index || mediaManifest?.media_url_index || "";
  if (indexPath) {
    const mediaIndex = readJson(indexPath, report, "media URL index");
    const entries = mediaIndex?.entries && typeof mediaIndex.entries === "object" ? mediaIndex.entries : {};
    const indexed = Object.keys(entries).length;
    report.summary.mediaUrlIndexEntries = indexed;
    if (indexed < mediaCheck.expected) {
      report.warnings.push(`media URL index has fewer entries (${indexed}) than materialized files (${mediaCheck.expected}).`);
    }
  }

  if (mergedArticles.length === 0) report.errors.push("merged articles are empty.");
  if (d1Articles.length === 0) report.warnings.push("D1 articles are empty.");
  if (supabaseArticles.length === 0) report.warnings.push("Supabase articles are empty.");

  report.ok = report.errors.length === 0;
  return report;
}

function printHuman(report) {
  console.log("CulturePeople local backup verification");
  console.log(`- ok: ${report.ok}`);
  console.log(`- backup: ${report.backupDir}`);
  console.log(`- D1 rows: ${report.summary.d1Rows}`);
  console.log(`- Supabase rows: ${report.summary.supabaseRows}`);
  console.log(`- merged articles: ${report.summary.mergedArticles}`);
  console.log(`- duplicate articles: ${report.summary.duplicateArticles}`);
  console.log(`- media candidates: ${report.summary.mediaCandidates}`);
  console.log(`- media downloaded/reused: ${report.summary.mediaDownloaded}/${report.summary.mediaReused}`);
  console.log(`- media files checked: ${report.summary.mediaFilesChecked}/${report.summary.mediaFilesExpected || 0}`);
  if (report.summary.sqlite) {
    const sqlite = report.summary.sqlite;
    console.log(`- SQLite snapshot: ${sqlite.present ? `${sqlite.file} (${sqlite.bytes} bytes, integrity=${sqlite.integrityOk})` : "missing"}`);
  }
  if (report.summary.mediaUrlIndexEntries != null) {
    console.log(`- media URL index entries: ${report.summary.mediaUrlIndexEntries}`);
  }
  if (report.summary.supabaseFallback?.used) {
    const fallback = report.summary.supabaseFallback;
    console.log(`- Supabase fallback age: ${formatDays(fallback.ageDays)} (threshold ${fallback.maxAgeDays}d, stale=${fallback.stale})`);
  }
  for (const warning of report.warnings) console.log(`- warning: ${warning}`);
  for (const error of report.errors) console.log(`- error: ${error}`);
}

const { flags, values, positionals } = parseArgs(process.argv.slice(2));
if (flags.has("help") || flags.has("h")) {
  printHelp();
  process.exit(0);
}

const root = path.resolve(expandHome(values.root || DEFAULT_BACKUP_ROOT));
const backupDir = path.resolve(expandHome(positionals[0] || (flags.has("latest") ? latestBackupDir(root) : latestBackupDir(root))));
const report = verifyBackup({
  backupDir,
  flags,
  options: {
    supabaseFallbackMaxAgeDays: toPositiveInt(
      values["supabase-fallback-max-age-days"],
      DEFAULT_SUPABASE_FALLBACK_MAX_AGE_DAYS,
    ),
    sqliteBin: values["sqlite-bin"] || "sqlite3",
  },
});

if (flags.has("json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printHuman(report);
}

if (!report.ok) process.exitCode = 1;
