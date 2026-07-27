#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_BACKUP_ROOT as DEFAULT_SOURCE_ROOT } from "./lib/backup-root.mjs";
const DEFAULT_INCLUDE_LOGS_DAYS = 30;
const DEFAULT_MIN_FREE_GB = 10;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
  console.log(`Usage: node scripts/sync-local-backup-copy.mjs [options]

Creates or previews a second local copy of CulturePeople backups.
The default mode is dry-run. Use --apply to copy files.

Options:
  --source <dir>             Primary backup root. Default: ${DEFAULT_SOURCE_ROOT}
  --target <dir>             Second backup root. Required.
  --apply                    Actually copy files. Without this, dry-run is used.
  --dry-run                  Preview copy plan only.
  --include-logs-days <n>    Copy logs newer than this many days. Default: ${DEFAULT_INCLUDE_LOGS_DAYS}
  --min-free-gb <n>          Require this much target free space before apply. Default: ${DEFAULT_MIN_FREE_GB}
  --json                     Print machine-readable JSON only.
`);
}

function expandHome(value) {
  const text = String(value || "");
  if (text === "~") return os.homedir();
  if (text.startsWith("~/")) return path.join(os.homedir(), text.slice(2));
  return text;
}

function toNonNegativeInt(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.floor(number);
}

function gbToBytes(value) {
  return Number(value || 0) * 1024 * 1024 * 1024;
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const precision = size >= 100 || unit === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(precision)} ${units[unit]}`;
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

function readJson(filePath, warnings = []) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    warnings.push(`Could not parse JSON ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
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

function readDiskStats(targetPath) {
  if (typeof fs.statfsSync !== "function") {
    return { supported: false, path: nearestExistingPath(targetPath), availableBytes: null };
  }
  const statPath = nearestExistingPath(targetPath);
  const stats = fs.statfsSync(statPath);
  return {
    supported: true,
    path: statPath,
    availableBytes: Number(stats.bavail || 0) * Number(stats.bsize || 0),
  };
}

function isInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function addFile(plan, sourceRoot, targetRoot, sourceFile, reason) {
  const resolvedSource = path.resolve(sourceFile);
  if (!fs.existsSync(resolvedSource) || !fs.statSync(resolvedSource).isFile()) return;
  if (!isInside(sourceRoot, resolvedSource)) {
    plan.warnings.push(`Skipped outside-source file for ${reason}: ${resolvedSource}`);
    return;
  }
  const relative = path.relative(sourceRoot, resolvedSource);
  const targetFile = path.join(targetRoot, relative);
  plan.files.set(resolvedSource, {
    source: resolvedSource,
    target: targetFile,
    relative,
    reason,
    bytes: fs.statSync(resolvedSource).size,
  });
}

function addDirectory(plan, sourceRoot, targetRoot, sourceDir, reason) {
  if (!fs.existsSync(sourceDir)) return;
  const stack = [path.resolve(sourceDir)];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        addFile(plan, sourceRoot, targetRoot, fullPath, reason);
      }
    }
  }
}

function mediaFileCandidatesFromManifest(sourceRoot, backupDir, mediaManifest) {
  const files = Array.isArray(mediaManifest?.files) ? mediaManifest.files : [];
  const candidates = [];
  for (const file of files) {
    if (!["downloaded", "reused"].includes(file?.status)) continue;
    if (file.media_store_file) candidates.push(path.resolve(sourceRoot, file.media_store_file));
    if (file.file) candidates.push(path.resolve(backupDir, file.file));
  }
  return candidates;
}

function mediaFileCandidatesFromIndex(sourceRoot, mediaIndex) {
  const entries = mediaIndex?.entries && typeof mediaIndex.entries === "object" ? mediaIndex.entries : {};
  const candidates = [];
  for (const entry of Object.values(entries)) {
    if (!entry || typeof entry !== "object") continue;
    if (entry.media_store_file) {
      candidates.push(path.resolve(sourceRoot, entry.media_store_file));
    } else if (entry.storage === "media_store" && entry.file) {
      candidates.push(path.resolve(sourceRoot, entry.file));
    } else if (entry.backup_dir && entry.file) {
      candidates.push(path.resolve(entry.backup_dir, entry.file));
    } else if (entry.file) {
      candidates.push(path.resolve(sourceRoot, entry.file));
    }
  }
  return candidates;
}

function addRecentLogs(plan, sourceRoot, targetRoot, logsDir, includeLogsDays) {
  if (!fs.existsSync(logsDir)) return;
  const cutoff = includeLogsDays <= 0 ? Number.POSITIVE_INFINITY : Date.now() - includeLogsDays * MS_PER_DAY;
  const stack = [logsDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        const mtime = fs.statSync(fullPath).mtimeMs;
        if (includeLogsDays <= 0 || mtime >= cutoff) addFile(plan, sourceRoot, targetRoot, fullPath, "recent-log");
      }
    }
  }
}

export function buildSyncPlan({
  sourceRoot = DEFAULT_SOURCE_ROOT,
  targetRoot,
  includeLogsDays = DEFAULT_INCLUDE_LOGS_DAYS,
  minFreeGb = DEFAULT_MIN_FREE_GB,
} = {}) {
  const source = path.resolve(expandHome(sourceRoot));
  const target = path.resolve(expandHome(targetRoot || ""));
  const warnings = [];
  const errors = [];
  const files = new Map();
  const plan = {
    ok: false,
    generatedAt: new Date().toISOString(),
    sourceRoot: source,
    targetRoot: target,
    latestBackupDir: null,
    latestBackupName: null,
    includeLogsDays,
    minFreeGb,
    disk: null,
    files,
    totals: {
      files: 0,
      bytes: 0,
      alreadyCurrent: 0,
      toCopy: 0,
      toCopyBytes: 0,
    },
    warnings,
    errors,
  };

  if (!targetRoot) errors.push("--target is required.");
  if (!fs.existsSync(source)) errors.push(`Source backup root missing: ${source}`);
  if (targetRoot && path.resolve(source) === path.resolve(target)) errors.push("Source and target roots must be different.");

  const latest = latestBackupDir(source);
  if (!latest) errors.push(`No timestamped backup with backup-manifest.json found under ${source}.`);
  plan.latestBackupDir = latest || null;
  plan.latestBackupName = latest ? path.basename(latest) : null;

  if (errors.length) return plan;

  addDirectory(plan, source, target, latest, "latest-backup");
  addFile(plan, source, target, path.join(source, "media-url-index.json"), "media-url-index");

  const mediaManifest = readJson(path.join(latest, "media", "media-manifest.json"), warnings);
  const mediaIndex = readJson(path.join(source, "media-url-index.json"), warnings);
  for (const mediaFile of [
    ...mediaFileCandidatesFromManifest(source, latest, mediaManifest),
    ...mediaFileCandidatesFromIndex(source, mediaIndex),
  ]) {
    addFile(plan, source, target, mediaFile, "media-store");
  }

  addRecentLogs(plan, source, target, path.join(source, "_logs"), includeLogsDays);

  const entries = [...files.values()];
  for (const entry of entries) {
    plan.totals.files += 1;
    plan.totals.bytes += entry.bytes;
    const current = fs.existsSync(entry.target) && fs.statSync(entry.target).size === entry.bytes;
    if (current) {
      plan.totals.alreadyCurrent += 1;
    } else {
      plan.totals.toCopy += 1;
      plan.totals.toCopyBytes += entry.bytes;
    }
  }

  plan.disk = readDiskStats(target);
  if (plan.disk.supported && plan.disk.availableBytes < gbToBytes(minFreeGb) && plan.totals.toCopyBytes > 0) {
    errors.push(`Target disk has less than ${minFreeGb} GB available (${formatBytes(plan.disk.availableBytes)}).`);
  }

  plan.ok = errors.length === 0;
  return plan;
}

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  const stat = fs.statSync(source);
  fs.utimesSync(target, stat.atime, stat.mtime);
}

export function applySyncPlan(plan) {
  const copied = [];
  const skipped = [];
  for (const entry of plan.files.values()) {
    if (fs.existsSync(entry.target) && fs.statSync(entry.target).size === entry.bytes) {
      skipped.push(entry.relative);
      continue;
    }
    copyFile(entry.source, entry.target);
    copied.push(entry.relative);
  }
  return { copied, skipped };
}

function publicPlan(plan, mode, applied = null) {
  return {
    ok: plan.ok,
    mode,
    generatedAt: plan.generatedAt,
    sourceRoot: plan.sourceRoot,
    targetRoot: plan.targetRoot,
    latestBackupDir: plan.latestBackupDir,
    latestBackupName: plan.latestBackupName,
    includeLogsDays: plan.includeLogsDays,
    minFreeGb: plan.minFreeGb,
    disk: plan.disk,
    totals: plan.totals,
    copied: applied?.copied?.length ?? 0,
    skipped: applied?.skipped?.length ?? 0,
    sample: [...plan.files.values()].slice(0, 20).map((entry) => ({
      relative: entry.relative,
      reason: entry.reason,
      bytes: entry.bytes,
      current: fs.existsSync(entry.target) && fs.statSync(entry.target).size === entry.bytes,
    })),
    warnings: plan.warnings,
    errors: plan.errors,
  };
}

function printHuman(report) {
  console.log("CulturePeople local backup second-copy sync");
  console.log(`- ok: ${report.ok}`);
  console.log(`- mode: ${report.mode}`);
  console.log(`- source: ${report.sourceRoot}`);
  console.log(`- target: ${report.targetRoot}`);
  console.log(`- latest backup: ${report.latestBackupName || "(none)"}`);
  console.log(`- files: ${report.totals.files}, to copy: ${report.totals.toCopy}, already current: ${report.totals.alreadyCurrent}`);
  console.log(`- bytes to copy: ${formatBytes(report.totals.toCopyBytes)} / ${formatBytes(report.totals.bytes)}`);
  if (report.disk?.supported) console.log(`- target disk available: ${formatBytes(report.disk.availableBytes)} at ${report.disk.path}`);
  if (report.mode === "apply") console.log(`- copied/skipped: ${report.copied}/${report.skipped}`);
  for (const warning of report.warnings) console.log(`- warning: ${warning}`);
  for (const error of report.errors) console.log(`- error: ${error}`);
}

function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  if (flags.has("help") || flags.has("h")) {
    printHelp();
    return;
  }

  const apply = flags.has("apply");
  const plan = buildSyncPlan({
    sourceRoot: values.source || values.root || DEFAULT_SOURCE_ROOT,
    targetRoot: values.target,
    includeLogsDays: toNonNegativeInt(values["include-logs-days"], DEFAULT_INCLUDE_LOGS_DAYS),
    minFreeGb: toNonNegativeInt(values["min-free-gb"], DEFAULT_MIN_FREE_GB),
  });
  let applied = null;
  if (apply && plan.ok) applied = applySyncPlan(plan);
  const report = publicPlan(plan, apply ? "apply" : "dry-run", applied);

  if (flags.has("json")) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);

  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
