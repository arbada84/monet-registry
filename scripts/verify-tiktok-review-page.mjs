#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";

const options = parseArgs(process.argv.slice(2));
loadEnv(["127.0.0.1", "localhost", "::1"].includes(new URL(options.base).hostname));
const route = "/cam/alidot/tiktok-review";

function parseArgs(argv) {
  const parsed = { base: "http://127.0.0.1:3000", json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--") continue;
    if (value === "--base") parsed.base = argv[++index];
    else if (value === "--json") parsed.json = true;
    else throw new Error(`unknown argument: ${value}`);
  }
  parsed.base = parsed.base.replace(/\/$/, "");
  new URL(parsed.base);
  return parsed;
}

function loadEnv(local) {
  const files = local
    ? [".env.local", ".env.production.local", ".env", ".env.production"]
    : [".env.production.local", ".env.local", ".env.production", ".env"];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      const raw = match[2].trim();
      process.env[match[1]] = ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) ? raw.slice(1, -1) : raw;
    }
  }
}

function isLocalBase() {
  const host = new URL(options.base).hostname;
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function createAdminToken() {
  if (process.env.SMOKE_ADMIN_AUTH_TOKEN) return process.env.SMOKE_ADMIN_AUTH_TOKEN;
  const secret = process.env.COOKIE_SECRET || (isLocalBase() ? "cp-cookie-secret-dev-only-not-for-production" : "");
  if (!secret) return "";
  const payload = `${Date.now()}|TikTok Review Verify|superadmin`;
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("hex");
  return `${encoded}.${signature}`;
}

function metaContent(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.match(new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']*)["']`, "i"))?.[1]
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escaped}["']`, "i"))?.[1]
    || "";
}

async function fetchText(pathname, init = {}) {
  const response = await fetch(`${options.base}${pathname}`, { signal: AbortSignal.timeout(15_000), ...init });
  return { response, text: await response.text() };
}

async function main() {
  const checks = {};
  const details = {};

  const unauthenticated = await fetchText(route, { redirect: "manual" });
  const location = unauthenticated.response.headers.get("location") || "";
  checks.unauthenticatedRedirect = [307, 308].includes(unauthenticated.response.status)
    && location.includes("/cam/login")
    && location.includes("redirect=%2Fcam%2Falidot%2Ftiktok-review");
  details.unauthenticated = { status: unauthenticated.response.status, location };

  const token = createAdminToken();
  if (!token) throw new Error("authenticated verification requires COOKIE_SECRET or SMOKE_ADMIN_AUTH_TOKEN");
  const authenticated = await fetchText(route, { headers: { cookie: `cp-admin-auth=${token}` }, redirect: "manual" });
  const html = authenticated.text;
  const robots = `${metaContent(html, "robots")},${metaContent(html, "googlebot")}`.toLowerCase();
  checks.authenticated200 = authenticated.response.status === 200;
  checks.noindex = robots.includes("noindex");
  checks.nofollow = robots.includes("nofollow");
  checks.noarchive = robots.includes("noarchive");
  checks.noTokenInputs = !/<input[^>]+(?:name|id|type)=["'][^"']*(?:token|secret|password)[^"']*["']/i.test(html);
  checks.noTikTokEndpoints = !/(?:open\.tiktokapis\.com|open-upload\.tiktokapis\.com|www\.tiktok\.com\/v2\/auth)/i.test(html);

  const [sitemap, newsSitemap, alidot, terms, privacy] = await Promise.all([
    fetchText("/sitemap.xml"),
    fetchText("/news-sitemap.xml"),
    fetchText("/alidot"),
    fetchText("/alidot/terms"),
    fetchText("/alidot/privacy"),
  ]);
  checks.sitemapExcluded = !sitemap.text.includes(route);
  checks.newsSitemapExcluded = !newsSitemap.text.includes(route);
  checks.publicPagesDoNotLinkAdmin = [alidot, terms, privacy].every((item) => !item.text.includes(route));
  details.authenticated = { status: authenticated.response.status, robots };

  const sourceFiles = [
    "src/app/cam/alidot/tiktok-review/page.tsx",
    "src/app/cam/alidot/tiktok-review/TikTokReviewForm.tsx",
    "src/lib/tiktok-review/fixture.ts",
  ];
  const source = sourceFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  const middleware = fs.readFileSync("src/middleware.ts", "utf8");
  checks.prototypeContract = [
    "내부 UX prototype",
    "TikTok API 미연결",
    "TikTok 전송 안 함",
    "Production 심사 제출 금지",
    "TIKTOK_REVIEW_INTEGRATION_STATUS",
    'data-server-upload-enabled="false"',
  ].every((value) => source.includes(value));
  checks.noPersistenceApis = !/(?:localStorage|sessionStorage|indexedDB)/.test(source);
  checks.noNetworkApis = !/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/.test(source);
  checks.reporterAllowlistUnchanged = !middleware.match(/REPORTER_ALLOWED_PATHS\s*=\s*\[[^\]]*tiktok\/review/s);
  checks.noDedicatedApiRoute = !fs.existsSync("src/app/api/alidot/tiktok/review-readiness/route.ts");

  const ok = Object.values(checks).every(Boolean);
  const report = { ok, base: options.base, route, checks, details };
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`[verify:tiktok-review] ${ok ? "ok" : "failed"}`);
    for (const [name, passed] of Object.entries(checks)) console.log(`- ${passed ? "PASS" : "FAIL"} ${name}`);
  }
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[verify:tiktok-review] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
