#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_OUTPUT_DIR = "exports/supabase";
const DEFAULT_TABLES = ["articles", "site_settings", "comments", "notifications"];
const DEFAULT_REQUIRED_TABLES = ["articles", "site_settings"];
const DEFAULT_PAGE_SIZE = 1000;

const DEFAULT_TABLE_ORDER = {
  articles: "id.asc",
  site_settings: "key.asc",
  comments: "created_at.asc",
  notifications: "created_at.asc",
};

class SupabaseHttpError extends Error {
  constructor(message, { status, bodyText, url }) {
    super(message);
    this.name = "SupabaseHttpError";
    this.status = status;
    this.bodyText = bodyText;
    this.url = url;
  }
}

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

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return {};

  const result = {};
  const text = fs.readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq < 0) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value) result[key] = value;
  }
  return result;
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function cleanSupabaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getProjectHost(supabaseUrl) {
  try {
    return new URL(supabaseUrl).host;
  } catch {
    return null;
  }
}

function buildRestUrl({ supabaseUrl, table, pageSize, offset, order }) {
  const url = new URL(`${supabaseUrl}/rest/v1/${encodeURIComponent(table)}`);
  url.searchParams.set("select", "*");
  url.searchParams.set("limit", String(pageSize));
  url.searchParams.set("offset", String(offset));
  if (order) url.searchParams.set("order", order);
  return url;
}

function headers(serviceKey) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: "application/json",
    Prefer: "count=exact",
  };
}

function parseContentRange(value) {
  if (!value) return null;
  const match = String(value).match(/\/(\d+|\*)$/);
  if (!match || match[1] === "*") return null;
  const count = Number(match[1]);
  return Number.isFinite(count) ? count : null;
}

function parseErrorBody(bodyText) {
  try {
    return JSON.parse(bodyText);
  } catch {
    return null;
  }
}

function errorSummary(status, bodyText) {
  const body = parseErrorBody(bodyText);
  const message = body?.message || body?.error || bodyText || "No response body";
  const code = body?.code ? ` ${body.code}` : "";

  if (status === 402) {
    return "Supabase REST is restricted with HTTP 402. The project is likely quota-restricted; wait for billing reset, temporarily upgrade, or ask Supabase Support to reopen access for cleanup/export.";
  }

  if (status === 401 || status === 403) {
    return `Supabase auth failed with HTTP ${status}${code}: ${String(message).slice(0, 220)}. Check SUPABASE_SERVICE_KEY.`;
  }

  return `Supabase REST failed with HTTP ${status}${code}: ${String(message).slice(0, 220)}`;
}

function isMissingTable(error) {
  if (!(error instanceof SupabaseHttpError)) return false;
  const body = parseErrorBody(error.bodyText);
  const text = `${error.bodyText || ""} ${body?.message || ""} ${body?.details || ""}`.toLowerCase();
  return error.status === 404
    || body?.code === "PGRST205"
    || text.includes("could not find the table")
    || (text.includes("relation") && text.includes("does not exist"));
}

function canRetryWithoutOrder(error) {
  if (!(error instanceof SupabaseHttpError)) return false;
  if (error.status !== 400) return false;

  const body = parseErrorBody(error.bodyText);
  const text = `${error.bodyText || ""} ${body?.message || ""} ${body?.details || ""}`.toLowerCase();
  return text.includes("order") || text.includes("column") || text.includes("does not exist");
}

async function requestPage({ supabaseUrl, serviceKey, table, pageSize, offset, order }) {
  const url = buildRestUrl({ supabaseUrl, table, pageSize, offset, order });
  const res = await fetch(url, { headers: headers(serviceKey) });
  const text = await res.text();

  if (!res.ok) {
    throw new SupabaseHttpError(errorSummary(res.status, text), {
      status: res.status,
      bodyText: text,
      url: String(url),
    });
  }

  let rows;
  try {
    rows = text ? JSON.parse(text) : [];
  } catch (error) {
    throw new Error(`Invalid JSON response for ${table}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!Array.isArray(rows)) {
    throw new Error(`Unexpected response shape for ${table}: expected an array.`);
  }

  return {
    rows,
    count: parseContentRange(res.headers.get("content-range")),
  };
}

async function exportTable({ supabaseUrl, serviceKey, table, required, pageSize, maxRows, noOrder }) {
  let order = noOrder ? "" : DEFAULT_TABLE_ORDER[table] || "";
  let offset = 0;
  let total = null;
  const rows = [];
  const warnings = [];

  while (true) {
    const effectivePageSize = maxRows ? Math.min(pageSize, Math.max(maxRows - rows.length, 0)) : pageSize;
    if (effectivePageSize <= 0) break;

    let page;
    try {
      page = await requestPage({ supabaseUrl, serviceKey, table, pageSize: effectivePageSize, offset, order });
    } catch (error) {
      if (offset === 0 && order && canRetryWithoutOrder(error)) {
        warnings.push(`Order '${order}' failed for ${table}; retried without ordering.`);
        order = "";
        continue;
      }

      if (!required && isMissingTable(error)) {
        warnings.push(`Optional table '${table}' was not found; exported an empty array.`);
        return { table, rows: [], total: 0, warnings, missing: true };
      }

      throw error;
    }

    if (total === null && page.count !== null) total = page.count;
    rows.push(...page.rows);

    if (page.rows.length < effectivePageSize) break;
    if (maxRows && rows.length >= maxRows) break;
    if (total !== null && rows.length >= total) break;

    offset += page.rows.length;
  }

  return {
    table,
    rows,
    total: total ?? rows.length,
    warnings,
    missing: false,
  };
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const env = {
    ...loadEnvFile(".env.local"),
    ...loadEnvFile(".env.production.local"),
    ...loadEnvFile(".env.vercel.local"),
    ...process.env,
  };

  const outputDir = path.resolve(values.out || DEFAULT_OUTPUT_DIR);
  const supabaseUrl = cleanSupabaseUrl(values["supabase-url"] || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL);
  const allowAnon = flags.has("allow-anon");
  const serviceKey = String(
    values["service-key"]
    || env.SUPABASE_SERVICE_KEY
    || (allowAnon ? env.NEXT_PUBLIC_SUPABASE_ANON_KEY : "")
    || ""
  ).trim();
  const tables = splitCsv(values.tables || DEFAULT_TABLES.join(","));
  const requiredTables = flags.has("allow-missing")
    ? new Set()
    : new Set(flags.has("require-all")
      ? tables
      : splitCsv(values.required || DEFAULT_REQUIRED_TABLES.join(",")));
  const pageSize = Math.max(1, Math.min(Number(values["page-size"] || DEFAULT_PAGE_SIZE), 5000));
  const maxRows = values["max-rows"] ? Math.max(1, Number(values["max-rows"])) : null;
  const dryRun = flags.has("dry-run");

  const manifest = {
    ok: false,
    generatedAt: new Date().toISOString(),
    outputDir: dryRun ? null : outputDir,
    supabaseProjectHost: getProjectHost(supabaseUrl),
    tables: [],
    totals: {
      rows: 0,
    },
    warnings: [],
    notes: [
      "Generated for Cloudflare D1 migration. Keep exports/supabase out of git because it may contain private article drafts and settings.",
    ],
  };

  if (!supabaseUrl || !serviceKey) {
    manifest.warnings.push("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are required. Use --allow-anon only for non-production dry checks.");
    console.log(JSON.stringify(manifest, null, 2));
    process.exitCode = 1;
    return;
  }

  if (!tables.length) {
    manifest.warnings.push("No tables selected.");
    console.log(JSON.stringify(manifest, null, 2));
    process.exitCode = 1;
    return;
  }

  try {
    for (const table of tables) {
      const result = await exportTable({
        supabaseUrl,
        serviceKey,
        table,
        required: requiredTables.has(table),
        pageSize,
        maxRows,
        noOrder: flags.has("no-order"),
      });

      const fileName = `${table}.json`;
      const filePath = path.join(outputDir, fileName);
      if (!dryRun) writeJson(filePath, result.rows);

      manifest.tables.push({
        table,
        required: requiredTables.has(table),
        rows: result.rows.length,
        reportedTotal: result.total,
        missing: result.missing,
        file: dryRun ? null : filePath,
      });
      manifest.totals.rows += result.rows.length;
      manifest.warnings.push(...result.warnings);
    }

    manifest.ok = true;

    if (!dryRun) {
      writeJson(path.join(outputDir, "export-manifest.json"), manifest);
    }
  } catch (error) {
    manifest.warnings.push(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }

  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
