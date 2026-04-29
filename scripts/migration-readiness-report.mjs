#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_INPUT_DIR = "exports/supabase";
const DEFAULT_SQL = "cloudflare/d1/import/generated-import.sql";
const DEFAULT_MEDIA_MANIFEST = "cloudflare/d1/import/media-manifest.json";
const DEFAULT_REHEARSAL_SUMMARY = "cloudflare/d1/import/rehearsal-summary.json";

function parseArgs(argv) {
  const flags = new Set();
  const values = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
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

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!value) continue;
    values[key] = value;
  }
  return values;
}

function env() {
  return {
    ...loadEnvFile(".env.local"),
    ...loadEnvFile(".env.production.local"),
    ...loadEnvFile(".env.vercel.local"),
    ...process.env,
  };
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function runJsonStep(scriptPath, args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdoutJson = null;
  if (result.stdout && result.stdout.trim()) {
    try {
      stdoutJson = JSON.parse(result.stdout);
    } catch {
      stdoutJson = null;
    }
  }

  return {
    ok: result.status === 0,
    exitCode: result.status ?? 1,
    stdoutJson,
    stdoutText: stdoutJson ? null : (result.stdout || "").trim() || null,
    stderrText: (result.stderr || "").trim() || null,
  };
}

function getDatabaseStatus(currentEnv) {
  const provider = (currentEnv.DATABASE_PROVIDER || currentEnv.DB_PROVIDER || "supabase").toLowerCase() === "d1"
    ? "d1"
    : "supabase";
  const supabase = {
    url: Boolean(currentEnv.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: Boolean(currentEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    serviceKey: Boolean(currentEnv.SUPABASE_SERVICE_KEY),
  };
  const d1 = {
    binding: currentEnv.D1_DATABASE_BINDING || "DB",
    databaseId: Boolean(currentEnv.CLOUDFLARE_D1_DATABASE_ID || currentEnv.D1_DATABASE_ID),
    databaseName: Boolean(currentEnv.CLOUDFLARE_D1_PROD_DB || currentEnv.D1_DATABASE_NAME),
    adapterReady: currentEnv.D1_RUNTIME_ADAPTER_READY === "true",
  };
  return {
    provider,
    configured: provider === "d1"
      ? (d1.databaseId || d1.databaseName) && Boolean(d1.binding)
      : supabase.url && (supabase.anonKey || supabase.serviceKey),
    runtimeReady: provider === "d1"
      ? ((d1.databaseId || d1.databaseName) && Boolean(d1.binding) && d1.adapterReady)
      : supabase.url && (supabase.anonKey || supabase.serviceKey),
    supabase,
    d1,
  };
}

function getMediaStatus(currentEnv) {
  const provider = (currentEnv.MEDIA_STORAGE_PROVIDER || currentEnv.STORAGE_PROVIDER || "supabase").toLowerCase() === "r2"
    ? "r2"
    : "supabase";
  const publicBaseUrl = (currentEnv.R2_PUBLIC_BASE_URL || currentEnv.CLOUDFLARE_R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  const supabase = {
    url: Boolean(currentEnv.NEXT_PUBLIC_SUPABASE_URL),
    serviceKey: Boolean(currentEnv.SUPABASE_SERVICE_KEY),
  };
  const r2 = {
    accountId: Boolean(currentEnv.R2_ACCOUNT_ID || currentEnv.CLOUDFLARE_ACCOUNT_ID),
    accessKeyId: Boolean(currentEnv.R2_ACCESS_KEY_ID || currentEnv.CLOUDFLARE_R2_ACCESS_KEY_ID),
    secretAccessKey: Boolean(currentEnv.R2_SECRET_ACCESS_KEY || currentEnv.CLOUDFLARE_R2_SECRET_ACCESS_KEY),
    bucket: Boolean(currentEnv.R2_BUCKET || currentEnv.CLOUDFLARE_R2_PROD_BUCKET),
    publicBaseUrl: Boolean(publicBaseUrl),
  };
  return {
    provider,
    configured: provider === "r2" ? Object.values(r2).every(Boolean) : Object.values(supabase).every(Boolean),
    publicBaseUrl: publicBaseUrl || null,
    supabase,
    r2,
  };
}

function fileInfo(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, bytes: 0 };
  }
  const stat = fs.statSync(filePath);
  return { exists: true, bytes: stat.size };
}

function classifyReadiness(report) {
  const blockers = [];
  const warnings = [];

  if (!report.providers.database.configured) blockers.push("Database provider env is incomplete.");
  if (!report.providers.media.configured) warnings.push("Active media provider env is incomplete.");
  if (!report.cloudflared1.schema.exists) blockers.push("D1 schema file is missing.");
  if (!report.cloudflared1.exportDir.exists) blockers.push("Supabase export directory is missing.");
  if (report.external.supabase.probed && !report.external.supabase.ok) {
    blockers.push("Supabase export access is not currently available.");
  }
  if (report.external.cloudflare.probed && !report.external.cloudflare.ok) {
    blockers.push("Cloudflare token/bootstrap access is not currently available.");
  }

  if (report.artifacts.rehearsalSummary.exists && !report.artifacts.rehearsalSummary.ok) {
    blockers.push("Latest migration rehearsal summary is failing.");
  }

  if (report.artifacts.sql.exists && !report.artifacts.mediaManifest.exists) {
    warnings.push("SQL exists but media manifest is missing.");
  }

  if (!report.artifacts.rehearsalSummary.exists) {
    warnings.push("No rehearsal summary found yet.");
  }

  return {
    readyNow: blockers.length === 0,
    blockers,
    warnings,
  };
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const currentEnv = env();
  const inputDir = path.resolve(values.input || DEFAULT_INPUT_DIR);
  const sqlPath = path.resolve(values.out || DEFAULT_SQL);
  const mediaManifestPath = path.resolve(values.media || DEFAULT_MEDIA_MANIFEST);
  const rehearsalSummaryPath = path.resolve(values.summary || DEFAULT_REHEARSAL_SUMMARY);

  const report = {
    generatedAt: new Date().toISOString(),
    paths: {
      inputDir,
      sqlPath,
      mediaManifestPath,
      rehearsalSummaryPath,
    },
    providers: {
      database: getDatabaseStatus(currentEnv),
      media: getMediaStatus(currentEnv),
    },
    cloudflared1: {
      schema: fileInfo(path.resolve("cloudflare/d1/migrations/0001_initial_schema.sql")),
      exportDir: { exists: fs.existsSync(inputDir) },
    },
    artifacts: {
      sql: fileInfo(sqlPath),
      mediaManifest: {
        ...fileInfo(mediaManifestPath),
        totalEntries: Array.isArray(readJsonIfExists(mediaManifestPath)) ? readJsonIfExists(mediaManifestPath).length : null,
      },
      rehearsalSummary: {
        ...fileInfo(rehearsalSummaryPath),
        ok: null,
      },
    },
    external: {
      supabase: {
        probed: false,
        ok: false,
        detail: null,
      },
      cloudflare: {
        probed: false,
        ok: false,
        detail: null,
      },
    },
    readiness: {
      readyNow: false,
      blockers: [],
      warnings: [],
    },
  };

  const rehearsalSummary = readJsonIfExists(rehearsalSummaryPath);
  if (rehearsalSummary && typeof rehearsalSummary === "object") {
    report.artifacts.rehearsalSummary.ok = rehearsalSummary.ok === true;
    report.artifacts.rehearsalSummary.lastStep = Array.isArray(rehearsalSummary.steps) && rehearsalSummary.steps.length
      ? rehearsalSummary.steps[rehearsalSummary.steps.length - 1].label
      : null;
  }

  if (!flags.has("skip-supabase-check")) {
    report.external.supabase.probed = true;
    const supabaseStep = runJsonStep(path.resolve("scripts/export-supabase-for-d1.mjs"), ["--dry-run", "--max-rows", "1"]);
    report.external.supabase.ok = supabaseStep.ok;
    report.external.supabase.detail = supabaseStep.stdoutJson || supabaseStep.stderrText || supabaseStep.stdoutText;
  }

  if (!flags.has("skip-cloudflare-check")) {
    report.external.cloudflare.probed = true;
    const cloudflareStep = runJsonStep(path.resolve("scripts/cloudflare-bootstrap.mjs"), []);
    report.external.cloudflare.ok = cloudflareStep.ok;
    report.external.cloudflare.detail = cloudflareStep.stdoutJson || cloudflareStep.stderrText || cloudflareStep.stdoutText;
  }

  report.readiness = classifyReadiness(report);

  if (flags.has("markdown")) {
    const lines = [
      `# Migration Readiness`,
      ``,
      `- Generated: ${report.generatedAt}`,
      `- Ready now: ${report.readiness.readyNow ? "yes" : "no"}`,
      `- Supabase access: ${report.external.supabase.probed ? (report.external.supabase.ok ? "ok" : "blocked") : "skipped"}`,
      `- Cloudflare access: ${report.external.cloudflare.probed ? (report.external.cloudflare.ok ? "ok" : "blocked") : "skipped"}`,
      `- Export dir: ${report.cloudflared1.exportDir.exists ? "present" : "missing"}`,
      `- Rehearsal summary: ${report.artifacts.rehearsalSummary.exists ? (report.artifacts.rehearsalSummary.ok ? "passing" : "failing") : "missing"}`,
      ``,
      `## Blockers`,
      ...(report.readiness.blockers.length ? report.readiness.blockers.map((item) => `- ${item}`) : ["- none"]),
      ``,
      `## Warnings`,
      ...(report.readiness.warnings.length ? report.readiness.warnings.map((item) => `- ${item}`) : ["- none"]),
    ];
    console.log(lines.join("\n"));
    process.exit(report.readiness.readyNow ? 0 : 1);
    return;
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.readiness.readyNow ? 0 : 1);
}

await main();
