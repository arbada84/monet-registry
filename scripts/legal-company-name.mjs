#!/usr/bin/env node
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  countLegacyCompanyNames,
  normalizeLegalSetting,
  replaceLegacyCompanyNames,
  sha256,
} from "./lib/legal-company-name.mjs";

const SOURCE_FILES = [
  "src/app/terms/page.tsx",
  "src/app/privacy/page.tsx",
  "src/app/about/page.tsx",
  "src/app/contact/page.tsx",
  "src/app/advertising/page.tsx",
  "src/app/youth-policy/page.tsx",
  "src/app/cam/terms/page.tsx",
  "src/lib/constants.ts",
  "src/lib/alidot-legal.ts",
];

function parseArgs(argv) {
  const options = { action: "audit", base: "https://culturepeople.co.kr", expected: "컬피", apply: false, json: false };
  const args = [...argv];
  if (args[0] === "audit" || args[0] === "normalize") options.action = args.shift();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--") continue;
    if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else if (arg === "--json") options.json = true;
    else if (arg === "--base") options.base = args[++i];
    else if (arg === "--expected") options.expected = args[++i];
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.expected?.trim()) throw new Error("--expected must not be empty");
  options.base = options.base.replace(/\/$/, "");
  return options;
}

async function auditSources(root) {
  const findings = [];
  for (const relativePath of SOURCE_FILES) {
    const source = await readFile(path.join(root, relativePath), "utf8");
    const hits = countLegacyCompanyNames(source);
    if (hits > 0) findings.push({ path: relativePath, hits });
  }
  return findings;
}

async function readLiveSetting(base, key) {
  const url = new URL("/api/db/settings", base);
  url.searchParams.set("key", key);
  url.searchParams.set("fallback", "null");
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success !== true) throw new Error(`${key} read failed: HTTP ${response.status}`);
  return body.value ?? null;
}

async function saveLiveSetting(base, key, value) {
  const secret = process.env.CULTUREPEOPLE_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!secret) throw new Error("Missing CULTUREPEOPLE_CRON_SECRET or CRON_SECRET; no setting was changed.");
  const response = await fetch(new URL("/api/db/settings", base), {
    method: "PUT",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ key, value }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`${key} update failed: HTTP ${response.status}`);
}

async function writeRollback(root, payload) {
  const directory = path.join(root, ".legal-migration-runs");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const filePath = path.join(directory, `company-name-${payload.mode}-${stamp}.json`);
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  await chmod(filePath, 0o600);
  return path.relative(root, filePath);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const sourceFindings = await auditSources(root);
  const [originalTerms, originalAbout] = await Promise.all([
    readLiveSetting(options.base, "cp-terms"),
    readLiveSetting(options.base, "cp-about"),
  ]);
  const normalizedTerms = normalizeLegalSetting(originalTerms, options.expected);
  const aboutReplacements = countLegacyCompanyNames(originalAbout?.companyName);
  const normalizedAbout = originalAbout && typeof originalAbout === "object"
    ? { ...originalAbout, companyName: replaceLegacyCompanyNames(originalAbout.companyName, options.expected) }
    : originalAbout;
  const beforeChecksum = sha256({ cpTerms: originalTerms, cpAbout: originalAbout });
  const afterChecksum = sha256({ cpTerms: normalizedTerms.value, cpAbout: normalizedAbout });
  const summary = {
    action: options.action,
    mode: options.apply ? "apply" : "dry-run",
    expected: options.expected,
    sourceLegacyHits: sourceFindings.reduce((sum, item) => sum + item.hits, 0),
    sourceFindings,
    termsSettingPresent: originalTerms !== null,
    aboutSettingPresent: originalAbout !== null,
    changedFields: [
      ...normalizedTerms.changedFields.map((field) => `cp-terms.${field}`),
      ...(aboutReplacements > 0 ? ["cp-about.companyName"] : []),
    ],
    settingReplacements: normalizedTerms.replacements + aboutReplacements,
    beforeChecksum,
    afterChecksum,
    applied: false,
  };

  if (options.action === "normalize") {
    summary.rollbackFile = await writeRollback(root, {
      createdAt: new Date().toISOString(),
      base: options.base,
      mode: summary.mode,
      beforeChecksum,
      afterChecksum,
      original: { cpTerms: originalTerms, cpAbout: originalAbout },
      normalized: { cpTerms: normalizedTerms.value, cpAbout: normalizedAbout },
      changedFields: summary.changedFields,
    });
    if (options.apply && summary.settingReplacements > 0) {
      if (normalizedTerms.replacements > 0) await saveLiveSetting(options.base, "cp-terms", normalizedTerms.value);
      if (aboutReplacements > 0) await saveLiveSetting(options.base, "cp-about", normalizedAbout);
      const [verifiedTerms, verifiedAbout] = await Promise.all([
        readLiveSetting(options.base, "cp-terms"),
        readLiveSetting(options.base, "cp-about"),
      ]);
      if (sha256({ cpTerms: verifiedTerms, cpAbout: verifiedAbout }) !== afterChecksum) {
        throw new Error("legal settings checksum verification failed after update");
      }
      summary.applied = true;
    }
  }

  const ok = summary.sourceLegacyHits === 0 && (options.action !== "audit" || summary.settingReplacements === 0);
  if (options.json) console.log(JSON.stringify({ ok, ...summary }, null, 2));
  else {
    console.log(`[legal-company-name] ${ok ? "ok" : "issues"}`);
    console.log(`- source legacy names: ${summary.sourceLegacyHits}`);
    console.log(`- cp-terms/cp-about present: ${summary.termsSettingPresent}/${summary.aboutSettingPresent}`);
    console.log(`- setting replacements: ${summary.settingReplacements}`);
    console.log(`- mode/applied: ${summary.mode}/${summary.applied}`);
    if (summary.rollbackFile) console.log(`- rollback: ${summary.rollbackFile}`);
  }
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[legal-company-name] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
