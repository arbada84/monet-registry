#!/usr/bin/env node
import path from "node:path";
import { buildRunPaths, parseArgs, readJson, writeJson, writeText } from "./lib/editorial-common.mjs";
import { auditEvidencePackage, buildEvidencePackage, validateAdapterManifest } from "./lib/editorial-artifact.mjs";

const { values } = parseArgs();
if (!values.input) throw new Error("--input <manifest-or-package> is required");
const input = readJson(path.resolve(values.input));
const pkg = Array.isArray(input.records)
  ? buildEvidencePackage(validateAdapterManifest(input), values.candidate || "shadow-candidate")
  : input;
const audit = auditEvidencePackage(pkg);
const report = {
  schemaVersion: 1,
  kind: "editorial-evidence-audit",
  generatedAt: new Date().toISOString(),
  status: audit.ok ? "review_required" : audit.state,
  audit,
  package: pkg,
};
const paths = buildRunPaths("editorial-evidence", values.output || ".editorial-audit-runs");
for (const file of [paths.json, paths.latestJson]) writeJson(file, report);
for (const file of [paths.markdown, paths.latestMarkdown]) writeText(file, [
  "# Editorial evidence audit",
  "",
  `- status: ${report.status}`,
  `- evidence coverage: ${(audit.evidenceCoverage * 100).toFixed(1)}%`,
  `- high risk: ${audit.highRisk.join(", ") || "none"}`,
  ...audit.errors.map((error) => `- blocked: ${error}`),
].join("\n"));
console.log(JSON.stringify({ ...report, package: { ...pkg, sources: pkg.sources.map(({ body: _body, ...source }) => source) }, reportPaths: paths }, null, 2));
