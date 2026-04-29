#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_MANIFEST = "cloudflare/d1/import/media-manifest.json";
const DEFAULT_REPORT = "cloudflare/d1/import/r2-verify-report.json";
const DEFAULT_TIMEOUT_MS = 15000;

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function toPositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function summarizeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function shouldCheckEntry(entry) {
  return Boolean(entry?.should_copy_to_r2 && entry?.public_url);
}

async function requestWithTimeout(url, { method, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method,
      headers: {
        "User-Agent": "CulturePeople-R2-Verify/1.0",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyOne(entry, config) {
  const base = {
    id: entry.id,
    source_url: entry.source_url,
    public_url: entry.public_url,
    object_key: entry.object_key,
  };

  if (!shouldCheckEntry(entry)) {
    return { ...base, status: "skipped" };
  }

  try {
    let response;
    try {
      response = await requestWithTimeout(entry.public_url, {
        method: "HEAD",
        timeoutMs: config.timeoutMs,
      });
    } catch {
      response = await requestWithTimeout(entry.public_url, {
        method: "GET",
        timeoutMs: config.timeoutMs,
      });
    }

    if ([403, 405, 501].includes(response.status)) {
      response = await requestWithTimeout(entry.public_url, {
        method: "GET",
        timeoutMs: config.timeoutMs,
      });
    }

    const contentType = response.headers.get("content-type") || "";
    const contentLength = response.headers.get("content-length");
    const byteSize = contentLength && Number.isFinite(Number(contentLength)) ? Number(contentLength) : null;

    if (!response.ok) {
      return {
        ...base,
        status: "failed",
        http_status: response.status,
        content_type: contentType,
        byte_size: byteSize,
        error: `Public URL returned HTTP ${response.status}`,
      };
    }

    const warning = contentType && !contentType.toLowerCase().startsWith("image/")
      ? `Unexpected content-type: ${contentType}`
      : "";

    return {
      ...base,
      status: warning ? "warning" : "ok",
      http_status: response.status,
      content_type: contentType,
      byte_size: byteSize,
      warning: warning || null,
    };
  } catch (error) {
    return {
      ...base,
      status: "failed",
      error: summarizeError(error),
    };
  }
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(values.input || DEFAULT_MANIFEST);
  const reportPath = path.resolve(values.report || DEFAULT_REPORT);
  const limit = values.limit ? toPositiveInt(values.limit, 0) : 0;
  const timeoutMs = toPositiveInt(values["timeout-ms"], DEFAULT_TIMEOUT_MS);
  const failOnWarning = flags.has("fail-on-warning");
  const noWrite = flags.has("no-write");

  if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest not found: ${manifestPath}`);
    process.exit(2);
  }

  const manifest = readJson(manifestPath);
  if (!Array.isArray(manifest)) {
    console.error("Manifest must be a JSON array.");
    process.exit(2);
  }

  const entries = manifest.filter(shouldCheckEntry);
  const selectedEntries = limit > 0 ? entries.slice(0, limit) : entries;
  const results = [];

  for (const entry of selectedEntries) {
    results.push(await verifyOne(entry, { timeoutMs }));
  }

  const failed = results.filter((result) => result.status === "failed");
  const warnings = results.filter((result) => result.status === "warning");
  const report = {
    ok: failed.length === 0 && (!failOnWarning || warnings.length === 0),
    generatedAt: new Date().toISOString(),
    manifestPath,
    checked: results.length,
    totalCopyRequiredWithPublicUrl: entries.length,
    skippedWithoutPublicUrl: manifest.filter((entry) => entry?.should_copy_to_r2 && !entry?.public_url).length,
    okCount: results.filter((result) => result.status === "ok").length,
    warningCount: warnings.length,
    failedCount: failed.length,
    timeoutMs,
    limit: limit || null,
    results,
  };

  if (!noWrite) {
    ensureDir(reportPath);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  }

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exit(failed.length > 0 ? 1 : 3);
  }
}

await main();
