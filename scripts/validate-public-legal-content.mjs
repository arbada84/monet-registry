#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expandHomePath, parseArgs, timestampForFile, writeJsonAtomic } from "./lib/culturepeople-ops-utils.mjs";

const PUBLIC_LEGAL_PATHS = ["/about", "/privacy", "/terms", "/contact", "/youth-policy"];
const SOURCE_FILES = [
  "src/app/about/page.tsx",
  "src/app/privacy/page.tsx",
  "src/app/terms/page.tsx",
  "src/app/terms/TermsContent.tsx",
  "src/app/contact/page.tsx",
  "src/app/youth-policy/page.tsx",
];
const PLACEHOLDERS = [
  { id: "placeholder-name", pattern: /홍길동/i },
  { id: "example-domain", pattern: /example\.(?:com|org|net|test)/i },
  { id: "todo", pattern: /\bTODO\b/i },
  { id: "missing-legal-status", pattern: /data-(?:youth-)?legal-status=["']missing["']/i },
  { id: "missing-legal-copy", pattern: /법적 정보가 설정되지 않았습니다/i },
];

function inspectText(text) {
  return PLACEHOLDERS.filter((item) => item.pattern.test(text)).map((item) => item.id);
}

function legalStatus(text, attribute = "data-legal-status") {
  const match = String(text || "").match(new RegExp(`${attribute}=["']([^"']+)["']`, "i"));
  return match?.[1]?.toLowerCase() || null;
}

const REQUIRED_LIVE_STATUSES = {
  "/about": ["data-company-legal-status"],
  "/privacy": ["data-privacy-legal-status"],
  "/terms": ["data-terms-legal-status", "data-privacy-legal-status", "data-youth-legal-status"],
  "/contact": ["data-contact-legal-status"],
  "/youth-policy": ["data-legal-status"],
};

function liveStatuses(route, html) {
  return Object.fromEntries((REQUIRED_LIVE_STATUSES[route] || []).map((attribute) => [attribute, legalStatus(html, attribute)]));
}

function companyCandidates(html) {
  const text = String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return [...new Set([...text.matchAll(/(?:\(주\)|주식회사)\s*[가-힣A-Za-z0-9]+(?:미디어)?/g)].map((match) => match[0].replace(/\s+/g, "").trim()))];
}

function sourceAudit() {
  return SOURCE_FILES.map((file) => {
    const exists = fs.existsSync(file);
    const text = exists ? fs.readFileSync(file, "utf8") : "";
    return { file, exists, findings: exists ? inspectText(text) : ["missing-source-file"] };
  });
}

async function liveAudit(baseUrl) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  if (!base) return [];
  const rows = [];
  for (const route of PUBLIC_LEGAL_PATHS) {
    try {
      const response = await fetch(`${base}${route}`, {
        headers: { "user-agent": "CulturePeopleLegalAudit/1.0" },
        signal: AbortSignal.timeout(10_000),
        redirect: "follow",
      });
      const html = (await response.text()).slice(0, 2_000_000);
      rows.push({
        route,
        status: response.status,
        finalUrl: response.url,
        findings: inspectText(html),
        legalStatuses: liveStatuses(route, html),
        companyCandidates: companyCandidates(html),
      });
    } catch (error) {
      rows.push({ route, status: 0, finalUrl: null, findings: ["request-failed"], error: error instanceof Error ? error.message : String(error) });
    }
  }
  return rows;
}

export async function buildLegalContentReport({ baseUrl = "" } = {}) {
  const source = sourceAudit();
  const live = await liveAudit(baseUrl);
  const errors = [];
  for (const row of source) {
    const blocking = row.findings.filter((item) => !["missing-legal-status", "missing-legal-copy"].includes(item));
    if (blocking.length) errors.push(`${row.file}: ${blocking.join(", ")}`);
  }
  for (const row of live) {
    if (row.status !== 200) errors.push(`${row.route}: expected 200, got ${row.status}`);
    if (row.findings.length) errors.push(`${row.route}: ${row.findings.join(", ")}`);
    for (const [attribute, status] of Object.entries(row.legalStatuses || {})) {
      if (status !== "approved") errors.push(`${row.route}: ${attribute} is ${status || "missing"}`);
    }
  }
  const youthPage = live.find((row) => row.route === "/youth-policy");
  const termsPage = live.find((row) => row.route === "/terms");
  const companies = [...new Set(live.flatMap((row) => row.companyCandidates || []))];
  if (companies.length > 1) errors.push(`Legal company name is inconsistent across public pages (${companies.length} variants).`);
  const representativeApprovalRecorded = Boolean(
    baseUrl &&
    youthPage?.status === 200 &&
    youthPage.legalStatuses?.["data-legal-status"] === "approved" &&
    termsPage?.status === 200 &&
    live.every((row) => Object.values(row.legalStatuses || {}).every((status) => status === "approved")),
  );
  return {
    ok: errors.length === 0,
    generatedAt: new Date().toISOString(),
    baseUrl: baseUrl || null,
    source,
    live,
    approval: {
      sourcePlaceholderFree: source.every((row) => !row.findings.some((item) => ["placeholder-name", "example-domain", "todo"].includes(item))),
      liveOfficialYouthPolicy: live.length > 0 ? live.find((row) => row.route === "/youth-policy")?.findings.length === 0 : null,
      representativeApprovalRecorded,
    },
    consistency: { companyCandidates: companies, consistentCompanyName: companies.length <= 1 },
    warnings: baseUrl ? [] : ["Live legal pages were not checked because --base was not provided."],
    errors,
  };
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const report = await buildLegalContentReport({ baseUrl: values.base || "" });
  const output = path.resolve(expandHomePath(values.report || path.join(".legal-audit-runs", `legal-content-${timestampForFile()}.json`)));
  if (!flags.has("no-write")) {
    report.reportPath = output;
    writeJsonAtomic(output, report);
  }
  if (flags.has("json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log("CulturePeople public legal content check");
    console.log(`- ok: ${report.ok}`);
    console.log(`- source placeholder free: ${report.approval.sourcePlaceholderFree}`);
    console.log(`- representative approval recorded: ${report.approval.representativeApprovalRecorded}`);
    if (report.reportPath) console.log(`- report: ${report.reportPath}`);
    for (const warning of report.warnings) console.log(`- warning: ${warning}`);
    for (const error of report.errors) console.log(`- error: ${error}`);
  }
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[legal:public-content-check] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
