#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { DEFAULT_BACKUP_ROOT, REPO_ROOT } from "./lib/backup-root.mjs";
import { buildSyncPlan } from "./sync-local-backup-copy.mjs";
import {
  commandAvailable,
  diskStats,
  expandHomePath,
  formatBytes,
  inspectSecretFile,
  isInside,
  parseArgs,
  readJson,
  sha256File,
  sha256Text,
  timestampForFile,
  writeJsonAtomic,
} from "./lib/culturepeople-ops-utils.mjs";

const APPLY_CONFIRMATION = "APPLY_SECURE_BACKUP";

export function secureCopyPlanId(plan) {
  return `secure-${sha256Text(JSON.stringify({
    sourceRoot: plan?.sourceRoot || "",
    targetRoot: plan?.targetRoot || "",
    latestBackupName: plan?.latestBackupName || "",
    tool: plan?.tool || "",
    selectedFiles: plan?.selectedFiles || [],
  })).slice(0, 20)}`;
}

function run(command, args, label) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    const detail = String(result.stderr || result.stdout || result.error?.message || "unknown error").trim().slice(0, 500);
    throw new Error(`${label} failed${result.status == null ? "" : ` with status ${result.status}`}: ${detail}`);
  }
}

export function buildSecureCopyPlan({
  sourceRoot = DEFAULT_BACKUP_ROOT,
  targetRoot = "",
  keyFile = "",
  minFreeGb = 5,
  includeLogsDays = 30,
  tool = "gpg",
} = {}) {
  const source = path.resolve(expandHomePath(sourceRoot));
  const target = targetRoot ? path.resolve(expandHomePath(targetRoot)) : "";
  const key = inspectSecretFile(keyFile || process.env.CULTUREPEOPLE_BACKUP_ENCRYPTION_KEY_FILE || "");
  const errors = [];
  const warnings = [];
  if (!target) errors.push("--target is required.");
  if (target && isInside(source, target)) errors.push("Secure target must not be inside the plaintext backup root.");
  if (tool !== "gpg") errors.push("Only the mature GnuPG backend is currently supported; use --tool gpg.");
  if (!commandAvailable("gpg")) errors.push("gpg is not installed or not executable.");
  if (!commandAvailable("tar")) errors.push("tar is not installed or not executable.");
  if (!key.configured || !key.exists || !key.nonEmpty) errors.push("CULTUREPEOPLE_BACKUP_ENCRYPTION_KEY_FILE (or --key-file) must point to a non-empty file.");
  if (key.broadlyReadable) errors.push("Encryption key file is group/world readable; restrict it before apply.");
  if (key.exists && (isInside(REPO_ROOT, key.resolved) || isInside(source, key.resolved) || (target && isInside(target, key.resolved)))) {
    errors.push("Encryption key file must be stored outside the repository, plaintext backup root, and encrypted target.");
  }

  const syncPlan = target
    ? buildSyncPlan({ sourceRoot: source, targetRoot: path.join(target, ".selection"), includeLogsDays, minFreeGb: 0 })
    : null;
  for (const error of syncPlan?.errors || []) errors.push(error);
  for (const warning of syncPlan?.warnings || []) warnings.push(warning);
  const files = syncPlan ? [...syncPlan.files.values()] : [];
  const latestBackupName = syncPlan?.latestBackupName || null;
  const estimatedPlainBytes = files.reduce((sum, entry) => sum + Number(entry.bytes || 0), 0);
  const disk = target ? diskStats(target) : null;
  const requiredBytes = Math.ceil(estimatedPlainBytes * 2.2) + Number(minFreeGb || 0) * 1024 ** 3;
  if (disk?.supported && disk.availableBytes < requiredBytes) {
    errors.push(`Secure target needs about ${formatBytes(requiredBytes)} free for temporary archive and encrypted output; ${formatBytes(disk.availableBytes)} is available.`);
  }

  const report = {
    ok: errors.length === 0,
    generatedAt: new Date().toISOString(),
    sourceRoot: source,
    targetRoot: target || null,
    latestBackupName,
    tool,
    key: {
      configured: key.configured,
      exists: key.exists,
      nonEmpty: key.nonEmpty,
      mode: key.mode,
      broadlyReadable: key.broadlyReadable,
      valueIncluded: false,
    },
    disk,
    totals: {
      files: files.length,
      estimatedPlainBytes,
      estimatedWorkingBytes: requiredBytes,
    },
    selectedFiles: files.map((entry) => ({ relative: entry.relative, bytes: entry.bytes, reason: entry.reason })),
    warnings,
    errors,
  };
  report.planId = secureCopyPlanId(report);
  return report;
}

export async function applySecureCopyPlan(plan, { keyFile = "" } = {}) {
  if (!plan.ok) throw new Error("Secure copy plan is blocked.");
  const key = inspectSecretFile(keyFile || process.env.CULTUREPEOPLE_BACKUP_ENCRYPTION_KEY_FILE || "");
  if (!key.exists || !key.nonEmpty || key.broadlyReadable) throw new Error("Encryption key file is missing, empty, or broadly readable.");
  fs.mkdirSync(plan.targetRoot, { recursive: true });
  const stamp = timestampForFile();
  const archiveName = `culturepeople-secure-${plan.latestBackupName}-${stamp}.tar.gpg`;
  const archivePath = path.join(plan.targetRoot, archiveName);
  const workDir = fs.mkdtempSync(path.join(plan.targetRoot, ".secure-backup-work-"));
  const listFile = path.join(workDir, "files.txt");
  const tarFile = path.join(workDir, "payload.tar");
  const temporaryArchive = path.join(workDir, "payload.tar.gpg");
  try {
    const relativeFiles = plan.selectedFiles.map((entry) => entry.relative);
    if (relativeFiles.some((item) => item.startsWith("-") || /[\n\r]/.test(item))) {
      throw new Error("Selected backup file name is not safe for a portable tar file list.");
    }
    fs.writeFileSync(listFile, `${relativeFiles.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
    run("tar", ["-cf", tarFile, "-C", plan.sourceRoot, "-T", listFile], "tar archive creation");
    run("gpg", [
      "--batch", "--yes", "--pinentry-mode", "loopback",
      "--passphrase-file", key.resolved,
      "--symmetric", "--cipher-algo", "AES256",
      "--output", temporaryArchive, tarFile,
    ], "GnuPG encryption");
    fs.renameSync(temporaryArchive, archivePath);
    if (process.platform !== "win32") {
      try { fs.chmodSync(archivePath, 0o600); } catch { /* NTFS and some mounts ignore chmod. */ }
    }
    const manifest = {
      ok: true,
      formatVersion: 1,
      generatedAt: new Date().toISOString(),
      tool: "gpg-symmetric-aes256",
      sourceRoot: plan.sourceRoot,
      latestBackupName: plan.latestBackupName,
      archiveFile: path.basename(archivePath),
      archiveBytes: fs.statSync(archivePath).size,
      archiveSha256: await sha256File(archivePath),
      selectedFiles: plan.totals.files,
      selectedPlainBytes: plan.totals.estimatedPlainBytes,
      keyValueIncluded: false,
      restoreVerified: false,
    };
    const manifestPath = `${archivePath}.manifest.json`;
    writeJsonAtomic(manifestPath, manifest);
    return { ...manifest, archivePath, manifestPath };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

function printHuman(report) {
  console.log("CulturePeople encrypted backup copy");
  console.log(`- ok: ${report.ok}`);
  console.log(`- mode: ${report.mode}`);
  console.log(`- latest: ${report.latestBackupName || "(none)"}`);
  console.log(`- selected: ${report.totals?.files || report.selectedFiles || 0} files, ${formatBytes(report.totals?.estimatedPlainBytes || report.selectedPlainBytes)}`);
  console.log(`- encryption backend: ${report.tool}`);
  console.log(`- key configured/secure: ${report.key?.configured ?? true}/${report.key ? !report.key.broadlyReadable : true}`);
  if (report.archivePath) console.log(`- archive: ${report.archivePath}`);
  if (report.manifestPath) console.log(`- manifest: ${report.manifestPath}`);
  for (const warning of report.warnings || []) console.log(`- warning: ${warning}`);
  for (const error of report.errors || []) console.log(`- error: ${error}`);
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const apply = flags.has("apply");
  const approved = apply && values.plan ? readJson(path.resolve(expandHomePath(values.plan)), null) : null;
  const keyFile = values["key-file"] || process.env.CULTUREPEOPLE_BACKUP_ENCRYPTION_KEY_FILE || "";
  const plan = buildSecureCopyPlan({
    sourceRoot: values.source || values.root || approved?.sourceRoot || DEFAULT_BACKUP_ROOT,
    targetRoot: values.target || approved?.targetRoot,
    keyFile,
    minFreeGb: Number(values["min-free-gb"] || 5),
    includeLogsDays: Number(values["include-logs-days"] || 30),
    tool: values.tool || "gpg",
  });
  let report = { ...plan, mode: "dry-run" };
  if (apply) {
    const approvedAgeHours = approved?.generatedAt ? (Date.now() - Date.parse(approved.generatedAt)) / 36e5 : Number.POSITIVE_INFINITY;
    const approvalValid = approved?.mode === "dry-run"
      && approved?.ok === true
      && approved?.planId === secureCopyPlanId(approved)
      && approved?.planId === values["plan-id"]
      && approved?.planId === plan.planId
      && Number.isFinite(approvedAgeHours)
      && approvedAgeHours <= 24;
    if (!approvalValid) {
      report = { ...report, ok: false, mode: "apply-blocked", errors: [...report.errors, "--plan and matching --plan-id from a current dry-run are required."] };
    } else if (values.confirm !== APPLY_CONFIRMATION) {
      report = { ...report, ok: false, mode: "apply-blocked", errors: [...report.errors, `--confirm ${APPLY_CONFIRMATION} is required.`] };
    } else if (plan.ok) {
      report = { ...(await applySecureCopyPlan(plan, { keyFile })), mode: "apply", warnings: [], errors: [] };
    }
  } else {
    const reportPath = path.resolve(expandHomePath(values.report || path.join(".secure-backup-runs", `secure-copy-plan-${timestampForFile()}.json`)));
    report.reportPath = reportPath;
    writeJsonAtomic(reportPath, report);
  }
  if (flags.has("json")) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[backup:secure-copy] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
