#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  commandAvailable,
  expandHomePath,
  inspectSecretFile,
  parseArgs,
  readJson,
  safeError,
  sha256File,
  timestampForFile,
  writeJsonAtomic,
} from "./lib/culturepeople-ops-utils.mjs";

function run(command, args, label) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    const detail = String(result.stderr || result.stdout || result.error?.message || "unknown error").trim().slice(0, 800);
    throw new Error(`${label} failed${result.status == null ? "" : ` with status ${result.status}`}: ${detail}`);
  }
  return result;
}

export async function restoreSecureBackup({
  archivePath = "",
  manifestPath = "",
  keyFile = "",
  keepTemp = false,
  skipSqliteCli = false,
  reportPath = "",
} = {}) {
  const archive = path.resolve(expandHomePath(archivePath || ""));
  const manifestFile = path.resolve(expandHomePath(manifestPath || `${archive}.manifest.json`));
  const key = inspectSecretFile(keyFile || process.env.CULTUREPEOPLE_BACKUP_ENCRYPTION_KEY_FILE || "");
  const report = {
    ok: false,
    generatedAt: new Date().toISOString(),
    archivePath: archive,
    manifestPath: manifestFile,
    archiveSha256Verified: false,
    key: { configured: key.configured, exists: key.exists, nonEmpty: key.nonEmpty, broadlyReadable: key.broadlyReadable, valueIncluded: false },
    restoreRoot: null,
    restore: null,
    warnings: [],
    errors: [],
  };
  if (!fs.existsSync(archive)) report.errors.push(`Encrypted archive missing: ${archive}`);
  const manifest = readJson(manifestFile, null);
  if (!manifest) report.errors.push(`Secure backup manifest missing or invalid: ${manifestFile}`);
  if (!key.exists || !key.nonEmpty || key.broadlyReadable) report.errors.push("Encryption key file is missing, empty, or broadly readable.");
  if (!commandAvailable("gpg")) report.errors.push("gpg is not installed or not executable.");
  if (!commandAvailable("tar")) report.errors.push("tar is not installed or not executable.");
  if (report.errors.length) return report;

  const actualHash = await sha256File(archive);
  report.archiveSha256Verified = actualHash === manifest.archiveSha256;
  if (!report.archiveSha256Verified) {
    report.errors.push("Encrypted archive SHA-256 does not match its manifest.");
    return report;
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "culturepeople-secure-restore-"));
  const tarFile = path.join(workDir, "payload.tar");
  const restoreRoot = path.join(workDir, "restored");
  fs.mkdirSync(restoreRoot, { recursive: true });
  report.restoreRoot = keepTemp ? restoreRoot : null;
  try {
    run("gpg", [
      "--batch", "--yes", "--pinentry-mode", "loopback",
      "--passphrase-file", key.resolved,
      "--decrypt", "--output", tarFile, archive,
    ], "GnuPG decryption");
    run("tar", ["-xf", tarFile, "-C", restoreRoot], "tar extraction");
    const restoreResult = run(process.execPath, [
      path.resolve("scripts/restore-local-culturepeople-backup.mjs"),
      "--root", restoreRoot, "--latest", "--json",
      ...(skipSqliteCli ? ["--skip-sqlite-cli"] : []),
    ], "CulturePeople restore rehearsal");
    report.restore = JSON.parse(String(restoreResult.stdout || "{}"));
    report.ok = report.archiveSha256Verified && report.restore?.ok === true;
    if (!report.ok) report.errors.push("Decrypted backup did not pass the CulturePeople restore rehearsal.");
  } catch (error) {
    report.errors.push(safeError(error));
  } finally {
    if (!keepTemp) fs.rmSync(workDir, { recursive: true, force: true });
  }

  const output = reportPath ? path.resolve(expandHomePath(reportPath)) : `${archive}.restore-${timestampForFile()}.json`;
  writeJsonAtomic(output, { ...report, reportPath: output, restoreRoot: keepTemp ? report.restoreRoot : null });
  report.reportPath = output;
  return report;
}

function printHuman(report) {
  console.log("CulturePeople encrypted backup restore check");
  console.log(`- ok: ${report.ok}`);
  console.log(`- archive hash verified: ${report.archiveSha256Verified}`);
  console.log(`- CulturePeople restore check: ${report.restore?.ok === true}`);
  if (report.reportPath) console.log(`- report: ${report.reportPath}`);
  for (const warning of report.warnings || []) console.log(`- warning: ${warning}`);
  for (const error of report.errors || []) console.log(`- error: ${error}`);
}

async function main() {
  const { flags, values, positionals } = parseArgs(process.argv.slice(2));
  const report = await restoreSecureBackup({
    archivePath: values.archive || positionals[0],
    manifestPath: values.manifest || "",
    keyFile: values["key-file"] || process.env.CULTUREPEOPLE_BACKUP_ENCRYPTION_KEY_FILE || "",
    keepTemp: flags.has("keep-temp"),
    skipSqliteCli: flags.has("skip-sqlite-cli"),
    reportPath: values.report || "",
  });
  if (flags.has("json")) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[backup:secure:restore-check] ${safeError(error)}`);
    process.exitCode = 1;
  });
}
