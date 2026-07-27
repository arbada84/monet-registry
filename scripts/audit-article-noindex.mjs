#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "https://culturepeople.co.kr";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_OUT_DIR = ".seo-audit-runs";
const DEFAULT_SITEMAP_SAMPLE_SIZE = 20;

const USER_AGENTS = [
  {
    key: "browser",
    label: "Browser",
    value:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  },
  {
    key: "googlebot",
    label: "Googlebot",
    value: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  },
  {
    key: "googleInspectionTool",
    label: "Google-InspectionTool",
    value: "Mozilla/5.0 (compatible; Google-InspectionTool/1.0)",
  },
];

function assignArg(values, key, value) {
  if (key === "url") {
    values.urls = values.urls || [];
    values.urls.push(value);
    return;
  }
  values[key] = value;
}

export function parseArgs(argv) {
  const flags = new Set();
  const values = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (!arg.startsWith("--")) continue;

    const eq = arg.indexOf("=");
    if (eq !== -1) {
      assignArg(values, arg.slice(2, eq), arg.slice(eq + 1));
      continue;
    }

    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      assignArg(values, key, next);
      i += 1;
    } else {
      flags.add(key);
    }
  }

  return { flags, values };
}

function cleanBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function stripTags(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

export function normalizeUrl(value, baseUrl = DEFAULT_BASE_URL) {
  if (!value) return "";
  try {
    const url = new URL(decodeHtmlEntities(String(value).trim()), baseUrl);
    url.hash = "";
    url.search = "";
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function extractArticleNo(value, baseUrl = DEFAULT_BASE_URL) {
  try {
    const url = new URL(value, baseUrl);
    const match = url.pathname.match(/^\/article\/(\d+)\/?$/);
    if (!match) return null;
    const no = Number(match[1]);
    return Number.isSafeInteger(no) && no > 0 ? no : null;
  } catch {
    return null;
  }
}

function getAttr(tag, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = tag.match(pattern);
  if (!match) return "";
  return decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
}

function isNoindexContent(content) {
  return /(^|[,\s])noindex([,\s]|$)/i.test(String(content || ""));
}

export function extractSeoSignals(html) {
  const text = String(html || "");
  const title = stripTags(text.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const h1 = stripTags(text.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  const metaRobots = [];
  const metaGooglebot = [];
  let canonical = "";

  for (const tag of text.match(/<meta\b[^>]*>/gi) || []) {
    const name = getAttr(tag, "name").toLowerCase();
    const content = getAttr(tag, "content");
    if (name === "robots") metaRobots.push(content);
    if (name === "googlebot") metaGooglebot.push(content);
  }

  for (const tag of text.match(/<link\b[^>]*>/gi) || []) {
    const rel = getAttr(tag, "rel").toLowerCase();
    if (rel.split(/\s+/).includes("canonical")) {
      canonical = getAttr(tag, "href");
      break;
    }
  }

  return {
    title,
    h1,
    canonical,
    metaRobots,
    metaGooglebot,
    hasNoindexText: /\bnoindex\b/i.test(text),
    hasNextNotFoundDigest: /NEXT_HTTP_ERROR_FALLBACK;404/i.test(text),
    looksLikeNotFoundTitle: /기사를 찾을 수 없습니다|not found/i.test(title),
    hasNewsArticleJsonLd: /"@type"\s*:\s*"?NewsArticle"?/i.test(text),
    metaRobotsNoindex: metaRobots.some(isNoindexContent),
    metaGooglebotNoindex: metaGooglebot.some(isNoindexContent),
  };
}

function headersToObject(headers) {
  const result = {};
  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
}

function timeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

async function fetchText(url, { userAgent, timeoutMs }) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: {
        "user-agent": userAgent,
        accept: "text/html,application/xhtml+xml,application/xml,text/xml,text/plain;q=0.9,*/*;q=0.8",
      },
      signal: timeoutSignal(timeoutMs),
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      redirected: response.redirected,
      headers: headersToObject(response.headers),
      ms: Date.now() - startedAt,
      text,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      finalUrl: url,
      redirected: false,
      headers: {},
      ms: Date.now() - startedAt,
      text: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchArticleForUserAgent(url, profile, timeoutMs) {
  const result = await fetchText(url, { userAgent: profile.value, timeoutMs });
  const signals = extractSeoSignals(result.text);
  const xRobotsTag = result.headers["x-robots-tag"] || "";

  return {
    userAgent: profile.key,
    label: profile.label,
    status: result.status,
    ok: result.ok,
    finalUrl: result.finalUrl,
    redirected: result.redirected,
    ms: result.ms,
    error: result.error,
    contentType: result.headers["content-type"] || "",
    xRobotsTag,
    xRobotsNoindex: isNoindexContent(xRobotsTag),
    title: signals.title,
    h1: signals.h1,
    canonical: signals.canonical,
    metaRobots: signals.metaRobots,
    metaGooglebot: signals.metaGooglebot,
    metaRobotsNoindex: signals.metaRobotsNoindex,
    metaGooglebotNoindex: signals.metaGooglebotNoindex,
    hasNoindexText: signals.hasNoindexText,
    hasNextNotFoundDigest: signals.hasNextNotFoundDigest,
    looksLikeNotFoundTitle: signals.looksLikeNotFoundTitle,
    notFoundSignal: signals.hasNextNotFoundDigest || signals.looksLikeNotFoundTitle,
    hasNewsArticleJsonLd: signals.hasNewsArticleJsonLd,
    htmlBytes: Buffer.byteLength(result.text || "", "utf8"),
  };
}

function extractLocs(xml) {
  const locs = [];
  for (const match of String(xml || "").matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)) {
    locs.push(decodeHtmlEntities(match[1].trim()));
  }
  return locs;
}

function parseRobotsGroups(robotsTxt) {
  const groups = [];
  let group = null;
  let seenDirective = false;

  for (const rawLine of String(robotsTxt || "").split(/\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) {
      group = null;
      seenDirective = false;
      continue;
    }

    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (key === "user-agent") {
      if (!group || seenDirective) {
        group = { agents: [], rules: [] };
        groups.push(group);
        seenDirective = false;
      }
      group.agents.push(value.toLowerCase());
      continue;
    }

    if (key === "allow" || key === "disallow") {
      if (!group) {
        group = { agents: ["*"], rules: [] };
        groups.push(group);
      }
      seenDirective = true;
      group.rules.push({ type: key, path: value });
    }
  }

  return groups;
}

function robotsRuleMatches(rulePath, pathname) {
  if (!rulePath) return false;
  const escaped = rulePath
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\\\$/g, "$");
  return new RegExp(`^${escaped}`).test(pathname);
}

export function getRobotsDecision(robotsTxt, targetUrl, userAgent = "Googlebot") {
  const groups = parseRobotsGroups(robotsTxt);
  const ua = String(userAgent || "").toLowerCase();
  const matchingGroups = groups
    .map((group) => {
      const bestAgent = group.agents
        .filter((agent) => agent === "*" || ua.includes(agent))
        .sort((a, b) => (b === "*" ? 0 : b.length) - (a === "*" ? 0 : a.length))[0];
      return bestAgent ? { group, agent: bestAgent, specificity: bestAgent === "*" ? 0 : bestAgent.length } : null;
    })
    .filter(Boolean);

  if (!matchingGroups.length) return { blocked: false, rule: null, matchedAgent: null };

  const maxSpecificity = Math.max(...matchingGroups.map((item) => item.specificity));
  const rules = matchingGroups
    .filter((item) => item.specificity === maxSpecificity)
    .flatMap((item) => item.group.rules.map((rule) => ({ ...rule, matchedAgent: item.agent })));

  let pathname = "/";
  try {
    pathname = new URL(targetUrl, DEFAULT_BASE_URL).pathname || "/";
  } catch {
    pathname = "/";
  }

  const matches = rules
    .filter((rule) => robotsRuleMatches(rule.path, pathname))
    .sort((a, b) => {
      if (b.path.length !== a.path.length) return b.path.length - a.path.length;
      if (a.type === b.type) return 0;
      return a.type === "allow" ? -1 : 1;
    });

  const winner = matches[0] || null;
  return {
    blocked: winner?.type === "disallow",
    rule: winner ? `${winner.type}: ${winner.path}` : null,
    matchedAgent: winner?.matchedAgent || matchingGroups.find((item) => item.specificity === maxSpecificity)?.agent || null,
  };
}

export function isRobotsBlocked(robotsTxt, targetUrl, userAgent = "Googlebot") {
  return getRobotsDecision(robotsTxt, targetUrl, userAgent).blocked;
}

function hasAnyNoindex(uaChecks) {
  return uaChecks.some(
    (check) =>
      check.metaRobotsNoindex ||
      check.metaGooglebotNoindex ||
      check.xRobotsNoindex
  );
}

function hasHeaderNoindex(uaChecks) {
  return uaChecks.some((check) => check.xRobotsNoindex);
}

function hasMetaNoindex(uaChecks) {
  return uaChecks.some((check) => check.metaRobotsNoindex || check.metaGooglebotNoindex);
}

export function classifyUrlAudit(input) {
  const {
    source,
    url,
    primary,
    uaChecks,
    sitemapKnown,
    sitemapPresent,
    robotsKnown,
    robotsBlocked,
    canonicalUrl,
    expectedCanonicalUrl,
    backupHistory,
  } = input;

  const status = primary?.status ?? null;

  if (robotsKnown && robotsBlocked) return "robots_blocked";
  if (status === 404 || status === 410 || primary?.notFoundSignal) {
    if (backupHistory?.wasPublished) return "historical_published_missing";
    return "not_found_or_unpublished";
  }
  if (status !== 200) return "live_fetch_error_or_bad_status";
  if (hasHeaderNoindex(uaChecks)) return "live_noindex_header";
  if (hasMetaNoindex(uaChecks)) return "live_noindex_meta";
  if (canonicalUrl && expectedCanonicalUrl && canonicalUrl !== expectedCanonicalUrl) return "canonical_mismatch";
  if (sitemapKnown && !sitemapPresent) return "sitemap_missing";
  if (source === "search_console") return "stale_search_console";
  return hasAnyNoindex(uaChecks) ? "live_noindex_meta" : "published_indexable";
}

function classificationIsBlocking(classification) {
  return [
    "historical_published_missing",
    "live_fetch_error_or_bad_status",
    "live_noindex_header",
    "live_noindex_meta",
    "canonical_mismatch",
    "sitemap_missing",
    "robots_blocked",
  ].includes(classification);
}

function makeNotes(row) {
  const notes = [];
  if (row.classification === "stale_search_console") {
    notes.push("Current live fetch is indexable; Search Console may still show the previous crawl result.");
  }
  if (row.classification === "not_found_or_unpublished") {
    notes.push("The URL currently returns 404/410 or a Next.js notFound fallback; keep this only if the article is unpublished, removed, or absent.");
  }
  if (row.classification === "historical_published_missing") {
    notes.push("Local backups show this article number was previously published but is missing from the current live dataset.");
  }
  if (row.backupHistory?.firstPublishedTitle) {
    notes.push(`backupTitle=${row.backupHistory.firstPublishedTitle}`);
  }
  if (!row.newsSitemapPresent) {
    notes.push("news-sitemap.xml normally contains only recent Google News entries, so older articles may be absent.");
  }
  if (row.primary?.hasNoindexText && !row.metaNoindex && !row.headerNoindex) {
    notes.push("The literal string noindex exists in HTML but not as robots meta/header.");
  }
  return notes;
}

async function readUrlsFile(file) {
  if (!file) return [];
  const text = await fs.readFile(file, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean);
}

async function loadSurface(baseUrl, timeoutMs) {
  const googlebot = USER_AGENTS.find((ua) => ua.key === "googlebot") || USER_AGENTS[0];
  const [sitemap, newsSitemap, robots] = await Promise.all([
    fetchText(`${baseUrl}/sitemap.xml`, { userAgent: googlebot.value, timeoutMs }),
    fetchText(`${baseUrl}/news-sitemap.xml`, { userAgent: googlebot.value, timeoutMs }),
    fetchText(`${baseUrl}/robots.txt`, { userAgent: googlebot.value, timeoutMs }),
  ]);

  return {
    sitemap: {
      known: Boolean(sitemap.ok && sitemap.text),
      status: sitemap.status,
      locs: extractLocs(sitemap.text),
      error: sitemap.error,
    },
    newsSitemap: {
      known: Boolean(newsSitemap.ok && newsSitemap.text),
      status: newsSitemap.status,
      locs: extractLocs(newsSitemap.text),
      error: newsSitemap.error,
    },
    robots: {
      known: Boolean(robots.ok && robots.text),
      status: robots.status,
      text: robots.text || "",
      error: robots.error,
    },
  };
}

async function safeReadJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function listBackupArticleFiles(root) {
  if (!root) return [];
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const file = path.join(root, entry.name, "merged", "articles.json");
      try {
        const stat = await fs.stat(file);
        if (stat.isFile()) files.push({ file, stamp: entry.name, mtimeMs: stat.mtimeMs });
      } catch {
        // Missing or partial backup directories are expected during interrupted runs.
      }
    }
    return files.sort((a, b) => a.stamp.localeCompare(b.stamp));
  } catch {
    return [];
  }
}

function normalizeArticlesJson(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.articles)) return value.articles;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

async function loadBackupHistory(root, articleNos) {
  const wanted = new Set(articleNos.filter((no) => Number.isSafeInteger(no) && no > 0));
  if (!root || wanted.size === 0) return { root, filesScanned: 0, available: false, byNo: {} };

  const files = await listBackupArticleFiles(root);
  const byNo = {};

  for (const { file, stamp } of files) {
    const articles = normalizeArticlesJson(await safeReadJson(file));
    if (!articles.length) continue;

    for (const article of articles) {
      const no = Number(article?.no);
      if (!wanted.has(no)) continue;
      const status = String(article?.status || "");
      const title = String(article?.title || "");
      const record = byNo[no] || {
        no,
        firstSeen: stamp,
        lastSeen: stamp,
        wasPublished: false,
        firstPublishedAtBackup: null,
        lastStatus: "",
        lastTitle: "",
        firstPublishedTitle: "",
      };
      record.lastSeen = stamp;
      record.lastStatus = status;
      record.lastTitle = title;
      if (status === "게시") {
        record.wasPublished = true;
        if (!record.firstPublishedAtBackup) {
          record.firstPublishedAtBackup = stamp;
          record.firstPublishedTitle = title;
        }
      }
      byNo[no] = record;
    }
  }

  return {
    root,
    filesScanned: files.length,
    available: files.length > 0,
    byNo,
  };
}

function buildTargets({ explicitUrls, sitemapLocs, baseUrl, sampleSitemap }) {
  const targets = unique(explicitUrls).map((url) => ({
    url: normalizeUrl(url, baseUrl) || url,
    source: "search_console",
  }));

  if (sampleSitemap) {
    const size = Number.isFinite(Number(sampleSitemap)) && Number(sampleSitemap) > 0
      ? Number(sampleSitemap)
      : DEFAULT_SITEMAP_SAMPLE_SIZE;
    const known = new Set(targets.map((item) => normalizeUrl(item.url, baseUrl)));
    for (const loc of sitemapLocs) {
      const normalized = normalizeUrl(loc, baseUrl);
      if (!normalized || known.has(normalized)) continue;
      if (!new URL(normalized).pathname.startsWith("/article/")) continue;
      targets.push({ url: normalized, source: "sitemap_sample" });
      known.add(normalized);
      if (targets.filter((target) => target.source === "sitemap_sample").length >= size) break;
    }
  }

  return targets;
}

function summarize(rows) {
  const classifications = {};
  for (const row of rows) {
    classifications[row.classification] = (classifications[row.classification] || 0) + 1;
  }
  return {
    total: rows.length,
    blocking: rows.filter((row) => row.blocking).length,
    classifications,
  };
}

function asYesNo(value) {
  if (value === null || value === undefined) return "unknown";
  return value ? "yes" : "no";
}

function markdownCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ")
    .slice(0, 240);
}

function buildMarkdown(report) {
  const lines = [
    "# CulturePeople noindex audit",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- baseUrl: ${report.baseUrl}`,
    `- ok: ${report.ok}`,
    `- total: ${report.summary.total}`,
    `- blocking: ${report.summary.blocking}`,
    "",
    "## Classification Summary",
    "",
    "| classification | count |",
    "| --- | ---: |",
  ];

  for (const [classification, count] of Object.entries(report.summary.classifications)) {
    lines.push(`| ${classification} | ${count} |`);
  }

  lines.push(
    "",
    "## URL Results",
    "",
    "| source | url | class | status | canonical | meta noindex | header noindex | sitemap | news sitemap | robots blocked | notes |",
    "| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |"
  );

  for (const row of report.rows) {
    lines.push(
      [
        row.source,
        row.url,
        row.classification,
        row.primary?.status ?? "ERR",
        row.primary?.canonical || "",
        asYesNo(row.metaNoindex),
        asYesNo(row.headerNoindex),
        asYesNo(row.sitemapPresent),
        asYesNo(row.newsSitemapPresent),
        asYesNo(row.robotsBlocked),
        row.notes.join(" "),
      ].map(markdownCell).join(" | ").replace(/^/, "| ").replace(/$/, " |")
    );
  }

  lines.push(
    "",
    "## Search Console follow-up",
    "",
    "- For `stale_search_console`, run URL Inspection live test and request indexing.",
    "- Start validation in the noindex report after live tests show no robots noindex.",
    "- Keep 404/noindex only for unpublished, deleted, or absent articles."
  );

  return `${lines.join("\n")}\n`;
}

async function writeReportFiles(report, outDir) {
  await fs.mkdir(outDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(outDir, `noindex-audit-${stamp}.json`);
  const mdPath = path.join(outDir, `noindex-audit-${stamp}.md`);
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(mdPath, buildMarkdown(report), "utf8");
  return { jsonPath, mdPath };
}

export async function buildArticleNoindexAuditReport(options = {}) {
  const baseUrl = cleanBaseUrl(options.baseUrl);
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const explicitUrls = unique([...(options.urls || []), ...(await readUrlsFile(options.urlsFile))]);
  const surface = await loadSurface(baseUrl, timeoutMs);
  const sitemapSet = new Set(surface.sitemap.locs.map((loc) => normalizeUrl(loc, baseUrl)).filter(Boolean));
  const newsSitemapSet = new Set(surface.newsSitemap.locs.map((loc) => normalizeUrl(loc, baseUrl)).filter(Boolean));
  const targets = buildTargets({
    explicitUrls,
    sitemapLocs: surface.sitemap.locs,
    baseUrl,
    sampleSitemap: options.sampleSitemap,
  });
  const targetNos = targets.map((target) => extractArticleNo(target.url, baseUrl)).filter(Boolean);
  const backupHistory = await loadBackupHistory(options.backupRoot, targetNos);

  const rows = [];

  for (const target of targets) {
    const uaChecks = [];
    for (const profile of USER_AGENTS) {
      uaChecks.push(await fetchArticleForUserAgent(target.url, profile, timeoutMs));
    }

    const primary = uaChecks.find((check) => check.userAgent === "googlebot") || uaChecks[0];
    const normalizedOriginal = normalizeUrl(target.url, baseUrl);
    const normalizedFinal = normalizeUrl(primary.finalUrl || target.url, baseUrl);
    const normalizedCanonical = normalizeUrl(primary.canonical, primary.finalUrl || baseUrl);
    const expectedCanonicalUrl = normalizedFinal || normalizedOriginal;
    const sitemapPresent = surface.sitemap.known
      ? [normalizedOriginal, normalizedFinal, normalizedCanonical].filter(Boolean).some((loc) => sitemapSet.has(loc))
      : null;
    const newsSitemapPresent = surface.newsSitemap.known
      ? [normalizedOriginal, normalizedFinal, normalizedCanonical].filter(Boolean).some((loc) => newsSitemapSet.has(loc))
      : null;
    const robotsDecision = surface.robots.known
      ? getRobotsDecision(surface.robots.text, primary.finalUrl || target.url, "Googlebot")
      : { blocked: null, rule: null, matchedAgent: null };
    const metaNoindex = hasMetaNoindex(uaChecks);
    const headerNoindex = hasHeaderNoindex(uaChecks);
    const articleNo = extractArticleNo(target.url, baseUrl);
    const history = articleNo ? backupHistory.byNo[articleNo] || null : null;

    const classification = classifyUrlAudit({
      source: target.source,
      url: target.url,
      primary,
      uaChecks,
      sitemapKnown: surface.sitemap.known,
      sitemapPresent,
      robotsKnown: surface.robots.known,
      robotsBlocked: robotsDecision.blocked,
      canonicalUrl: normalizedCanonical,
      expectedCanonicalUrl,
      backupHistory: history,
    });

    const row = {
      source: target.source,
      url: target.url,
      articleNo,
      classification,
      blocking: classificationIsBlocking(classification),
      primaryUserAgent: primary.userAgent,
      primary,
      uaChecks,
      canonicalUrl: normalizedCanonical || "",
      expectedCanonicalUrl,
      metaNoindex,
      headerNoindex,
      htmlNoindexText: uaChecks.some((check) => check.hasNoindexText),
      notFoundSignal: Boolean(primary.notFoundSignal),
      titlePresent: Boolean(primary.title || primary.h1),
      newsArticleJsonLdPresent: Boolean(primary.hasNewsArticleJsonLd),
      sitemapPresent,
      newsSitemapPresent,
      robotsKnown: surface.robots.known,
      robotsBlocked: robotsDecision.blocked,
      robotsRule: robotsDecision.rule,
      robotsMatchedAgent: robotsDecision.matchedAgent,
      backupHistory: history,
      notes: [],
    };
    row.notes = makeNotes(row);
    rows.push(row);
  }

  const report = {
    ok: rows.every((row) => !row.blocking),
    generatedAt: new Date().toISOString(),
    baseUrl,
    timeoutMs,
    userAgents: USER_AGENTS.map(({ key, label, value }) => ({ key, label, value })),
    surface: {
      sitemap: {
        known: surface.sitemap.known,
        status: surface.sitemap.status,
        locCount: surface.sitemap.locs.length,
        error: surface.sitemap.error,
      },
      newsSitemap: {
        known: surface.newsSitemap.known,
        status: surface.newsSitemap.status,
        locCount: surface.newsSitemap.locs.length,
        error: surface.newsSitemap.error,
      },
      robots: {
        known: surface.robots.known,
        status: surface.robots.status,
        error: surface.robots.error,
      },
    },
    backupHistory: {
      enabled: Boolean(options.backupRoot),
      root: options.backupRoot || "",
      available: backupHistory.available,
      filesScanned: backupHistory.filesScanned,
    },
    summary: summarize(rows),
    rows,
  };

  if (options.writeReports !== false) {
    report.reportFiles = await writeReportFiles(report, options.outDir || DEFAULT_OUT_DIR);
  }

  return report;
}

function printHuman(report) {
  console.log("CulturePeople article noindex audit");
  console.log(`- base: ${report.baseUrl}`);
  console.log(`- ok: ${report.ok}`);
  console.log(`- total: ${report.summary.total}`);
  console.log(`- blocking: ${report.summary.blocking}`);
  console.log(`- classifications: ${JSON.stringify(report.summary.classifications)}`);
  if (report.reportFiles) {
    console.log(`- json: ${report.reportFiles.jsonPath}`);
    console.log(`- markdown: ${report.reportFiles.mdPath}`);
  }
  for (const row of report.rows) {
    const status = row.primary?.status ?? "ERR";
    const flags = [
      row.metaNoindex ? "meta-noindex" : "",
      row.headerNoindex ? "header-noindex" : "",
      row.notFoundSignal ? "not-found-signal" : "",
      row.robotsBlocked ? "robots-blocked" : "",
      row.sitemapPresent === false ? "sitemap-missing" : "",
    ].filter(Boolean).join(",");
    console.log(`- ${row.classification} status=${status} ${row.url}${flags ? ` flags=${flags}` : ""}`);
  }
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const sampleSitemap = flags.has("sample-sitemap")
    ? true
    : values["sample-sitemap"] || values["sample-sitemap-size"] || false;
  const report = await buildArticleNoindexAuditReport({
    baseUrl: values.base || values.url || DEFAULT_BASE_URL,
    urlsFile: values["urls-file"],
    urls: values.urls || [],
    backupRoot: values["backup-root"] || "",
    sampleSitemap,
    timeoutMs: Number(values.timeout || DEFAULT_TIMEOUT_MS),
    outDir: values["out-dir"] || DEFAULT_OUT_DIR,
    writeReports: !flags.has("no-write"),
  });

  if (flags.has("json")) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);

  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
