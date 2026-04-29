#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_INPUT_DIR = "exports/supabase";
const DEFAULT_OUTPUT_SQL = "cloudflare/d1/import/generated-import.sql";
const DEFAULT_MANIFEST = "cloudflare/d1/import/media-manifest.json";
const DEFAULT_SUMMARY = "cloudflare/d1/import/rehearsal-summary.json";

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

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJson(filePath, data) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function runJsonStep(label, scriptPath, args) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const endedAt = new Date().toISOString();

  let parsedStdout = null;
  if (result.stdout && result.stdout.trim()) {
    try {
      parsedStdout = JSON.parse(result.stdout);
    } catch {
      parsedStdout = null;
    }
  }

  const step = {
    label,
    scriptPath,
    args,
    startedAt,
    endedAt,
    exitCode: result.status ?? 1,
    ok: result.status === 0,
    stdoutJson: parsedStdout,
    stdoutText: parsedStdout ? null : (result.stdout || "").trim() || null,
    stderrText: (result.stderr || "").trim() || null,
  };

  if (result.error) {
    step.ok = false;
    step.exitCode = 1;
    step.stderrText = `${step.stderrText ? `${step.stderrText}\n` : ""}${result.error.message}`;
  }

  return step;
}

function buildSummary({ config, steps }) {
  return {
    ok: steps.every((step) => step.ok),
    generatedAt: new Date().toISOString(),
    config,
    steps,
  };
}

const { flags, values } = parseArgs(process.argv.slice(2));
const inputDir = path.resolve(values.input || DEFAULT_INPUT_DIR);
const outputSql = path.resolve(values.out || DEFAULT_OUTPUT_SQL);
const outputManifest = path.resolve(values.media || DEFAULT_MANIFEST);
const summaryPath = path.resolve(values.summary || DEFAULT_SUMMARY);
const mediaBaseUrl = values["media-base-url"] || process.env.R2_PUBLIC_BASE_URL || process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL || "";
const failOnWarning = flags.has("fail-on-warning");
const dryRun = flags.has("dry-run");

const config = {
  inputDir,
  outputSql: dryRun ? null : outputSql,
  outputManifest: dryRun ? null : outputManifest,
  summaryPath,
  mediaBaseUrl: mediaBaseUrl || null,
  failOnWarning,
  dryRun,
};

if (!fs.existsSync(inputDir)) {
  const summary = buildSummary({
    config,
    steps: [{
      label: "preflight",
      scriptPath: null,
      args: [],
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      exitCode: 2,
      ok: false,
      stdoutJson: null,
      stdoutText: null,
      stderrText: `Input directory not found: ${inputDir}`,
    }],
  });
  writeJson(summaryPath, summary);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(2);
}

const validateArgs = ["--input", inputDir];
if (failOnWarning) validateArgs.push("--fail-on-warning");
const validateStep = runJsonStep("validate-export", path.resolve("scripts/validate-supabase-export.mjs"), validateArgs);

const steps = [validateStep];
if (!validateStep.ok) {
  const summary = buildSummary({ config, steps });
  writeJson(summaryPath, summary);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(validateStep.exitCode || 1);
}

const prepareArgs = ["--input", inputDir];
if (!dryRun) {
  prepareArgs.push("--out", outputSql, "--media", outputManifest);
}
if (mediaBaseUrl) {
  prepareArgs.push("--media-base-url", mediaBaseUrl);
}
if (dryRun) prepareArgs.push("--dry-run");

const prepareStep = runJsonStep("prepare-import", path.resolve("scripts/prepare-d1-import.mjs"), prepareArgs);
steps.push(prepareStep);
if (!prepareStep.ok) {
  const summary = buildSummary({ config, steps });
  writeJson(summaryPath, summary);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(prepareStep.exitCode || 1);
}

const manifestExists = !dryRun && fs.existsSync(outputManifest);
if (manifestExists) {
  const manifestArgs = ["--input", outputManifest];
  if (failOnWarning) manifestArgs.push("--fail-on-warning");
  const manifestStep = runJsonStep("validate-manifest", path.resolve("scripts/validate-r2-media-manifest.mjs"), manifestArgs);
  steps.push(manifestStep);
  if (!manifestStep.ok) {
    const summary = buildSummary({ config, steps });
    writeJson(summaryPath, summary);
    console.log(JSON.stringify(summary, null, 2));
    process.exit(manifestStep.exitCode || 1);
  }
} else {
  steps.push({
    label: "validate-manifest",
    scriptPath: path.resolve("scripts/validate-r2-media-manifest.mjs"),
    args: dryRun ? ["skipped: dry-run"] : ["skipped: manifest not generated"],
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    exitCode: 0,
    ok: true,
    stdoutJson: {
      skipped: true,
      reason: dryRun ? "dry-run mode does not write a media manifest" : "media manifest not found",
    },
    stdoutText: null,
    stderrText: null,
  });
}

const summary = buildSummary({ config, steps });
writeJson(summaryPath, summary);
console.log(JSON.stringify(summary, null, 2));

if (!summary.ok) {
  process.exit(1);
}
