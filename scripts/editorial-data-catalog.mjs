#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  buildRunPaths,
  parseArgs,
  readJson,
  redactPath,
  resolveExistingRoot,
  sha256,
  stableJson,
  writeJson,
  writeText,
} from "./lib/editorial-common.mjs";

function pythonCommands() {
  return process.platform === "win32"
    ? [["py", ["-3"]], ["python", []], ["python3", []]]
    : [["python3", []], ["python", []], ["py", ["-3"]]];
}

function inspectSqlite(database, bridge) {
  let lastError = "";
  for (const [command, prefix] of pythonCommands()) {
    const result = spawnSync(command, [...prefix, bridge, database], {
      cwd: process.cwd(),
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.status === 0) {
      return JSON.parse(result.stdout);
    }
    if (result.error?.code === "ENOENT") continue;
    lastError = (result.stderr || result.error?.message || "").trim();
  }
  throw new Error(`SQLite catalog bridge failed: ${lastError || "Python runtime not found"}`);
}

function isFixtureGroup(group) {
  const source = String(group.source_name || "").toLowerCase();
  if (source.includes("harness") || source.includes("fixture") || source.includes("example.com")) return true;
  if (group.document_type === "press_release" && source.startsWith("harness_")) return true;
  if (Number(group.fixture_signal_rows || 0) === Number(group.row_count || 0) && Number(group.row_count || 0) > 0) return true;
  return false;
}

function policyFor(source, policy) {
  const fixtureRule = policy.rules.find((rule) => rule.match?.fixture === true);
  if (source.fixture && fixtureRule) return fixtureRule.policy;
  const matched = policy.rules.find((rule) => (
    rule.match?.sourceType && rule.match.sourceType === source.sourceType
  ));
  return matched?.policy || policy.defaultPolicy;
}

function markdownFor(report) {
  const lines = [
    "# Editorial data catalog",
    "",
    `- status: ${report.status}`,
    `- generatedAt: ${report.generatedAt}`,
    `- databases: ${report.databases.length}`,
    `- sources: ${report.sources.length}`,
    `- rows: ${report.summary.rows}`,
    `- fixture rows: ${report.summary.fixtureRows}`,
    `- evidence blocked rows: ${report.summary.evidenceBlockedRows}`,
    "",
    "| Database | Source type | Source name | Rows | Fixture | Rights | Evidence | Block reason |",
    "|---|---|---|---:|---|---|---|---|",
  ];
  for (const source of report.sources) {
    lines.push(`| ${source.databaseName} | ${source.sourceType} | ${source.sourceName || "-"} | ${source.rowCount} | ${source.fixture ? "yes" : "no"} | ${source.rightsGrade} | ${source.evidenceEligible ? "allowed" : "blocked"} | ${source.blockReason || "-"} |`);
  }
  lines.push("", "This report never includes article bodies, credentials, or raw local roots.");
  return lines.join("\n");
}

const { flags, values } = parseArgs();
const articleGuardRoot = resolveExistingRoot(
  values["article-guard-root"] || values.root,
  "ARTICLE_GUARD_ROOT",
  "비즈니스트리뷴_기사검증프로그램",
);
const outputDir = values.output || ".editorial-audit-runs";
const policyPath = path.resolve(values.policy || "config/editorial-source-policy.json");
const policy = readJson(policyPath);
const bridge = path.resolve("scripts/lib/export-article-guard-catalog.py");
const requestedDatabases = values.database
  ? [path.resolve(values.database)]
  : [
      path.join(articleGuardRoot, "data", "article_guard.db"),
      path.join(articleGuardRoot, "data", "article_guard.sqlite"),
    ];

const databases = requestedDatabases.filter((database) => fs.existsSync(database)).map((database) => {
  const inspection = inspectSqlite(database, bridge);
  return {
    ...inspection,
    root: `<${path.basename(articleGuardRoot)}>`,
    path: redactPath(database, [articleGuardRoot]),
    checksum: sha256(fs.readFileSync(database)),
  };
});

const sources = databases.flatMap((database) => database.documentGroups.map((group) => {
  const fixture = isFixtureGroup(group);
  const base = {
    datasetId: `article-guard:${database.databaseName}`,
    recordId: `${group.document_type}:${group.source_name || "unknown"}`,
    sourceType: group.document_type,
    sourceName: group.source_name || "",
    databaseName: database.databaseName,
    rowCount: Number(group.row_count || 0),
    collectedAt: null,
    publishedRange: {
      min: group.min_published_at || null,
      max: group.max_published_at || null,
    },
    fixture,
    provenance: {
      collectorVersion: "article-guard-unknown",
      databaseChecksum: database.checksum,
      urlHosts: group.url_hosts || [],
      metadataKeys: group.metadata_keys || [],
      fixtureSignalRows: Number(group.fixture_signal_rows || 0),
    },
    piiStatus: "not_scanned_body_redacted",
    freshness: group.max_published_at || null,
  };
  return { ...base, ...policyFor(base, policy) };
}));

const summary = {
  rows: sources.reduce((sum, source) => sum + source.rowCount, 0),
  fixtureRows: sources.filter((source) => source.fixture).reduce((sum, source) => sum + source.rowCount, 0),
  evidenceBlockedRows: sources.filter((source) => !source.evidenceEligible).reduce((sum, source) => sum + source.rowCount, 0),
  trainingBlockedRows: sources.filter((source) => !source.trainingEligible).reduce((sum, source) => sum + source.rowCount, 0),
  harnessReviewers: [...new Set(databases.flatMap((database) => database.reviewers)
    .map((row) => row.reviewer)
    .filter((reviewer) => /harness/i.test(String(reviewer))))],
};

const report = {
  schemaVersion: 1,
  kind: "editorial-data-catalog",
  generatedAt: new Date().toISOString(),
  dryRun: !flags.has("apply"),
  status: sources.some((source) => source.blockReason === "rights_unconfirmed") ? "blocked" : "ready",
  policy: {
    path: path.relative(process.cwd(), policyPath),
    version: policy.version,
    checksum: sha256(stableJson(policy)),
  },
  databases,
  sources,
  summary,
};

const paths = buildRunPaths("editorial-catalog", outputDir);
const markdown = markdownFor(report);
for (const file of [paths.json, paths.latestJson]) writeJson(file, report);
for (const file of [paths.markdown, paths.latestMarkdown]) writeText(file, markdown);
console.log(JSON.stringify({ ...report, databases: report.databases.map(({ documentGroups: _groups, ...database }) => database), reportPaths: paths }, null, 2));
