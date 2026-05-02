import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const SCRIPT_NAME = process.env.CLOUDFLARE_RETRY_SCHEDULER_SCRIPT_NAME || "culturepeople-auto-press-retry-scheduler";
const WORKER_PATH = resolve("cloudflare/workers/auto-press-retry-scheduler.js");
const API_BASE = "https://api.cloudflare.com/client/v4";
const DEFAULT_SCHEDULE = process.env.CLOUDFLARE_RETRY_SCHEDULER_CRON || "0 * * * *";

function parseDotEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

async function loadEnvFile(path) {
  try {
    return parseDotEnv(await readFile(path, "utf8"));
  } catch {
    return {};
  }
}

function getEnv(name, envFile, fallback = "") {
  return String(process.env[name] || envFile[name] || fallback)
    .replace(/\\n/g, "")
    .replace(/\\r/g, "")
    .trim();
}

async function cfFetch(path, init, token) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "authorization": `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    const errors = Array.isArray(data.errors) ? data.errors.map((error) => error.message).join(" / ") : "";
    throw new Error(`${init.method || "GET"} ${path} failed (${response.status})${errors ? `: ${errors}` : ""}`);
  }
  return data;
}

async function uploadWorker({ accountId, token }) {
  const script = await readFile(WORKER_PATH, "utf8");
  const form = new FormData();
  form.set("metadata", new Blob([JSON.stringify({
    main_module: "auto-press-retry-scheduler.js",
    compatibility_date: "2025-04-01",
  })], { type: "application/json" }), "metadata.json");
  form.set("auto-press-retry-scheduler.js", new Blob([script], {
    type: "application/javascript+module",
  }), "auto-press-retry-scheduler.js");

  await cfFetch(`/accounts/${accountId}/workers/scripts/${SCRIPT_NAME}`, {
    method: "PUT",
    body: form,
  }, token);
}

async function putSecret({ accountId, token, name, value }) {
  await cfFetch(`/accounts/${accountId}/workers/scripts/${SCRIPT_NAME}/secrets`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, text: value, type: "secret_text" }),
  }, token);
}

async function updateSchedules({ accountId, token, schedule }) {
  await cfFetch(`/accounts/${accountId}/workers/scripts/${SCRIPT_NAME}/schedules`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify([{ cron: schedule }]),
  }, token);
}

async function main() {
  const envFile = await loadEnvFile(resolve(".env.local"));
  const accountId = getEnv("CLOUDFLARE_ACCOUNT_ID", envFile);
  const token = getEnv("CLOUDFLARE_API_TOKEN", envFile);
  const cronSecret = getEnv("CRON_SECRET", envFile);
  const siteUrl = getEnv("NEXT_PUBLIC_SITE_URL", envFile, "https://culturepeople.co.kr");
  const retryLimit = getEnv("CLOUDFLARE_RETRY_SCHEDULER_LIMIT", envFile, "2");

  const missing = [
    ["CLOUDFLARE_ACCOUNT_ID", accountId],
    ["CLOUDFLARE_API_TOKEN", token],
    ["CRON_SECRET", cronSecret],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing required environment values: ${missing.join(", ")}`);
  }

  console.log(`Deploying Cloudflare Worker: ${SCRIPT_NAME}`);
  await uploadWorker({ accountId, token });
  await putSecret({ accountId, token, name: "CRON_SECRET", value: cronSecret });
  await putSecret({ accountId, token, name: "SITE_URL", value: siteUrl.replace(/\/+$/, "") });
  await putSecret({ accountId, token, name: "RETRY_LIMIT", value: retryLimit });
  await updateSchedules({ accountId, token, schedule: DEFAULT_SCHEDULE });

  console.log(JSON.stringify({
    ok: true,
    scriptName: SCRIPT_NAME,
    schedule: DEFAULT_SCHEDULE,
    siteUrl: siteUrl.replace(/\/+$/, ""),
    retryLimit,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
