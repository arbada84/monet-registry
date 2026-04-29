#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_BASE_URL = process.env.MIGRATION_SMOKE_BASE_URL || process.env.SMOKE_BASE_URL || "https://culturepeople.co.kr";
const DEFAULT_DATABASE = "culturepeople-staging";
const DEFAULT_REPORT = "cloudflare/d1/import/cutover-gate-report.json";

function parseArgs(argv) {
  const flags = new Set();
  const values = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
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

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function parseJsonOrNull(text) {
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function runStep(label, scriptPath, args) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const endedAt = new Date().toISOString();
  const stdoutJson = parseJsonOrNull(result.stdout);

  return {
    label,
    scriptPath,
    args,
    startedAt,
    endedAt,
    exitCode: result.status ?? 1,
    ok: result.status === 0,
    stdoutJson,
    stdoutText: stdoutJson ? null : (result.stdout || "").trim() || null,
    stderrText: (result.stderr || "").trim() || null,
  };
}

function stepSummary(step) {
  const json = step.stdoutJson;
  if (!json || typeof json !== "object") return null;

  if (step.label === "readiness") {
    return {
      readyNow: json.readiness?.readyNow ?? false,
      phase: json.readiness?.phase ?? null,
      blockers: json.readiness?.blockers || [],
      warnings: json.readiness?.warnings || [],
      nextActions: json.readiness?.nextActions || [],
    };
  }

  if (step.label === "d1-verify") {
    return {
      checks: Array.isArray(json.checks) ? json.checks.length : 0,
      errors: json.errors || [],
      warnings: json.warnings || [],
    };
  }

  if (step.label === "r2-verify") {
    return {
      checked: json.checked ?? 0,
      failedCount: json.failedCount ?? 0,
      warningCount: json.warningCount ?? 0,
    };
  }

  if (step.label === "site-smoke") {
    return {
      baseUrl: json.baseUrl,
      requiredFailures: json.requiredFailures ?? 0,
      optionalFailures: json.optionalFailures ?? 0,
      warningCount: json.warningCount ?? 0,
    };
  }

  return null;
}

function collectBlockers(steps) {
  const blockers = [];
  const warnings = [];

  for (const step of steps) {
    const json = step.stdoutJson;
    if (step.ok) {
      const summary = stepSummary(step);
      if (summary?.warnings?.length) {
        for (const warning of summary.warnings) warnings.push(`${step.label}: ${warning}`);
      }
      if (step.label === "r2-verify" && summary?.warningCount > 0) {
        warnings.push(`${step.label}: ${summary.warningCount} public media warning(s).`);
      }
      if (step.label === "site-smoke" && summary?.warningCount > 0) {
        warnings.push(`${step.label}: ${summary.warningCount} route warning(s).`);
      }
      if (step.label === "site-smoke" && summary?.optionalFailures > 0) {
        warnings.push(`${step.label}: ${summary.optionalFailures} optional route failure(s).`);
      }
      continue;
    }

    if (step.label === "readiness" && json?.readiness?.blockers?.length) {
      for (const blocker of json.readiness.blockers) blockers.push(`${step.label}: ${blocker}`);
    } else if (step.label === "d1-verify" && json?.errors?.length) {
      for (const error of json.errors) blockers.push(`${step.label}: ${error}`);
    } else if (step.label === "r2-verify" && Array.isArray(json?.results)) {
      const failed = json.results.filter((entry) => entry.status === "failed").slice(0, 10);
      for (const item of failed) blockers.push(`${step.label}: ${item.public_url || item.object_key || item.id} failed${item.error ? ` (${item.error})` : ""}`);
    } else if (step.label === "site-smoke" && Array.isArray(json?.results)) {
      const failed = json.results.filter((entry) => entry.required && !entry.ok);
      for (const item of failed) blockers.push(`${step.label}: ${item.path} failed (${item.errors?.join("; ") || "unknown"})`);
    } else {
      blockers.push(`${step.label}: exited with ${step.exitCode}${step.stderrText ? ` (${step.stderrText.slice(0, 220)})` : ""}`);
    }

    if (json?.warnings?.length) {
      for (const warning of json.warnings) warnings.push(`${step.label}: ${warning}`);
    }
  }

  return { blockers, warnings };
}

function maybeAddValue(args, key, value) {
  if (value) args.push(key, value);
}

const { flags, values } = parseArgs(process.argv.slice(2));
const baseUrl = values["base-url"] || DEFAULT_BASE_URL;
const database = values.database || DEFAULT_DATABASE;
const reportPath = path.resolve(values.report || DEFAULT_REPORT);
const steps = [];

if (!flags.has("skip-readiness")) {
  const readinessArgs = [];
  if (flags.has("skip-supabase-check")) readinessArgs.push("--skip-supabase-check");
  if (flags.has("skip-cloudflare-check")) readinessArgs.push("--skip-cloudflare-check");
  maybeAddValue(readinessArgs, "--input", values.input);
  maybeAddValue(readinessArgs, "--out", values.out);
  maybeAddValue(readinessArgs, "--media", values.media);
  maybeAddValue(readinessArgs, "--summary", values.summary);
  maybeAddValue(readinessArgs, "--base-url", baseUrl);
  maybeAddValue(readinessArgs, "--expect-live-database-provider", values["expect-database-provider"]);
  maybeAddValue(readinessArgs, "--expect-live-media-provider", values["expect-media-provider"]);
  steps.push(runStep("readiness", path.resolve("scripts/migration-readiness-report.mjs"), readinessArgs));
}

if (!flags.has("skip-d1-verify")) {
  const d1Args = ["--database", database];
  if (flags.has("remote")) d1Args.push("--remote");
  if (flags.has("local")) d1Args.push("--local");
  if (flags.has("http-api")) d1Args.push("--http-api");
  if (flags.has("fail-on-warning")) d1Args.push("--fail-on-warning");
  maybeAddValue(d1Args, "--summary", values.summary);
  maybeAddValue(d1Args, "--media", values.media);
  maybeAddValue(d1Args, "--counts-json", values["counts-json"]);
  steps.push(runStep("d1-verify", path.resolve("scripts/verify-d1-import.mjs"), d1Args));
}

if (!flags.has("skip-r2-verify")) {
  const r2Args = [];
  if (flags.has("fail-on-warning")) r2Args.push("--fail-on-warning");
  maybeAddValue(r2Args, "--input", values.media);
  maybeAddValue(r2Args, "--limit", values["r2-limit"]);
  maybeAddValue(r2Args, "--timeout-ms", values["timeout-ms"]);
  maybeAddValue(r2Args, "--report", values["r2-report"]);
  steps.push(runStep("r2-verify", path.resolve("scripts/verify-r2-media-public.mjs"), r2Args));
}

if (!flags.has("skip-smoke")) {
  const smokeArgs = ["--base-url", baseUrl];
  if (flags.has("strict-feeds")) smokeArgs.push("--strict-feeds");
  if (flags.has("fail-on-warning")) smokeArgs.push("--fail-on-warning");
  maybeAddValue(smokeArgs, "--timeout-ms", values["timeout-ms"]);
  maybeAddValue(smokeArgs, "--expect-database-provider", values["expect-database-provider"]);
  maybeAddValue(smokeArgs, "--expect-media-provider", values["expect-media-provider"]);
  steps.push(runStep("site-smoke", path.resolve("scripts/migration-site-smoke.mjs"), smokeArgs));
}

const { blockers, warnings } = collectBlockers(steps);
const report = {
  ok: blockers.length === 0,
  decision: blockers.length === 0 ? "GO" : "NO_GO",
  generatedAt: new Date().toISOString(),
  baseUrl,
  database,
  reportPath,
  blockers,
  warnings,
  stepSummaries: steps.map((step) => ({
    label: step.label,
    ok: step.ok,
    exitCode: step.exitCode,
    summary: stepSummary(step),
  })),
  steps,
};

if (!flags.has("no-write")) {
  writeJson(reportPath, report);
}

console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  process.exitCode = 1;
}
