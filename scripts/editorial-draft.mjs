#!/usr/bin/env node
import path from "node:path";
import { buildRunPaths, parseArgs, readJson, writeJson, writeText } from "./lib/editorial-common.mjs";
import { auditEvidencePackage, validateLockedDraft } from "./lib/editorial-artifact.mjs";

const { flags, values } = parseArgs();
if (!values.candidate && !values.input) throw new Error("--candidate <evidence-package> is required");
const packagePath = path.resolve(values.candidate || values.input);
const wrapped = readJson(packagePath);
const pkg = wrapped.package || wrapped;
const evidenceAudit = auditEvidencePackage(pkg);
const draft = values.draft ? readJson(path.resolve(values.draft)).draft || "" : "";
const evidenceExcerpts = (pkg.evidence || [])
  .filter((item) => item.evidenceEligible && !item.fixture)
  .map((item) => item.excerpt);
const draftAudit = draft
  ? validateLockedDraft(draft, evidenceExcerpts)
  : { ok: false, unsupportedTokens: [], errors: ["draft_not_provided"] };
const status = !evidenceAudit.ok ? evidenceAudit.state : !draftAudit.ok ? "blocked_draft" : "review_required";
const report = {
  schemaVersion: 1,
  kind: "editorial-draft-audit",
  generatedAt: new Date().toISOString(),
  dryRun: !flags.has("apply"),
  status,
  autoPublishEnabled: false,
  humanReviewRequired: true,
  evidenceAudit,
  draftAudit,
};
const paths = buildRunPaths("editorial-draft", values.output || ".editorial-audit-runs");
for (const file of [paths.json, paths.latestJson]) writeJson(file, report);
for (const file of [paths.markdown, paths.latestMarkdown]) writeText(file, [
  "# Editorial evidence-locked draft audit",
  "",
  `- status: ${status}`,
  "- auto publish: disabled",
  "- human review: required",
  ...draftAudit.errors.map((error) => `- blocked: ${error}`),
].join("\n"));
console.log(JSON.stringify({ ...report, reportPaths: paths }, null, 2));
