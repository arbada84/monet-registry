#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_BACKUP_ROOT, expandHomePath } from "./lib/backup-root.mjs";
import { buildCategoryAudit } from "./audit-culturepeople-categories.mjs";

const APPLY_CONFIRMATION = "APPLY_CATEGORY_NORMALIZATION";

function parseArgs(argv) {
  const flags = new Set();
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--" || !arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) values[key] = inlineValue;
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) values[key] = argv[++index];
    else flags.add(key);
  }
  return { flags, values };
}

function latestBackupDir(root) {
  if (!fs.existsSync(root)) return "";
  return fs.readdirSync(root)
    .filter((name) => /^\d{4}-\d{2}-\d{2}T/.test(name))
    .map((name) => path.join(root, name))
    .filter((dir) => fs.existsSync(path.join(dir, "backup-manifest.json")) && fs.existsSync(path.join(dir, "merged", "articles.json")))
    .sort()
    .at(-1) || "";
}

function clean(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

function inferTargetProvider(target) {
  const source = String(target.sourceDatabase || "").toLowerCase();
  if (source.includes("d1")) return "d1";
  if (source.includes("supabase")) return "supabase";
  return "";
}

function targetMatchesProvider(target, provider) {
  const inferred = inferTargetProvider(target);
  return provider ? inferred === provider : Boolean(inferred);
}

export function buildCategoryApplyPlan(report, provider = "") {
  const changes = [];
  for (const row of report.changes) {
    const targets = (row.targets || []).filter((target) => targetMatchesProvider(target, provider));
    for (const target of targets) {
      changes.push({
        provider: provider || inferTargetProvider(target),
        id: target.id,
        no: row.no,
        title: row.title,
        oldCategory: target.category || row.oldCategory,
        newCategory: row.newCategory,
        reason: row.reason,
      });
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    sourceBackup: report.backupDir,
    provider: provider || null,
    mode: "dry-run",
    changeCount: changes.length,
    changes,
  };
}

function writePlanFiles(plan, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = plan.generatedAt.replace(/[:.]/g, "-");
  const planPath = path.join(outDir, `category-normalize-plan-${stamp}.json`);
  const rollbackPath = path.join(outDir, `category-normalize-rollback-${stamp}.json`);
  fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  fs.writeFileSync(rollbackPath, `${JSON.stringify({
    generatedAt: plan.generatedAt,
    sourcePlan: planPath,
    provider: plan.provider,
    changes: plan.changes.map((row) => ({ ...row, oldCategory: row.newCategory, newCategory: row.oldCategory })),
  }, null, 2)}\n`, "utf8");
  return { planPath, rollbackPath };
}

async function applyD1(changes, batchSize) {
  const accountId = clean(process.env.CLOUDFLARE_ACCOUNT_ID);
  const databaseId = clean(process.env.CLOUDFLARE_D1_DATABASE_ID || process.env.D1_DATABASE_ID);
  const apiToken = clean(process.env.CLOUDFLARE_API_TOKEN);
  if (!accountId || !databaseId || !apiToken) throw new Error("D1 apply blocked: Cloudflare D1 environment is incomplete");
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;
  let applied = 0;
  for (let offset = 0; offset < changes.length; offset += batchSize) {
    const batch = changes.slice(offset, offset + batchSize);
    const conditions = batch.map(() => "WHEN id = ? AND category = ? THEN ?").join(" ");
    const ids = batch.map(() => "?").join(", ");
    const params = batch.flatMap((row) => [row.id, row.oldCategory, row.newCategory]).concat(batch.map((row) => row.id));
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql: `UPDATE articles SET category = CASE ${conditions} ELSE category END WHERE id IN (${ids})`, params }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.success === false) throw new Error(`D1 apply failed at offset ${offset}: HTTP ${response.status}`);
    applied += batch.length;
  }
  return applied;
}

async function applySupabase(changes, delayMs) {
  const baseUrl = clean(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
  const serviceKey = clean(process.env.SUPABASE_SERVICE_KEY);
  if (!baseUrl || !serviceKey) throw new Error("Supabase apply blocked: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY is missing");
  let applied = 0;
  for (const row of changes) {
    const url = `${baseUrl}/rest/v1/articles?id=eq.${encodeURIComponent(row.id)}&category=eq.${encodeURIComponent(row.oldCategory)}`;
    const response = await fetch(url, {
      method: "PATCH",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ category: row.newCategory, updated_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Supabase apply failed for id=${row.id}: HTTP ${response.status}`);
    applied += 1;
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return applied;
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const root = path.resolve(expandHomePath(values.root || DEFAULT_BACKUP_ROOT));
  const backupDir = values["backup-dir"] ? path.resolve(expandHomePath(values["backup-dir"])) : latestBackupDir(root);
  if (!backupDir) throw new Error(`No merged CulturePeople backup found under ${root}`);
  const articles = JSON.parse(fs.readFileSync(path.join(backupDir, "merged", "articles.json"), "utf8"));
  if (!Array.isArray(articles)) throw new Error("Merged articles backup is not an array");

  const provider = String(values.provider || "").toLowerCase();
  if (provider && !["d1", "supabase"].includes(provider)) throw new Error("--provider must be d1 or supabase");
  const report = buildCategoryAudit({ articles, backupDir });
  const plan = buildCategoryApplyPlan(report, provider);
  const outDir = path.resolve(expandHomePath(values["out-dir"] || ".category-audit-runs"));
  const paths = writePlanFiles(plan, outDir);

  if (!flags.has("apply")) {
    console.log("CulturePeople category normalization dry-run");
    console.log(`- backup: ${backupDir}`);
    console.log(`- all candidates: ${report.summary.changeCandidates}`);
    console.log(`- provider: ${provider || "not selected (report only)"}`);
    console.log(`- provider targets: ${plan.changeCount}`);
    console.log(`- plan: ${paths.planPath}`);
    console.log(`- rollback: ${paths.rollbackPath}`);
    return;
  }

  if (!provider) throw new Error("Apply blocked: --provider d1|supabase is required");
  if (values.confirm !== APPLY_CONFIRMATION) throw new Error(`Apply blocked: --confirm ${APPLY_CONFIRMATION} is required`);
  const maxUpdates = Number(values["max-updates"] || 0);
  if (!Number.isInteger(maxUpdates) || maxUpdates <= 0 || plan.changeCount > maxUpdates) {
    throw new Error(`Apply blocked: --max-updates must be at least the planned target count (${plan.changeCount})`);
  }
  if (plan.changeCount === 0) {
    console.log("No provider-specific category changes to apply.");
    return;
  }

  const applied = provider === "d1"
    ? await applyD1(plan.changes, Math.max(1, Math.min(40, Number(values["batch-size"] || 25))))
    : await applySupabase(plan.changes, Math.max(0, Number(values["delay-ms"] || 100)));
  plan.mode = "apply";
  plan.appliedAt = new Date().toISOString();
  plan.applied = applied;
  fs.writeFileSync(paths.planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  console.log(`Applied ${applied} ${provider} category updates. Rollback mapping: ${paths.rollbackPath}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main().catch((error) => {
  console.error(`[category:normalize] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
