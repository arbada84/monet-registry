#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { parseArgs, readJson, timestampForFile, writeJsonAtomic } from "./lib/culturepeople-ops-utils.mjs";

const DEFAULT_QUEUED_MAX_HOURS = 6;

function runGh(limit) {
  const result = spawnSync("gh", [
    "run", "list", "--workflow", "ci.yml", "--limit", String(limit),
    "--json", "databaseId,displayTitle,event,headBranch,headSha,status,conclusion,createdAt,updatedAt,url",
  ], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    const detail = String(result.stderr || result.stdout || result.error?.message || "GitHub CLI failed").trim().slice(0, 500);
    throw new Error(detail);
  }
  return JSON.parse(result.stdout || "[]");
}

function ageHours(value, now) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? Math.round(((now - parsed) / 36e5) * 10) / 10 : null;
}

export function buildGithubActionsHealth({ runs = [], headSha = "", queuedMaxHours = DEFAULT_QUEUED_MAX_HOURS, now = Date.now() } = {}) {
  const normalized = Array.isArray(runs) ? runs : [];
  const queuedStale = normalized.filter((run) => {
    if (!new Set(["queued", "waiting", "pending"]).has(String(run?.status || "").toLowerCase())) return false;
    const hours = ageHours(run?.createdAt, now);
    return hours != null && hours >= queuedMaxHours;
  }).map((run) => ({
    databaseId: run.databaseId ?? null,
    headSha: run.headSha || null,
    status: run.status || null,
    createdAt: run.createdAt || null,
    ageHours: ageHours(run.createdAt, now),
    url: run.url || null,
  }));
  const sameShaRuns = headSha ? normalized.filter((run) => run?.headSha === headSha) : [];
  const successfulSameSha = sameShaRuns.find((run) => run.status === "completed" && run.conclusion === "success") || null;
  let consecutiveFailures = 0;
  for (const run of normalized) {
    if (run.status !== "completed") continue;
    if (run.conclusion === "success") break;
    if (run.conclusion === "failure") consecutiveFailures += 1;
  }
  const errors = [];
  if (headSha && !successfulSameSha) errors.push(`No successful ci.yml run was found for HEAD ${headSha}.`);
  if (queuedStale.length) errors.push(`${queuedStale.length} GitHub Actions run(s) have remained queued longer than ${queuedMaxHours} hours.`);
  return {
    ok: errors.length === 0,
    generatedAt: new Date(now).toISOString(),
    headSha: headSha || null,
    totalRuns: normalized.length,
    sameShaRuns: sameShaRuns.length,
    successfulSameSha: successfulSameSha ? {
      databaseId: successfulSameSha.databaseId ?? null,
      headSha: successfulSameSha.headSha,
      updatedAt: successfulSameSha.updatedAt || null,
      url: successfulSameSha.url || null,
    } : null,
    consecutiveFailures,
    queuedMaxHours,
    queuedStale,
    errors,
  };
}

function gitHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const input = values.input ? path.resolve(values.input) : "";
  let runs;
  try {
    runs = input ? readJson(input, []) : runGh(Number(values.limit || 30));
  } catch (error) {
    const report = { ok: false, generatedAt: new Date().toISOString(), errors: [error instanceof Error ? error.message : String(error)] };
    if (flags.has("json")) console.log(JSON.stringify(report, null, 2));
    else console.error(`[ops:github-actions-health] ${report.errors[0]}`);
    process.exitCode = 1;
    return;
  }
  const report = buildGithubActionsHealth({
    runs,
    headSha: values.sha || gitHead(),
    queuedMaxHours: Number(values["queued-max-hours"] || DEFAULT_QUEUED_MAX_HOURS),
  });
  if (!flags.has("no-write")) {
    const output = path.resolve(values.report || path.join(".release-manifests", `github-actions-health-${timestampForFile()}.json`));
    report.reportPath = output;
    writeJsonAtomic(output, report);
  }
  if (flags.has("json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log("CulturePeople GitHub Actions health");
    console.log(`- ok: ${report.ok}`);
    console.log(`- same SHA successful: ${Boolean(report.successfulSameSha)}`);
    console.log(`- consecutive failures: ${report.consecutiveFailures}`);
    console.log(`- stale queued: ${report.queuedStale.length}`);
    for (const error of report.errors) console.log(`- error: ${error}`);
    if (report.reportPath) console.log(`- report: ${report.reportPath}`);
  }
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
