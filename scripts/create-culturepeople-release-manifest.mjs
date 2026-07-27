#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { parseArgs, readJson, sha256File, sha256Text, timestampForFile, writeJsonAtomic } from "./lib/culturepeople-ops-utils.mjs";

const DEFAULT_ENV_KEYS = [
  "CULTUREPEOPLE_VERCEL_TOKEN",
  "CULTUREPEOPLE_BACKUP_ROOT",
  "CULTUREPEOPLE_BACKUP_SECOND_COPY",
  "CULTUREPEOPLE_BACKUP_ENCRYPTION_KEY_FILE",
  "CLOUDFLARE_API_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TELEGRAM_BOT_TOKEN",
];

function command(command, args = []) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  return result.status === 0 ? String(result.stdout || result.stderr || "").trim() : null;
}

function localVercelVersion() {
  const candidates = process.platform === "win32"
    ? [path.resolve("node_modules/.bin/vercel.cmd")]
    : [path.resolve("node_modules/.bin/vercel")];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const version = command(candidate, ["--version"]);
    if (version) return version;
  }
  return null;
}

function git(commandArgs) {
  return command("git", commandArgs);
}

function parseStatus(value) {
  if (!value) return [];
  return value.split("\0").filter(Boolean).map((line) => ({
    index: line[0] || " ",
    worktree: line[1] || " ",
    file: line.slice(3),
  }));
}

function latestEvidenceFiles(directories) {
  const output = [];
  for (const directory of directories) {
    if (!fs.existsSync(directory)) continue;
    const files = fs.readdirSync(directory)
      .map((name) => path.join(directory, name))
      .filter((file) => fs.statSync(file).isFile())
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (files[0]) output.push(files[0]);
  }
  return output;
}

async function evidenceRows(files) {
  const rows = [];
  for (const candidate of [...new Set(files)]) {
    const file = path.resolve(candidate);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    rows.push({ file, bytes: fs.statSync(file).size, sha256: await sha256File(file), modifiedAt: fs.statSync(file).mtime.toISOString() });
  }
  return rows;
}

export function safeEnvStatus(keys) {
  return [...new Set(keys)].sort().map((key) => {
    const present = Object.prototype.hasOwnProperty.call(process.env, key);
    const value = String(process.env[key] || "");
    return { key, state: !present ? "missing" : value.trim() ? "masked" : "empty", valueIncluded: false };
  });
}

export async function buildReleaseManifest({
  evidence = [],
  gateReport = "",
  deployId = "",
  alias = "",
  rollbackId = "",
  envKeys = DEFAULT_ENV_KEYS,
} = {}) {
  const statusRows = parseStatus(git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
  const branch = git(["branch", "--show-current"]);
  const headSha = git(["rev-parse", "HEAD"]);
  const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  const upstreamSha = upstream ? git(["rev-parse", upstream]) : null;
  const aheadBehindText = upstream ? git(["rev-list", "--left-right", "--count", `${upstream}...HEAD`]) : null;
  const [behind, ahead] = String(aheadBehindText || "0 0").trim().split(/\s+/).map(Number);
  const defaultEvidence = latestEvidenceFiles([
    ".deploy-logs", ".seo-audit-runs", ".legal-audit-runs", ".category-audit-runs", ".ops-audit-runs",
  ]);
  const gate = gateReport ? readJson(path.resolve(gateReport), null) : null;
  const lockfile = path.resolve("pnpm-lock.yaml");
  const manifest = {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    release: {
      branch,
      headSha,
      upstream: upstream || null,
      upstreamSha,
      ahead: Number.isFinite(ahead) ? ahead : null,
      behind: Number.isFinite(behind) ? behind : null,
      dirty: statusRows.length > 0,
      changedFiles: statusRows,
    },
    toolchain: {
      node: process.version,
      pnpm: command(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["--version"]),
      vercel: localVercelVersion(),
    },
    lockfile: fs.existsSync(lockfile) ? { file: lockfile, sha256: await sha256File(lockfile) } : null,
    environment: safeEnvStatus(envKeys),
    gate: gate ? {
      report: path.resolve(gateReport),
      ok: gate.ok === true,
      headSha: gate.headSha || null,
      releaseCandidate: gate.releaseCandidate === true,
      base: gate.base || null,
      reportId: gate.reportId || null,
      sha256: await sha256File(path.resolve(gateReport)),
    } : null,
    evidence: await evidenceRows([...defaultEvidence, ...evidence]),
    deployment: {
      deployId: deployId || null,
      alias: alias || null,
      rollbackId: rollbackId || null,
    },
    secretValuesIncluded: false,
  };
  manifest.releaseId = `cp-${String(headSha || "unknown").slice(0, 12)}-${sha256Text(JSON.stringify(manifest)).slice(0, 12)}`;
  manifest.ok = Boolean(headSha && !manifest.release.dirty && gate?.ok === true && gate?.headSha === headSha);
  return manifest;
}

function printHuman(report, mode) {
  console.log("CulturePeople release manifest");
  console.log(`- mode: ${mode}`);
  console.log(`- release id: ${report.releaseId}`);
  console.log(`- HEAD: ${report.release.headSha || "unknown"}`);
  console.log(`- dirty/files: ${report.release.dirty}/${report.release.changedFiles.length}`);
  console.log(`- gate: ${report.gate?.ok === true ? "passed" : "missing_or_failed"}`);
  console.log(`- manifest valid for deployment: ${report.ok}`);
  if (report.manifestPath) console.log(`- manifest: ${report.manifestPath}`);
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const evidence = String(values.evidence || "").split(",").map((item) => item.trim()).filter(Boolean);
  const envKeys = String(values["env-keys"] || "").split(",").map((item) => item.trim()).filter(Boolean);
  const report = await buildReleaseManifest({
    evidence,
    gateReport: values["gate-report"] || "",
    deployId: values["deploy-id"] || "",
    alias: values.alias || "",
    rollbackId: values["rollback-id"] || "",
    envKeys: envKeys.length ? envKeys : DEFAULT_ENV_KEYS,
  });
  const apply = flags.has("apply");
  if (apply) {
    const output = path.resolve(values.output || path.join(".release-manifests", `culturepeople-release-${timestampForFile()}.json`));
    report.manifestPath = output;
    writeJsonAtomic(output, report);
  }
  if (flags.has("json")) console.log(JSON.stringify({ ...report, mode: apply ? "apply" : "dry-run" }, null, 2));
  else printHuman(report, apply ? "apply" : "dry-run");
  if (flags.has("require-valid") && !report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[release:manifest] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
