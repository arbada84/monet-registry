#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_BACKUP_ROOT = path.join(os.homedir(), "culturepeople-backups");
const DEFAULT_DAILY_NEW_MEDIA = 300;
const DEFAULT_LOCK_STALE_MINUTES = 12 * 60;

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

function buildStatus({ root, dailyNewMedia, lockStaleMinutes }) {
  const errors = [];
  const warnings = [];
  const backupDir = latestBackupDir(root);
  const mediaStore = path.join(root, "_media-store", "files");
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

  if (manifest?.sources?.supabase?.fallback_used) {
    warnings.push(`Supabase fallback snapshot is in use from ${manifest.sources.supabase.fallback_generated_at || "unknown time"}.`);
  }
  if (missingIndexedUrls > 0) {
    warnings.push(`${missingIndexedUrls} indexed media URLs do not have a readable local file.`);
  }
  if (manifest && manifest.ok === false) {
    warnings.push("Latest backup manifest is not ok.");
  }
  if (disk.supported && disk.availableBytes < 10 * 1024 * 1024 * 1024) {
    warnings.push(`Backup disk has less than 10 GB available (${formatBytes(disk.availableBytes)}).`);
  }
  if (lock.present && lock.running) {
    warnings.push(`Backup lock is present and appears to be running${lock.info?.pid ? ` (pid ${lock.info.pid})` : ""}.`);
  } else if (lock.present && lock.stale) {
    warnings.push(`Backup lock appears stale after ${lock.ageMinutes} minutes.`);
  } else if (lock.present) {
    warnings.push(`Backup lock is present but not stale yet (${lock.ageMinutes} minutes old).`);
  }

  return {
    ok: errors.length === 0,
    generatedAt: new Date().toISOString(),
    root,
    latestBackupDir: backupDir || null,
    latestBackup: manifest ? {
      ok: manifest.ok === true,
      generatedAt: manifest.generated_at || null,
      completedAt: manifest.completed_at || null,
      mergedArticles: Number(manifest.merge?.kept?.total || 0),
      duplicateArticles: Number(manifest.merge?.duplicates?.length || 0),
      d1Rows: Number(manifest.sources?.d1?.tables?.reduce?.((sum, table) => sum + Number(table.rows || 0), 0) || 0),
      supabaseRows: Number(manifest.sources?.supabase?.tables?.reduce?.((sum, table) => sum + Number(table.rows || 0), 0) || 0),
      supabaseSource: manifest.sources?.supabase?.source || null,
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
    lock,
    warnings,
    errors,
  };
}

function printHuman(status) {
  console.log("CulturePeople local backup status");
  console.log(`- ok: ${status.ok}`);
  console.log(`- root: ${status.root}`);
  console.log(`- latest backup: ${status.latestBackupDir || "(none)"}`);
  if (status.latestBackup) {
    console.log(`- latest backup ok: ${status.latestBackup.ok}`);
    console.log(`- completed at: ${status.latestBackup.completedAt || "(unknown)"}`);
    console.log(`- merged articles: ${status.latestBackup.mergedArticles}`);
    console.log(`- duplicate articles: ${status.latestBackup.duplicateArticles}`);
    console.log(`- D1/Supabase rows: ${status.latestBackup.d1Rows}/${status.latestBackup.supabaseRows}`);
    console.log(`- Supabase source: ${status.latestBackup.supabaseSource || "(unknown)"}`);
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
  if (status.lock?.present) {
    const pid = status.lock.info?.pid ? ` pid=${status.lock.info.pid}` : "";
    const startedAt = status.lock.info?.startedAt ? ` started=${status.lock.info.startedAt}` : "";
    console.log(`- backup lock: present running=${status.lock.running} stale=${status.lock.stale} age=${status.lock.ageMinutes}m${pid}${startedAt}`);
  } else {
    console.log("- backup lock: clear");
  }
  console.log(`- latest run downloaded/reused/failed: ${status.media.latestRunDownloaded}/${status.media.latestRunReused}/${status.media.latestRunFailed}`);
  console.log(`- latest run retried/retry attempts: ${status.media.latestRunRetried}/${status.media.latestRunRetryAttempts}`);
  console.log(`- estimated runs remaining at ${status.media.dailyNewMedia}/run: ${status.media.estimatedRunsRemaining}`);
  for (const warning of status.warnings) console.log(`- warning: ${warning}`);
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
  const status = buildStatus({ root, dailyNewMedia, lockStaleMinutes });

  if (flags.has("json")) console.log(JSON.stringify(status, null, 2));
  else printHuman(status);

  if (!status.ok) process.exitCode = 1;
}

main();
