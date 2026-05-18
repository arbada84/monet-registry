#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_OUT = "cloudflare/d1/import/existing-d1-articles.json";
const DEFAULT_DATABASE = "culturepeople-prod";
const DEFAULT_PAGE_SIZE = 500;

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

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function toPositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
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

async function d1Query({ accountId, apiToken, databaseId, sql, params = [] }) {
  const result = await cloudflareRequest({
    accountId,
    apiToken,
    endpoint: `/accounts/${accountId}/d1/database/${databaseId}/query`,
    method: "POST",
    body: { sql, params },
  });

  if (!result.ok) {
    throw new Error(`D1 query failed (${result.status}): ${summarizeCloudflareErrors(result.json)}`);
  }

  const first = Array.isArray(result.json.result) ? result.json.result[0] : null;
  return Array.isArray(first?.results) ? first.results : [];
}

const { values } = parseArgs(process.argv.slice(2));
const env = {
  ...readDotEnv(path.resolve(".env.local")),
  ...readDotEnv(path.resolve(".env.production.local")),
  ...process.env,
};
const accountId = env.CLOUDFLARE_ACCOUNT_ID || "";
const apiToken = env.CLOUDFLARE_API_TOKEN || "";
const database = values.database || env.CLOUDFLARE_D1_PROD_DB || env.D1_DATABASE_NAME || DEFAULT_DATABASE;
const out = path.resolve(values.out || DEFAULT_OUT);
const pageSize = Math.min(toPositiveInt(values["page-size"], DEFAULT_PAGE_SIZE), 1000);
const maxRows = values["max-rows"] ? toPositiveInt(values["max-rows"], Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;

const report = {
  ok: false,
  generatedAt: new Date().toISOString(),
  database,
  out,
  rows: 0,
  warnings: [],
};

try {
  if (!accountId || !apiToken) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.");
  }

  const databaseId = await resolveD1DatabaseId({ accountId, apiToken, database });
  report.databaseId = databaseId;

  const rows = [];
  for (let offset = 0; rows.length < maxRows; offset += pageSize) {
    const limit = Math.min(pageSize, maxRows - rows.length);
    const page = await d1Query({
      accountId,
      apiToken,
      databaseId,
      sql: `
        SELECT id, no, title, slug, source_url, status, created_at, updated_at
        FROM articles
        ORDER BY COALESCE(no, 999999999), created_at, id
        LIMIT ? OFFSET ?
      `,
      params: [limit, offset],
    });

    rows.push(...page);
    if (page.length < limit) break;
  }

  ensureDir(out);
  fs.writeFileSync(out, JSON.stringify(rows, null, 2) + "\n", "utf8");

  report.ok = true;
  report.rows = rows.length;
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
}

console.log(JSON.stringify(report, null, 2));
