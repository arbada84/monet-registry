#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildRunPaths, parseArgs, readJson, writeJson, writeText } from "./lib/editorial-common.mjs";

const { values } = parseArgs();
const metrics = values.input && fs.existsSync(path.resolve(values.input))
  ? readJson(path.resolve(values.input))
  : {};
const normalized = {
  shadowDays: Number(values.days ?? metrics.shadowDays ?? 0),
  pilotCount: Number(metrics.pilotCount ?? 0),
  reviewerCount: Number(metrics.reviewerCount ?? 0),
  holdoutEvaluated: metrics.holdoutEvaluated === true,
  unsupportedCoreClaims: Number(metrics.unsupportedCoreClaims ?? 0),
  highRiskAutoPublished: Number(metrics.highRiskAutoPublished ?? 0),
  killSwitchVerified: metrics.killSwitchVerified === true,
  decisionRecordApproved: metrics.decisionRecordApproved === true,
};
const blockers = [];
if (normalized.shadowDays < 90) blockers.push("shadow_period_below_90_days");
if (normalized.pilotCount < 50) blockers.push("pilot_below_50");
if (normalized.reviewerCount < 2) blockers.push("reviewers_below_2");
if (!normalized.holdoutEvaluated) blockers.push("holdout_not_evaluated");
if (normalized.unsupportedCoreClaims > 0) blockers.push("unsupported_core_claims_present");
if (normalized.highRiskAutoPublished > 0) blockers.push("high_risk_auto_publish_detected");
if (!normalized.killSwitchVerified) blockers.push("kill_switch_not_verified");
if (!normalized.decisionRecordApproved) blockers.push("representative_decision_missing");
const report = {
  schemaVersion: 1,
  kind: "editorial-automation-readiness",
  generatedAt: new Date().toISOString(),
  status: blockers.length ? "blocked" : "ready_for_representative_review",
  mode: "draft_only",
  autoPublishEnabled: false,
  metrics: normalized,
  blockers,
};
const paths = buildRunPaths("editorial-readiness", values.output || ".editorial-audit-runs");
for (const file of [paths.json, paths.latestJson]) writeJson(file, report);
for (const file of [paths.markdown, paths.latestMarkdown]) writeText(file, [
  "# Editorial automation readiness",
  "",
  `- status: ${report.status}`,
  "- mode: draft_only",
  "- auto publish: disabled",
  ...blockers.map((blocker) => `- blocked: ${blocker}`),
].join("\n"));
console.log(JSON.stringify({ ...report, reportPaths: paths }, null, 2));
