#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_BACKUP_ROOT } from "./lib/backup-root.mjs";
import fs from "node:fs";
import crypto from "node:crypto";

const APPLY_CONFIRMATION = "APPLY_SUPABASE_RECOVERED_BACKUP";

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
  console.log(`Usage: node scripts/supabase-recovered-backup.mjs [options]

Runs the safe post-Supabase-recovery backup chain. Default mode is dry-run.
Use --apply only after supabase:recovery-check is ready.

Options:
  --root <dir>      Backup root. Default: ${DEFAULT_BACKUP_ROOT}
  --apply           Run the backup chain if Supabase is ready.
  --dry-run         Print the planned chain only. Default.
  --plan <file>     Approved dry-run report. Required with --apply.
  --report-id <id>  Matching report ID. Required with --apply.
  --confirm ${APPLY_CONFIRMATION}
                     Explicit apply confirmation.
  --json            Print machine-readable JSON only.
`);
}

function expandHome(value) {
  const text = String(value || "");
  if (text === "~") return os.homedir();
  if (text.startsWith("~/")) return path.join(os.homedir(), text.slice(2));
  return text;
}

function runNodeJson(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  let json = null;
  try {
    json = JSON.parse(result.stdout || "{}");
  } catch (error) {
    json = {
      ok: false,
      parseError: error instanceof Error ? error.message : String(error),
      stdout: String(result.stdout || "").slice(0, 1000),
      stderr: String(result.stderr || "").slice(0, 1000),
    };
  }
  return {
    ok: result.status === 0 && json?.ok !== false,
    status: result.status,
    args,
    json,
  };
}

function runNodeText(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    args,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

export function buildPlan(root) {
  return [
    {
      name: "supabase-recovery-check",
      args: [path.resolve("scripts/supabase-recovery-check.mjs"), "--require-storage"],
    },
    {
      name: "backup-local-quiet",
      args: [path.resolve("scripts/run-local-backup-quiet.mjs"), "--root", root, "--json"],
    },
    {
      name: "restore-check",
      args: [path.resolve("scripts/restore-local-culturepeople-backup.mjs"), "--latest", "--root", root, "--json"],
    },
    {
      name: "status",
      args: [path.resolve("scripts/local-culturepeople-backup-status.mjs"), "--root", root, "--json"],
    },
  ];
}

function printHuman(report) {
  console.log("CulturePeople Supabase recovered backup");
  console.log(`- ok: ${report.ok}`);
  console.log(`- mode: ${report.mode}`);
  console.log(`- root: ${report.root}`);
  console.log(`- blocked: ${report.blocked}`);
  if (report.recovery?.classification) {
    console.log(`- Supabase phase: ${report.recovery.classification.phase}`);
    console.log(`- ready DB/storage: ${report.recovery.classification.readyForDbExport}/${report.recovery.classification.readyForStorageCopy}`);
  }
  for (const step of report.steps) console.log(`- step ${step.name}: ${step.statusText}`);
  for (const warning of report.warnings) console.log(`- warning: ${warning}`);
  for (const error of report.errors) console.log(`- error: ${error}`);
}

function reportIdFor(report) {
  return `supabase-${crypto.createHash("sha256").update(JSON.stringify({ root: report.root, recovery: report.recovery, generatedAt: report.generatedAt })).digest("hex").slice(0, 20)}`;
}

function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  if (flags.has("help") || flags.has("h")) {
    printHelp();
    return;
  }

  const root = path.resolve(expandHome(values.root || DEFAULT_BACKUP_ROOT));
  const apply = flags.has("apply");
  const plan = buildPlan(root);
  const warnings = [];
  const errors = [];
  const steps = [];
  const recoveryStep = plan[0];
  const recoveryResult = runNodeJson(recoveryStep.args);
  const recovery = recoveryResult.json;
  const ready = Boolean(recovery?.classification?.readyForDbExport && recovery?.classification?.readyForStorageCopy);
  const blocked = !ready;

  if (apply) {
    const planPath = values.plan ? path.resolve(expandHome(values.plan)) : "";
    const approved = planPath && fs.existsSync(planPath) ? JSON.parse(fs.readFileSync(planPath, "utf8")) : null;
    if (!approved || approved.reportId !== values["report-id"] || approved.reportId !== reportIdFor(approved)) {
      errors.push("Apply blocked: --plan and matching --report-id from a current dry-run are required.");
    }
    const planAgeHours = approved?.generatedAt ? (Date.now() - Date.parse(approved.generatedAt)) / 36e5 : Number.POSITIVE_INFINITY;
    if (approved?.mode !== "dry-run" || path.resolve(approved?.root || "") !== root || !Number.isFinite(planAgeHours) || planAgeHours > 24) {
      errors.push("Apply blocked: approved dry-run must match this root and be less than 24 hours old.");
    }
    if (values.confirm !== APPLY_CONFIRMATION) errors.push(`Apply blocked: --confirm ${APPLY_CONFIRMATION} is required.`);
    if (approved?.blocked || approved?.recovery?.classification?.readyForDbExport !== true || approved?.recovery?.classification?.readyForStorageCopy !== true) {
      errors.push("Apply blocked: approved report does not show DB and Storage ready.");
    }
  }

  steps.push({
    name: recoveryStep.name,
    status: recoveryResult.status,
    statusText: ready ? "ready" : "blocked",
  });

  if (blocked) {
    warnings.push(`Supabase is not ready for fresh export/storage copy: ${recovery?.classification?.phase || "unknown"}.`);
    for (const action of recovery?.classification?.nextActions || []) warnings.push(action);
  }

  if (apply && ready && errors.length === 0) {
    for (const step of plan.slice(1)) {
      const result = step.name === "backup-local-quiet" ? runNodeText(step.args) : runNodeJson(step.args);
      steps.push({
        name: step.name,
        status: result.status,
        statusText: result.ok ? "ok" : "failed",
      });
      if (!result.ok) {
        errors.push(`${step.name} failed with status ${result.status}.`);
        break;
      }
    }
  } else if (apply && blocked) {
    errors.push("Blocked: refusing to run fresh backup because Supabase recovery-check is not ready.");
  } else {
    for (const step of plan.slice(1)) {
      steps.push({ name: step.name, status: null, statusText: "planned" });
    }
  }

  const report = {
    ok: errors.length === 0,
    mode: apply ? "apply" : "dry-run",
    generatedAt: new Date().toISOString(),
    root,
    blocked,
    recovery,
    steps,
    warnings,
    errors,
  };
  report.reportId = reportIdFor(report);

  if (!apply) {
    const reportPath = path.resolve(expandHome(values.report || path.join(".ops-audit-runs", `supabase-recovered-backup-${report.generatedAt.replace(/[:.]/g, "-")}.json`)));
    report.reportPath = reportPath;
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  }

  if (flags.has("json")) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);

  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
