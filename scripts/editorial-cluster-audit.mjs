#!/usr/bin/env node
import path from "node:path";
import { buildRunPaths, clusterRecords, parseArgs, readJson, writeJson, writeText } from "./lib/editorial-common.mjs";
import { validateAdapterManifest } from "./lib/editorial-artifact.mjs";

const { values } = parseArgs();
if (!values.input) throw new Error("--input <manifest> is required");
const manifest = validateAdapterManifest(readJson(path.resolve(values.input)));
const clusters = clusterRecords(manifest.records);
const report = {
  schemaVersion: 1,
  kind: "editorial-cluster-audit",
  generatedAt: new Date().toISOString(),
  status: manifest.records.every((record) => record.fixture) ? "functional_test_only" : "report_only",
  counts: {
    records: manifest.records.length,
    clusters: clusters.length,
    fixtureClusters: clusters.filter((cluster) => cluster.fixture).length,
  },
  clusters,
};
const paths = buildRunPaths("editorial-cluster", values.output || ".editorial-audit-runs");
for (const file of [paths.json, paths.latestJson]) writeJson(file, report);
for (const file of [paths.markdown, paths.latestMarkdown]) writeText(file, [
  "# Editorial origin cluster audit",
  "",
  `- status: ${report.status}`,
  `- records: ${report.counts.records}`,
  `- clusters: ${report.counts.clusters}`,
  "",
  ...clusters.map((cluster) => `- ${cluster.id}: ${cluster.recordIds.length} records, independent origins=${cluster.independentOriginCount}, fixture=${cluster.fixture}`),
].join("\n"));
console.log(JSON.stringify({ ...report, reportPaths: paths }, null, 2));
