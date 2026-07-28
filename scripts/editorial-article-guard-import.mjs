#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildRunPaths, parseArgs, sha256, writeJson, writeText } from "./lib/editorial-common.mjs";
import { readAdapterManifestFile } from "./lib/editorial-artifact.mjs";

const { flags, values } = parseArgs();
if (!values.manifest && !values.input) throw new Error("--manifest <file> is required");
const inputPath = path.resolve(values.manifest || values.input);
const manifest = readAdapterManifestFile(inputPath);
const counts = {
  records: manifest.records.length,
  fixtures: manifest.records.filter((record) => record.fixture).length,
  evidenceEligible: manifest.records.filter((record) => record.evidenceEligible).length,
  rightsBlocked: manifest.records.filter((record) => !record.evidenceEligible).length,
  highRisk: manifest.records.filter((record) => record.highRisk.length).length,
};
const report = {
  schemaVersion: 1,
  kind: "editorial-article-guard-import",
  generatedAt: new Date().toISOString(),
  dryRun: !flags.has("apply"),
  status: counts.rightsBlocked ? "blocked" : "ready",
  inputChecksum: sha256(fs.readFileSync(inputPath)),
  counts,
  normalizedManifest: flags.has("apply") ? manifest : undefined,
};
const paths = buildRunPaths("editorial-adapter", values.output || ".editorial-audit-runs");
for (const file of [paths.json, paths.latestJson]) writeJson(file, report);
for (const file of [paths.markdown, paths.latestMarkdown]) writeText(file, [
  "# Editorial Article Guard adapter",
  "",
  `- status: ${report.status}`,
  `- dry-run: ${report.dryRun}`,
  `- records: ${counts.records}`,
  `- fixtures: ${counts.fixtures}`,
  `- evidence eligible: ${counts.evidenceEligible}`,
  `- rights blocked: ${counts.rightsBlocked}`,
].join("\n"));
console.log(JSON.stringify({ ...report, normalizedManifest: undefined, reportPaths: paths }, null, 2));
