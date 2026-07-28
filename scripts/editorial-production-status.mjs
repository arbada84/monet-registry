#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "./lib/editorial-common.mjs";

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const result = {};
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value) result[match[1]] = value;
  }
  return result;
}

const { flags } = parseArgs();
const env = {
  ...readEnvFile(path.resolve(".env.local")),
  ...readEnvFile(path.resolve(".env.vercel.local")),
  ...process.env,
};
const accountId = env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = env.CLOUDFLARE_API_TOKEN;
const databaseId = env.CLOUDFLARE_D1_DATABASE_ID || env.D1_DATABASE_ID;
if (!accountId || !apiToken || !databaseId) {
  console.error(JSON.stringify({
    ok: false,
    error: "Cloudflare D1 credentials are missing.",
    credentials: {
      accountId: Boolean(accountId),
      apiToken: Boolean(apiToken),
      databaseId: Boolean(databaseId),
    },
  }, null, 2));
  process.exit(2);
}

const sql = `
SELECT
  (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name LIKE 'editorial_%') AS table_count,
  (SELECT COUNT(*) FROM editorial_candidates) AS candidate_count,
  (SELECT COUNT(*) FROM editorial_reviews WHERE is_fixture = 0) AS human_review_count,
  (SELECT COUNT(*) FROM editorial_sources
    WHERE fixture = 1 AND (evidence_eligible = 1 OR training_eligible = 1)) AS fixture_violations,
  generation, feature_enabled, shadow_enabled, draft_enabled,
  auto_publish_enabled, kill_switch_verified_at, updated_at
FROM editorial_runtime_state WHERE singleton = 1`;

const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql }),
    signal: AbortSignal.timeout(15_000),
  },
);
const payload = await response.json().catch(() => ({}));
const row = payload?.result?.[0]?.results?.[0];
const report = {
  ok: response.ok && payload.success !== false && Boolean(row),
  generatedAt: new Date().toISOString(),
  database: env.CLOUDFLARE_D1_PROD_DB || env.D1_DATABASE_NAME || "configured-d1",
  schema: {
    tableCount: Number(row?.table_count || 0),
  },
  runtime: {
    generation: Number(row?.generation || 0),
    featureEnabled: Number(row?.feature_enabled || 0) === 1,
    shadowEnabled: Number(row?.shadow_enabled || 0) === 1,
    draftEnabled: Number(row?.draft_enabled || 0) === 1,
    autoPublishEnabled: Number(row?.auto_publish_enabled || 0) === 1,
    killSwitchVerifiedAt: row?.kill_switch_verified_at || null,
    updatedAt: row?.updated_at || null,
  },
  counts: {
    candidates: Number(row?.candidate_count || 0),
    humanReviews: Number(row?.human_review_count || 0),
    fixtureEligibilityViolations: Number(row?.fixture_violations || 0),
  },
  error: response.ok && payload.success !== false
    ? null
    : (payload?.errors || []).map((item) => item?.message || String(item)).join("; ") || `HTTP ${response.status}`,
};
const safe = report.ok
  && report.schema.tableCount === 13
  && report.runtime.autoPublishEnabled === false
  && report.counts.fixtureEligibilityViolations === 0;
console.log(JSON.stringify({ ...report, safe }, null, 2));
if (!report.ok || (flags.has("require-safe") && !safe)) process.exit(1);
