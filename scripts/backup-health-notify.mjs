#!/usr/bin/env node

import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { DEFAULT_BACKUP_ROOT, readConfiguredBackupSecondCopyRoot } from "./lib/backup-root.mjs";
import {
  expandHomePath,
  parseArgs,
  readJson,
  sha256Text,
  timestampForFile,
  writeJsonAtomic,
} from "./lib/culturepeople-ops-utils.mjs";

const APPLY_CONFIRMATION = "SEND_BACKUP_HEALTH_ALERT";

function runJson(script, args) {
  const result = spawnSync(process.execPath, [path.resolve("scripts", script), ...args, "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  try {
    return { status: result.status, report: JSON.parse(result.stdout) };
  } catch {
    return { status: result.status, report: { ok: false, errors: [String(result.stderr || "Invalid JSON output").slice(0, 500)] } };
  }
}

export function buildBackupHealthSummary(status, restore = null) {
  const health = status?.health || {};
  const states = Object.entries(health).map(([name, value]) => ({ name, status: String(value?.status || "unknown") }));
  if (restore) states.push({ name: "restoreCheckAll", status: restore.ok ? "ok" : "danger" });
  const severity = states.some((item) => ["danger", "block"].includes(item.status))
    ? "danger"
    : states.some((item) => ["warning", "unknown", "not_configured"].includes(item.status))
      ? "warning"
      : "ok";
  const messages = [];
  if (health.backupFreshness?.status !== "ok") messages.push(`backup freshness=${health.backupFreshness?.status || "unknown"}`);
  if (health.supabaseFallback?.status !== "ok") messages.push(`Supabase fallback=${health.supabaseFallback?.status || "unknown"}`);
  if (health.disk?.status !== "ok") messages.push(`disk=${health.disk?.status || "unknown"}, used=${health.disk?.usedPercent ?? "unknown"}%`);
  if (health.secondCopy?.status !== "ok") messages.push(`second copy=${health.secondCopy?.status || "unknown"}`);
  if (health.imageBackfill?.status !== "ok") messages.push(`image backfill=${health.imageBackfill?.status || "unknown"}, +${health.imageBackfill?.addedFiles ?? 0}`);
  if (health.lock?.status !== "ok") messages.push(`backup lock=${health.lock?.status || "unknown"}`);
  if (restore && !restore.ok) messages.push("primary/second restore-check failed");
  return { severity, states, messages };
}

async function sendTelegram(text) {
  const token = String(process.env.CULTUREPEOPLE_TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(process.env.CULTUREPEOPLE_TELEGRAM_CHAT_ID || "").trim();
  if (!token || !chatId) return { ok: false, blocked: true, reason: "CULTUREPEOPLE_TELEGRAM_BOT_TOKEN or CULTUREPEOPLE_TELEGRAM_CHAT_ID is missing" };
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  });
  return { ok: response.ok, status: response.status, blocked: false };
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const root = path.resolve(expandHomePath(values.root || DEFAULT_BACKUP_ROOT));
  const secondCopy = values["second-copy"] ? path.resolve(expandHomePath(values["second-copy"])) : readConfiguredBackupSecondCopyRoot();
  const statusResult = runJson("local-culturepeople-backup-status.mjs", ["--root", root, ...(secondCopy ? ["--second-copy", secondCopy] : [])]);
  const restoreResult = flags.has("run-restore-check-all")
    ? runJson("restore-local-backup-copies.mjs", ["--root", root, ...(secondCopy ? ["--second-copy", secondCopy] : [])])
    : null;
  const summary = buildBackupHealthSummary(statusResult.report, restoreResult?.report || null);
  const reportDir = path.resolve(expandHomePath(values["report-dir"] || path.join(root, "_reports")));
  const reportPath = path.join(reportDir, `backup-health-${timestampForFile()}.json`);
  const statePath = path.join(reportDir, "backup-health-notification-state.json");
  const fingerprint = sha256Text(JSON.stringify({ severity: summary.severity, messages: summary.messages }));
  const previous = readJson(statePath, {});
  const dedupeHours = Math.max(1, Number(values["dedupe-hours"] || 12));
  const previousAgeHours = previous.sentAt ? (Date.now() - Date.parse(previous.sentAt)) / 36e5 : Number.POSITIVE_INFINITY;
  const duplicate = previous.fingerprint === fingerprint && previousAgeHours < dedupeHours;
  const text = [
    `[CulturePeople backup] ${summary.severity.toUpperCase()}`,
    `generated=${new Date().toISOString()}`,
    ...(summary.messages.length ? summary.messages : ["all monitored checks are healthy"]),
  ].join("\n");
  let delivery = { attempted: false, ok: null, duplicate };
  const applyAuthorized = flags.has("apply") && values.confirm === APPLY_CONFIRMATION;
  if (flags.has("apply") && !applyAuthorized) {
    delivery = { attempted: false, ok: false, duplicate: false, blocked: true, reason: `--confirm ${APPLY_CONFIRMATION} is required` };
  } else if (applyAuthorized && !duplicate) {
    const sent = await sendTelegram(flags.has("test") ? `[TEST]\n${text}` : text);
    delivery = { attempted: true, duplicate: false, ...sent };
    if (sent.ok) writeJsonAtomic(statePath, { fingerprint, sentAt: new Date().toISOString(), severity: summary.severity });
  }
  const report = {
    ok: statusResult.report?.ok === true && (!restoreResult || restoreResult.report?.ok === true) && (!flags.has("apply") || delivery.ok === true || duplicate),
    generatedAt: new Date().toISOString(),
    mode: flags.has("apply") ? "apply" : "report-only",
    root,
    secondCopy: secondCopy || null,
    summary,
    status: statusResult.report,
    restore: restoreResult?.report || null,
    delivery,
    secretValuesIncluded: false,
    reportPath,
  };
  writeJsonAtomic(reportPath, report);
  if (flags.has("json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log("CulturePeople backup health notification");
    console.log(`- ok: ${report.ok}`);
    console.log(`- mode/severity: ${report.mode}/${summary.severity}`);
    console.log(`- delivery attempted/ok/duplicate: ${delivery.attempted}/${delivery.ok}/${delivery.duplicate}`);
    console.log(`- report: ${reportPath}`);
    for (const message of summary.messages) console.log(`- warning: ${message}`);
  }
  if (!report.ok || (flags.has("strict") && ["danger", "block"].includes(summary.severity))) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[backup:health:notify] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
