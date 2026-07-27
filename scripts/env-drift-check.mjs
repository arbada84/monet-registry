#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_ENV_FILES = [".env.local", ".env.production.local", ".env.vercel.local"];
const SENSITIVE_RE = /(TOKEN|SECRET|KEY|PASSWORD|WEBHOOK|AUTH|SERVICE_ROLE)/i;

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

function printHelp() {
  console.log(`Usage: node scripts/env-drift-check.mjs [options]

Checks local env files for empty overrides and secret-log risks.
Values are never printed.

Options:
  --files <csv>             Env files in load order. Default: ${DEFAULT_ENV_FILES.join(",")}
  --fail-empty-overrides    Exit non-zero when a later env file empties a non-empty earlier value.
  --json                    Print machine-readable JSON only.
`);
}

function parseEnvFile(filePath) {
  const entries = {};
  if (!fs.existsSync(filePath)) return entries;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries[match[1]] = {
      key: match[1],
      empty: value.length === 0,
      sensitive: SENSITIVE_RE.test(match[1]),
      line: index + 1,
    };
  }
  return entries;
}

export function buildEnvDriftReport({ files = DEFAULT_ENV_FILES, failEmptyOverrides = false } = {}) {
  const resolvedFiles = files.map((file) => path.resolve(file));
  const parsed = resolvedFiles.map((file) => ({
    file,
    exists: fs.existsSync(file),
    entries: parseEnvFile(file),
  }));
  const seen = new Map();
  const emptyOverrides = [];
  const duplicateSensitive = [];
  const sensitiveKeys = new Set();

  for (const file of parsed) {
    for (const entry of Object.values(file.entries)) {
      if (entry.sensitive) sensitiveKeys.add(entry.key);
      const earlier = seen.get(entry.key);
      if (earlier && !earlier.empty && entry.empty) {
        emptyOverrides.push({
          key: entry.key,
          earlierFile: earlier.file,
          earlierLine: earlier.line,
          overrideFile: file.file,
          overrideLine: entry.line,
          sensitive: entry.sensitive || earlier.sensitive,
        });
      }
      if (earlier && entry.sensitive) {
        duplicateSensitive.push({
          key: entry.key,
          earlierFile: earlier.file,
          overrideFile: file.file,
        });
      }
      seen.set(entry.key, { ...entry, file: file.file });
    }
  }

  const warnings = [];
  if (emptyOverrides.length) warnings.push(`${emptyOverrides.length} empty env overrides can mask earlier non-empty values.`);
  if (duplicateSensitive.length) warnings.push(`${duplicateSensitive.length} sensitive keys are defined in multiple env files; check precedence carefully.`);

  return {
    ok: !(failEmptyOverrides && emptyOverrides.length > 0),
    generatedAt: new Date().toISOString(),
    files: parsed.map((file) => ({
      file: file.file,
      exists: file.exists,
      keys: Object.keys(file.entries).length,
      sensitiveKeys: Object.values(file.entries).filter((entry) => entry.sensitive).length,
      emptyKeys: Object.values(file.entries).filter((entry) => entry.empty).length,
    })),
    sensitiveKeys: [...sensitiveKeys].sort().map((key) => ({ key, value: key ? "***" : "" })),
    emptyOverrides,
    duplicateSensitive,
    warnings,
    errors: failEmptyOverrides && emptyOverrides.length ? ["empty env overrides detected"] : [],
  };
}

function printHuman(report) {
  console.log("CulturePeople env drift check");
  console.log(`- ok: ${report.ok}`);
  for (const file of report.files) {
    console.log(`- file: ${file.exists ? "present" : "missing"} ${file.file} keys=${file.keys} sensitive=${file.sensitiveKeys} empty=${file.emptyKeys}`);
  }
  for (const item of report.emptyOverrides) {
    console.log(`- warning: ${item.key} is empty in ${item.overrideFile}:${item.overrideLine} and can mask ${item.earlierFile}:${item.earlierLine}`);
  }
  for (const warning of report.warnings) console.log(`- warning: ${warning}`);
  for (const error of report.errors) console.log(`- error: ${error}`);
}

function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  if (flags.has("help") || flags.has("h")) {
    printHelp();
    return;
  }

  const files = values.files
    ? String(values.files).split(",").map((item) => item.trim()).filter(Boolean)
    : DEFAULT_ENV_FILES;
  const report = buildEnvDriftReport({
    files,
    failEmptyOverrides: flags.has("fail-empty-overrides"),
  });

  if (flags.has("json")) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
