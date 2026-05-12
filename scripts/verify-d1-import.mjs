#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_DATABASE = "culturepeople-staging";
const DEFAULT_REHEARSAL_SUMMARY = "cloudflare/d1/import/rehearsal-summary.json";
const DEFAULT_MEDIA_MANIFEST = "cloudflare/d1/import/media-manifest.json";

const COUNT_TABLES = [
  "articles",
  "article_search_index",
  "site_settings",
  "comments",
  "notifications",
  "view_logs",
  "distribute_logs",
  "media_objects",
  "migration_runs",
];

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

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
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

function normalizeCountRows(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    if (value.length && Array.isArray(value[0]?.results)) return value.flatMap((item) => item.results);
    return value;
  }
  if (Array.isArray(value.results)) return value.results;
  if (Array.isArray(value.result)) return normalizeCountRows(value.result);
  if (Array.isArray(value.data)) return value.data;
  if (value.stdoutJson) return normalizeCountRows(value.stdoutJson);
  return [];
}

function rowsToCounts(rows) {
  const counts = {};
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const name = String(row.name || row.table_name || row.table || "");
    const value = Number(row.count ?? row.total ?? row.rows);
    if (name && Number.isFinite(value)) counts[name] = value;
  }
  return counts;
}

function findPrepareStats(summary) {
  if (!summary || typeof summary !== "object") return null;
  const steps = Array.isArray(summary.steps) ? summary.steps : [];
  const prepare = steps.find((step) => step?.label === "prepare-import");
  return prepare?.stdoutJson?.stats || null;
}

function expectedFromStats(stats, manifest) {
  const mediaObjects = stats?.mediaObjects ?? (Array.isArray(manifest)
    ? manifest.filter((entry) => entry?.should_copy_to_r2 && entry?.bucket && entry?.object_key && entry?.public_url).length
    : 0);

  return {
    articles: Number(stats?.articles ?? 0),
    article_search_index: Number(stats?.articles ?? 0),
    site_settings: Number(stats?.settings ?? 0),
    comments: Number(stats?.comments ?? 0),
    notifications: Number(stats?.notifications ?? 0),
    view_logs: Number(stats?.viewLogs ?? 0),
    distribute_logs: Number(stats?.distributeLogs ?? 0),
    media_objects: Number(mediaObjects),
  };
}

function buildCountSql() {
  return COUNT_TABLES
    .map((table) => `SELECT '${table}' AS name, COUNT(*) AS count FROM ${table}`)
    .join(" UNION ALL ");
}

function runWranglerCountQuery({ database, remote, local }) {
  const args = [
    "wrangler",
    "d1",
    "execute",
    database,
    "--command",
    buildCountSql(),
    "--json",
  ];
  if (remote) args.splice(4, 0, "--remote");
  if (local) args.splice(4, 0, "--local");

  const result = spawnSync("npx", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    return {
      ok: false,
      exitCode: result.status ?? 1,
      stdoutText: (result.stdout || "").trim() || null,
      stderrText: (result.stderr || "").trim() || null,
      counts: {},
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return {
      ok: false,
      exitCode: 1,
      stdoutText: (result.stdout || "").trim() || null,
      stderrText: "Wrangler returned non-JSON output.",
      counts: {},
    };
  }

  return {
    ok: true,
    exitCode: 0,
    stdoutText: null,
    stderrText: (result.stderr || "").trim() || null,
    counts: rowsToCounts(normalizeCountRows(parsed)),
  };
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
  return errors.map((error) => error.message).filter(Boolean).join("; ") || "unknown error";
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

async function runHttpApiCountQuery({ database, accountId, apiToken }) {
  if (!accountId) {
    return { ok: false, exitCode: 2, stdoutText: null, stderrText: "CLOUDFLARE_ACCOUNT_ID is required for --http-api.", counts: {} };
  }
  if (!apiToken) {
    return { ok: false, exitCode: 2, stdoutText: null, stderrText: "CLOUDFLARE_API_TOKEN is required for --http-api.", counts: {} };
  }

  try {
    const databaseId = await resolveD1DatabaseId({ accountId, apiToken, database });
    const counts = {};
    for (const table of COUNT_TABLES) {
      const result = await cloudflareRequest({
        accountId,
        apiToken,
        endpoint: `/accounts/${accountId}/d1/database/${databaseId}/query`,
        method: "POST",
        body: { sql: `SELECT COUNT(*) AS count FROM ${table}` },
      });
      if (!result.ok) {
        return {
          ok: false,
          exitCode: result.status,
          stdoutText: null,
          stderrText: `${table} count failed (${result.status}): ${summarizeCloudflareErrors(result.json)}`,
          counts,
        };
      }
      const first = result.json.result?.[0]?.results?.[0];
      counts[table] = Number(first?.count ?? 0);
    }
    return {
      ok: true,
      exitCode: 0,
      stdoutText: null,
      stderrText: null,
      counts,
      databaseId,
    };
  } catch (error) {
    return {
      ok: false,
      exitCode: 1,
      stdoutText: null,
      stderrText: error instanceof Error ? error.message : String(error),
      counts: {},
    };
  }
}

async function loadCounts({ countsJson, database, remote, local, httpApi, currentEnv }) {
  if (countsJson) {
    const parsed = readJsonIfExists(countsJson);
    if (!parsed) {
      return {
        ok: false,
        exitCode: 2,
        stdoutText: null,
        stderrText: `Counts JSON not found: ${countsJson}`,
        counts: {},
      };
    }

    if (!Array.isArray(parsed) && typeof parsed === "object" && !Array.isArray(parsed.results) && !Array.isArray(parsed.result)) {
      return {
        ok: true,
        exitCode: 0,
        stdoutText: null,
        stderrText: null,
        counts: Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, Number(value)])),
      };
    }

    return {
      ok: true,
      exitCode: 0,
      stdoutText: null,
      stderrText: null,
      counts: rowsToCounts(normalizeCountRows(parsed)),
    };
  }

  if (httpApi) {
    return runHttpApiCountQuery({
      database,
      accountId: currentEnv.CLOUDFLARE_ACCOUNT_ID,
      apiToken: currentEnv.CLOUDFLARE_API_TOKEN,
    });
  }

  return runWranglerCountQuery({ database, remote, local });
}

function compareCounts(expected, actual) {
  const checks = [];
  const errors = [];
  const warnings = [];

  for (const [table, expectedCount] of Object.entries(expected)) {
    const actualCount = actual[table];
    const ok = actualCount === expectedCount;
    checks.push({ table, expected: expectedCount, actual: actualCount ?? null, ok });
    if (!ok) {
      errors.push(`${table} count mismatch: expected ${expectedCount}, actual ${actualCount ?? "missing"}.`);
    }
  }

  if (actual.article_search_index !== undefined && actual.articles !== undefined && actual.article_search_index !== actual.articles) {
    errors.push(`article_search_index must match articles: ${actual.article_search_index} vs ${actual.articles}.`);
  }

  if ((actual.migration_runs ?? 0) < 1) {
    warnings.push("migration_runs has no rows. The import may have been applied without the generated migration marker.");
  }

  return { checks, errors, warnings };
}

const { flags, values } = parseArgs(process.argv.slice(2));
const database = values.database || DEFAULT_DATABASE;
const rehearsalSummaryPath = path.resolve(values.summary || DEFAULT_REHEARSAL_SUMMARY);
const mediaManifestPath = path.resolve(values.media || DEFAULT_MEDIA_MANIFEST);
const countsJsonPath = values["counts-json"] ? path.resolve(values["counts-json"]) : "";
const remote = flags.has("remote");
const local = flags.has("local");
const httpApi = flags.has("http-api");
const failOnWarning = flags.has("fail-on-warning");
const currentEnv = {
  ...readDotEnv(path.resolve(".env.local")),
  ...readDotEnv(path.resolve(".env.production.local")),
  ...process.env,
};

if ([remote, local, httpApi].filter(Boolean).length > 1) {
  console.error("Use only one count mode: --remote, --local, or --http-api.");
  process.exit(2);
}

const summary = readJsonIfExists(rehearsalSummaryPath);
const manifest = readJsonIfExists(mediaManifestPath);
const stats = findPrepareStats(summary);

const report = {
  ok: false,
  generatedAt: new Date().toISOString(),
  database,
  mode: countsJsonPath ? "counts-json" : httpApi ? "http-api" : remote ? "remote" : local ? "local" : "wrangler-default",
  rehearsalSummaryPath,
  mediaManifestPath,
  countsJsonPath: countsJsonPath || null,
  expected: {},
  actual: {},
  checks: [],
  warnings: [],
  errors: [],
};

if (!stats) {
  report.errors.push(`Could not find prepare-import stats in rehearsal summary: ${rehearsalSummaryPath}`);
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}

report.expected = expectedFromStats(stats, manifest);

const countResult = await loadCounts({
  countsJson: countsJsonPath,
  database,
  remote,
  local,
  httpApi,
  currentEnv,
});

if (!countResult.ok) {
  report.errors.push(countResult.stderrText || countResult.stdoutText || "Failed to read D1 table counts.");
  console.log(JSON.stringify(report, null, 2));
  process.exit(countResult.exitCode || 1);
}

report.actual = countResult.counts;
if (countResult.databaseId) {
  report.databaseId = countResult.databaseId;
}
const comparison = compareCounts(report.expected, report.actual);
report.checks = comparison.checks;
report.warnings = comparison.warnings;
report.errors = comparison.errors;
report.ok = report.errors.length === 0 && (!failOnWarning || report.warnings.length === 0);

console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  process.exit(report.errors.length > 0 ? 1 : 3);
}
