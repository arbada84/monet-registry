#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_BASE_URL = process.env.MIGRATION_SMOKE_BASE_URL || process.env.SMOKE_BASE_URL || "https://culturepeople.co.kr";
const DEFAULT_REPORT = "cloudflare/d1/import/post-cutover-monitor-report.json";
const DEFAULT_ITERATIONS = 6;
const DEFAULT_INTERVAL_MS = 60000;
const DEFAULT_FAILURE_THRESHOLD = 2;
const DEFAULT_TIMEOUT_MS = 12000;

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

function toPositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function runSmoke(options) {
  const args = [
    path.resolve("scripts/migration-site-smoke.mjs"),
    "--base-url",
    options.baseUrl,
    "--timeout-ms",
    String(options.timeoutMs),
  ];

  if (options.strictFeeds) args.push("--strict-feeds");
  if (options.failOnWarning) args.push("--fail-on-warning");
  if (options.expectDatabaseProvider) args.push("--expect-database-provider", options.expectDatabaseProvider);
  if (options.expectMediaProvider) args.push("--expect-media-provider", options.expectMediaProvider);

  const startedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const endedAt = new Date().toISOString();
  const stdoutJson = parseJsonOrNull(result.stdout);

  return {
    startedAt,
    endedAt,
    exitCode: result.status ?? 1,
    ok: result.status === 0,
    stdoutJson,
    stdoutText: stdoutJson ? null : (result.stdout || "").trim() || null,
    stderrText: (result.stderr || "").trim() || null,
  };
}

function longestFailureStreak(samples) {
  let longest = 0;
  let current = 0;
  for (const sample of samples) {
    if (sample.ok) {
      current = 0;
    } else {
      current += 1;
      longest = Math.max(longest, current);
    }
  }
  return longest;
}

function summarizeFailures(samples) {
  const items = [];
  for (const sample of samples.filter((item) => !item.ok)) {
    const smoke = sample.stdoutJson;
    if (Array.isArray(smoke?.results)) {
      const failedRoutes = smoke.results
        .filter((result) => result.required && !result.ok)
        .map((result) => `${result.path}: ${result.errors?.join("; ") || `HTTP ${result.status}`}`);
      items.push(...failedRoutes);
    } else if (sample.stderrText || sample.stdoutText) {
      items.push(sample.stderrText || sample.stdoutText);
    } else {
      items.push(`Smoke exited with ${sample.exitCode}`);
    }
  }
  return [...new Set(items)].slice(0, 20);
}

function rollbackAdvice(baseUrl) {
  return [
    `Keep the previous Vercel/Supabase deployment available while ${baseUrl} is unstable.`,
    "Restore DNS/route traffic to the previous production target if Cloudflare is already serving production.",
    "Set DATABASE_PROVIDER=supabase and MEDIA_STORAGE_PROVIDER=supabase for rollback deployments until D1/R2 smoke passes.",
    "Pause new writes during rollback triage so content does not split between providers.",
    "Rerun pnpm cloudflare:migration:gate after fixing the failed checks.",
  ];
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const options = {
    baseUrl: String(values["base-url"] || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    iterations: flags.has("once") ? 1 : toPositiveInt(values.iterations, DEFAULT_ITERATIONS),
    intervalMs: toPositiveInt(values["interval-ms"], DEFAULT_INTERVAL_MS),
    failureThreshold: toPositiveInt(values["failure-threshold"], DEFAULT_FAILURE_THRESHOLD),
    timeoutMs: toPositiveInt(values["timeout-ms"], DEFAULT_TIMEOUT_MS),
    expectDatabaseProvider: values["expect-database-provider"] || "",
    expectMediaProvider: values["expect-media-provider"] || "",
    strictFeeds: flags.has("strict-feeds"),
    failOnWarning: flags.has("fail-on-warning"),
    noWrite: flags.has("no-write"),
    reportPath: path.resolve(values.report || DEFAULT_REPORT),
  };

  const samples = [];
  for (let index = 0; index < options.iterations; index += 1) {
    samples.push(runSmoke(options));
    if (index < options.iterations - 1) {
      await sleep(options.intervalMs);
    }
  }

  const failedSamples = samples.filter((sample) => !sample.ok);
  const failureStreak = longestFailureStreak(samples);
  const rollbackRecommended = failedSamples.length >= options.failureThreshold
    || failureStreak >= options.failureThreshold;
  const report = {
    ok: !rollbackRecommended,
    decision: rollbackRecommended ? "ROLLBACK_RECOMMENDED" : "CONTINUE",
    generatedAt: new Date().toISOString(),
    baseUrl: options.baseUrl,
    iterations: options.iterations,
    intervalMs: options.intervalMs,
    failureThreshold: options.failureThreshold,
    timeoutMs: options.timeoutMs,
    expectDatabaseProvider: options.expectDatabaseProvider || null,
    expectMediaProvider: options.expectMediaProvider || null,
    failedSamples: failedSamples.length,
    longestFailureStreak: failureStreak,
    failureSummary: summarizeFailures(samples),
    rollbackAdvice: rollbackRecommended ? rollbackAdvice(options.baseUrl) : [],
    samples,
  };

  if (!options.noWrite) {
    writeJson(options.reportPath, report);
  }

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

await main();
