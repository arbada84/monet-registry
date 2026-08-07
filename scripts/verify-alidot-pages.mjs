#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROUTES = ["/alidot", "/alidot/terms", "/alidot/privacy"];
const LEGACY_PATTERN = /(?:\(주\))?컬처피플미디어/;
const PLACEHOLDER_PATTERN = /TODO|홍길동|준비\s*중/i;
const TRACKING_SCRIPT_PATTERN = /<script[^>]+src=["'][^"']*(?:googletagmanager\.com|googlesyndication\.com|wcs\.pstatic\.net|kakao_js_sdk)[^"']*["']/i;

function parseArgs(argv) {
  const options = { base: "http://127.0.0.1:3000", siteType: "all", json: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--") continue;
    if (argv[i] === "--base") options.base = argv[++i];
    else if (argv[i] === "--site-type") options.siteType = argv[++i];
    else if (argv[i] === "--json") options.json = true;
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  const parsed = new URL(options.base);
  parsed.pathname = parsed.pathname.replace(/\/alidot\/?$/, "").replace(/\/$/, "");
  options.origin = `${parsed.origin}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  return options;
}

function matchMeta(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)["']`, "i"))?.[1]
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["']`, "i"))?.[1]
    || "";
}

function matchCanonical(html) {
  return html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1]
    || "";
}

async function verifyRoute(origin, canonicalOrigin, route) {
  const requestUrl = `${origin}${route}`;
  const expectedCanonical = `${canonicalOrigin}${route}`;
  const response = await fetch(requestUrl, {
    redirect: "manual",
    headers: { accept: "text/html", "user-agent": "CulturePeople-Alidot-Verify/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  const html = await response.text();
  const canonical = matchCanonical(html);
  const robots = `${matchMeta(html, "robots")},${matchMeta(html, "googlebot")}`.toLowerCase();
  const checks = {
    direct200: response.status === 200,
    canonical: canonical === expectedCanonical,
    indexable: !robots.includes("noindex") && !String(response.headers.get("x-robots-tag") || "").toLowerCase().includes("noindex"),
    noLegacyCompanyName: !LEGACY_PATTERN.test(html),
    noPlaceholder: !PLACEHOLDER_PATTERN.test(html),
    noTrackingScripts: !TRACKING_SCRIPT_PATTERN.test(html),
    termsLink: html.includes('href="/alidot/terms"'),
    privacyLink: html.includes('href="/alidot/privacy"'),
    deletionAnchor: route !== "/alidot/privacy" || html.includes('id="data-deletion"'),
  };
  return { route, status: response.status, canonical, checks, ok: Object.values(checks).every(Boolean) };
}

async function verifySourceContract(root, siteType) {
  const [optionsSource, shellSource] = await Promise.all([
    readFile(path.join(root, "src/lib/site-type-options.ts"), "utf8"),
    readFile(path.join(root, "src/components/alidot/AlidotPublicShell.tsx"), "utf8"),
  ]);
  const expectedTypes = siteType === "all" ? ["netpro", "insightkorea", "culturepeople"] : [siteType];
  const types = expectedTypes.map((type) => ({
    type,
    declared: optionsSource.includes(`id: "${type}"`),
    shellMapped: type === "netpro"
      ? shellSource.includes("CulturepeopleHeader0") && shellSource.includes("CulturepeopleFooter6")
      : shellSource.includes(`siteType === "${type}"`),
  }));
  return { types, ok: types.every((item) => item.declared && item.shellMapped) };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const canonicalOrigin = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(options.origin)
    ? "https://culturepeople.co.kr"
    : options.origin;
  const results = [];
  for (const route of ROUTES) results.push(await verifyRoute(options.origin, canonicalOrigin, route));
  const sourceContract = await verifySourceContract(process.cwd(), options.siteType);
  const ok = results.every((item) => item.ok) && sourceContract.ok;
  const report = { ok, base: options.origin, results, sourceContract };
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`[verify:alidot-pages] ${ok ? "ok" : "failed"}`);
    for (const result of results) {
      const failed = Object.entries(result.checks).filter(([, value]) => !value).map(([key]) => key);
      console.log(`- ${result.route}: HTTP ${result.status}${failed.length ? `; failed=${failed.join(",")}` : ""}`);
    }
    console.log(`- site types: ${sourceContract.types.map((item) => `${item.type}:${item.declared && item.shellMapped ? "ok" : "failed"}`).join(", ")}`);
  }
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[verify:alidot-pages] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
