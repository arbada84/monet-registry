#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "https://culturepeople.co.kr";
const DEFAULT_TIMEOUT_MS = 5_000;

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

function cleanBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
}

function timeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

async function request(url, options) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      ...options,
      signal: timeoutSignal(options.timeoutMs),
      cache: "no-store",
    });
    const text = options.readText ? await response.text() : "";
    return {
      ok: response.ok,
      status: response.status,
      redirected: response.redirected,
      url: response.url,
      ms: Date.now() - startedAt,
      text,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      redirected: false,
      url,
      ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      text: "",
    };
  }
}

function statusOk(actual, expected) {
  return expected.includes(actual);
}

async function checkHead(baseUrl, path, expected, timeoutMs, redirect = "manual") {
  const result = await request(`${baseUrl}${path}`, {
    method: "HEAD",
    redirect,
    timeoutMs,
    readText: false,
  });
  return {
    name: path,
    expected,
    method: "HEAD",
    ...result,
    ok: statusOk(result.status, expected),
  };
}

async function checkGetContains(baseUrl, path, contains, timeoutMs) {
  const result = await request(`${baseUrl}${path}`, {
    method: "GET",
    redirect: "follow",
    timeoutMs,
    readText: true,
  });
  return {
    name: path,
    expected: contains,
    method: "GET",
    ...result,
    ok: result.ok && contains.every((token) => result.text.includes(token)),
    text: result.text.slice(0, 500),
  };
}

async function checkGetNotContains(baseUrl, path, forbidden, timeoutMs) {
  const result = await request(`${baseUrl}${path}`, {
    method: "GET",
    redirect: "follow",
    timeoutMs,
    readText: true,
  });
  const hits = forbidden.filter((token) => result.text.includes(token));
  return {
    name: path,
    expected: `not ${forbidden.join("|")}`,
    method: "GET",
    ...result,
    ok: result.ok && hits.length === 0,
    forbiddenHits: hits,
    text: result.text.slice(0, 500),
  };
}

function printHuman(report) {
  console.log("CulturePeople portal surface verification");
  console.log(`- base: ${report.baseUrl}`);
  console.log(`- ok: ${report.ok}`);
  for (const check of report.checks) {
    const status = check.status === null ? "ERR" : check.status;
    const expected = Array.isArray(check.expected) ? check.expected.join("|") : String(check.expected);
    const forbidden = Array.isArray(check.forbiddenHits) && check.forbiddenHits.length
      ? ` forbidden=${check.forbiddenHits.join("|")}`
      : "";
    const suffix = `${check.error ? ` error=${check.error}` : ""}${forbidden}`;
    console.log(`- ${check.ok ? "ok" : "fail"} ${check.method} ${check.name}: status=${status} expected=${expected} ms=${check.ms}${suffix}`);
  }
}

export async function buildPortalSurfaceReport(options = {}) {
  const baseUrl = cleanBaseUrl(options.baseUrl);
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const indexNowKey = String(options.indexNowKey || "").trim();

  const checks = [
    await checkGetContains(baseUrl, "/ads.txt", ["google.com", "DIRECT"], timeoutMs),
    await checkHead(baseUrl, "/rss.xml", [200], timeoutMs),
    await checkHead(baseUrl, "/feed.xml", [200], timeoutMs),
    await checkHead(baseUrl, "/rss", [301, 302, 307, 308], timeoutMs),
    await checkHead(baseUrl, "/feed", [301, 302, 307, 308], timeoutMs),
    await checkHead(baseUrl, "/sitemap.xml", [200], timeoutMs),
    await checkHead(baseUrl, "/news-sitemap.xml", [200], timeoutMs),
    await checkGetContains(baseUrl, "/rss.xml", ["<rss", "<item", "<description"], timeoutMs),
    await checkGetNotContains(baseUrl, "/sitemap.xml", [
      `<loc>${baseUrl}/search</loc>`,
      `<loc>${baseUrl}/cam`,
      `<loc>${baseUrl}/api`,
      `<loc>${baseUrl}/smoke`,
    ], timeoutMs),
  ];

  if (indexNowKey) {
    checks.push(await checkGetContains(baseUrl, `/${encodeURIComponent(indexNowKey)}.txt`, [indexNowKey], timeoutMs));
  }

  return {
    ok: checks.every((check) => check.ok),
    baseUrl,
    generatedAt: new Date().toISOString(),
    checks,
  };
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const report = await buildPortalSurfaceReport({
    baseUrl: values.base || values.url || DEFAULT_BASE_URL,
    timeoutMs: Number(values.timeout || DEFAULT_TIMEOUT_MS),
    indexNowKey: values["indexnow-key"] || values.key || "",
  });

  if (flags.has("json")) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);

  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
