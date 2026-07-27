#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_BACKUP_ROOT,
  backupSecondCopyConfigFile,
  readConfiguredBackupSecondCopyRoot,
} from "./lib/backup-root.mjs";

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
  console.log(`Usage: node scripts/predeploy-ops-check.mjs [options]

Runs a compact predeploy operations check. Use --dry-run to print the plan only.

Options:
  --root <dir>         Backup root. Default: ${DEFAULT_BACKUP_ROOT}
  --base <url>         Optional production base URL for small portal surface checks.
  --second-copy <dir>  Optional second backup root for status and restore-check-all. Defaults to CULTUREPEOPLE_BACKUP_SECOND_COPY or ${backupSecondCopyConfigFile()}
  --dry-run            Print planned commands without executing them.
  --json               Print machine-readable JSON only.
  --skip-typecheck     Skip pnpm ci:typecheck.
  --skip-portal        Skip verify:portal even when --base is provided.
`);
}

function expandHome(value) {
  const text = String(value || "");
  if (text === "~") return os.homedir();
  if (text.startsWith("~/")) return path.join(os.homedir(), text.slice(2));
  return text;
}

function pnpmCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function commandLabel(command, args) {
  return [command, ...args].join(" ");
}

function buildSteps({ root, baseUrl, secondCopy, skipTypecheck, skipPortal }) {
  const statusArgs = [path.resolve("scripts/local-culturepeople-backup-status.mjs"), "--root", root, "--json"];
  if (secondCopy) statusArgs.push("--second-copy", secondCopy);

  const restoreAllArgs = [path.resolve("scripts/restore-local-backup-copies.mjs"), "--root", root, "--json"];
  if (secondCopy) restoreAllArgs.push("--second-copy", secondCopy);

  const steps = [];
  if (!skipTypecheck) steps.push({ name: "typecheck", command: pnpmCommand(), args: ["ci:typecheck"], required: true });
  steps.push({ name: "env-drift", command: process.execPath, args: [path.resolve("scripts/env-drift-check.mjs"), "--json"], required: false });
  steps.push({ name: "backup-status", command: process.execPath, args: statusArgs, required: true });
  steps.push({ name: "restore-check-all", command: process.execPath, args: restoreAllArgs, required: true });
  steps.push({ name: "ops-audit", command: process.execPath, args: [path.resolve("scripts/culturepeople-ops-audit.mjs"), "--root", root, "--json"], required: true });
  if (baseUrl && !skipPortal) {
    steps.push({ name: "portal-surface", command: process.execPath, args: [path.resolve("scripts/verify-portal-surface.mjs"), "--base", baseUrl, "--json"], required: true });
  }
  return steps;
}

function runStep(step) {
  const startedAt = new Date();
  const result = spawnSync(step.command, step.args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    name: step.name,
    required: step.required,
    command: commandLabel(step.command, step.args),
    status: result.status,
    ok: result.status === 0,
    durationMs: Date.now() - startedAt.getTime(),
    stdoutPreview: String(result.stdout || "").slice(0, 1200),
    stderrPreview: String(result.stderr || "").slice(0, 1200),
  };
}

function printHuman(report) {
  console.log("CulturePeople predeploy ops check");
  console.log(`- ok: ${report.ok}`);
  console.log(`- mode: ${report.mode}`);
  console.log(`- root: ${report.root}`);
  if (report.baseUrl) console.log(`- base: ${report.baseUrl}`);
  for (const step of report.steps) {
    console.log(`- ${step.name}: ${step.ok == null ? "planned" : step.ok ? "ok" : "failed"}${step.required ? "" : " optional"}`);
    if (report.mode === "dry-run") console.log(`  $ ${step.command}`);
  }
  for (const warning of report.warnings) console.log(`- warning: ${warning}`);
  for (const error of report.errors) console.log(`- error: ${error}`);
}

function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  if (flags.has("help") || flags.has("h")) {
    printHelp();
    return;
  }

  const root = path.resolve(expandHome(values.root || DEFAULT_BACKUP_ROOT));
  const secondCopy = values["second-copy"] ? path.resolve(expandHome(values["second-copy"])) : readConfiguredBackupSecondCopyRoot();
  const baseUrl = values.base || "";
  const dryRun = flags.has("dry-run");
  const planned = buildSteps({
    root,
    baseUrl,
    secondCopy,
    skipTypecheck: flags.has("skip-typecheck"),
    skipPortal: flags.has("skip-portal"),
  });
  const warnings = [];
  const errors = [];
  const steps = dryRun
    ? planned.map((step) => ({
      name: step.name,
      required: step.required,
      command: commandLabel(step.command, step.args),
      ok: null,
      status: null,
    }))
    : planned.map(runStep);

  if (!baseUrl && !flags.has("skip-portal")) warnings.push("Portal surface check skipped because --base was not provided.");
  if (!secondCopy) warnings.push("Second copy restore-check skipped because --second-copy was not provided.");

  if (!dryRun) {
    for (const step of steps) {
      if (!step.ok && step.required) errors.push(`${step.name} failed with status ${step.status}.`);
    }
  }

  const report = {
    ok: errors.length === 0,
    mode: dryRun ? "dry-run" : "run",
    generatedAt: new Date().toISOString(),
    root,
    secondCopy: secondCopy || null,
    baseUrl: baseUrl || null,
    steps,
    warnings,
    errors,
  };

  if (flags.has("json")) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
