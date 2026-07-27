#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_BACKUP_ROOT } from "./lib/backup-root.mjs";
import {
  directorySize,
  diskStats,
  expandHomePath,
  isInside,
  parseArgs,
  readJson,
  sha256Text,
  timestampForFile,
  writeJsonAtomic,
} from "./lib/culturepeople-ops-utils.mjs";

const APPLY_CONFIRMATION = "APPLY_BACKUP_RETENTION";

function backupDirectories(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .filter((name) => /^\d{4}-\d{2}-\d{2}T/.test(name))
    .map((name) => ({ name, dir: path.join(root, name) }))
    .filter((entry) => fs.statSync(entry.dir).isDirectory() && fs.existsSync(path.join(entry.dir, "backup-manifest.json")))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function secureRestoreReport(filePath, latestBackupName) {
  const report = filePath ? readJson(path.resolve(expandHomePath(filePath)), null) : null;
  if (!report?.ok || report.archiveSha256Verified !== true || report.restore?.ok !== true) return null;
  const manifest = readJson(report.manifestPath, null);
  return manifest?.latestBackupName === latestBackupName ? report : null;
}

function verifiedBackupNamesFromReports(value) {
  const names = new Set();
  for (const candidate of String(value || "").split(",").map((item) => item.trim()).filter(Boolean)) {
    const report = readJson(path.resolve(expandHomePath(candidate)), null);
    if (report?.ok === true && report?.backupDir) names.add(path.basename(report.backupDir));
  }
  return [...names].sort();
}

export function buildRetentionPlan({ root = DEFAULT_BACKUP_ROOT, retentionDays = 90, keepLatest = 7, verifiedBackupNames = [] } = {}) {
  const backupRoot = path.resolve(expandHomePath(root));
  const entries = backupDirectories(backupRoot);
  const latest = entries.at(-1);
  const restoreVerified = new Set(verifiedBackupNames);
  const cutoff = Date.now() - Math.max(1, Number(retentionDays || 90)) * 24 * 60 * 60 * 1000;
  const protectedNames = new Map();
  for (const entry of entries.slice(-Math.max(1, Number(keepLatest || 7)))) protectedNames.set(entry.name, "latest-set");
  const monthly = new Map();
  for (const entry of entries) monthly.set(entry.name.slice(0, 7), entry);
  for (const entry of monthly.values()) protectedNames.set(entry.name, "monthly-anchor");
  const fallbackAnchors = new Map();
  for (const entry of entries) {
    const manifest = readJson(path.join(entry.dir, "backup-manifest.json"), {});
    const source = manifest?.sources?.supabase || {};
    if (source.fallback_used !== true) continue;
    fallbackAnchors.set(String(source.fallback_generated_at || "unknown"), entry);
  }
  for (const entry of fallbackAnchors.values()) protectedNames.set(entry.name, "supabase-fallback-anchor");
  for (const entry of entries) {
    if (!restoreVerified.has(entry.name) && !protectedNames.has(entry.name) && entry.name !== latest?.name) {
      protectedNames.set(entry.name, "restore-unverified");
    }
  }
  const rows = entries.map((entry) => {
    const stat = fs.statSync(entry.dir);
    const completedAt = readJson(path.join(entry.dir, "backup-manifest.json"), {})?.completed_at || null;
    const old = stat.mtimeMs < cutoff;
    const protection = protectedNames.get(entry.name) || null;
    return {
      name: entry.name,
      dir: entry.dir,
      completedAt,
      mtime: stat.mtime.toISOString(),
      bytes: directorySize(entry.dir),
      old,
      protected: Boolean(protection) || entry.name === latest?.name,
      protection: entry.name === latest?.name ? "latest" : protection,
      candidate: old && !protection && entry.name !== latest?.name,
    };
  });
  const candidates = rows.filter((row) => row.candidate);
  const payload = {
    root: backupRoot,
    latestBackupName: latest?.name || null,
    retentionDays: Number(retentionDays),
    keepLatest: Number(keepLatest),
    verifiedBackupNames: [...restoreVerified].sort(),
    candidates: candidates.map((row) => ({ name: row.name, bytes: row.bytes })),
  };
  return {
    ok: Boolean(latest),
    mode: "dry-run",
    generatedAt: new Date().toISOString(),
    planId: sha256Text(JSON.stringify(payload)),
    ...payload,
    diskBefore: diskStats(backupRoot),
    summary: {
      backups: rows.length,
      protected: rows.filter((row) => row.protected).length,
      candidates: candidates.length,
      candidateBytes: candidates.reduce((sum, row) => sum + row.bytes, 0),
    },
    backups: rows,
    warnings: latest ? [] : [`No backups found under ${backupRoot}.`],
    errors: latest ? [] : [`No backups found under ${backupRoot}.`],
  };
}

function applyPlan(plan, { primaryRestoreReport, secondRestoreReport }) {
  const primary = secureRestoreReport(primaryRestoreReport, plan.latestBackupName);
  const second = secureRestoreReport(secondRestoreReport, plan.latestBackupName);
  if (!primary || !second) {
    throw new Error("Apply blocked: two secure restore reports for the latest backup are required.");
  }
  if (path.resolve(primary.archivePath || "") === path.resolve(second.archivePath || "")) {
    throw new Error("Apply blocked: primary and second secure restore reports must reference distinct encrypted archives.");
  }
  const current = buildRetentionPlan({ root: plan.root, retentionDays: plan.retentionDays, keepLatest: plan.keepLatest, verifiedBackupNames: plan.verifiedBackupNames || [] });
  if (current.latestBackupName !== plan.latestBackupName || current.planId !== plan.planId) {
    throw new Error("Apply blocked: backup set changed after the retention plan was generated.");
  }
  const removed = [];
  for (const candidate of plan.candidates) {
    const target = path.resolve(plan.root, candidate.name);
    if (!isInside(plan.root, target) || path.basename(target) !== candidate.name || !/^\d{4}-\d{2}-\d{2}T/.test(candidate.name)) {
      throw new Error(`Unsafe retention candidate: ${candidate.name}`);
    }
    fs.rmSync(target, { recursive: true, force: true });
    removed.push(candidate.name);
  }
  return { removed, diskAfter: diskStats(plan.root) };
}

function printHuman(report) {
  console.log("CulturePeople backup retention plan");
  console.log(`- ok: ${report.ok}`);
  console.log(`- mode: ${report.mode}`);
  console.log(`- backups/protected/candidates: ${report.summary.backups}/${report.summary.protected}/${report.summary.candidates}`);
  console.log(`- candidate bytes: ${report.summary.candidateBytes}`);
  console.log(`- plan id: ${report.planId}`);
  if (report.reportPath) console.log(`- report: ${report.reportPath}`);
  for (const warning of report.warnings || []) console.log(`- warning: ${warning}`);
  for (const error of report.errors || []) console.log(`- error: ${error}`);
}

function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const apply = flags.has("apply");
  let report;
  if (apply) {
    if (!values.plan) throw new Error("Apply blocked: --plan <approved-plan.json> is required.");
    if (values.confirm !== APPLY_CONFIRMATION) throw new Error(`Apply blocked: --confirm ${APPLY_CONFIRMATION} is required.`);
    const reportPath = path.resolve(expandHomePath(values.plan));
    const plan = readJson(reportPath, null);
    if (!plan?.planId || !Array.isArray(plan.candidates)) throw new Error("Apply blocked: retention plan is invalid.");
    const applied = applyPlan(plan, {
      primaryRestoreReport: values["secure-primary-report"],
      secondRestoreReport: values["secure-second-report"],
    });
    report = { ...plan, ok: true, mode: "apply", appliedAt: new Date().toISOString(), ...applied };
    writeJsonAtomic(reportPath, report);
  } else {
    report = buildRetentionPlan({
      root: values.root || DEFAULT_BACKUP_ROOT,
      retentionDays: Number(values["retention-days"] || 90),
      keepLatest: Number(values["keep-latest"] || 7),
      verifiedBackupNames: verifiedBackupNamesFromReports(values["restore-reports"]),
    });
    const reportPath = path.resolve(expandHomePath(values.report || path.join(".backup-retention-runs", `backup-retention-${timestampForFile()}.json`)));
    report.reportPath = reportPath;
    writeJsonAtomic(reportPath, report);
  }
  if (flags.has("json")) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) {
    console.error(`[backup:retention:plan] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
