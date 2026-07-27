#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_DATABASE = "culturepeople-staging";
const DEFAULT_SCHEMA_FILE = "cloudflare/d1/migrations/0001_initial_schema.sql";
const DEFAULT_IMPORT_FILE = "cloudflare/d1/import/generated-import.sql";
const DEFAULT_REPORT = "cloudflare/d1/import/d1-apply-report.json";
const DEFAULT_REHEARSAL_SUMMARY = "cloudflare/d1/import/rehearsal-summary.json";
const DEFAULT_HTTP_API_BATCH_SIZE = 50;

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

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && value) values[key] = value;
  }
  return values;
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

function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let quote = null;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
        current += char;
      }
      continue;
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        i += 1;
      }
      continue;
    }

    if (!quote && char === "-" && next === "-") {
      lineComment = true;
      i += 1;
      continue;
    }

    if (!quote && char === "/" && next === "*") {
      blockComment = true;
      i += 1;
      continue;
    }

    if (quote) {
      current += char;
      if (char === quote) {
        if (next === quote) {
          current += next;
          i += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (char === "'" || char === "\"" || char === "`") {
      quote = char;
      current += char;
      continue;
    }

    if (char === ";") {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = "";
      continue;
    }

    current += char;
  }

  const finalStatement = current.trim();
  if (finalStatement) statements.push(finalStatement);
  return statements;
}

async function cloudflareRequest({ accountId, apiToken, endpoint, method = "GET", body }) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { success: false, errors: [{ message: text || response.statusText }] };
  }
  return {
    ok: response.ok && json.success !== false,
    status: response.status,
    json,
  };
}

function summarizeCloudflareErrors(json) {
  const errors = Array.isArray(json?.errors) ? json.errors : [];
  return errors
    .map((error) => (typeof error === "string" ? error : error?.message))
    .filter(Boolean)
    .join("; ") || "unknown error";
}

async function resolveD1DatabaseId({ accountId, apiToken, database }) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(database)) {
    return database;
  }

  const result = await cloudflareRequest({
    accountId,
    apiToken,
    endpoint: `/accounts/${accountId}/d1/database`,
  });

  if (!result.ok) {
    throw new Error(`D1 list failed (${result.status}): ${summarizeCloudflareErrors(result.json)}`);
  }

  const databases = Array.isArray(result.json.result) ? result.json.result : [];
  const found = databases.find((item) => item.name === database);
  if (!found?.uuid) {
    throw new Error(`D1 database not found: ${database}`);
  }
  return found.uuid;
}

function toPositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function isHttpApiControlStatement(statement) {
  const normalized = statement.replace(/\s+/g, " ").trim().toUpperCase();
  return (
    normalized === "BEGIN" ||
    normalized === "BEGIN TRANSACTION" ||
    normalized === "COMMIT" ||
    normalized === "ROLLBACK" ||
    normalized.startsWith("PRAGMA FOREIGN_KEYS")
  );
}

function chunkStatements(statements, size) {
  const chunks = [];
  for (let i = 0; i < statements.length; i += size) {
    chunks.push(statements.slice(i, i + size));
  }
  return chunks;
}

async function executeWithHttpApi({
  accountId,
  apiToken,
  databaseId,
  statements,
  batchSize,
  startIndex,
  skipOversizedStatements,
  maxStatementChars,
}) {
  const allExecutableEntries = statements
    .filter((statement) => !isHttpApiControlStatement(statement))
    .map((statement, index) => ({ statement, index: index + 1 }));
  const skippedControlStatements = statements.length - allExecutableEntries.length;
  const skippedBeforeStart = allExecutableEntries.filter((entry) => entry.index < startIndex).length;
  const oversizedEntries = [];
  const executableEntries = allExecutableEntries.filter((entry) => {
    if (entry.index < startIndex) return false;
    if (skipOversizedStatements && entry.statement.length > maxStatementChars) {
      oversizedEntries.push({
        index: entry.index,
        length: entry.statement.length,
        sqlPreview: entry.statement.replace(/\s+/g, " ").slice(0, 160),
      });
      return false;
    }
    return true;
  });
  const batches = chunkStatements(executableEntries, batchSize);
  const results = [];

  for (const [batchIndex, batch] of batches.entries()) {
    const batchStartIndex = batch[0]?.index ?? startIndex;
    const batchEndIndex = batch[batch.length - 1]?.index ?? batchStartIndex;
    const result = await cloudflareRequest({
      accountId,
      apiToken,
      endpoint: `/accounts/${accountId}/d1/database/${databaseId}/query`,
      method: "POST",
      body: { batch: batch.map((entry) => ({ sql: entry.statement })) },
    });

    const entry = {
      batch: batchIndex + 1,
      startIndex: batchStartIndex,
      endIndex: batchEndIndex,
      ok: result.ok,
      status: result.status,
      statements: batch.length,
      sqlPreview: batch[0]?.statement.replace(/\s+/g, " ").slice(0, 160) || "",
      errors: [],
    };

    if (!result.ok) {
      entry.errors.push(summarizeCloudflareErrors(result.json));
    } else {
      const batchResults = Array.isArray(result.json.result) ? result.json.result : [];
      const failedResults = batchResults
        .map((item, offset) => ({ item, offset }))
        .filter(({ item }) => item?.success === false);
      if (failedResults.length > 0) {
        entry.ok = false;
        entry.errors.push(...failedResults.map(({ item, offset }) => {
          const message = summarizeCloudflareErrors({ errors: item?.error ? [item.error] : item?.errors });
          return `statement ${batch[offset]?.index ?? batchStartIndex + offset}: ${message}`;
        }));
      }
      entry.rowsWritten = batchResults.reduce((total, item) => total + Number(item?.meta?.rows_written || 0), 0);
      entry.changes = batchResults.reduce((total, item) => total + Number(item?.meta?.changes || 0), 0);
    }

    results.push(entry);

    if (!entry.ok) {
      const error = new Error(`D1 batch ${entry.batch} failed (${entry.status}): ${entry.errors.join("; ")}`);
      error.results = results;
      error.appliedStatements = results
        .filter((item) => item.ok)
        .reduce((total, item) => total + item.statements, 0);
      error.skippedControlStatements = skippedControlStatements;
      error.skippedBeforeStart = skippedBeforeStart;
      error.skippedOversizedStatements = oversizedEntries;
      throw error;
    }
  }

  return {
    results,
    totalExecutableStatements: allExecutableEntries.length,
    executableStatements: executableEntries.length,
    skippedControlStatements,
    skippedBeforeStart,
    skippedOversizedStatements: oversizedEntries,
  };
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
const httpApi = flags.has("http-api");
const httpApiBatchSize = toPositiveInt(values["batch-size"], DEFAULT_HTTP_API_BATCH_SIZE);
const httpApiStartIndex = toPositiveInt(values["start-index"], 1);
const skipOversizedStatements = flags.has("skip-oversized-statements");
const maxStatementChars = toPositiveInt(values["max-statement-chars"], 100000);
const confirmProduction = flags.has("confirm-production");
const skipRehearsalCheck = flags.has("skip-rehearsal-check");
const allowDangerousSql = flags.has("allow-dangerous-sql");
const dotEnv = {
  ...readDotEnv(path.resolve(".env.local")),
  ...readDotEnv(path.resolve(".env.production.local")),
  ...process.env,
};

const report = {
  ok: false,
  generatedAt: new Date().toISOString(),
  kind,
  database,
  filePath,
  reportPath,
  apply,
  mode: httpApi ? "http-api" : remote ? "remote" : local ? "local" : "unspecified",
  httpApiBatchSize: httpApi ? httpApiBatchSize : null,
  httpApiStartIndex: httpApi ? httpApiStartIndex : null,
  skipOversizedStatements: httpApi ? skipOversizedStatements : null,
  maxStatementChars: httpApi && skipOversizedStatements ? maxStatementChars : null,
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

if (httpApi && local) {
  addCheck("http_api_mode", false, "--http-api cannot be combined with --local.");
} else {
  addCheck("http_api_mode", true);
}

if (apply && !remote && !local && !httpApi) {
  addCheck("explicit_mode_for_apply", false, "Pass --remote, --local, or --http-api when using --apply.");
} else {
  addCheck("explicit_mode_for_apply", true);
}

if (httpApi) {
  addCheck("http_api_account_id", Boolean(dotEnv.CLOUDFLARE_ACCOUNT_ID), "CLOUDFLARE_ACCOUNT_ID is required for --http-api.");
  addCheck("http_api_token", Boolean(dotEnv.CLOUDFLARE_API_TOKEN), "CLOUDFLARE_API_TOKEN is required for --http-api.");
  addCheck("http_api_batch_size", httpApiBatchSize > 0, "--batch-size must be greater than zero.");
  addCheck("http_api_start_index", httpApiStartIndex > 0, "--start-index must be greater than zero.");
  if (skipOversizedStatements) {
    addCheck("http_api_max_statement_chars", maxStatementChars > 0, "--max-statement-chars must be greater than zero.");
  }
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
report.command = httpApi
  ? ["cloudflare-http-api", "d1", "query", database, "--file", filePath]
  : ["npx", ...wranglerArgs];

if (report.errors.length === 0 && apply && httpApi) {
  try {
    const statements = splitSqlStatements(fs.readFileSync(filePath, "utf8"));
    const databaseId = await resolveD1DatabaseId({
      accountId: dotEnv.CLOUDFLARE_ACCOUNT_ID,
      apiToken: dotEnv.CLOUDFLARE_API_TOKEN,
      database,
    });
    const results = await executeWithHttpApi({
      accountId: dotEnv.CLOUDFLARE_ACCOUNT_ID,
      apiToken: dotEnv.CLOUDFLARE_API_TOKEN,
      databaseId,
      statements,
      batchSize: httpApiBatchSize,
      startIndex: httpApiStartIndex,
      skipOversizedStatements,
      maxStatementChars,
    });
    report.ok = true;
    report.result = {
      databaseId,
      statements: statements.length,
      totalExecutableStatements: results.totalExecutableStatements,
      executableStatements: results.executableStatements,
      skippedControlStatements: results.skippedControlStatements,
      skippedBeforeStart: results.skippedBeforeStart,
      skippedOversizedStatements: results.skippedOversizedStatements,
      applied: results.executableStatements,
      batches: results.results.length,
      results: results.results,
    };
  } catch (error) {
    report.ok = false;
    report.errors.push(error instanceof Error ? error.message : String(error));
    report.result = {
      applied: error?.appliedStatements || 0,
      skippedControlStatements: error?.skippedControlStatements || 0,
      skippedBeforeStart: error?.skippedBeforeStart || 0,
      skippedOversizedStatements: error?.skippedOversizedStatements || [],
      results: error?.results || [],
    };
  }
} else if (report.errors.length === 0 && apply) {
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
      : "Dry-run only. Pass --apply with --remote, --local, or --http-api to execute.",
  };
}

writeJson(reportPath, report);
console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  process.exitCode = report.errors.length ? 1 : 2;
}
