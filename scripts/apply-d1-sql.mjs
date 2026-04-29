#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_DATABASE = "culturepeople-staging";
const DEFAULT_SCHEMA_FILE = "cloudflare/d1/migrations/0001_initial_schema.sql";
const DEFAULT_IMPORT_FILE = "cloudflare/d1/import/generated-import.sql";
const DEFAULT_REPORT = "cloudflare/d1/import/d1-apply-report.json";
const DEFAULT_REHEARSAL_SUMMARY = "cloudflare/d1/import/rehearsal-summary.json";

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

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function isProductionDatabase(name) {
  return /\bprod\b|production|culturepeople-prod/i.test(name);
}

function sqlLooksDangerous(filePath) {
  const text = fs.readFileSync(filePath, "utf8").toLowerCase();
  return /\bdrop\s+table\b|\bdelete\s+from\b|\btruncate\b/.test(text);
}

function getKind(value) {
  if (value === "import" || value === "schema") return value;
  return "schema";
}

function buildWranglerArgs({ database, filePath, remote, local }) {
  const args = ["wrangler", "d1", "execute", database];
  if (remote) args.push("--remote");
  if (local) args.push("--local");
  args.push("--file", filePath);
  return args;
}

const { flags, values } = parseArgs(process.argv.slice(2));
const kind = getKind(values.kind);
const database = values.database || DEFAULT_DATABASE;
const filePath = path.resolve(values.file || (kind === "import" ? DEFAULT_IMPORT_FILE : DEFAULT_SCHEMA_FILE));
const reportPath = path.resolve(values.report || DEFAULT_REPORT);
const rehearsalSummaryPath = path.resolve(values.summary || DEFAULT_REHEARSAL_SUMMARY);
const apply = flags.has("apply");
const remote = flags.has("remote");
const local = flags.has("local");
const confirmProduction = flags.has("confirm-production");
const skipRehearsalCheck = flags.has("skip-rehearsal-check");
const allowDangerousSql = flags.has("allow-dangerous-sql");

const report = {
  ok: false,
  generatedAt: new Date().toISOString(),
  kind,
  database,
  filePath,
  reportPath,
  apply,
  mode: remote ? "remote" : local ? "local" : "unspecified",
  command: null,
  checks: [],
  errors: [],
  warnings: [],
  result: null,
};

function addCheck(name, ok, detail = null) {
  report.checks.push({ name, ok, detail: ok ? null : detail });
  if (!ok) report.errors.push(detail || `${name} failed.`);
}

addCheck("sql_file_exists", fs.existsSync(filePath), `SQL file not found: ${filePath}`);
if (fs.existsSync(filePath)) {
  const stat = fs.statSync(filePath);
  addCheck("sql_file_not_empty", stat.size > 0, "SQL file is empty.");
  report.fileBytes = stat.size;
  if (sqlLooksDangerous(filePath)) {
    const message = "SQL contains DROP TABLE, DELETE FROM, or TRUNCATE. Pass --allow-dangerous-sql only after manual review.";
    if (allowDangerousSql) report.warnings.push(message);
    else addCheck("dangerous_sql_guard", false, message);
  } else {
    addCheck("dangerous_sql_guard", true);
  }
}

if (remote && local) {
  addCheck("single_mode", false, "Use either --remote or --local, not both.");
} else {
  addCheck("single_mode", true);
}

if (apply && !remote && !local) {
  addCheck("explicit_mode_for_apply", false, "Pass --remote or --local when using --apply.");
} else {
  addCheck("explicit_mode_for_apply", true);
}

if (isProductionDatabase(database) && !confirmProduction) {
  addCheck("production_confirmation", false, "Production database requires --confirm-production.");
} else {
  addCheck("production_confirmation", true);
}

if (kind === "import" && !skipRehearsalCheck) {
  const summary = readJsonIfExists(rehearsalSummaryPath);
  addCheck(
    "rehearsal_summary_ok",
    summary?.ok === true,
    `Import apply requires a passing rehearsal summary at ${rehearsalSummaryPath}.`,
  );
}

const wranglerArgs = buildWranglerArgs({ database, filePath, remote, local });
report.command = ["npx", ...wranglerArgs];

if (report.errors.length === 0 && apply) {
  const result = spawnSync("npx", wranglerArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  report.result = {
    exitCode: result.status ?? 1,
    stdout: (result.stdout || "").trim() || null,
    stderr: (result.stderr || "").trim() || null,
  };
  report.ok = result.status === 0;
  if (!report.ok) {
    report.errors.push(report.result.stderr || report.result.stdout || "Wrangler D1 execute failed.");
  }
} else {
  report.ok = report.errors.length === 0;
  report.result = {
    dryRun: !apply,
    message: apply
      ? "Not executed because preflight checks failed."
      : "Dry-run only. Pass --apply with --remote or --local to execute.",
  };
}

writeJson(reportPath, report);
console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  process.exitCode = report.errors.length ? 1 : 2;
}
