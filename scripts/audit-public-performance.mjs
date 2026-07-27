#!/usr/bin/env node

import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { parseArgs, timestampForFile, writeJsonAtomic } from "./lib/culturepeople-ops-utils.mjs";

const DEFAULT_ROUTES = ["/", "/search?q=%EB%89%B4%EC%8A%A4", "/category/%EB%AC%B8%ED%99%94", "/about", "/contact", "/youth-policy"];

async function measure(url) {
  const started = performance.now();
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "CulturePeoplePerformanceAudit/1.0" } });
    const headersAt = performance.now();
    await response.arrayBuffer();
    const completed = performance.now();
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      ttfbMs: Math.round(headersAt - started),
      totalMs: Math.round(completed - started),
      cacheControl: response.headers.get("cache-control"),
      vercelCache: response.headers.get("x-vercel-cache"),
      contentType: response.headers.get("content-type"),
    };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function buildPerformanceAudit({ baseUrl, routes = DEFAULT_ROUTES, samples = 2 } = {}) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  if (!base) return { ok: false, generatedAt: new Date().toISOString(), errors: ["--base is required"], rows: [] };
  const rows = [];
  for (const route of routes) {
    const results = [];
    for (let index = 0; index < Math.max(1, Math.min(2, Number(samples || 2))); index += 1) results.push(await measure(`${base}${route}`));
    rows.push({ route, results });
  }
  const errors = rows.flatMap((row) => row.results.filter((item) => !item.ok).map((item) => `${row.route}: HTTP ${item.status}`));
  return {
    ok: errors.length === 0,
    generatedAt: new Date().toISOString(),
    baseUrl: base,
    samplesPerRoute: Math.max(1, Math.min(2, Number(samples || 2))),
    rows,
    policy: {
      cspNoncePreserved: true,
      cacheChanged: false,
      reason: "Measurement only; keep no-store until publication freshness within five minutes is proven.",
    },
    errors,
  };
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const routes = String(values.routes || "").split(",").map((item) => item.trim()).filter(Boolean);
  const report = await buildPerformanceAudit({ baseUrl: values.base, routes: routes.length ? routes : DEFAULT_ROUTES, samples: Number(values.samples || 2) });
  if (!flags.has("no-write")) {
    const output = path.resolve(values.report || path.join(".ops-audit-runs", `public-performance-${timestampForFile()}.json`));
    report.reportPath = output;
    writeJsonAtomic(output, report);
  }
  if (flags.has("json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log("CulturePeople public performance baseline");
    console.log(`- ok: ${report.ok}`);
    for (const row of report.rows) console.log(`- ${row.route}: ${row.results.map((item) => `${item.status}/${item.ttfbMs ?? "-"}ms/${item.vercelCache || "-"}`).join(", ")}`);
    console.log("- cache policy changed: false");
    if (report.reportPath) console.log(`- report: ${report.reportPath}`);
  }
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
