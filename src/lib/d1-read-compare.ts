import "server-only";

import {
  d1GetArticleSitemapData,
  d1GetDeletedArticles,
  d1GetFeedArticles,
  d1GetMaintenanceArticles,
  d1GetRecentArticles,
  d1GetRecentTitles,
  d1GetScheduledArticles,
  d1GetSetting,
  d1GetTopArticles,
  d1SearchArticles,
} from "@/lib/d1-server-db";
import {
  sbGetArticleSitemapData,
  sbGetDeletedArticles,
  sbGetFeedArticles,
  sbGetMaintenanceArticles,
  sbGetRecentArticles,
  sbGetRecentTitles,
  sbGetScheduledArticles,
  sbGetSetting,
  sbGetTopArticles,
  sbSearchArticles,
} from "@/lib/supabase-server-db";
import type { Article } from "@/types/article";

export interface D1ReadCompareOptions {
  limit?: number;
  searchQuery?: string;
  settingKeys?: string[];
  checks?: string[];
  recentTitleDays?: number;
}

interface ArticleFingerprint {
  id: string;
  no?: number;
  title: string;
  date: string;
  status: string;
  slug?: string;
}

interface ArticleFieldMismatch {
  id: string;
  field: keyof ArticleFingerprint;
  supabase: unknown;
  d1: unknown;
}

interface ArticleCompareResult {
  ok: boolean;
  compared: number;
  supabaseCount: number;
  d1Count: number;
  missingInD1: ArticleFingerprint[];
  missingInSupabase: ArticleFingerprint[];
  fieldMismatches: ArticleFieldMismatch[];
}

interface SettingCompareResult {
  ok: boolean;
  key: string;
  supabaseFound: boolean;
  d1Found: boolean;
  mismatch: boolean;
}

interface DataFingerprint {
  id: string;
  [key: string]: unknown;
}

interface DataFieldMismatch {
  id: string;
  field: string;
  supabase: unknown;
  d1: unknown;
}

interface DataCompareResult {
  ok: boolean;
  compared: number;
  supabaseCount: number;
  d1Count: number;
  missingInD1: DataFingerprint[];
  missingInSupabase: DataFingerprint[];
  fieldMismatches: DataFieldMismatch[];
}

export interface D1ReadCompareReport {
  ok: boolean;
  generatedAt: string;
  limit: number;
  searchQuery: string | null;
  recent: ArticleCompareResult | null;
  search: ArticleCompareResult | null;
  articleChecks: Record<string, ArticleCompareResult | null>;
  dataChecks: Record<string, DataCompareResult | null>;
  settings: SettingCompareResult[];
  errors: string[];
}

const DEFAULT_LIMIT = 20;
const DEFAULT_SETTING_KEYS = [
  "cp-auto-press-settings",
  "cp-auto-news-settings",
  "cp-image-settings",
  "cp-watermark-settings",
];
const DEFAULT_CHECKS = [
  "recent",
  "feed",
  "top",
  "scheduled",
  "deleted",
  "maintenance",
  "sitemap",
  "recentTitles",
];

function safeLimit(value?: number): number {
  const number = Number(value || DEFAULT_LIMIT);
  if (!Number.isFinite(number)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.trunc(number), 100));
}

function fingerprint(article: Article): ArticleFingerprint {
  return {
    id: article.id,
    no: article.no,
    title: article.title || "",
    date: article.date || "",
    status: article.status || "",
    slug: article.slug,
  };
}

function fingerprintMap(articles: Article[]): Map<string, ArticleFingerprint> {
  return new Map(articles.map((article) => [article.id, fingerprint(article)]));
}

function compareArticles(supabaseArticles: Article[], d1Articles: Article[]): ArticleCompareResult {
  const supabase = fingerprintMap(supabaseArticles);
  const d1 = fingerprintMap(d1Articles);
  const missingInD1: ArticleFingerprint[] = [];
  const missingInSupabase: ArticleFingerprint[] = [];
  const fieldMismatches: ArticleFieldMismatch[] = [];

  for (const item of supabase.values()) {
    const other = d1.get(item.id);
    if (!other) {
      missingInD1.push(item);
      continue;
    }
    for (const field of ["no", "title", "date", "status", "slug"] as Array<keyof ArticleFingerprint>) {
      if ((item[field] || null) !== (other[field] || null)) {
        fieldMismatches.push({
          id: item.id,
          field,
          supabase: item[field] ?? null,
          d1: other[field] ?? null,
        });
      }
    }
  }

  for (const item of d1.values()) {
    if (!supabase.has(item.id)) {
      missingInSupabase.push(item);
    }
  }

  return {
    ok: missingInD1.length === 0 && missingInSupabase.length === 0 && fieldMismatches.length === 0,
    compared: Math.min(supabaseArticles.length, d1Articles.length),
    supabaseCount: supabaseArticles.length,
    d1Count: d1Articles.length,
    missingInD1,
    missingInSupabase,
    fieldMismatches,
  };
}

function dataMap(items: DataFingerprint[]): Map<string, DataFingerprint> {
  return new Map(items.map((item) => [item.id, item]));
}

function compareData(supabaseItems: DataFingerprint[], d1Items: DataFingerprint[]): DataCompareResult {
  const supabase = dataMap(supabaseItems);
  const d1 = dataMap(d1Items);
  const missingInD1: DataFingerprint[] = [];
  const missingInSupabase: DataFingerprint[] = [];
  const fieldMismatches: DataFieldMismatch[] = [];

  for (const item of supabase.values()) {
    const other = d1.get(item.id);
    if (!other) {
      missingInD1.push(item);
      continue;
    }
    for (const field of Object.keys(item).filter((key) => key !== "id")) {
      if ((item[field] ?? null) !== (other[field] ?? null)) {
        fieldMismatches.push({
          id: item.id,
          field,
          supabase: item[field] ?? null,
          d1: other[field] ?? null,
        });
      }
    }
  }

  for (const item of d1.values()) {
    if (!supabase.has(item.id)) {
      missingInSupabase.push(item);
    }
  }

  return {
    ok: missingInD1.length === 0 && missingInSupabase.length === 0 && fieldMismatches.length === 0,
    compared: Math.min(supabaseItems.length, d1Items.length),
    supabaseCount: supabaseItems.length,
    d1Count: d1Items.length,
    missingInD1,
    missingInSupabase,
    fieldMismatches,
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function normalizeChecks(checks?: string[]): Set<string> {
  const values = checks?.length ? checks : DEFAULT_CHECKS;
  return new Set(values.map((check) => {
    const normalized = check.trim().toLowerCase().replace(/[-_]/g, "");
    if (normalized === "recenttitles") return "recentTitles";
    return normalized;
  }).filter(Boolean));
}

function sliceLimit<T>(items: T[], limit: number): T[] {
  return items.slice(0, limit);
}

async function compareRecent(limit: number): Promise<ArticleCompareResult> {
  const [supabase, d1] = await Promise.all([
    sbGetRecentArticles(limit),
    d1GetRecentArticles(limit),
  ]);
  return compareArticles(supabase, d1);
}

async function compareSearch(query: string, limit: number): Promise<ArticleCompareResult> {
  const [supabase, d1] = await Promise.all([
    sbSearchArticles(query),
    d1SearchArticles(query, limit),
  ]);
  return compareArticles(supabase.slice(0, limit), d1.slice(0, limit));
}

async function compareFeed(limit: number): Promise<ArticleCompareResult> {
  const opts = { limit, includeBody: false };
  const [supabase, d1] = await Promise.all([
    sbGetFeedArticles(opts),
    d1GetFeedArticles(opts),
  ]);
  return compareArticles(supabase, d1);
}

async function compareTop(limit: number): Promise<ArticleCompareResult> {
  const [supabase, d1] = await Promise.all([
    sbGetTopArticles(limit),
    d1GetTopArticles(limit),
  ]);
  return compareArticles(supabase, d1);
}

async function compareScheduled(limit: number): Promise<ArticleCompareResult> {
  const [supabase, d1] = await Promise.all([
    sbGetScheduledArticles(),
    d1GetScheduledArticles(),
  ]);
  return compareArticles(sliceLimit(supabase, limit), sliceLimit(d1, limit));
}

async function compareDeleted(limit: number): Promise<ArticleCompareResult> {
  const [supabase, d1] = await Promise.all([
    sbGetDeletedArticles(),
    d1GetDeletedArticles(),
  ]);
  return compareArticles(sliceLimit(supabase, limit), sliceLimit(d1, limit));
}

async function compareMaintenance(limit: number): Promise<ArticleCompareResult> {
  const opts = { limit, includeBody: false };
  const [supabase, d1] = await Promise.all([
    sbGetMaintenanceArticles(opts),
    d1GetMaintenanceArticles(opts),
  ]);
  return compareArticles(supabase, d1);
}

async function compareSitemap(limit: number): Promise<DataCompareResult> {
  const [supabase, d1] = await Promise.all([
    sbGetArticleSitemapData(),
    d1GetArticleSitemapData(limit),
  ]);
  return compareData(
    sliceLimit(supabase, limit).map((item) => ({
      id: String(item.no),
      no: item.no,
      date: item.date,
      tags: item.tags || null,
      author: item.author || null,
    })),
    sliceLimit(d1, limit).map((item) => ({
      id: String(item.no),
      no: item.no,
      date: item.date,
      tags: item.tags || null,
      author: item.author || null,
    })),
  );
}

async function compareRecentTitles(days: number, limit: number): Promise<DataCompareResult> {
  const [supabase, d1] = await Promise.all([
    sbGetRecentTitles(days),
    d1GetRecentTitles(days),
  ]);
  const toFingerprint = (item: { title: string; sourceUrl?: string }): DataFingerprint => ({
    id: `${item.title}\n${item.sourceUrl || ""}`,
    title: item.title,
    sourceUrl: item.sourceUrl || null,
  });
  return compareData(
    sliceLimit(supabase, limit).map(toFingerprint),
    sliceLimit(d1, limit).map(toFingerprint),
  );
}

async function compareSetting(key: string): Promise<SettingCompareResult> {
  const sentinel = { __missing: true };
  const [supabase, d1] = await Promise.all([
    sbGetSetting<unknown>(key, sentinel),
    d1GetSetting<unknown>(key, sentinel),
  ]);
  const supabaseFound = !sameJson(supabase, sentinel);
  const d1Found = !sameJson(d1, sentinel);
  const mismatch = !sameJson(supabase, d1);
  return {
    ok: supabaseFound === d1Found && !mismatch,
    key,
    supabaseFound,
    d1Found,
    mismatch,
  };
}

function errorMessage(label: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${label}: ${message}`;
}

export async function buildD1ReadCompareReport(options: D1ReadCompareOptions = {}): Promise<D1ReadCompareReport> {
  const limit = safeLimit(options.limit);
  const searchQuery = options.searchQuery?.trim() || "";
  const settingKeys = options.settingKeys?.length ? options.settingKeys : DEFAULT_SETTING_KEYS;
  const checks = normalizeChecks(options.checks);
  const recentTitleDays = Math.max(1, Math.min(Math.trunc(Number(options.recentTitleDays || 7)), 365));
  const errors: string[] = [];

  const articleJobs: Array<[string, Promise<ArticleCompareResult>]> = [];
  if (checks.has("recent")) articleJobs.push(["recent", compareRecent(limit)]);
  if (checks.has("feed")) articleJobs.push(["feed", compareFeed(limit)]);
  if (checks.has("top")) articleJobs.push(["top", compareTop(limit)]);
  if (checks.has("scheduled")) articleJobs.push(["scheduled", compareScheduled(limit)]);
  if (checks.has("deleted")) articleJobs.push(["deleted", compareDeleted(limit)]);
  if (checks.has("maintenance")) articleJobs.push(["maintenance", compareMaintenance(limit)]);

  const articleChecks: Record<string, ArticleCompareResult | null> = {};
  const articleResults = await Promise.allSettled(articleJobs.map(([, job]) => job));
  for (const [index, result] of articleResults.entries()) {
    const label = articleJobs[index][0];
    if (result.status === "fulfilled") {
      articleChecks[label] = result.value;
    } else {
      articleChecks[label] = null;
      errors.push(errorMessage(label, result.reason));
    }
  }

  const dataJobs: Array<[string, Promise<DataCompareResult>]> = [];
  if (checks.has("sitemap")) dataJobs.push(["sitemap", compareSitemap(limit)]);
  if (checks.has("recentTitles")) dataJobs.push(["recentTitles", compareRecentTitles(recentTitleDays, limit)]);

  const dataChecks: Record<string, DataCompareResult | null> = {};
  const dataResults = await Promise.allSettled(dataJobs.map(([, job]) => job));
  for (const [index, result] of dataResults.entries()) {
    const label = dataJobs[index][0];
    if (result.status === "fulfilled") {
      dataChecks[label] = result.value;
    } else {
      dataChecks[label] = null;
      errors.push(errorMessage(label, result.reason));
    }
  }

  const recent = articleChecks.recent ?? null;

  let search: ArticleCompareResult | null = null;
  if (searchQuery) {
    const searchResult = await Promise.allSettled([compareSearch(searchQuery, limit)]);
    search = searchResult[0].status === "fulfilled" ? searchResult[0].value : null;
    if (searchResult[0].status === "rejected") errors.push(errorMessage("search", searchResult[0].reason));
  }

  const settingResults = await Promise.allSettled(settingKeys.map((key) => compareSetting(key)));
  const settings: SettingCompareResult[] = [];
  for (const [index, result] of settingResults.entries()) {
    if (result.status === "fulfilled") {
      settings.push(result.value);
    } else {
      errors.push(errorMessage(`setting:${settingKeys[index]}`, result.reason));
    }
  }

  return {
    ok: errors.length === 0
      && (!checks.has("recent") || Boolean(recent?.ok))
      && (!searchQuery || Boolean(search?.ok))
      && Object.values(articleChecks).every((item) => item?.ok)
      && Object.values(dataChecks).every((item) => item?.ok)
      && settings.every((item) => item.ok),
    generatedAt: new Date().toISOString(),
    limit,
    searchQuery: searchQuery || null,
    recent,
    search,
    articleChecks,
    dataChecks,
    settings,
    errors,
  };
}
