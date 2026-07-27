#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_BACKUP_ROOT } from "./lib/backup-root.mjs";
import {
  expandHomePath,
  fileMode,
  latestBackupDir,
  parseArgs,
  readJson,
  timestampForFile,
  walkFiles,
  writeJsonAtomic,
} from "./lib/culturepeople-ops-utils.mjs";

const SENSITIVE_SETTING_RE = /(admin|api|access|auth|mail|newsletter|subscriber|telegram|webhook|secret|credential)/i;
const SENSITIVE_FIELD_RE = /(api.?key|auth|cookie|email|hash|ip|key|pass|phone|secret|subscriber|token|webhook)/i;

function parseNested(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || !["{", "["].includes(text[0])) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function inspectObjectFields(value, prefix = "", depth = 0, output = new Map()) {
  if (depth > 8 || value == null) return output;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 100)) inspectObjectFields(item, prefix, depth + 1, output);
    return output;
  }
  if (typeof value !== "object") return output;
  for (const [key, raw] of Object.entries(value)) {
    const field = prefix ? `${prefix}.${key}` : key;
    if (SENSITIVE_FIELD_RE.test(key)) {
      const nonEmpty = raw != null && (typeof raw !== "string" || raw.trim().length > 0);
      output.set(field, (output.get(field) || false) || nonEmpty);
    }
    const nested = parseNested(raw);
    if (nested) inspectObjectFields(nested, field, depth + 1, output);
  }
  return output;
}

function inspectSettingsFile(filePath, backupRoot) {
  const rows = readJson(filePath, []);
  if (!Array.isArray(rows)) return { file: path.relative(backupRoot, filePath), rows: 0, sensitiveSettings: [], parseError: true };
  const sensitiveSettings = [];
  for (const row of rows) {
    const settingKey = String(row?.key || row?.id || "").trim();
    const parsed = parseNested(row?.value ?? row?.data ?? row?.settings);
    const fields = [...inspectObjectFields(parsed).entries()]
      .map(([field, nonEmpty]) => ({ field, nonEmpty }))
      .sort((a, b) => a.field.localeCompare(b.field));
    if (!SENSITIVE_SETTING_RE.test(settingKey) && fields.length === 0) continue;
    sensitiveSettings.push({
      settingKey: settingKey || "(missing)",
      sensitiveFields: fields.map((item) => item.field),
      nonEmptySensitiveFields: fields.filter((item) => item.nonEmpty).length,
      valuePresent: row?.value != null && String(row.value).trim().length > 0,
    });
  }
  return { file: path.relative(backupRoot, filePath), rows: rows.length, sensitiveSettings, parseError: false };
}

export function buildBackupSecurityAudit({ root = DEFAULT_BACKUP_ROOT, backupDir = "" } = {}) {
  const backupRoot = path.resolve(expandHomePath(root));
  const latest = backupDir ? path.resolve(expandHomePath(backupDir)) : latestBackupDir(backupRoot);
  const errors = [];
  const warnings = [];
  if (!latest) errors.push(`No backup found under ${backupRoot}.`);
  const files = latest ? walkFiles(latest) : [];
  const jsonFiles = files.filter((filePath) => filePath.endsWith(".json"));
  const permissionCounts = {};
  const broadlyAccessible = [];
  for (const filePath of jsonFiles) {
    const mode = fileMode(filePath) || "unknown";
    permissionCounts[mode] = (permissionCounts[mode] || 0) + 1;
    if (mode !== "unknown" && (Number.parseInt(mode, 8) & 0o077) !== 0) {
      broadlyAccessible.push({ file: path.relative(backupRoot, filePath), mode });
    }
  }
  const settingsFiles = latest ? [
    path.join(latest, "raw", "d1", "tables", "site_settings.json"),
    path.join(latest, "raw", "supabase", "tables", "site_settings.json"),
  ].filter((filePath) => fs.existsSync(filePath)) : [];
  const settings = settingsFiles.map((filePath) => inspectSettingsFile(filePath, backupRoot));
  const sensitiveSettingCount = settings.reduce((sum, item) => sum + item.sensitiveSettings.length, 0);
  const nonEmptySensitiveFieldCount = settings.reduce(
    (sum, item) => sum + item.sensitiveSettings.reduce((subtotal, setting) => subtotal + setting.nonEmptySensitiveFields, 0),
    0,
  );
  const permissionModelReliable = process.platform !== "win32" && !backupRoot.startsWith(`${path.sep}media${path.sep}`);
  if (broadlyAccessible.length) warnings.push(`${broadlyAccessible.length} backup JSON files are group/world accessible by POSIX mode.`);
  if (!permissionModelReliable) warnings.push("The backup root appears to be on a Windows/removable mount; POSIX mode bits are not a reliable security boundary.");
  if (sensitiveSettingCount) warnings.push(`${sensitiveSettingCount} settings contain sensitive setting names or fields; values were not included in this report.`);
  return {
    ok: errors.length === 0,
    generatedAt: new Date().toISOString(),
    root: backupRoot,
    latestBackupDir: latest || null,
    permissionModelReliable,
    files: {
      total: files.length,
      json: jsonFiles.length,
      permissionCounts,
      broadlyAccessible: broadlyAccessible.length,
      broadlyAccessibleSample: broadlyAccessible.slice(0, 30),
    },
    sensitiveData: {
      settingsFiles: settings,
      sensitiveSettingCount,
      nonEmptySensitiveFieldCount,
      valuesIncluded: false,
      plaintextRisk: sensitiveSettingCount > 0,
    },
    warnings,
    errors,
  };
}

function printHuman(report) {
  console.log("CulturePeople backup security audit");
  console.log(`- ok: ${report.ok}`);
  console.log(`- backup: ${report.latestBackupDir || "(none)"}`);
  console.log(`- JSON files / broad mode: ${report.files.json}/${report.files.broadlyAccessible}`);
  console.log(`- sensitive settings/fields: ${report.sensitiveData.sensitiveSettingCount}/${report.sensitiveData.nonEmptySensitiveFieldCount}`);
  console.log("- secret values included: false");
  for (const warning of report.warnings) console.log(`- warning: ${warning}`);
  for (const error of report.errors) console.log(`- error: ${error}`);
}

function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const root = path.resolve(expandHomePath(values.root || DEFAULT_BACKUP_ROOT));
  const report = buildBackupSecurityAudit({ root, backupDir: values["backup-dir"] || "" });
  const output = values.report
    ? path.resolve(expandHomePath(values.report))
    : path.join(root, "_security-reports", `backup-security-audit-${timestampForFile()}.json`);
  if (!flags.has("no-write")) {
    writeJsonAtomic(output, { ...report, reportPath: output });
    report.reportPath = output;
  }
  if (flags.has("json")) console.log(JSON.stringify(report, null, 2));
  else {
    printHuman(report);
    if (report.reportPath) console.log(`- report: ${report.reportPath}`);
  }
  if (!report.ok || (flags.has("fail-sensitive-plaintext") && report.sensitiveData.plaintextRisk)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
