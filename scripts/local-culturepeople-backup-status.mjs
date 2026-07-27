#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_BACKUP_ROOT,
  backupSecondCopyConfigFile,
  readConfiguredBackupSecondCopyRoot,
} from "./lib/backup-root.mjs";
const DEFAULT_DAILY_NEW_MEDIA = 300;
const DEFAULT_LOCK_STALE_MINUTES = 12 * 60;
const DEFAULT_SUPABASE_FALLBACK_MAX_AGE_DAYS = 3;
const DEFAULT_BACKUP_RPO_HOURS = 24;
const DEFAULT_SQLITE_RTO_HOURS = 4;
const DEFAULT_FULL_RTO_HOURS = 24;
const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_DISK_WARNING_GB = 30;
const DEFAULT_DISK_DANGER_GB = 20;
const DEFAULT_DISK_BLOCK_GB = 10;
const DEFAULT_DISK_WARNING_USED_PERCENT = 80;
const DEFAULT_DISK_DANGER_USED_PERCENT = 90;
const DEFAULT_DISK_BLOCK_USED_PERCENT = 95;
const DEFAULT_SECOND_COPY_MAX_LAG_HOURS = 24;
const DEFAULT_IMAGE_BACKFILL_WINDOW_HOURS = 24;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

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
  console.log(`Usage: node scripts/local-culturepeople-backup-status.mjs [options]

Summarizes local CulturePeople backup progress without remote network access.

Options:
  --root <dir>              Backup root. Default: ${DEFAULT_BACKUP_ROOT}
  --json                    Print machine-readable JSON only.
  --daily-new-media <n>     Batch size for remaining-run estimate. Default: ${DEFAULT_DAILY_NEW_MEDIA}
  --lock-stale-minutes <n>  Stale-lock threshold. Default: ${DEFAULT_LOCK_STALE_MINUTES}
  --supabase-fallback-max-age-days <n>
                            Warn when local Supabase fallback is older than this. Default: ${DEFAULT_SUPABASE_FALLBACK_MAX_AGE_DAYS}
  --fail-stale-supabase-fallback
                            Exit non-zero when fallback is older than the threshold.
  --backup-rpo-hours <n>    Warn when latest backup is older than this. Default: ${DEFAULT_BACKUP_RPO_HOURS}
  --sqlite-rto-hours <n>    Target SQLite read-recovery time. Default: ${DEFAULT_SQLITE_RTO_HOURS}
  --full-rto-hours <n>      Target full service recovery time. Default: ${DEFAULT_FULL_RTO_HOURS}
  --retention-days <n>      Backup retention target. Default: ${DEFAULT_RETENTION_DAYS}
  --disk-warning-gb <n>     Warn below this free-space threshold. Default: ${DEFAULT_DISK_WARNING_GB}
  --disk-danger-gb <n>      Mark disk danger below this threshold. Default: ${DEFAULT_DISK_DANGER_GB}
  --disk-block-gb <n>       Backup-run block threshold. Default: ${DEFAULT_DISK_BLOCK_GB}
  --disk-warning-used-percent <n>
                            Warn when disk used percent is at least this. Default: ${DEFAULT_DISK_WARNING_USED_PERCENT}
  --disk-danger-used-percent <n>
                            Mark disk danger when disk used percent is at least this. Default: ${DEFAULT_DISK_DANGER_USED_PERCENT}
  --disk-block-used-percent <n>
                            Block backup apply when disk used percent is at least this. Default: ${DEFAULT_DISK_BLOCK_USED_PERCENT}
  --second-copy <dir>       Optional second backup root to summarize. Defaults to CULTUREPEOPLE_BACKUP_SECOND_COPY or ${backupSecondCopyConfigFile()}
  --second-copy-max-lag-hours <n>
                            Warn when second copy latest backup lags by more than this. Default: ${DEFAULT_SECOND_COPY_MAX_LAG_HOURS}
  --image-backfill-window-hours <n>
                            Warn when image backfill adds 0 files in this window. Default: ${DEFAULT_IMAGE_BACKFILL_WINDOW_HOURS}
`);
}

function expandHome(value) {
  const text = String(value || "");
  if (text === "~") return os.homedir();
  if (text.startsWith("~/")) return path.join(os.homedir(), text.slice(2));
  return text;
}

function readJson(filePath, errors, label) {
  if (!fs.existsSync(filePath)) {
    errors.push(`${label} missing: ${filePath}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    errors.push(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
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

function countFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return { files: 0, bytes: 0 };
  let files = 0;
  let bytes = 0;
  const stack = [dirPath];

  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        files += 1;
        bytes += fs.statSync(fullPath).size;
      }
    }
  }

  return { files, bytes };
}

function indexFilePath(entry, root) {
  if (!entry || typeof entry !== "object") return "";
  if (entry.media_store_file) return path.resolve(root, entry.media_store_file);
  if (entry.storage === "media_store" && entry.file) return path.resolve(root, entry.file);
  if (entry.backup_dir && entry.file) return path.resolve(entry.backup_dir, entry.file);
  if (entry.file) return path.resolve(root, entry.file);
  return "";
}

function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function nearestExistingPath(targetPath) {
  let current = path.resolve(targetPath);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

function bytesFromStatfs(value) {
  return Number(value || 0);
}

function readDiskStats(root) {
  if (typeof fs.statfsSync !== "function") {
    return {
      supported: false,
      path: nearestExistingPath(root),
    };
  }

  const statPath = nearestExistingPath(root);
  const stats = fs.statfsSync(statPath);
  const blockSize = bytesFromStatfs(stats.bsize);
  const totalBytes = bytesFromStatfs(stats.blocks) * blockSize;
  const freeBytes = bytesFromStatfs(stats.bfree) * blockSize;
  const availableBytes = bytesFromStatfs(stats.bavail) * blockSize;
  const usedBytes = Math.max(0, totalBytes - freeBytes);

  return {
    supported: true,
    path: statPath,
    totalBytes,
    freeBytes,
    availableBytes,
    usedBytes,
    usedPercent: percent(usedBytes, totalBytes),
    availablePercent: percent(availableBytes, totalBytes),
  };
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const precision = size >= 100 || unit === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(precision)} ${units[unit]}`;
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

function ageHoursFromNow(value) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, (Date.now() - timestamp) / MS_PER_HOUR);
}

function formatDays(value) {
  const days = Number(value);
  if (!Number.isFinite(days)) return "unknown";
  return `${Math.round(days * 10) / 10}d`;
}

function formatHours(value) {
  const hours = Number(value);
  if (!Number.isFinite(hours)) return "unknown";
  return `${Math.round(hours * 10) / 10}h`;
}

function gbToBytes(value) {
  return Number(value || 0) * 1024 * 1024 * 1024;
}

function buildSupabaseFallbackStatus(supabaseSource, maxAgeDays) {
  const used = supabaseSource?.fallback_used === true;
  const generatedAt = supabaseSource?.fallback_generated_at || null;
  const ageDays = used ? ageDaysFromNow(generatedAt) : null;
  const remoteErrors = Array.isArray(supabaseSource?.remote_errors)
    ? supabaseSource.remote_errors.filter(Boolean)
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

function backupNameTime(name) {
  const match = String(name || "").match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/);
  if (!match) return Number.NaN;
  return Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`);
}

function buildSecondCopyStatus({ primaryLatestBackup, secondCopyRoot, maxLagHours }) {
  if (!secondCopyRoot) return null;

  const root = path.resolve(expandHome(secondCopyRoot));
  const warnings = [];
  const latest = latestBackupDir(root);
  const manifest = latest ? readJson(path.join(latest, "backup-manifest.json"), warnings, "second copy backup manifest") : null;
  const mediaIndexFile = path.join(root, "media-url-index.json");
  const sqliteFile = latest ? path.join(latest, "merged", "culturepeople.sqlite") : "";
  const primaryName = primaryLatestBackup ? path.basename(primaryLatestBackup) : null;
  const latestName = latest ? path.basename(latest) : null;
  const primaryTime = backupNameTime(primaryName);
  const copyTime = backupNameTime(latestName);
  const lagHours = Number.isFinite(primaryTime) && Number.isFinite(copyTime)
    ? Math.max(0, (primaryTime - copyTime) / MS_PER_HOUR)
    : null;

  if (!fs.existsSync(root)) warnings.push(`Second copy root missing: ${root}`);
  if (!latest) warnings.push(`No timestamped backup found in second copy root: ${root}`);
  if (primaryName && latestName && primaryName !== latestName) warnings.push(`Second copy latest backup differs from primary: primary=${primaryName}, second=${latestName}`);
  if (lagHours != null && lagHours > maxLagHours) warnings.push(`Second copy lags primary by ${formatHours(lagHours)}; target=${maxLagHours}h.`);
  if (latest && !fs.existsSync(sqliteFile)) warnings.push(`Second copy SQLite snapshot missing: ${sqliteFile}`);
  if (!fs.existsSync(mediaIndexFile)) warnings.push(`Second copy media-url-index.json missing: ${mediaIndexFile}`);

  const status = !latest
    ? "missing"
    : warnings.length
      ? "warning"
      : "ok";

  return {
    configured: true,
    root,
    latestBackupDir: latest || null,
    latestBackupName: latestName,
    primaryLatestBackupName: primaryName,
    lagHours,
    maxLagHours,
    mediaIndexPresent: fs.existsSync(mediaIndexFile),
    sqlitePresent: Boolean(sqliteFile && fs.existsSync(sqliteFile)),
    completedAt: manifest?.completed_at || manifest?.generated_at || null,
    disk: readDiskStats(root),
    status,
    warnings,
  };
}

function isProcessAlive(pid) {
  const number = Number(pid);
  if (!Number.isInteger(number) || number <= 0) return false;
  try {
    process.kill(number, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function readLockStatus(root, staleMinutes) {
  const lockDir = path.join(root, ".backup.lock");
  const lockFile = path.join(lockDir, "lock.json");
  if (!fs.existsSync(lockDir)) {
    return {
      present: false,
      stale: false,
      running: false,
      path: lockDir,
      ageMinutes: null,
      info: null,
    };
  }

  let info = null;
  try {
    info = fs.existsSync(lockFile) ? JSON.parse(fs.readFileSync(lockFile, "utf8")) : null;
  } catch {
    info = null;
  }

  const stat = fs.statSync(lockDir);
  const ageMinutes = Math.max(0, Math.round((Date.now() - stat.mtimeMs) / 6000) / 10);
  const sameHost = !info?.hostname || info.hostname === os.hostname();
  const running = sameHost && isProcessAlive(info?.pid);
  const stale = !running && ageMinutes >= staleMinutes;

  return {
    present: true,
    stale,
    running,
    path: lockDir,
    ageMinutes,
    staleMinutes,
    info: info ? {
      pid: info.pid || null,
      hostname: info.hostname || null,
      platform: info.platform || null,
      runId: info.run_id || null,
      startedAt: info.started_at || null,
    } : null,
  };
}

function readImageBackfillWindow(root, windowHours) {
  const runDir = path.join(root, "_image-backfill-runs");
  const windowMs = windowHours * MS_PER_HOUR;
  if (!fs.existsSync(runDir)) {
    return {
      runDir,
      windowHours,
      runs: 0,
      addedFiles: 0,
      downloaded: 0,
      failed: 0,
      deferredDns: 0,
      latestRunAt: null,
    };
  }

  const since = Date.now() - windowMs;
  let runs = 0;
  let addedFiles = 0;
  let downloaded = 0;
  let failed = 0;
  let deferredDns = 0;
  let latestRunAt = null;

  for (const name of fs.readdirSync(runDir)) {
    if (!/^image-backfill-.*\.json$/.test(name)) continue;
    const filePath = path.join(runDir, name);
    let run = null;
    try {
      run = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      continue;
    }
    const time = Date.parse(String(run?.generated_at || ""));
    if (!Number.isFinite(time)) continue;
    if (!latestRunAt || time > Date.parse(latestRunAt)) latestRunAt = new Date(time).toISOString();
    if (time < since) continue;
    const media = run.media || {};
    runs += 1;
    addedFiles += Math.max(0, Number(media.materialized_after || 0) - Number(media.materialized_before || 0));
    downloaded += Number(media.downloaded || 0);
    failed += Number(media.failed || 0);
    deferredDns += Number(media.deferred_dns || 0);
  }

  return {
    runDir,
    windowHours,
    runs,
    addedFiles,
    downloaded,
    failed,
    deferredDns,
    latestRunAt,
  };
}

function buildStatus({
  root,
  dailyNewMedia,
  lockStaleMinutes,
  supabaseFallbackMaxAgeDays,
  failStaleSupabaseFallback,
  backupRpoHours,
  sqliteRtoHours,
  fullRtoHours,
  retentionDays,
  diskWarningGb,
  diskDangerGb,
  diskBlockGb,
  diskWarningUsedPercent,
  diskDangerUsedPercent,
  diskBlockUsedPercent,
  secondCopyRoot,
  secondCopyMaxLagHours,
  imageBackfillWindowHours,
}) {
  const errors = [];
  const warnings = [];
  const nextActions = [];
  const backupDir = latestBackupDir(root);
  const mediaStore = path.join(root, "_media-store", "files");
  const latestImageBackfill = readJson(path.join(root, "_image-backfill-runs", "latest.json"), [], "latest image backfill") || null;
  const imageBackfillWindow = readImageBackfillWindow(root, imageBackfillWindowHours);
  const mediaStoreStats = countFiles(mediaStore);
  const disk = readDiskStats(root);
  const lock = readLockStatus(root, lockStaleMinutes);
  const indexPath = path.join(root, "media-url-index.json");

  if (!backupDir) {
    errors.push(`No backup-manifest.json found under ${root}.`);
  }

  const manifest = backupDir ? readJson(path.join(backupDir, "backup-manifest.json"), errors, "backup manifest") : null;
  const mediaManifest = backupDir ? readJson(path.join(backupDir, "media", "media-manifest.json"), errors, "media manifest") : null;
  const mediaCandidates = backupDir
    ? readJson(path.join(backupDir, "merged", "media-candidates.json"), errors, "media candidates")
    : null;
  const sqliteFile = backupDir ? path.join(backupDir, "merged", "culturepeople.sqlite") : "";
  const sqlitePresent = Boolean(sqliteFile && fs.existsSync(sqliteFile));
  const sqliteBytes = sqlitePresent ? fs.statSync(sqliteFile).size : 0;
  const mediaIndex = fs.existsSync(indexPath) ? readJson(indexPath, errors, "media URL index") : { entries: {} };

  const candidates = Array.isArray(mediaCandidates) ? mediaCandidates : [];
  const downloadable = candidates.filter((candidate) => candidate?.download_allowed);
  const indexEntries = mediaIndex?.entries && typeof mediaIndex.entries === "object" ? mediaIndex.entries : {};
  let materializedUrls = 0;
  let missingIndexedUrls = 0;

  for (const candidate of downloadable) {
    const entry = indexEntries[candidate.url];
    const filePath = indexFilePath(entry, root);
    if (filePath && fs.existsSync(filePath)) {
      materializedUrls += 1;
    } else if (entry) {
      missingIndexedUrls += 1;
    }
  }

  const remainingUrls = Math.max(0, downloadable.length - materializedUrls);
  const estimatedRunsRemaining = dailyNewMedia > 0 ? Math.ceil(remainingUrls / dailyNewMedia) : null;
  const estimatedBytesPerMediaUrl = materializedUrls > 0 ? Math.round(mediaStoreStats.bytes / materializedUrls) : 0;
  const estimatedRemainingMediaBytes = estimatedBytesPerMediaUrl * remainingUrls;
  const projectedAvailableBytesAfterMedia = disk.supported
    ? Math.max(0, Number(disk.availableBytes || 0) - estimatedRemainingMediaBytes)
    : null;
  const supabaseFallback = buildSupabaseFallbackStatus(
    manifest?.sources?.supabase,
    supabaseFallbackMaxAgeDays,
  );
  const latestBackupAgeHours = ageHoursFromNow(manifest?.completed_at || manifest?.generated_at);
  const diskWarningBytes = gbToBytes(diskWarningGb);
  const diskDangerBytes = gbToBytes(diskDangerGb);
  const diskBlockBytes = gbToBytes(diskBlockGb);
  const diskUsedPercent = Number(disk.usedPercent || 0);
  const diskFreeWarning = disk.supported && disk.availableBytes < diskWarningBytes;
  const diskFreeDanger = disk.supported && disk.availableBytes < diskDangerBytes;
  const diskFreeBlock = disk.supported && disk.availableBytes < diskBlockBytes;
  const diskUsedWarning = disk.supported && diskUsedPercent >= diskWarningUsedPercent;
  const diskUsedDanger = disk.supported && diskUsedPercent >= diskDangerUsedPercent;
  const diskUsedBlock = disk.supported && diskUsedPercent >= diskBlockUsedPercent;
  const backupFreshnessStatus = latestBackupAgeHours == null
    ? "unknown"
    : latestBackupAgeHours <= backupRpoHours
      ? "ok"
      : latestBackupAgeHours <= backupRpoHours * 2
        ? "warning"
        : "danger";
  const supabaseHealthStatus = supabaseFallback.used
    ? (supabaseFallback.stale ? "danger" : "warning")
    : "ok";
  const diskHealthStatus = disk.supported
    ? (diskFreeBlock || diskUsedBlock ? "block" : diskFreeDanger || diskUsedDanger ? "danger" : diskFreeWarning || diskUsedWarning ? "warning" : "ok")
    : "unknown";
  const secondCopy = buildSecondCopyStatus({
    primaryLatestBackup: backupDir,
    secondCopyRoot,
    maxLagHours: secondCopyMaxLagHours,
  });

  if (supabaseFallback.used) {
    warnings.push(
      `Supabase fallback snapshot is in use from ${supabaseFallback.generatedAt || "unknown time"}; age=${formatDays(supabaseFallback.ageDays)}.`,
    );
    if (supabaseFallback.stale) {
      const message = `Supabase fallback snapshot is stale: age=${formatDays(supabaseFallback.ageDays)}, threshold=${supabaseFallback.maxAgeDays}d.`;
      if (failStaleSupabaseFallback) errors.push(message);
      else warnings.push(message);
    }
    if (supabaseFallback.remoteErrors.length) {
      warnings.push(`Supabase live export error: ${supabaseFallback.remoteErrors.join("; ")}`);
    }
    nextActions.push("Run `pnpm supabase:recovery-check -- --require-storage` before attempting a fresh Supabase export.");
    nextActions.push("When the recovery check reports DB export ready, run the local backup once to refresh the Supabase fallback snapshot.");
  }
  if (missingIndexedUrls > 0) {
    warnings.push(`${missingIndexedUrls} indexed media URLs do not have a readable local file.`);
  }
  if (manifest && manifest.ok === false) {
    warnings.push("Latest backup manifest is not ok.");
  }
  if (latestBackupAgeHours != null && latestBackupAgeHours > backupRpoHours) {
    warnings.push(`Latest backup is older than RPO: age=${formatHours(latestBackupAgeHours)}, target=${backupRpoHours}h.`);
  }
  if (diskFreeWarning) {
    warnings.push(`Backup disk has less than ${diskWarningGb} GB available (${formatBytes(disk.availableBytes)}).`);
  }
  if (diskFreeDanger) {
    warnings.push(`Backup disk is below the ${diskDangerGb} GB danger threshold (${formatBytes(disk.availableBytes)}).`);
  }
  if (diskFreeBlock) {
    warnings.push(`Backup disk is below the ${diskBlockGb} GB backup-run block threshold (${formatBytes(disk.availableBytes)}).`);
  }
  if (diskUsedBlock) {
    warnings.push(`Backup disk is ${diskUsedPercent}% used, at or above the ${diskBlockUsedPercent}% apply-block threshold.`);
  } else if (diskUsedDanger) {
    warnings.push(`Backup disk is ${diskUsedPercent}% used, above the ${diskDangerUsedPercent}% danger threshold.`);
  } else if (diskUsedWarning) {
    warnings.push(`Backup disk is ${diskUsedPercent}% used, above the ${diskWarningUsedPercent}% warning threshold.`);
  }
  if (secondCopy) {
    for (const warning of secondCopy.warnings) warnings.push(warning);
    if (secondCopy.status !== "ok") {
      nextActions.push("Run `pnpm backup:local:sync-copy -- --target <second-copy> --apply` from the repo root, then verify the second copy restore-check.");
    }
  }
  if (lock.present && lock.running) {
    warnings.push(`Backup lock is present and appears to be running${lock.info?.pid ? ` (pid ${lock.info.pid})` : ""}.`);
  } else if (lock.present && lock.stale) {
    warnings.push(`Backup lock appears stale after ${lock.ageMinutes} minutes.`);
    nextActions.push(`Inspect ${lock.path} and remove it only after confirming no backup process is running.`);
  } else if (lock.present) {
    warnings.push(`Backup lock is present but not stale yet (${lock.ageMinutes} minutes old).`);
  }

  if (remainingUrls > 0 && Number(mediaManifest?.deferred_recent_failures || 0) > 0) {
    const hosts = Object.keys(mediaManifest?.deferred_recent_failure_hosts || {});
    nextActions.push(
      `Image backfill is safely deferring ${Number(mediaManifest?.deferred_recent_failures || 0)} URLs${hosts.length ? ` from ${hosts.slice(0, 3).join(", ")}` : ""}; avoid bulk retries until DNS or storage access recovers.`,
    );
  } else if (remainingUrls > 0) {
    nextActions.push("Let the hourly image backfill timer continue, or run one low-rate `pnpm backup:local:media-backfill` pass if disk/network are healthy.");
  }

  if (remainingUrls > 0 && imageBackfillWindow.runs === 0) {
    warnings.push(`No image backfill run was found in the last ${imageBackfillWindow.windowHours}h.`);
  } else if (remainingUrls > 0 && imageBackfillWindow.addedFiles === 0) {
    warnings.push(`Image backfill added 0 local files in the last ${imageBackfillWindow.windowHours}h.`);
  }

  const imageBackfillHealthStatus = remainingUrls === 0
    ? "ok"
    : imageBackfillWindow.runs === 0 || imageBackfillWindow.addedFiles === 0
      ? "warning"
      : "ok";

  return {
    ok: errors.length === 0,
    generatedAt: new Date().toISOString(),
    root,
    latestBackupDir: backupDir || null,
    latestBackup: manifest ? {
      ok: manifest.ok === true,
      generatedAt: manifest.generated_at || null,
      completedAt: manifest.completed_at || null,
      ageHours: latestBackupAgeHours,
      mergedArticles: Number(manifest.merge?.kept?.total || 0),
      duplicateArticles: Number(manifest.merge?.duplicates?.length || 0),
      d1Rows: Number(manifest.sources?.d1?.tables?.reduce?.((sum, table) => sum + Number(table.rows || 0), 0) || 0),
      supabaseRows: Number(manifest.sources?.supabase?.tables?.reduce?.((sum, table) => sum + Number(table.rows || 0), 0) || 0),
      supabaseSource: manifest.sources?.supabase?.source || null,
      supabaseFallback,
      sqlite: {
        present: sqlitePresent,
        file: sqliteFile || null,
        bytes: sqliteBytes,
      },
    } : null,
    media: {
      candidates: candidates.length,
      downloadable: downloadable.length,
      materializedUrls,
      remainingUrls,
      coveragePercent: percent(materializedUrls, downloadable.length),
      indexedUrls: Object.keys(indexEntries).length,
      missingIndexedUrls,
      mediaStoreFiles: mediaStoreStats.files,
      mediaStoreBytes: mediaStoreStats.bytes,
      estimatedBytesPerMediaUrl,
      estimatedRemainingMediaBytes,
      latestRunDownloaded: Number(mediaManifest?.downloaded || 0),
      latestRunReused: Number(mediaManifest?.reused || 0),
      latestRunFailed: Number(mediaManifest?.failed || 0),
      latestRunRetried: Number(mediaManifest?.retried || 0),
      latestRunRetryAttempts: Number(mediaManifest?.retry_attempts || 0),
      latestRunDeferredRecentFailures: Number(mediaManifest?.deferred_recent_failures || 0),
      latestRunDeferredRecentFailureHosts: mediaManifest?.deferred_recent_failure_hosts || {},
      latestRunSeededRecentFailures: Number(mediaManifest?.seeded_recent_failures || 0),
      latestRunSkippedByLimit: Number(mediaManifest?.skipped_by_limit || 0),
      dailyNewMedia,
      estimatedRunsRemaining,
    },
    disk: {
      ...disk,
      projectedAvailableBytesAfterMedia,
      projectedAvailablePercentAfterMedia: disk.supported
        ? percent(projectedAvailableBytesAfterMedia, disk.totalBytes)
        : null,
    },
    secondCopy,
    lock,
    imageBackfill: latestImageBackfill,
    imageBackfillWindow,
    targets: {
      backupRpoHours,
      sqliteRtoHours,
      fullRtoHours,
      retentionDays,
      diskWarningGb,
      diskDangerGb,
      diskBlockGb,
      diskWarningUsedPercent,
      diskDangerUsedPercent,
      diskBlockUsedPercent,
      secondCopyMaxLagHours,
      supabaseFallbackMaxAgeDays,
      imageBackfillWindowHours,
    },
    health: {
      backupFreshness: {
        status: backupFreshnessStatus,
        ageHours: latestBackupAgeHours,
        targetHours: backupRpoHours,
      },
      supabaseFallback: {
        status: supabaseHealthStatus,
        stale: supabaseFallback.stale,
        used: supabaseFallback.used,
      },
      disk: {
        status: diskHealthStatus,
        availableBytes: disk.availableBytes ?? null,
        usedPercent: disk.usedPercent ?? null,
        warningBytes: diskWarningBytes,
        dangerBytes: diskDangerBytes,
        blockBytes: diskBlockBytes,
        warningUsedPercent: diskWarningUsedPercent,
        dangerUsedPercent: diskDangerUsedPercent,
        blockUsedPercent: diskBlockUsedPercent,
      },
      secondCopy: {
        status: secondCopy?.status || "not_configured",
        lagHours: secondCopy?.lagHours ?? null,
        maxLagHours: secondCopyMaxLagHours,
      },
      imageBackfill: {
        status: imageBackfillHealthStatus,
        windowHours: imageBackfillWindow.windowHours,
        addedFiles: imageBackfillWindow.addedFiles,
        runs: imageBackfillWindow.runs,
      },
      lock: {
        status: lock.present ? (lock.stale ? "danger" : "warning") : "ok",
      },
    },
    warnings,
    nextActions,
    errors,
  };
}

function printHuman(status) {
  console.log("CulturePeople local backup status");
  console.log(`- ok: ${status.ok}`);
  console.log(`- root: ${status.root}`);
  console.log(`- targets: backup RPO ${status.targets.backupRpoHours}h, SQLite RTO ${status.targets.sqliteRtoHours}h, full RTO ${status.targets.fullRtoHours}h, retention ${status.targets.retentionDays}d`);
  console.log(`- latest backup: ${status.latestBackupDir || "(none)"}`);
  if (status.latestBackup) {
    console.log(`- latest backup ok: ${status.latestBackup.ok}`);
    console.log(`- completed at: ${status.latestBackup.completedAt || "(unknown)"}`);
    console.log(`- backup age: ${formatHours(status.latestBackup.ageHours)} (freshness ${status.health.backupFreshness.status})`);
    console.log(`- merged articles: ${status.latestBackup.mergedArticles}`);
    console.log(`- duplicate articles: ${status.latestBackup.duplicateArticles}`);
    console.log(`- D1/Supabase rows: ${status.latestBackup.d1Rows}/${status.latestBackup.supabaseRows}`);
    console.log(`- Supabase source: ${status.latestBackup.supabaseSource || "(unknown)"}`);
    if (status.latestBackup.sqlite?.present) {
      console.log(`- SQLite snapshot: ${status.latestBackup.sqlite.file} (${formatBytes(status.latestBackup.sqlite.bytes)})`);
    } else {
      console.log("- SQLite snapshot: missing");
    }
    if (status.latestBackup.supabaseFallback?.used) {
      const fallback = status.latestBackup.supabaseFallback;
      console.log(`- Supabase fallback age: ${formatDays(fallback.ageDays)} (threshold ${fallback.maxAgeDays}d, stale=${fallback.stale})`);
    }
  }
  console.log(`- media URLs backed up: ${status.media.materializedUrls}/${status.media.downloadable} (${status.media.coveragePercent}%)`);
  console.log(`- media URLs remaining: ${status.media.remainingUrls}`);
  console.log(`- media URL index entries: ${status.media.indexedUrls}`);
  console.log(`- media store files: ${status.media.mediaStoreFiles} (${formatBytes(status.media.mediaStoreBytes)})`);
  console.log(`- estimated remaining media size: ${formatBytes(status.media.estimatedRemainingMediaBytes)}`);
  if (status.disk?.supported) {
    console.log(`- backup disk available: ${formatBytes(status.disk.availableBytes)} (${status.disk.availablePercent}%)`);
    console.log(`- projected available after remaining media: ${formatBytes(status.disk.projectedAvailableBytesAfterMedia)} (${status.disk.projectedAvailablePercentAfterMedia}%)`);
  }
  if (status.secondCopy) {
    console.log(`- second copy: ${status.secondCopy.status} ${status.secondCopy.latestBackupName || "(none)"} root=${status.secondCopy.root}`);
    console.log(`- second copy lag: ${formatHours(status.secondCopy.lagHours)} (target ${status.secondCopy.maxLagHours}h), SQLite=${status.secondCopy.sqlitePresent}, mediaIndex=${status.secondCopy.mediaIndexPresent}`);
    if (status.secondCopy.disk?.supported) {
      console.log(`- second copy disk available: ${formatBytes(status.secondCopy.disk.availableBytes)} at ${status.secondCopy.disk.path}`);
    }
  }
  if (status.lock?.present) {
    const pid = status.lock.info?.pid ? ` pid=${status.lock.info.pid}` : "";
    const startedAt = status.lock.info?.startedAt ? ` started=${status.lock.info.startedAt}` : "";
    console.log(`- backup lock: present running=${status.lock.running} stale=${status.lock.stale} age=${status.lock.ageMinutes}m${pid}${startedAt}`);
  } else {
    console.log("- backup lock: clear");
  }
  console.log(`- latest run downloaded/reused/failed: ${status.media.latestRunDownloaded}/${status.media.latestRunReused}/${status.media.latestRunFailed}`);
  console.log(`- latest run retried/retry attempts: ${status.media.latestRunRetried}/${status.media.latestRunRetryAttempts}`);
  if (status.media.latestRunDeferredRecentFailures > 0) {
    const hosts = Object.entries(status.media.latestRunDeferredRecentFailureHosts || {})
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 3)
      .map(([host, count]) => `${host}:${count}`)
      .join(", ");
    console.log(`- latest run deferred recent media failures: ${status.media.latestRunDeferredRecentFailures}${hosts ? ` (${hosts})` : ""}`);
  }
  if (status.imageBackfill?.generated_at) {
    const media = status.imageBackfill.media || {};
    console.log(`- latest Python image backfill: ${status.imageBackfill.generated_at} downloaded/failed/deferred=${Number(media.downloaded || 0)}/${Number(media.failed || 0)}/${Number(media.deferred_dns || 0)}`);
  }
  console.log(`- image backfill last ${status.imageBackfillWindow.windowHours}h: runs=${status.imageBackfillWindow.runs}, +${status.imageBackfillWindow.addedFiles}, downloaded=${status.imageBackfillWindow.downloaded}, deferred_dns=${status.imageBackfillWindow.deferredDns}`);
  console.log(`- health: backup=${status.health.backupFreshness.status}, supabase=${status.health.supabaseFallback.status}, disk=${status.health.disk.status}, secondCopy=${status.health.secondCopy.status}, image=${status.health.imageBackfill.status}, lock=${status.health.lock.status}`);
  console.log(`- estimated runs remaining at ${status.media.dailyNewMedia}/run: ${status.media.estimatedRunsRemaining}`);
  for (const warning of status.warnings) console.log(`- warning: ${warning}`);
  for (const action of status.nextActions || []) console.log(`- next: ${action}`);
  for (const error of status.errors) console.log(`- error: ${error}`);
}

function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  if (flags.has("help") || flags.has("h")) {
    printHelp();
    return;
  }

  const root = path.resolve(expandHome(values.root || DEFAULT_BACKUP_ROOT));
  const dailyNewMedia = toPositiveInt(values["daily-new-media"], DEFAULT_DAILY_NEW_MEDIA);
  const lockStaleMinutes = toPositiveInt(values["lock-stale-minutes"], DEFAULT_LOCK_STALE_MINUTES);
  const supabaseFallbackMaxAgeDays = toPositiveInt(
    values["supabase-fallback-max-age-days"],
    DEFAULT_SUPABASE_FALLBACK_MAX_AGE_DAYS,
  );
  const backupRpoHours = toPositiveInt(values["backup-rpo-hours"], DEFAULT_BACKUP_RPO_HOURS);
  const sqliteRtoHours = toPositiveInt(values["sqlite-rto-hours"], DEFAULT_SQLITE_RTO_HOURS);
  const fullRtoHours = toPositiveInt(values["full-rto-hours"], DEFAULT_FULL_RTO_HOURS);
  const retentionDays = toPositiveInt(values["retention-days"], DEFAULT_RETENTION_DAYS);
  const diskWarningGb = toPositiveInt(values["disk-warning-gb"], DEFAULT_DISK_WARNING_GB);
  const diskDangerGb = toPositiveInt(values["disk-danger-gb"], DEFAULT_DISK_DANGER_GB);
  const diskBlockGb = toPositiveInt(values["disk-block-gb"], DEFAULT_DISK_BLOCK_GB);
  const diskWarningUsedPercent = toPositiveInt(values["disk-warning-used-percent"], DEFAULT_DISK_WARNING_USED_PERCENT);
  const diskDangerUsedPercent = toPositiveInt(values["disk-danger-used-percent"], DEFAULT_DISK_DANGER_USED_PERCENT);
  const diskBlockUsedPercent = toPositiveInt(values["disk-block-used-percent"], DEFAULT_DISK_BLOCK_USED_PERCENT);
  const secondCopyMaxLagHours = toPositiveInt(values["second-copy-max-lag-hours"], DEFAULT_SECOND_COPY_MAX_LAG_HOURS);
  const imageBackfillWindowHours = toPositiveInt(
    values["image-backfill-window-hours"],
    DEFAULT_IMAGE_BACKFILL_WINDOW_HOURS,
  );
  const status = buildStatus({
    root,
    dailyNewMedia,
    lockStaleMinutes,
    supabaseFallbackMaxAgeDays,
    failStaleSupabaseFallback: flags.has("fail-stale-supabase-fallback"),
    backupRpoHours,
    sqliteRtoHours,
    fullRtoHours,
    retentionDays,
    diskWarningGb,
    diskDangerGb,
    diskBlockGb,
    diskWarningUsedPercent,
    diskDangerUsedPercent,
    diskBlockUsedPercent,
    secondCopyRoot: values["second-copy"] || readConfiguredBackupSecondCopyRoot(),
    secondCopyMaxLagHours,
    imageBackfillWindowHours,
  });

  if (flags.has("json")) console.log(JSON.stringify(status, null, 2));
  else printHuman(status);

  if (!status.ok) process.exitCode = 1;
}

main();
