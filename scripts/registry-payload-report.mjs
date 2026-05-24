#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const checkMode = args.has("--check");
const jsonMode = args.has("--json");

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

const baselineRelativePath = getArgValue("--baseline") || "docs/registry-payload-baseline.json";
const baselinePath = path.join(root, baselineRelativePath);

const registryFiles = [
  { key: "componentRegistry", path: "public/generated/registry.json" },
  { key: "shadcnRegistry", path: "registry.json" },
  { key: "pageRegistry", path: "public/generated/page-registry.json" },
  { key: "categoryIndex", path: "public/generated/category-index.json" },
  { key: "tagIndex", path: "public/generated/tag-index.json" },
  { key: "pageIndex", path: "public/generated/page-index.json" },
  { key: "sectionToPage", path: "public/generated/section-to-page.json" },
];

function readJsonFile(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const raw = fs.readFileSync(absolutePath);
  return {
    raw,
    json: JSON.parse(raw.toString("utf8")),
  };
}

function entryCount(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
}

function jsonBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

function readBaseline() {
  if (!fs.existsSync(baselinePath)) return null;
  return JSON.parse(fs.readFileSync(baselinePath, "utf8"));
}

function thresholdCheck(key, label, actual, thresholds) {
  const limit = thresholds[key];
  if (typeof limit !== "number") {
    return { key, label, actual, limit: null, ok: true, skipped: true };
  }
  return { key, label, actual, limit, ok: actual <= limit, skipped: false };
}

const files = Object.fromEntries(
  registryFiles.map((file) => {
    const { raw, json } = readJsonFile(file.path);
    return [
      file.key,
      {
        path: file.path,
        bytes: raw.byteLength,
        gzipBytes: gzipSync(raw).byteLength,
        entries: entryCount(json),
        json,
      },
    ];
  }),
);

const componentEntries = Object.entries(files.componentRegistry.json)
  .map(([id, component]) => ({
    id,
    bytes: jsonBytes(component),
    searchableTextBytes: Buffer.byteLength(String(component.searchableText || ""), "utf8"),
    category: typeof component.category === "string" ? component.category : "",
    tagCount: Array.isArray(component.tags) ? component.tags.length : 0,
    dependencyCount: Array.isArray(component.dependencies) ? component.dependencies.length : 0,
  }))
  .sort((a, b) => b.bytes - a.bytes);

const actuals = {
  componentRegistryBytes: files.componentRegistry.bytes,
  componentRegistryGzipBytes: files.componentRegistry.gzipBytes,
  componentCount: files.componentRegistry.entries,
  shadcnRegistryBytes: files.shadcnRegistry.bytes,
  tagIndexBytes: files.tagIndex.bytes,
  searchableTextBytes: componentEntries.reduce((sum, item) => sum + item.searchableTextBytes, 0),
  largestComponentBytes: componentEntries[0]?.bytes ?? 0,
};

const baseline = readBaseline();
const thresholds = baseline?.thresholds || {};
const thresholdResults = [
  thresholdCheck("componentRegistryBytes", "Generated component registry bytes", actuals.componentRegistryBytes, thresholds),
  thresholdCheck("componentRegistryGzipBytes", "Generated component registry gzip bytes", actuals.componentRegistryGzipBytes, thresholds),
  thresholdCheck("componentCount", "Generated component count", actuals.componentCount, thresholds),
  thresholdCheck("shadcnRegistryBytes", "Shadcn registry bytes", actuals.shadcnRegistryBytes, thresholds),
  thresholdCheck("tagIndexBytes", "Tag index bytes", actuals.tagIndexBytes, thresholds),
  thresholdCheck("searchableTextBytes", "Searchable text bytes", actuals.searchableTextBytes, thresholds),
  thresholdCheck("largestComponentBytes", "Largest component JSON bytes", actuals.largestComponentBytes, thresholds),
];

const failures = [
  ...(checkMode && !baseline ? [`Baseline file is missing: ${baselineRelativePath}`] : []),
  ...thresholdResults
    .filter((result) => !result.ok)
    .map((result) => `${result.label} is ${result.actual}, above limit ${result.limit}.`),
];

const report = {
  ok: failures.length === 0,
  baseline: baselineRelativePath,
  files: Object.fromEntries(
    Object.entries(files).map(([key, file]) => [
      key,
      {
        path: file.path,
        bytes: file.bytes,
        gzipBytes: file.gzipBytes,
        entries: file.entries,
      },
    ]),
  ),
  actuals,
  largestComponents: componentEntries.slice(0, 10),
  thresholds,
  thresholdResults,
  failures,
};

if (jsonMode) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("Registry payload report");
  console.log(
    `- Component registry: ${formatBytes(actuals.componentRegistryBytes)} (${formatBytes(actuals.componentRegistryGzipBytes)} gzip), ${actuals.componentCount} components`,
  );
  console.log(`- Shadcn registry: ${formatBytes(actuals.shadcnRegistryBytes)}`);
  console.log(`- Tag index: ${formatBytes(actuals.tagIndexBytes)}`);
  console.log(`- Searchable text: ${formatBytes(actuals.searchableTextBytes)}`);
  console.log(`- Largest component: ${formatBytes(actuals.largestComponentBytes)} (${componentEntries[0]?.id || "n/a"})`);

  if (checkMode) {
    for (const result of thresholdResults) {
      if (result.skipped) continue;
      const status = result.ok ? "OK" : "FAIL";
      console.log(`- ${status}: ${result.label} ${result.actual} <= ${result.limit}`);
    }
    for (const failure of failures) console.error(`ERROR: ${failure}`);
    console.log(failures.length === 0 ? "Registry payload check passed." : "Registry payload check failed.");
  }
}

process.exit(failures.length === 0 ? 0 : 1);
