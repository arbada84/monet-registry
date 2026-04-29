#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_INPUT_DIR = "exports/supabase";
const DEFAULT_REQUIRED_FILES = ["articles.json", "site_settings.json"];
const DEFAULT_OPTIONAL_FILES = ["comments.json", "notifications.json", "export-manifest.json"];

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

function splitCsv(value, fallback = []) {
  const resolved = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return resolved.length ? resolved : fallback;
}

function readJsonFile(filePath) {
  const body = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(body);
}

function asArray(value, fileName) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.result)) return value.result;
  throw new Error(`Expected array JSON in ${fileName}`);
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pushIssue(report, severity, message) {
  if (severity === "error") report.errors.push(message);
  else report.warnings.push(message);
}

function previewValue(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return String(text || "").slice(0, 120);
}

function requireFields(rows, fields, fileName, report) {
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!isPlainObject(row)) {
      pushIssue(report, "error", `${fileName}[${index}] is not an object.`);
      continue;
    }

    for (const field of fields) {
      if (!(field in row)) {
        pushIssue(report, "error", `${fileName}[${index}] is missing required field '${field}'.`);
        continue;
      }

      const value = row[field];
      if (value === null || value === undefined || value === "") {
        pushIssue(report, "error", `${fileName}[${index}] has an empty required field '${field}'.`);
      }
    }
  }
}

function detectDuplicates(rows, field, fileName, report) {
  const seen = new Map();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!isPlainObject(row) || !(field in row)) continue;
    const value = row[field];
    if (value === null || value === undefined || value === "") continue;

    const normalized = String(value);
    const existing = seen.get(normalized);
    if (existing !== undefined) {
      pushIssue(report, "error", `${fileName} has duplicate '${field}' value '${previewValue(value)}' at rows ${existing} and ${index}.`);
    } else {
      seen.set(normalized, index);
    }
  }
}

function validateArticles(rows, report) {
  requireFields(rows, ["id", "title"], "articles.json", report);
  detectDuplicates(rows, "id", "articles.json", report);

  let missingBodyCount = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!isPlainObject(row)) continue;

    if ("no" in row && row.no !== null && row.no !== undefined && Number.isNaN(Number(row.no))) {
      pushIssue(report, "warning", `articles.json[${index}] has a non-numeric 'no' value.`);
    }

    if (!("body" in row) || row.body === null || row.body === undefined) missingBodyCount += 1;
  }

  if (rows.length === 0) {
    pushIssue(report, "warning", "articles.json is empty.");
  }

  if (missingBodyCount > 0) {
    pushIssue(report, "warning", `articles.json has ${missingBodyCount} row(s) without a body field; import will still work but content may be incomplete.`);
  }
}

function validateSiteSettings(rows, report) {
  requireFields(rows, ["key"], "site_settings.json", report);
  detectDuplicates(rows, "key", "site_settings.json", report);

  const keys = new Set();
  for (const row of rows) {
    if (isPlainObject(row) && row.key) keys.add(String(row.key));
  }

  const recommendedKeys = ["cp-view-logs", "cp-distribute-logs"];
  for (const key of recommendedKeys) {
    if (!keys.has(key)) {
      pushIssue(report, "warning", `site_settings.json does not contain '${key}'. This is OK if the feature was unused, but related D1 log tables will import empty.`);
    }
  }
}

function validateComments(rows, report) {
  detectDuplicates(rows, "id", "comments.json", report);

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!isPlainObject(row)) {
      pushIssue(report, "error", `comments.json[${index}] is not an object.`);
      continue;
    }

    if (!("article_id" in row) && !("articleId" in row)) {
      pushIssue(report, "warning", `comments.json[${index}] does not include article_id/articleId; prepare-import will skip it.`);
    }
  }
}

function validateNotifications(rows, report) {
  detectDuplicates(rows, "id", "notifications.json", report);

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!isPlainObject(row)) {
      pushIssue(report, "error", `notifications.json[${index}] is not an object.`);
      continue;
    }

    if (!("title" in row) || row.title === null || row.title === undefined || row.title === "") {
      pushIssue(report, "warning", `notifications.json[${index}] is missing a title; import will fallback to '(untitled)'.`);
    }
  }
}

function validateManifest(manifest, report) {
  if (!isPlainObject(manifest)) {
    pushIssue(report, "warning", "export-manifest.json exists but is not an object.");
    return;
  }

  if (manifest.ok !== true) {
    pushIssue(report, "warning", "export-manifest.json reports ok=false. The export may have been partial.");
  }

  if (!Array.isArray(manifest.tables)) {
    pushIssue(report, "warning", "export-manifest.json is missing a tables array.");
    return;
  }

  for (const required of ["articles", "site_settings"]) {
    if (!manifest.tables.some((entry) => isPlainObject(entry) && entry.table === required)) {
      pushIssue(report, "warning", `export-manifest.json does not list required table '${required}'.`);
    }
  }
}

function buildFileStatus(inputDir, fileName) {
  const filePath = path.join(inputDir, fileName);
  return {
    fileName,
    filePath,
    exists: fs.existsSync(filePath),
  };
}

function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const inputDir = path.resolve(values.input || DEFAULT_INPUT_DIR);
  const requiredFiles = splitCsv(values.required, DEFAULT_REQUIRED_FILES);
  const optionalFiles = splitCsv(values.optional, DEFAULT_OPTIONAL_FILES);
  const failOnWarning = flags.has("fail-on-warning");

  const report = {
    ok: false,
    inputDir,
    generatedAt: new Date().toISOString(),
    files: [],
    counts: {},
    warnings: [],
    errors: [],
  };

  if (!fs.existsSync(inputDir)) {
    report.errors.push(`Input directory not found: ${inputDir}`);
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const fileStatuses = [
    ...requiredFiles.map((fileName) => ({ ...buildFileStatus(inputDir, fileName), required: true })),
    ...optionalFiles
      .filter((fileName) => !requiredFiles.includes(fileName))
      .map((fileName) => ({ ...buildFileStatus(inputDir, fileName), required: false })),
  ];
  report.files = fileStatuses;

  for (const file of fileStatuses.filter((entry) => entry.required && !entry.exists)) {
    report.errors.push(`Required export file is missing: ${file.fileName}`);
  }

  for (const file of fileStatuses.filter((entry) => !entry.required && !entry.exists)) {
    report.warnings.push(`Optional export file is missing: ${file.fileName}`);
  }

  for (const file of fileStatuses.filter((entry) => entry.exists)) {
    try {
      const parsed = readJsonFile(file.filePath);

      if (file.fileName === "export-manifest.json") {
        validateManifest(parsed, report);
        continue;
      }

      const rows = asArray(parsed, file.fileName);
      report.counts[file.fileName] = rows.length;

      if (file.fileName === "articles.json") validateArticles(rows, report);
      if (file.fileName === "site_settings.json") validateSiteSettings(rows, report);
      if (file.fileName === "comments.json") validateComments(rows, report);
      if (file.fileName === "notifications.json") validateNotifications(rows, report);
    } catch (error) {
      report.errors.push(`${file.fileName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  report.ok = report.errors.length === 0 && (!failOnWarning || report.warnings.length === 0);
  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exit(report.errors.length > 0 ? 1 : 3);
  }
}

main();
