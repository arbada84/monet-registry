#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildRunPaths, parseArgs, readJson, writeJson, writeText } from "./lib/editorial-common.mjs";

function findCatalog(explicit) {
  const candidates = [
    explicit,
    ".editorial-audit-runs/editorial-catalog-latest.json",
  ].filter(Boolean).map((item) => path.resolve(item));
  const found = candidates.find((item) => fs.existsSync(item));
  if (!found) throw new Error("catalog report not found; run pnpm editorial:catalog first");
  return found;
}

const { flags, values } = parseArgs();
const catalogPath = findCatalog(values.input);
const catalog = readJson(catalogPath);
const unknown = catalog.sources.filter((source) => (
  source.usageBasis === "unconfirmed" || source.blockReason === "rights_unconfirmed"
));
const fixtures = catalog.sources.filter((source) => source.fixture);
const eligible = catalog.sources.filter((source) => source.evidenceEligible && !source.fixture);
const unsafe = catalog.sources.filter((source) => source.fixture && (source.evidenceEligible || source.trainingEligible));
const status = unsafe.length ? "failed" : unknown.length ? "blocked" : "ready";
const report = {
  schemaVersion: 1,
  kind: "editorial-rights-audit",
  generatedAt: new Date().toISOString(),
  status,
  catalogChecksum: catalog.policy?.checksum || null,
  counts: {
    sources: catalog.sources.length,
    unknown: unknown.length,
    fixtures: fixtures.length,
    eligible: eligible.length,
    unsafe: unsafe.length,
  },
  blocked: unknown.map((source) => ({
    recordId: source.recordId,
    rowCount: source.rowCount,
    blockReason: source.blockReason,
  })),
  violations: unsafe.map((source) => ({
    recordId: source.recordId,
    reason: "fixture_must_not_be_evidence_or_training_eligible",
  })),
};
const paths = buildRunPaths("editorial-rights-audit", values.output || ".editorial-audit-runs");
const markdown = [
  "# Editorial rights audit",
  "",
  `- status: ${status}`,
  `- unknown sources: ${unknown.length}`,
  `- fixtures: ${fixtures.length}`,
  `- eligible sources: ${eligible.length}`,
  `- unsafe policy rows: ${unsafe.length}`,
  "",
  ...report.blocked.map((item) => `- blocked: ${item.recordId} (${item.rowCount} rows) - ${item.blockReason}`),
].join("\n");
for (const file of [paths.json, paths.latestJson]) writeJson(file, report);
for (const file of [paths.markdown, paths.latestMarkdown]) writeText(file, markdown);
console.log(JSON.stringify({ ...report, reportPaths: paths }, null, 2));
if (unsafe.length || (flags.has("fail-on-unknown") && unknown.length)) process.exit(2);
