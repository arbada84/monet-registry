#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_BACKUP_ROOT } from "./lib/backup-root.mjs";
import { expandHomePath, latestBackupDir, parseArgs, readJson, timestampForFile, writeJsonAtomic } from "./lib/culturepeople-ops-utils.mjs";

function parseTags(value) {
  if (Array.isArray(value)) return value.map(String);
  const text = String(value || "").trim();
  if (!text) return [];
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch { /* Fall through to delimiter parsing. */ }
  }
  return text.split(/[,#|]/g);
}

function normalizeTag(value) {
  return String(value || "").replace(/^#+/, "").replace(/\s+/g, " ").trim();
}

export function buildTagAudit({ articles = [], thresholds = [2, 3, 5], backupDir = "" } = {}) {
  const counts = new Map();
  let publishedArticles = 0;
  for (const article of Array.isArray(articles) ? articles : []) {
    if (String(article?.status || "") !== "게시") continue;
    publishedArticles += 1;
    for (const tag of new Set(parseTags(article.tags).map(normalizeTag).filter(Boolean))) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  const tags = [...counts.entries()].map(([tag, articleCount]) => ({ tag, articleCount })).sort((a, b) => b.articleCount - a.articleCount || a.tag.localeCompare(b.tag, "ko"));
  const comparisons = [...new Set(thresholds.map(Number).filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => a - b).map((threshold) => ({
    threshold,
    indexableTags: tags.filter((item) => item.articleCount >= threshold).length,
    thinTags: tags.filter((item) => item.articleCount < threshold).length,
    sitemapUrlsRemoved: tags.filter((item) => item.articleCount < threshold).length,
  }));
  return {
    ok: Boolean(backupDir && publishedArticles > 0),
    mode: "dry-run",
    generatedAt: new Date().toISOString(),
    backupDir: backupDir || null,
    publishedArticles,
    uniqueTags: tags.length,
    comparisons,
    distribution: {
      oneArticle: tags.filter((item) => item.articleCount === 1).length,
      twoArticles: tags.filter((item) => item.articleCount === 2).length,
      threeToFourArticles: tags.filter((item) => item.articleCount >= 3 && item.articleCount < 5).length,
      fiveOrMore: tags.filter((item) => item.articleCount >= 5).length,
    },
    sampleThinTags: tags.filter((item) => item.articleCount < 5).slice(0, 100),
    policyApplied: false,
    databaseWrites: false,
    warnings: ["This report does not delete tags or change robots metadata. Review Search Console and traffic before choosing a threshold."],
  };
}

function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const root = path.resolve(expandHomePath(values.root || DEFAULT_BACKUP_ROOT));
  const backupDir = values["backup-dir"] ? path.resolve(expandHomePath(values["backup-dir"])) : latestBackupDir(root);
  const articles = backupDir ? readJson(path.join(backupDir, "merged", "articles.json"), []) : [];
  const thresholds = String(values.thresholds || "2,3,5").split(",").map(Number);
  const report = buildTagAudit({ articles, thresholds, backupDir });
  if (!flags.has("no-write")) {
    const output = path.resolve(values.report || path.join(".seo-audit-runs", `tag-audit-${timestampForFile()}.json`));
    report.reportPath = output;
    writeJsonAtomic(output, report);
  }
  if (flags.has("json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log("CulturePeople tag SEO audit");
    console.log(`- published articles: ${report.publishedArticles}`);
    console.log(`- unique / one-article tags: ${report.uniqueTags}/${report.distribution.oneArticle}`);
    for (const row of report.comparisons) console.log(`- threshold ${row.threshold}: keep=${row.indexableTags}, remove-from-sitemap=${row.sitemapUrlsRemoved}`);
    console.log("- database writes: false");
    if (report.reportPath) console.log(`- report: ${report.reportPath}`);
  }
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
