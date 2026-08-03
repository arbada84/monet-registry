#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { DEFAULT_BACKUP_ROOT, readConfiguredBackupSecondCopyRoot } from "./lib/backup-root.mjs";
import { expandHomePath, parseArgs, readJson, sha256Text, timestampForFile, writeJsonAtomic } from "./lib/culturepeople-ops-utils.mjs";
import { buildGithubActionsHealth } from "./github-actions-health.mjs";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(command, args, { parseJson = false, env = process.env } = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 128 * 1024 * 1024, env });
  let data = null;
  if (parseJson && result.status === 0) {
    try { data = JSON.parse(String(result.stdout || "{}")); } catch { /* Reported as a failed parse below. */ }
  }
  return {
    ok: result.status === 0 && (!parseJson || data != null),
    status: result.status,
    durationMs: Date.now() - started,
    data,
    diagnostic: String(result.stderr || (result.status === 0 ? "" : result.stdout) || "").trim().slice(0, 800),
  };
}

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  return result.status === 0 ? String(result.stdout || "").trim() : "";
}

function check(name, ok, detail = "", required = true) {
  return { name, ok: Boolean(ok), required, detail };
}

export function latestValidSecureRestore(reportPath, latestBackupName) {
  const report = reportPath ? readJson(path.resolve(expandHomePath(reportPath)), null) : null;
  const manifest = report?.manifestPath ? readJson(path.resolve(expandHomePath(report.manifestPath)), null) : null;
  return {
    ok: Boolean(
      report?.ok
      && report?.archiveSha256Verified === true
      && report?.restore?.ok === true
      && manifest?.ok === true
      && manifest?.archiveSha256
      && manifest?.latestBackupName
      && (!latestBackupName || manifest.latestBackupName === latestBackupName)
      && path.resolve(expandHomePath(report.archivePath || "")) === path.resolve(path.dirname(report.manifestPath), manifest.archiveFile || ""),
    ),
    reportPath: reportPath ? path.resolve(expandHomePath(reportPath)) : null,
    archivePath: report?.archivePath || null,
    latestBackupName: manifest?.latestBackupName || null,
    generatedAt: report?.generatedAt || null,
  };
}

export function evaluateReleaseGate(checks) {
  const failed = checks.filter((item) => item.required !== false && item.ok !== true);
  return { ok: failed.length === 0, failed: failed.map((item) => item.name), checks };
}

function plannedChecks() {
  return [
    "git-clean", "github-ci-same-sha", "github-queue-health", "env-drift", "legal-content",
    "typecheck", "unit-tests", "lint", "backup-status", "restore-primary-second", "backup-security-audit",
    "secure-restore-primary", "secure-restore-second", "supabase-recovery-or-exception", "portal-verify",
    "alidot-pages", "noindex-audit", "public-browser-smoke",
  ].map((name) => check(name, false, "planned"));
}

function githubRunsFromCli() {
  const result = spawnSync("gh", [
    "run", "list", "--workflow", "ci.yml", "--limit", "40",
    "--json", "databaseId,headSha,status,conclusion,createdAt,updatedAt,url",
  ], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    return { ok: false, runs: [], diagnostic: String(result.stderr || result.stdout || result.error?.message || "gh run list failed").trim().slice(0, 500) };
  }
  try { return { ok: true, runs: JSON.parse(String(result.stdout || "[]")), diagnostic: "" }; }
  catch { return { ok: false, runs: [], diagnostic: "GitHub Actions output was not valid JSON." }; }
}

function printHuman(report) {
  console.log("CulturePeople release gate");
  console.log(`- mode: ${report.mode}`);
  console.log(`- HEAD: ${report.headSha || "unknown"}`);
  console.log(`- release candidate: ${report.releaseCandidate}`);
  console.log(`- ok: ${report.ok}`);
  for (const item of report.checks) console.log(`- ${item.name}: ${item.ok ? "ok" : item.detail === "planned" ? "planned" : "failed"}${item.detail && item.detail !== "planned" ? ` (${item.detail})` : ""}`);
  if (report.reportPath) console.log(`- report: ${report.reportPath}`);
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const execute = flags.has("run");
  const headSha = git(["rev-parse", "HEAD"]);
  const dirtyRows = git(["status", "--porcelain=v1", "--untracked-files=all"]).split(/\r?\n/).filter(Boolean);
  const root = path.resolve(expandHomePath(values.root || DEFAULT_BACKUP_ROOT));
  const secondCopy = values["second-copy"] ? path.resolve(expandHomePath(values["second-copy"])) : readConfiguredBackupSecondCopyRoot();
  const base = String(values.base || "").replace(/\/+$/, "");
  const checks = [];
  const evidence = {};

  if (!execute) {
    checks.push(...plannedChecks());
  } else {
    checks.push(check("git-clean", dirtyRows.length === 0, `${dirtyRows.length} changed path(s)`));

    const githubInput = values["github-runs-file"] ? readJson(path.resolve(values["github-runs-file"]), []) : null;
    const githubSource = githubInput ? { ok: true, runs: githubInput, diagnostic: "" } : githubRunsFromCli();
    const github = githubSource.ok ? buildGithubActionsHealth({ runs: githubSource.runs, headSha }) : null;
    evidence.github = github;
    checks.push(check("github-ci-same-sha", Boolean(github?.successfulSameSha), githubSource.ok ? `${github?.sameShaRuns || 0} same-SHA run(s)` : githubSource.diagnostic));
    checks.push(check("github-queue-health", githubSource.ok && (github?.queuedStale?.length || 0) === 0, githubSource.ok ? `${github?.queuedStale?.length || 0} stale queued run(s)` : githubSource.diagnostic));

    const envDrift = run(process.execPath, [path.resolve("scripts/env-drift-check.mjs"), "--fail-empty-overrides", "--json"], { parseJson: true });
    evidence.envDrift = envDrift.data;
    checks.push(check("env-drift", envDrift.ok && envDrift.data?.ok === true, envDrift.diagnostic || `${envDrift.data?.emptyOverrides?.length || 0} empty override(s)`));

    const legalArgs = [path.resolve("scripts/validate-public-legal-content.mjs"), "--json", "--no-write"];
    if (base) legalArgs.push("--base", base);
    const legal = run(process.execPath, legalArgs, { parseJson: true });
    evidence.legal = legal.data;
    checks.push(check("legal-content", Boolean(base && legal.ok && legal.data?.ok && legal.data?.approval?.representativeApprovalRecorded), base ? legal.diagnostic || `${legal.data?.errors?.length || 0} error(s)` : "--base is required for representative-approved live legal verification"));

    const typecheck = run(pnpm, ["ci:typecheck"]);
    checks.push(check("typecheck", typecheck.ok, typecheck.diagnostic));
    const unit = run(pnpm, ["test:unit"]);
    checks.push(check("unit-tests", unit.ok, unit.diagnostic));
    const lint = run(pnpm, ["ci:lint"]);
    checks.push(check("lint", lint.ok, lint.diagnostic));

    const statusArgs = [path.resolve("scripts/local-culturepeople-backup-status.mjs"), "--root", root, "--json"];
    if (secondCopy) statusArgs.push("--second-copy", secondCopy);
    const backupStatus = run(process.execPath, statusArgs, { parseJson: true });
    evidence.backupStatus = backupStatus.data;
    const diskPercent = Number(backupStatus.data?.disk?.usedPercent ?? 100);
    checks.push(check("backup-status", Boolean(backupStatus.ok && backupStatus.data?.ok && diskPercent < 95 && backupStatus.data?.health?.disk?.status !== "danger"), backupStatus.diagnostic || `disk=${diskPercent}%`));

    const restoreArgs = [path.resolve("scripts/restore-local-backup-copies.mjs"), "--root", root, "--json"];
    if (secondCopy) restoreArgs.push("--second-copy", secondCopy);
    const restoreAll = run(process.execPath, restoreArgs, { parseJson: true });
    evidence.restoreAll = restoreAll.data;
    checks.push(check("restore-primary-second", Boolean(secondCopy && restoreAll.ok && restoreAll.data?.ok), secondCopy ? restoreAll.diagnostic || `${restoreAll.data?.checks?.length || 0} check(s)` : "second copy is not configured"));

    const securityPrimary = run(process.execPath, [path.resolve("scripts/backup-security-audit.mjs"), "--root", root, "--json", "--no-write"], { parseJson: true });
    const securitySecond = secondCopy
      ? run(process.execPath, [path.resolve("scripts/backup-security-audit.mjs"), "--root", secondCopy, "--json", "--no-write"], { parseJson: true })
      : { ok: false, data: null, diagnostic: "second copy is not configured" };
    evidence.backupSecurity = { primary: securityPrimary.data, second: securitySecond.data };
    checks.push(check(
      "backup-security-audit",
      Boolean(
        securityPrimary.ok
        && securitySecond.ok
        && securityPrimary.data?.ok
        && securitySecond.data?.ok
        && securityPrimary.data?.sensitiveData?.valuesIncluded === false
        && securitySecond.data?.sensitiveData?.valuesIncluded === false
      ),
      securityPrimary.diagnostic || securitySecond.diagnostic || "primary and second-copy audit reports must be value-redacted",
    ));

    const latestBackupName = backupStatus.data?.latestBackupDir ? path.basename(backupStatus.data.latestBackupDir) : "";
    const securePrimary = latestValidSecureRestore(values["secure-primary-report"], latestBackupName);
    const secureSecond = latestValidSecureRestore(values["secure-second-report"], latestBackupName);
    evidence.secureRestore = { primary: securePrimary, second: secureSecond };
    checks.push(check("secure-restore-primary", securePrimary.ok, securePrimary.reportPath || "--secure-primary-report is required"));
    checks.push(check("secure-restore-second", secureSecond.ok && secureSecond.archivePath !== securePrimary.archivePath, secureSecond.reportPath || "--secure-second-report is required and must reference a distinct archive"));

    const supabase = run(process.execPath, [path.resolve("scripts/supabase-recovery-check.mjs"), "--require-storage", "--json"], { parseJson: true });
    evidence.supabase = supabase.data;
    const exception = flags.has("allow-supabase-blocked") && String(values["exception-id"] || "").trim().length >= 8;
    checks.push(check("supabase-recovery-or-exception", Boolean((supabase.ok && supabase.data?.ok) || exception), exception ? `approved exception ${values["exception-id"]}` : supabase.diagnostic || "Supabase recovery is blocked and no approved exception was supplied"));

    if (base) {
      const portal = run(pnpm, ["verify:portal", "--", "--base", base, "--json"]);
      checks.push(check("portal-verify", portal.ok, portal.diagnostic));
      const alidot = run(pnpm, ["verify:alidot-pages", "--", "--base", base, "--site-type", "all", "--json"]);
      checks.push(check("alidot-pages", alidot.ok, alidot.diagnostic));
      const noindex = run(pnpm, ["seo:audit:noindex", "--", "--base", base, "--urls-file", values["urls-file"] || "tmp/noindex-urls.txt", "--json"]);
      checks.push(check("noindex-audit", noindex.ok, noindex.diagnostic));
      const smoke = run(pnpm, ["smoke:browser", "--", `--base-url=${base}`, "--public-site-only", "--no-auto-start", "--no-admin-auth", "--json"]);
      checks.push(check("public-browser-smoke", smoke.ok, smoke.diagnostic));
    } else {
      checks.push(check("portal-verify", false, "--base is required"));
      checks.push(check("alidot-pages", false, "--base is required"));
      checks.push(check("noindex-audit", false, "--base is required"));
      checks.push(check("public-browser-smoke", false, "--base is required"));
    }
  }

  const evaluation = execute ? evaluateReleaseGate(checks) : { ok: false, failed: [], checks };
  const report = {
    formatVersion: 1,
    ok: execute && evaluation.ok,
    mode: execute ? "run" : "dry-run",
    generatedAt: new Date().toISOString(),
    headSha: headSha || null,
    dirtyPaths: dirtyRows.length,
    releaseCandidate: execute && evaluation.ok && dirtyRows.length === 0,
    root,
    secondCopy: secondCopy || null,
    base: base || null,
    checks,
    failed: evaluation.failed,
    evidence,
    secretValuesIncluded: false,
  };
  report.reportId = `gate-${String(headSha || "unknown").slice(0, 12)}-${sha256Text(JSON.stringify(report)).slice(0, 12)}`;
  if (execute || values.report) {
    const output = path.resolve(values.report || path.join(".release-manifests", `release-gate-${timestampForFile()}.json`));
    report.reportPath = output;
    writeJsonAtomic(output, report);
  }
  if (flags.has("json")) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  if (execute && !report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[release:gate] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
