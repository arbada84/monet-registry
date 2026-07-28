#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import { buildRunPaths, parseArgs, readJson, writeJson, writeText } from "./lib/editorial-common.mjs";
import { assertSafeRelativeArtifact } from "./lib/editorial-common.mjs";

function hashRows(rows) {
  return crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

const { values } = parseArgs();
if (!values.manifest) throw new Error("--manifest <file> is required");
const manifest = readJson(path.resolve(values.manifest));
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.rows) || !Array.isArray(manifest.calculations)) {
  throw new Error("invalid analysis manifest");
}
if (!manifest.methodology || !Array.isArray(manifest.limitations) || !manifest.limitations.length
  || !/^[a-f0-9]{64}$/i.test(manifest.queryHash || "")
  || !/^[a-f0-9]{64}$/i.test(manifest.codeHash || "")
  || !Array.isArray(manifest.chartArtifacts)) {
  throw new Error("methodology, limitations, queryHash, codeHash, and chartArtifacts are required");
}
for (const artifact of manifest.chartArtifacts) {
  assertSafeRelativeArtifact(artifact.artifactKey);
  if (!/^[a-f0-9]{64}$/i.test(artifact.contentHash || "")) throw new Error(`invalid chart artifact hash: ${artifact.id || "unknown"}`);
}
const datasetHash = hashRows(manifest.rows);
const results = manifest.calculations.map((calculation) => {
  const valuesForField = calculation.field
    ? manifest.rows.map((row) => Number(row[calculation.field])).filter(Number.isFinite)
    : [];
  const actual = calculation.operation === "count"
    ? manifest.rows.length
    : calculation.operation === "sum"
      ? valuesForField.reduce((sum, value) => sum + value, 0)
      : calculation.operation === "average" && valuesForField.length
        ? valuesForField.reduce((sum, value) => sum + value, 0) / valuesForField.length
        : 0;
  return { ...calculation, actual, matches: Math.abs(actual - Number(calculation.expected)) < 1e-9 };
});
const report = {
  schemaVersion: 1,
  kind: "editorial-analysis-reproduction",
  generatedAt: new Date().toISOString(),
  status: datasetHash === manifest.datasetHash && results.every((result) => result.matches) ? "reproduced" : "mismatch",
  datasetId: manifest.datasetId,
  datasetVersion: manifest.datasetVersion,
  datasetHash,
  expectedDatasetHash: manifest.datasetHash,
  queryHash: manifest.queryHash,
  codeHash: manifest.codeHash,
  chartArtifacts: manifest.chartArtifacts.map((artifact) => ({
    id: artifact.id,
    artifactKey: artifact.artifactKey,
    contentHash: artifact.contentHash,
    mediaType: artifact.mediaType,
    description: artifact.description,
  })),
  results,
};
const paths = buildRunPaths("editorial-analysis", values.output || ".editorial-audit-runs");
for (const file of [paths.json, paths.latestJson]) writeJson(file, report);
for (const file of [paths.markdown, paths.latestMarkdown]) writeText(file, [
  "# Editorial analysis reproduction",
  "",
  `- status: ${report.status}`,
  `- dataset: ${report.datasetId}@${report.datasetVersion}`,
  `- hash match: ${datasetHash === manifest.datasetHash}`,
  ...results.map((result) => `- ${result.id}: expected=${result.expected}, actual=${result.actual}, match=${result.matches}`),
].join("\n"));
console.log(JSON.stringify({ ...report, reportPaths: paths }, null, 2));
if (report.status !== "reproduced") process.exit(2);
