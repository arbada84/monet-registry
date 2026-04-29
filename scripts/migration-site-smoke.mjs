#!/usr/bin/env node

const DEFAULT_BASE_URL = process.env.MIGRATION_SMOKE_BASE_URL || process.env.SMOKE_BASE_URL || "https://culturepeople.co.kr";
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

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function toPositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function buildUrl(baseUrl, path) {
  return new URL(path, `${baseUrl}/`).toString();
}

function hasBadBody(body) {
  const normalized = String(body || "").toLowerCase();
  return [
    "server error",
    "application error",
    "internal server error",
    "database error",
    "quota exceeded",
    "invalid api token",
    "supabase rest is restricted",
    "exceed_storage_size_quota",
  ].some((needle) => normalized.includes(needle));
}

async function fetchText(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "CulturePeople-Migration-Smoke/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml,application/json,*/*;q=0.8",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    const body = await response.text().catch(() => "");
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}

function contentTypeIncludes(contentType, expected) {
  if (!expected) return true;
  return String(contentType || "").toLowerCase().includes(expected);
}

function parseJson(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function defaultChecks({ strictFeeds }) {
  return [
    { name: "health", path: "/api/health", kind: "json", required: true, contentType: "application/json" },
    { name: "home", path: "/", kind: "html", required: true, contentType: "text/html" },
    { name: "search", path: "/search?q=%EB%89%B4%EC%8A%A4", kind: "html", required: true, contentType: "text/html" },
    { name: "sitemap", path: "/sitemap.xml", kind: "xml", required: true, contentType: "xml" },
    { name: "robots", path: "/robots.txt", kind: "text", required: true, contentType: "text/plain" },
    { name: "rss", path: "/api/rss", kind: "xml", required: strictFeeds, contentType: "xml", optionalStatuses: [404] },
    { name: "json-feed", path: "/feed.json", kind: "json", required: strictFeeds, contentType: "json", optionalStatuses: [404] },
  ];
}

function validateHealthJson(json, options) {
  const errors = [];
  const warnings = [];

  if (!json || typeof json !== "object") {
    return { errors: ["Health response is not JSON."], warnings };
  }

  if (json.status !== "ok") {
    errors.push(`Health status is '${json.status ?? "missing"}'.`);
  }

  const databaseProvider = json.databaseProvider?.provider;
  const mediaProvider = json.mediaStorage?.provider;

  if (options.expectDatabaseProvider && databaseProvider !== options.expectDatabaseProvider) {
    errors.push(`Database provider mismatch: expected ${options.expectDatabaseProvider}, actual ${databaseProvider ?? "missing"}.`);
  }

  if (options.expectMediaProvider && mediaProvider !== options.expectMediaProvider) {
    errors.push(`Media provider mismatch: expected ${options.expectMediaProvider}, actual ${mediaProvider ?? "missing"}.`);
  }

  if (json.databaseProvider?.runtimeReady === false) {
    errors.push("Database provider reports runtimeReady=false.");
  }

  if (json.mediaStorage?.configured === false) {
    errors.push("Media storage reports configured=false.");
  }

  return { errors, warnings };
}

function summarizeHealthJson(json) {
  if (!json || typeof json !== "object") return null;
  return {
    status: json.status ?? null,
    initialized: json.initialized ?? null,
    databaseProvider: json.databaseProvider?.provider ?? null,
    databaseConfigured: json.databaseProvider?.configured ?? null,
    databaseRuntimeReady: json.databaseProvider?.runtimeReady ?? null,
    mediaProvider: json.mediaStorage?.provider ?? null,
    mediaConfigured: json.mediaStorage?.configured ?? null,
  };
}

async function runCheck(check, options) {
  const url = buildUrl(options.baseUrl, check.path);
  const result = {
    name: check.name,
    path: check.path,
    url,
    required: check.required,
    ok: false,
    status: null,
    contentType: "",
    bytes: 0,
    summary: null,
    errors: [],
    warnings: [],
  };

  try {
    const { response, body } = await fetchText(url, options.timeoutMs);
    result.status = response.status;
    result.contentType = response.headers.get("content-type") || "";
    result.bytes = Buffer.byteLength(body);

    if (check.optionalStatuses?.includes(response.status) && !check.required) {
      result.ok = true;
      result.warnings.push(`Optional route returned HTTP ${response.status}.`);
      return result;
    }

    if (!response.ok) {
      result.errors.push(`HTTP ${response.status}`);
    }

    if (!contentTypeIncludes(result.contentType, check.contentType)) {
      result.warnings.push(`Unexpected content-type '${result.contentType || "missing"}'.`);
    }

    if (result.bytes === 0) {
      result.errors.push("Response body is empty.");
    }

    if (hasBadBody(body)) {
      result.errors.push("Response body contains an error marker.");
    }

    if (check.kind === "json") {
      const json = parseJson(body);
      if (!json) {
        result.errors.push("Response body is not valid JSON.");
      } else if (check.name === "health") {
        result.summary = summarizeHealthJson(json);
        const health = validateHealthJson(json, options);
        result.errors.push(...health.errors);
        result.warnings.push(...health.warnings);
      }
    }

    result.ok = result.errors.length === 0 && (!options.failOnWarning || result.warnings.length === 0);
    return result;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    return result;
  }
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const options = {
    baseUrl: normalizeBaseUrl(values["base-url"]),
    timeoutMs: toPositiveInt(values["timeout-ms"], DEFAULT_TIMEOUT_MS),
    failOnWarning: flags.has("fail-on-warning"),
    expectDatabaseProvider: values["expect-database-provider"] || "",
    expectMediaProvider: values["expect-media-provider"] || "",
  };

  const checks = defaultChecks({ strictFeeds: flags.has("strict-feeds") });
  const results = [];
  for (const check of checks) {
    results.push(await runCheck(check, options));
  }

  const requiredFailures = results.filter((result) => result.required && !result.ok);
  const optionalFailures = results.filter((result) => !result.required && !result.ok);
  const warnings = results.flatMap((result) => result.warnings.map((warning) => `${result.name}: ${warning}`));
  const report = {
    ok: requiredFailures.length === 0 && (!options.failOnWarning || warnings.length === 0),
    generatedAt: new Date().toISOString(),
    baseUrl: options.baseUrl,
    timeoutMs: options.timeoutMs,
    expectDatabaseProvider: options.expectDatabaseProvider || null,
    expectMediaProvider: options.expectMediaProvider || null,
    requiredFailures: requiredFailures.length,
    optionalFailures: optionalFailures.length,
    warningCount: warnings.length,
    health: results.find((result) => result.name === "health")?.summary || null,
    results,
  };

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exitCode = requiredFailures.length > 0 ? 1 : 3;
  }
}

await main();
