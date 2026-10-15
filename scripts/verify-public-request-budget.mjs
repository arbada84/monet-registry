#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";
import { parseArgs, timestampForFile, writeJsonAtomic } from "./lib/culturepeople-ops-utils.mjs";

const { flags, values } = parseArgs(process.argv.slice(2));
if (!values.base) throw new Error("--base is required");
const base = new URL(values.base);
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || ["/usr/bin/google-chrome", "/usr/bin/chromium"].find((file) => fs.existsSync(file));
const browser = await puppeteer.launch({ headless: true, executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const rows = [];
try {
  for (const width of [375, 1440]) {
    const page = await browser.newPage();
    if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
      await page.setExtraHTTPHeaders({ "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET });
    }
    await page.setViewport({ width, height: 900 });
    const requests = [];
    const failures = [];
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = new URL(req.url());
      // Read-only probe: no view counters, ad/provider requests, or form submissions.
      if (req.method() !== "GET" || url.origin !== base.origin) return void req.abort();
      requests.push({ path: url.pathname, query: url.search, prefetch: req.headers()["next-router-prefetch"] === "1" || req.headers().purpose === "prefetch" });
      void req.continue();
    });
    page.on("response", (res) => {
      if (res.url().startsWith(base.origin) && res.status() >= 400) failures.push({ url: res.url(), status: res.status() });
    });
    const response = await page.goto(base.href, { waitUntil: "networkidle2", timeout: 45_000 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const link = await page.$('a[href^="/article/"]');
    if (link) { await link.hover(); await new Promise((resolve) => setTimeout(resolve, 1000)); }
    const layout = await page.evaluate(() => ({
      title: document.title,
      articleLinks: document.querySelectorAll('a[href^="/article/"]').length,
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    }));
    const prefetchRequests = requests.filter((row) => row.prefetch);
    const oldSettingRequests = requests.filter((row) => row.path === "/api/db/settings");
    const publicSettingRequests = requests.filter((row) => row.path === "/api/public/site-settings");
    const row = { width, status: response?.status(), ...layout, prefetchRequests, oldSettingRequests,
      publicSettingRequests, sameOriginGetCount: requests.length, failures };
    if (values.screenshots) {
      fs.mkdirSync(values.screenshots, { recursive: true });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(values.screenshots, `public-${width}.png`) });
    }
    rows.push(row);
    await page.close();
  }
} finally {
  await browser.close();
}
const report = {
  generatedAt: new Date().toISOString(), base: base.href,
  ok: rows.every((row) => row.status === 200 && row.articleLinks > 0 && !row.overflow && row.failures.length === 0
    && (!flags.has("require-optimized") || row.prefetchRequests.length === 0)),
  rows,
  scope: "Two homepage viewports, scroll and article hover; external requests and all mutations blocked. Not a CPU usage measurement.",
};
writeJsonAtomic(values.report || path.join(".ops-audit-runs", `public-request-budget-${timestampForFile()}.json`), report);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
