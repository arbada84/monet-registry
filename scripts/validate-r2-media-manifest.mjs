#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_MANIFEST = "cloudflare/d1/import/media-manifest.json";

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

function hostname(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "(invalid)";
  }
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function addIssue(issues, severity, message, entry) {
  issues.push({
    severity,
    message,
    id: entry?.id,
    source_url: entry?.source_url,
    object_key: entry?.object_key,
  });
}

const { flags, values } = parseArgs(process.argv.slice(2));
const manifestPath = path.resolve(values.input || DEFAULT_MANIFEST);
const failOnWarning = flags.has("fail-on-warning");

if (!fs.existsSync(manifestPath)) {
  console.error(`Manifest not found: ${manifestPath}`);
  process.exit(2);
}

const manifest = readJson(manifestPath);
if (!Array.isArray(manifest)) {
  console.error("Manifest must be a JSON array.");
  process.exit(2);
}

const issues = [];
const sourceUrls = new Set();
const objectKeys = new Map();
const hostCounts = new Map();
let copyRequired = 0;
let readyForRewrite = 0;

for (const entry of manifest) {
  const sourceUrl = entry?.source_url;
  const objectKey = entry?.object_key;
  const publicUrl = entry?.public_url;

  if (!sourceUrl || typeof sourceUrl !== "string" || !/^https?:\/\//i.test(sourceUrl)) {
    addIssue(issues, "error", "source_url is missing or not an HTTP URL", entry);
    continue;
  }

  if (sourceUrls.has(sourceUrl)) {
    addIssue(issues, "warning", "duplicate source_url entry", entry);
  }
  sourceUrls.add(sourceUrl);
  increment(hostCounts, hostname(sourceUrl));

  if (entry.should_copy_to_r2) {
    copyRequired += 1;

    if (!entry.bucket) addIssue(issues, "error", "R2 bucket is missing for copy-required entry", entry);
    if (!objectKey) addIssue(issues, "error", "object_key is missing for copy-required entry", entry);
    if (!publicUrl) addIssue(issues, "warning", "public_url is missing; D1 import cannot rewrite this media yet", entry);

    if (objectKey) {
      if (objectKeys.has(objectKey)) {
        addIssue(issues, "error", `duplicate object_key also used by ${objectKeys.get(objectKey)}`, entry);
      } else {
        objectKeys.set(objectKey, entry.id || sourceUrl);
      }
    }

    if (publicUrl) readyForRewrite += 1;
  }
}

const errorCount = issues.filter((issue) => issue.severity === "error").length;
const warningCount = issues.filter((issue) => issue.severity === "warning").length;
const topHosts = [...hostCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([host, count]) => ({ host, count }));

const report = {
  manifestPath,
  totalEntries: manifest.length,
  uniqueSourceUrls: sourceUrls.size,
  copyRequired,
  readyForRewrite,
  errorCount,
  warningCount,
  topHosts,
  issues: issues.slice(0, 50),
};

console.log(JSON.stringify(report, null, 2));

if (errorCount > 0 || (failOnWarning && warningCount > 0)) {
  process.exit(1);
}
