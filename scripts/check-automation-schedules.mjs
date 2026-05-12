#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];
const warnings = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function warn(condition, message) {
  if (!condition) warnings.push(message);
}

function extractObjectBlock(source, exportName) {
  const marker = `export const ${exportName}`;
  const start = source.indexOf(marker);
  if (start === -1) return "";
  const braceStart = source.indexOf("{", start);
  if (braceStart === -1) return "";

  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") depth -= 1;
    if (depth === 0) return source.slice(braceStart, i + 1);
  }
  return "";
}

const vercel = JSON.parse(read("vercel.json"));
const cronPaths = Array.isArray(vercel.crons) ? vercel.crons.map((cron) => cron.path) : [];

assert(!cronPaths.includes("/api/cron/auto-news"), "vercel.json must not schedule /api/cron/auto-news.");
assert(cronPaths.includes("/api/cron/auto-press"), "vercel.json must schedule /api/cron/auto-press.");

const autoPressCron = vercel.crons?.find((cron) => cron.path === "/api/cron/auto-press");
assert(Boolean(autoPressCron?.schedule), "auto-press cron must define a schedule.");

const defaults = read("src/lib/auto-defaults.ts");
const autoNewsDefaults = extractObjectBlock(defaults, "DEFAULT_AUTO_NEWS_SETTINGS");
const autoPressDefaults = extractObjectBlock(defaults, "DEFAULT_AUTO_PRESS_SETTINGS");

assert(/enabled:\s*false/.test(autoNewsDefaults), "DEFAULT_AUTO_NEWS_SETTINGS.enabled must remain false.");
assert(/cronEnabled:\s*false/.test(autoNewsDefaults), "DEFAULT_AUTO_NEWS_SETTINGS.cronEnabled must remain false.");
assert(/enabled:\s*true/.test(autoPressDefaults), "DEFAULT_AUTO_PRESS_SETTINGS.enabled must be true.");
assert(/cronEnabled:\s*true/.test(autoPressDefaults), "DEFAULT_AUTO_PRESS_SETTINGS.cronEnabled must be true.");
assert(/publishStatus:\s*"게시"/.test(autoPressDefaults), "DEFAULT_AUTO_PRESS_SETTINGS.publishStatus must be 게시.");

const autoNewsRoute = read("src/app/api/cron/auto-news/route.ts");
const autoPressRoute = read("src/app/api/cron/auto-press/route.ts");

assert(/function\s+inferExecutionSource/.test(autoNewsRoute), "auto-news route must infer cron/manual source.");
assert(/function\s+inferExecutionSource/.test(autoPressRoute), "auto-press route must infer cron/manual source.");
assert(/settings\.cronEnabled/.test(autoNewsRoute), "auto-news route must honor cronEnabled.");
assert(/settings\.cronEnabled/.test(autoPressRoute), "auto-press route must honor cronEnabled.");
assert(
  /source:\s*inferExecutionSource\(req,\s*body\.source\)/.test(autoNewsRoute)
    || (
      /const\s+source\s*=\s*inferExecutionSource\(req,\s*body\.source\)/.test(autoNewsRoute)
      && /runAutoNews\(\s*{\s*source,/.test(autoNewsRoute)
    ),
  "auto-news must pass inferred execution source.",
);
assert(/const source = inferExecutionSource\(req,\s*body\.source\)/.test(autoPressRoute), "auto-press must calculate inferred execution source.");

const newswireWorkflow = read(".github/workflows/crawl-newswire.yml");
assert(/cron:\s*["']15 \* \* \* \*["']/.test(newswireWorkflow), "crawl-newswire workflow must run on the hourly :15 schedule.");
assert(/COCKROACH_DATABASE_URL/.test(newswireWorkflow), "crawl-newswire workflow must provide COCKROACH_DATABASE_URL.");
assert(/node scripts\/crawl-newswire\.mjs --pages 3/.test(newswireWorkflow), "crawl-newswire workflow must run the newswire crawler for latest 3 pages.");

const crawler = read("scripts/crawl-newswire.mjs");
assert(/ON CONFLICT \(url\) DO NOTHING/.test(crawler), "newswire crawler must dedupe by URL.");
assert(/process\.exit\(0\)/.test(crawler), "newswire crawler should avoid noisy Action failures on transient crawl errors.");
warn(/뉴스와이어 크롤러 \(매시간\)/.test(newswireWorkflow), "newswire crawler currently runs hourly, not once daily.");

const result = {
  ok: errors.length === 0,
  cronPaths,
  autoPressSchedule: autoPressCron?.schedule ?? null,
  errors,
  warnings,
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("Automation schedule check");
  console.log(`- Vercel cron paths: ${cronPaths.join(", ") || "(none)"}`);
  console.log(`- Auto-press schedule: ${result.autoPressSchedule || "(missing)"}`);
  for (const warning of warnings) console.warn(`WARNING: ${warning}`);
  for (const error of errors) console.error(`ERROR: ${error}`);
}

process.exit(result.ok ? 0 : 1);
