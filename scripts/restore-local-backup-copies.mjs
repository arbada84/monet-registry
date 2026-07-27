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
  console.log(`Usage: node scripts/restore-local-backup-copies.mjs [options]

Runs read-only restore rehearsals for the primary local backup and, optionally,
a second backup copy.

Options:
  --root <dir>          Primary backup root. Default: ${DEFAULT_BACKUP_ROOT}
  --second-copy <dir>   Second backup root to verify. Defaults to CULTUREPEOPLE_BACKUP_SECOND_COPY or ${backupSecondCopyConfigFile()}
  --json                Print machine-readable JSON only.
  --skip-sqlite-cli     Forward to restore-check for machines without sqlite3.
`);
}

function expandHome(value) {
  const text = String(value || "");
  if (text === "~") return os.homedir();
  if (text.startsWith("~/")) return path.join(os.homedir(), text.slice(2));
  return text;
}

function runRestoreCheck(label, root, flags) {
  const args = [
    path.resolve("scripts/restore-local-culturepeople-backup.mjs"),
    "--latest",
    "--root", root,
    "--json",
  ];
  if (flags.has("skip-sqlite-cli")) args.push("--skip-sqlite-cli");

  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  let report = null;
  try {
    report = JSON.parse(result.stdout || "{}");
  } catch (error) {
    report = {
      ok: false,
      errors: [`could not parse restore-check JSON: ${error instanceof Error ? error.message : String(error)}`],
      stdout: String(result.stdout || "").slice(0, 1000),
      stderr: String(result.stderr || "").slice(0, 1000),
    };
  }

  return {
    label,
    root,
    ok: result.status === 0 && report?.ok === true,
    status: result.status,
    report,
  };
}

function printHuman(report) {
  console.log("CulturePeople local backup restore checks");
  console.log(`- ok: ${report.ok}`);
  for (const check of report.checks) {
    console.log(`- ${check.label}: ok=${check.ok} root=${check.root}`);
    for (const warning of check.report?.warnings || []) console.log(`  - warning: ${warning}`);
    for (const error of check.report?.errors || []) console.log(`  - error: ${error}`);
  }
}

function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  if (flags.has("help") || flags.has("h")) {
    printHelp();
    return;
  }

  const root = path.resolve(expandHome(values.root || DEFAULT_BACKUP_ROOT));
  const secondCopy = values["second-copy"] ? path.resolve(expandHome(values["second-copy"])) : readConfiguredBackupSecondCopyRoot();
  const checks = [
    runRestoreCheck("primary", root, flags),
  ];
  if (secondCopy) checks.push(runRestoreCheck("second-copy", secondCopy, flags));

  const report = {
    ok: checks.every((check) => check.ok),
    generatedAt: new Date().toISOString(),
    checks,
  };

  if (flags.has("json")) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);

  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
