#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_BACKUP_ROOT } from "./lib/backup-root.mjs";
const DEFAULT_R2_MANIFEST = "cloudflare/d1/import/media-manifest.json";
const DEFAULT_COPY_REPORT = "cloudflare/d1/import/r2-copy-report.json";
const DEFAULT_VERIFY_REPORT = "cloudflare/d1/import/r2-verify-report.json";

function parseArgs(argv) {
  const flags = new Set();
  const values = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      values[key] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      values[key] = next;
      i += 1;
    } else {
      flags.add(key);
    }
  }

  return { flags, values };
}

function printHelp() {
  console.log(`Usage: node scripts/r2-media-readiness-report.mjs [options]

Builds a read-only media migration readiness report from local backup manifests.
It does not upload to R2 and does not rewrite production URLs.

Options:
  --root <dir>       Backup root. Default: ${DEFAULT_BACKUP_ROOT}
  --manifest <file>  R2 media manifest. Default: ${DEFAULT_R2_MANIFEST}
  --report <file>    Output report path. Default: <root>/_reports/r2-media-readiness-<timestamp>.json
  --copy-report <f>  R2 copy evidence. Default: ${DEFAULT_COPY_REPORT}
  --verify-report <f> Public URL verification evidence. Default: ${DEFAULT_VERIFY_REPORT}
  --json             Print machine-readable JSON only.
`);
}

function expandHome(value) {
  const text = String(value || "");
  if (text === "~") return os.homedir();
  if (text.startsWith("~/")) return path.join(os.homedir(), text.slice(2));
  return text;
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function latestBackupDir(root) {
  if (!fs.existsSync(root)) return "";
  return fs.readdirSync(root)
    .filter((name) => /^\d{4}-\d{2}-\d{2}T/.test(name))
    .map((name) => path.join(root, name))
    .filter((item) => fs.existsSync(path.join(item, "backup-manifest.json")))
    .sort()
    .at(-1) || "";
}

function readJson(filePath, fallback, warnings, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    if (label) warnings.push(`${label} missing: ${filePath}`);
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    warnings.push(`${label || "JSON"} parse failed: ${error instanceof Error ? error.message : String(error)}`);
    return fallback;
  }
}

function indexFilePath(entry, root) {
  if (!entry || typeof entry !== "object") return "";
  if (entry.media_store_file) return path.resolve(root, entry.media_store_file);
  if (entry.storage === "media_store" && entry.file) return path.resolve(root, entry.file);
  if (entry.backup_dir && entry.file) return path.resolve(entry.backup_dir, entry.file);
  if (entry.file) return path.resolve(root, entry.file);
  return "";
}

function isSupabaseMediaUrl(value) {
  return /supabase|\/storage\/v1\/object\/public\//i.test(String(value || ""));
}

function articleContainsAnyUrl(article, urls) {
  const haystack = [
    article?.body,
    article?.thumbnail,
    article?.og_image,
    article?.ogImage,
  ].filter(Boolean).join("\n");
  for (const url of urls) {
    if (url && haystack.includes(url)) return true;
  }
  return false;
}

export function buildR2MediaReadinessReport({
  root = DEFAULT_BACKUP_ROOT,
  manifestPath = DEFAULT_R2_MANIFEST,
  copyReportPath = DEFAULT_COPY_REPORT,
  verifyReportPath = DEFAULT_VERIFY_REPORT,
  reportPath = "",
} = {}) {
  const backupRoot = path.resolve(expandHome(root));
  const warnings = [];
  const errors = [];
  const latest = latestBackupDir(backupRoot);
  if (!latest) errors.push(`No latest backup found under ${backupRoot}.`);

  const backupManifest = latest ? readJson(path.join(latest, "backup-manifest.json"), null, warnings, "backup manifest") : null;
  const candidates = latest ? readJson(path.join(latest, "merged", "media-candidates.json"), [], warnings, "media candidates") : [];
  const mediaManifest = latest ? readJson(path.join(latest, "media", "media-manifest.json"), {}, warnings, "media manifest") : {};
  const articles = latest ? readJson(path.join(latest, "merged", "articles.json"), [], warnings, "merged articles") : [];
  const mediaIndex = readJson(path.join(backupRoot, "media-url-index.json"), { entries: {} }, warnings, "media URL index");
  const r2ManifestFile = path.resolve(expandHome(manifestPath));
  const r2Manifest = fs.existsSync(r2ManifestFile)
    ? readJson(r2ManifestFile, [], warnings, "R2 media manifest")
    : [];
  const copyReportFile = path.resolve(expandHome(copyReportPath));
  const verifyReportFile = path.resolve(expandHome(verifyReportPath));
  const copyReport = readJson(copyReportFile, { results: [] }, warnings, "R2 copy report");
  const verifyReport = readJson(verifyReportFile, { results: [] }, warnings, "R2 verify report");

  const entries = mediaIndex?.entries && typeof mediaIndex.entries === "object" ? mediaIndex.entries : {};
  const r2Entries = Array.isArray(r2Manifest) ? r2Manifest : [];
  const copyRequired = r2Entries.filter((entry) => entry?.should_copy_to_r2);
  const sourceToR2 = new Map(copyRequired.map((entry) => [entry.source_url, entry]));
  const verifyEvidence = new Map((Array.isArray(verifyReport?.results) ? verifyReport.results : []).map((entry) => [entry.id || entry.object_key, entry]));
  const downloadable = Array.isArray(candidates) ? candidates.filter((candidate) => candidate?.download_allowed) : [];
  let directMaterialized = 0;
  let migratedEquivalent = 0;
  const missing = [];
  const supabaseCandidates = [];

  for (const candidate of downloadable) {
    if (isSupabaseMediaUrl(candidate.url)) supabaseCandidates.push(candidate.url);
    const entry = entries[candidate.url];
    const filePath = indexFilePath(entry, backupRoot);
    if (filePath && fs.existsSync(filePath)) {
      directMaterialized += 1;
      continue;
    }

    const r2Entry = sourceToR2.get(candidate.url);
    const publicEntry = r2Entry?.public_url ? entries[r2Entry.public_url] : null;
    const publicFilePath = indexFilePath(publicEntry, backupRoot);
    const verification = r2Entry
      ? verifyEvidence.get(r2Entry.id) || verifyEvidence.get(r2Entry.object_key)
      : null;
    if (
      publicFilePath
      && fs.existsSync(publicFilePath)
      && verification?.status === "ok"
      && /^image\//i.test(String(verification.content_type || ""))
    ) {
      migratedEquivalent += 1;
      continue;
    }

    missing.push(candidate.url);
  }

  const materialized = directMaterialized + migratedEquivalent;
  const readyForRewrite = copyRequired.filter((entry) => entry?.public_url);
  const copyEvidence = new Map((Array.isArray(copyReport?.results) ? copyReport.results : []).map((entry) => [entry.id || entry.object_key, entry]));
  const copiedWithHashAndType = copyRequired.filter((entry) => {
    const evidence = copyEvidence.get(entry.id) || copyEvidence.get(entry.object_key);
    return evidence?.status === "copied" && /^[a-f0-9]{64}$/i.test(String(evidence.source_sha256 || "")) && /^image\//i.test(String(evidence.content_type || ""));
  });
  const reconciledExisting = copyRequired.filter((entry) => {
    const publicEntry = entry?.public_url ? entries[entry.public_url] : null;
    const filePath = indexFilePath(publicEntry, backupRoot);
    const verification = verifyEvidence.get(entry.id) || verifyEvidence.get(entry.object_key);
    return filePath
      && fs.existsSync(filePath)
      && /^[a-f0-9]{64}$/i.test(String(publicEntry?.content_hash || ""))
      && /^image\//i.test(String(publicEntry?.content_type || ""))
      && verification?.status === "ok"
      && /^image\//i.test(String(verification.content_type || ""));
  });
  const copySatisfied = new Set([
    ...copiedWithHashAndType.map((entry) => entry.id || entry.object_key),
    ...reconciledExisting.map((entry) => entry.id || entry.object_key),
  ]);
  const publiclyVerified = copyRequired.filter((entry) => {
    const evidence = verifyEvidence.get(entry.id) || verifyEvidence.get(entry.object_key);
    return evidence?.status === "ok" && /^image\//i.test(String(evidence.content_type || ""));
  });
  const rollbackMapped = copyRequired.filter((entry) => Boolean(entry.source_url && entry.public_url && entry.object_key));
  const rewriteUrls = new Set(copyRequired.map((entry) => entry?.source_url).filter(Boolean));
  const rewriteCandidateArticles = Array.isArray(articles)
    ? articles.filter((article) => articleContainsAnyUrl(article, rewriteUrls)).length
    : 0;
  const supabaseReferencedArticles = Array.isArray(articles)
    ? articles.filter((article) => [
      article?.body,
      article?.thumbnail,
      article?.og_image,
      article?.ogImage,
    ].filter(Boolean).some(isSupabaseMediaUrl)).length
    : 0;

  const output = reportPath
    ? path.resolve(expandHome(reportPath))
    : path.join(backupRoot, "_reports", `r2-media-readiness-${timestampForFile()}.json`);
  const productionRewriteAllowed = missing.length === 0 && downloadable.length > 0 && materialized === downloadable.length && copyRequired.length > 0 && readyForRewrite.length === copyRequired.length && copySatisfied.size === copyRequired.length && publiclyVerified.length === copyRequired.length && rollbackMapped.length === copyRequired.length;

  const report = {
    ok: errors.length === 0,
    generatedAt: new Date().toISOString(),
    root: backupRoot,
    latestBackupDir: latest || null,
    latestBackupCompletedAt: backupManifest?.completed_at || backupManifest?.generated_at || null,
    r2ManifestPath: fs.existsSync(r2ManifestFile) ? r2ManifestFile : null,
    reportPath: output,
    media: {
      candidates: Array.isArray(candidates) ? candidates.length : 0,
      downloadable: downloadable.length,
      materialized,
      directMaterialized,
      migratedEquivalent,
      missing: missing.length,
      missingSample: missing.slice(0, 20),
      supabaseCandidateUrls: supabaseCandidates.length,
      latestManifestDownloaded: Number(mediaManifest?.downloaded || 0),
      latestManifestReused: Number(mediaManifest?.reused || 0),
      latestManifestFailed: Number(mediaManifest?.failed || 0),
      latestManifestDeferredRecentFailures: Number(mediaManifest?.deferred_recent_failures || 0),
    },
    r2: {
      totalManifestEntries: r2Entries.length,
      copyRequired: copyRequired.length,
      readyForRewrite: readyForRewrite.length,
      missingPublicUrl: copyRequired.length - readyForRewrite.length,
      copiedWithHashAndContentType: copiedWithHashAndType.length,
      reconciledExistingWithHashAndContentType: reconciledExisting.length,
      copySatisfiedWithHashAndContentType: copySatisfied.size,
      publiclyVerifiedWithImageContentType: publiclyVerified.length,
      copyEvidenceComplete: copySatisfied.size === copyRequired.length,
      publicVerificationComplete: publiclyVerified.length === copyRequired.length,
      topBuckets: [...copyRequired.reduce((map, entry) => {
        const key = entry?.bucket || "(missing)";
        map.set(key, (map.get(key) || 0) + 1);
        return map;
      }, new Map()).entries()].map(([name, count]) => ({ name, count })),
    },
    rewrite: {
      productionRewriteAllowed,
      blockedReasons: [
        missing.length > 0 ? `${missing.length} downloadable media URLs are not materialized locally.` : "",
        copyRequired.length === 0 ? "No R2 copy-required entries were found." : "",
        copyRequired.length > readyForRewrite.length ? `${copyRequired.length - readyForRewrite.length} R2 entries do not have public_url.` : "",
        copySatisfied.size < copyRequired.length ? `${copyRequired.length - copySatisfied.size} R2 entries lack successful copy or reconciled hash/content-type evidence.` : "",
        publiclyVerified.length < copyRequired.length ? `${copyRequired.length - publiclyVerified.length} R2 entries lack successful public image verification.` : "",
        rollbackMapped.length < copyRequired.length ? `${copyRequired.length - rollbackMapped.length} R2 entries lack complete rollback mapping.` : "",
      ].filter(Boolean),
      rewriteCandidateArticles,
      supabaseReferencedArticles,
      rollbackMappingCoverage: copyRequired.length ? Math.round((rollbackMapped.length / copyRequired.length) * 1000) / 10 : 0,
    },
    warnings,
    errors,
  };

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

function printHuman(report) {
  console.log("CulturePeople R2 media readiness");
  console.log(`- ok: ${report.ok}`);
  console.log(`- latest backup: ${report.latestBackupDir || "(none)"}`);
  console.log(`- media materialized: ${report.media.materialized}/${report.media.downloadable}, missing=${report.media.missing}`);
  console.log(`- R2 copy required/ready: ${report.r2.copyRequired}/${report.r2.readyForRewrite}`);
  console.log(`- rewrite candidate articles: ${report.rewrite.rewriteCandidateArticles}, Supabase referenced articles: ${report.rewrite.supabaseReferencedArticles}`);
  console.log(`- production URL rewrite allowed: ${report.rewrite.productionRewriteAllowed}`);
  console.log(`- report: ${report.reportPath}`);
  for (const reason of report.rewrite.blockedReasons) console.log(`- blocked: ${reason}`);
  for (const warning of report.warnings) console.log(`- warning: ${warning}`);
  for (const error of report.errors) console.log(`- error: ${error}`);
}

function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  if (flags.has("help") || flags.has("h")) {
    printHelp();
    return;
  }
  const report = buildR2MediaReadinessReport({
    root: values.root || DEFAULT_BACKUP_ROOT,
    manifestPath: values.manifest || values.input || DEFAULT_R2_MANIFEST,
    copyReportPath: values["copy-report"] || DEFAULT_COPY_REPORT,
    verifyReportPath: values["verify-report"] || DEFAULT_VERIFY_REPORT,
    reportPath: values.report || "",
  });
  if (flags.has("json")) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
