#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_MANIFEST = "cloudflare/d1/import/media-manifest.json";
const DEFAULT_REPORT = "cloudflare/d1/import/r2-media-budget-report.json";
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_LIMIT = 200;
const DEFAULT_BUDGET_BYTES = 8 * 1024 * 1024 * 1024;

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

function bytesToMb(bytes) {
  return Math.round((bytes / 1024 / 1024) * 100) / 100;
}

function hostname(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "(invalid)";
  }
}

function addCount(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

async function headSource(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent": "CulturePeople-MediaBudget/1.0",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    const length = Number(response.headers.get("content-length") || 0);
    return {
      ok: response.ok,
      status: response.status,
      byte_size: Number.isFinite(length) && length > 0 ? length : null,
      content_type: response.headers.get("content-type")?.split(";")[0]?.trim() || null,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      byte_size: null,
      content_type: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

const { flags, values } = parseArgs(process.argv.slice(2));
const input = path.resolve(values.input || DEFAULT_MANIFEST);
const reportPath = path.resolve(values.report || DEFAULT_REPORT);
const limit = flags.has("all") ? Number.POSITIVE_INFINITY : toPositiveInt(values.limit, DEFAULT_LIMIT);
const timeoutMs = toPositiveInt(values["timeout-ms"], DEFAULT_TIMEOUT_MS);
const budgetBytes = toPositiveInt(values["budget-bytes"] || process.env.R2_MEDIA_BUDGET_BYTES, DEFAULT_BUDGET_BYTES);
const failOverBudget = flags.has("fail-over-budget");

if (!fs.existsSync(input)) {
  console.error(`Manifest not found: ${input}`);
  process.exit(2);
}

const manifest = readJson(input);
if (!Array.isArray(manifest)) {
  console.error("Manifest must be a JSON array.");
  process.exit(2);
}

const copyEntries = manifest.filter((entry) => entry?.should_copy_to_r2);
const selectedEntries = copyEntries.slice(0, limit);
const hostCounts = new Map();
const results = [];
let knownBytes = 0;
let knownCount = 0;
let unknownCount = 0;
let failedCount = 0;
let maxKnownBytes = 0;

for (const entry of selectedEntries) {
  addCount(hostCounts, hostname(entry.source_url));
  const probe = await headSource(entry.source_url, timeoutMs);
  if (probe.byte_size !== null) {
    knownBytes += probe.byte_size;
    knownCount += 1;
    maxKnownBytes = Math.max(maxKnownBytes, probe.byte_size);
  } else {
    unknownCount += 1;
  }
  if (!probe.ok) failedCount += 1;

  results.push({
    id: entry.id,
    source_url: entry.source_url,
    object_key: entry.object_key,
    ...probe,
  });
}

const averageKnownBytes = knownCount > 0 ? knownBytes / knownCount : 0;
const projectedBytes = selectedEntries.length > 0
  ? Math.round((knownBytes / selectedEntries.length) * copyEntries.length)
  : 0;
const projectedConservativeBytes = Math.round(
  ((knownBytes + (unknownCount * Math.max(averageKnownBytes, maxKnownBytes))) / Math.max(selectedEntries.length, 1)) * copyEntries.length,
);

const report = {
  ok: !failOverBudget || projectedConservativeBytes <= budgetBytes,
  generated_at: new Date().toISOString(),
  input,
  reportPath,
  budgetBytes,
  budgetMb: bytesToMb(budgetBytes),
  totalManifestEntries: manifest.length,
  copyRequiredEntries: copyEntries.length,
  sampledEntries: selectedEntries.length,
  knownCount,
  unknownCount,
  failedCount,
  knownBytes,
  knownMb: bytesToMb(knownBytes),
  averageKnownBytes: Math.round(averageKnownBytes),
  maxKnownBytes,
  projectedBytes,
  projectedMb: bytesToMb(projectedBytes),
  projectedConservativeBytes,
  projectedConservativeMb: bytesToMb(projectedConservativeBytes),
  overBudget: projectedConservativeBytes > budgetBytes,
  topHosts: [...hostCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([host, count]) => ({ host, count })),
  results,
};

ensureDir(reportPath);
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

console.log(JSON.stringify({
  reportPath,
  ok: report.ok,
  copyRequiredEntries: report.copyRequiredEntries,
  sampledEntries: report.sampledEntries,
  knownMb: report.knownMb,
  projectedMb: report.projectedMb,
  projectedConservativeMb: report.projectedConservativeMb,
  overBudget: report.overBudget,
  unknownCount,
  failedCount,
}, null, 2));

if (!report.ok) process.exit(1);
