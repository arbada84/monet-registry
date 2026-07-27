#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_BACKUP_ROOT, expandHomePath } from "./lib/backup-root.mjs";
import { CULTUREPEOPLE_CATEGORIES, classifyCulturePeopleCategory, isCulturePeopleCategory } from "./lib/culturepeople-category-policy.mjs";

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

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function articleTargets(article) {
  const backupMeta = article?.backup_meta && typeof article.backup_meta === "object" ? article.backup_meta : {};
  const targets = [{
    sourceDatabase: String(backupMeta.source_database || "unknown"),
    id: String(article?.id || ""),
    category: String(article?.category || ""),
  }];
  for (const duplicate of Array.isArray(backupMeta.duplicate_sources) ? backupMeta.duplicate_sources : []) {
    targets.push({
      sourceDatabase: String(duplicate?.source_database || "unknown"),
      id: String(duplicate?.id || ""),
      category: String(duplicate?.category || article?.category || ""),
    });
  }
  return targets.filter((target, index, all) => target.id && all.findIndex((item) => item.sourceDatabase === target.sourceDatabase && item.id === target.id) === index);
}

export function buildCategoryAudit({ articles, backupDir = "" }) {
  const distribution = {};
  const changes = [];
  for (const article of articles) {
    const oldCategory = String(article?.category || "").normalize("NFC").trim() || "(empty)";
    distribution[oldCategory] = (distribution[oldCategory] || 0) + 1;
    if (isCulturePeopleCategory(oldCategory)) continue;
    const context = `${article?.title || ""} ${article?.summary || ""} ${String(article?.body || "").replace(/<[^>]*>/g, " ").slice(0, 1200)} ${article?.tags || ""}`;
    const classified = classifyCulturePeopleCategory(oldCategory === "(empty)" ? "" : oldCategory, context, "문화");
    changes.push({
      id: String(article?.id || ""),
      no: Number(article?.no || 0) || null,
      title: String(article?.title || ""),
      status: String(article?.status || ""),
      oldCategory: oldCategory === "(empty)" ? "" : oldCategory,
      newCategory: classified.category,
      reason: classified.reason,
      targets: articleTargets(article),
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    backupDir,
    standardCategories: CULTUREPEOPLE_CATEGORIES,
    summary: {
      totalArticles: articles.length,
      standardArticles: articles.length - changes.length,
      changeCandidates: changes.length,
      publishedChangeCandidates: changes.filter((row) => row.status === "게시").length,
    },
    distribution: Object.fromEntries(Object.entries(distribution).sort((a, b) => b[1] - a[1])),
    changes,
  };
}

export function writeCategoryAuditReports(report, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(outDir, `category-audit-${stamp}.json`);
  const csvPath = path.join(outDir, `category-audit-${stamp}.csv`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const rows = [["id", "no", "status", "old_category", "new_category", "reason", "title"], ...report.changes.map((row) => [row.id, row.no || "", row.status, row.oldCategory, row.newCategory, row.reason, row.title])];
  fs.writeFileSync(csvPath, `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`, "utf8");
  return { jsonPath, csvPath };
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const root = path.resolve(expandHomePath(values.root || DEFAULT_BACKUP_ROOT));
  const backupDir = values["backup-dir"] ? path.resolve(expandHomePath(values["backup-dir"])) : latestBackupDir(root);
  if (!backupDir) throw new Error(`No merged CulturePeople backup found under ${root}`);
  const articlesPath = path.join(backupDir, "merged", "articles.json");
  const articles = JSON.parse(fs.readFileSync(articlesPath, "utf8"));
  if (!Array.isArray(articles)) throw new Error(`Expected an array: ${articlesPath}`);
  const report = buildCategoryAudit({ articles, backupDir });
  const outDir = path.resolve(expandHomePath(values["out-dir"] || ".category-audit-runs"));
  const paths = writeCategoryAuditReports(report, outDir);
  if (flags.has("json")) console.log(JSON.stringify({ ...report, reportFiles: paths }, null, 2));
  else {
    console.log("CulturePeople category audit");
    console.log(`- backup: ${backupDir}`);
    console.log(`- articles: ${report.summary.totalArticles}`);
    console.log(`- change candidates: ${report.summary.changeCandidates}`);
    console.log(`- published candidates: ${report.summary.publishedChangeCandidates}`);
    console.log(`- JSON: ${paths.jsonPath}`);
    console.log(`- CSV: ${paths.csvPath}`);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main().catch((error) => {
  console.error(`[category:audit] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
