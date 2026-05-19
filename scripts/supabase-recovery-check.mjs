#!/usr/bin/env node

import fs from "node:fs";
import { pathToFileURL } from "node:url";

const DEFAULT_BUCKET = "images";

function parseArgs(argv) {
  const flags = new Set();
  const values = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;

    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      values[key] = inlineValue;
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      values[key] = next;
      i += 1;
    } else {
      flags.add(key);
    }
  }

  return { flags, values };
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const values = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq < 0) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && value) values[key] = value;
  }
  return values;
}

function cleanSupabaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function projectHost(supabaseUrl) {
  try {
    return new URL(supabaseUrl).host;
  } catch {
    return null;
  }
}

function textPreview(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function isRestrictedStatus(status, text) {
  return status === 402 || /restricted|quota|exceed_storage_size_quota|payment required/i.test(String(text || ""));
}

function isNetworkUnavailable(error) {
  const text = error instanceof Error ? `${error.message} ${error.cause?.code || ""}` : String(error);
  return /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|could not be resolved|resolve|dns/i.test(text);
}

function authHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };
}

async function probe({ name, method, url, key, body }) {
  if (!url || !key) {
    return {
      name,
      ok: false,
      configured: Boolean(url && key),
      status: null,
      restricted: false,
      authFailed: false,
      networkUnavailable: false,
      detail: "missing url or key",
    };
  }

  try {
    const headers = authHeaders(key);
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(url, {
      method,
      headers,
      body,
    });
    const text = await response.text();
    return {
      name,
      ok: response.ok,
      configured: true,
      status: response.status,
      restricted: isRestrictedStatus(response.status, text),
      authFailed: response.status === 401 || response.status === 403,
      networkUnavailable: false,
      detail: response.ok ? "" : textPreview(text || response.statusText),
    };
  } catch (error) {
    return {
      name,
      ok: false,
      configured: true,
      status: null,
      restricted: false,
      authFailed: false,
      networkUnavailable: isNetworkUnavailable(error),
      detail: textPreview(error instanceof Error ? error.message : String(error)),
    };
  }
}

export function classify(report) {
  const probes = report.probes;
  const configured = report.config.hasUrl && report.config.hasServiceKey;
  const anyRestricted = probes.some((item) => item.restricted);
  const anyNetworkUnavailable = probes.some((item) => item.networkUnavailable);
  const serviceRest = probes.find((item) => item.name === "service_rest_articles");
  const serviceAuthFailed = serviceRest?.authFailed === true;
  const restExportReady = serviceRest?.ok === true;
  const storageProbes = probes.filter((item) => item.name.startsWith("service_storage_"));
  const storageReady = storageProbes.length > 0 && storageProbes.every((item) => item.ok);
  const storageRestricted = storageProbes.some((item) => item.restricted);

  const nextActions = [];
  let phase = "unknown";

  if (!configured) {
    phase = "missing_env";
    nextActions.push("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY before export.");
  } else if (anyNetworkUnavailable) {
    phase = "project_unreachable_or_paused";
    nextActions.push("Open the Supabase dashboard and confirm the project is resumed and the project ref still matches the env URL.");
  } else if (serviceAuthFailed && !anyRestricted) {
    phase = "service_key_invalid";
    nextActions.push("Regenerate or copy the current Supabase service_role key into SUPABASE_SERVICE_KEY, then rerun the check.");
  } else if (anyRestricted) {
    phase = "quota_restricted";
    nextActions.push("Storage quota restriction is still active. Wait for Supabase to fully lift it, reduce storage from the dashboard, contact support, or temporarily upgrade.");
  } else if (!restExportReady) {
    phase = "rest_not_ready";
    nextActions.push("REST export probe failed without a quota/auth signature. Inspect probe details before exporting.");
  } else if (!storageReady) {
    phase = "db_export_ready_storage_not_ready";
    nextActions.push("Database export can proceed, but Storage is not fully readable. Export DB first, then handle image copy separately.");
  } else {
    phase = "ready_for_safe_migration";
    nextActions.push("Run pnpm supabase:export-for-d1, refresh the D1 snapshot, then rehearse the D1/R2 import.");
  }

  return {
    ok: restExportReady,
    readyForDbExport: restExportReady,
    readyForStorageCopy: storageReady,
    restricted: anyRestricted,
    storageRestricted,
    phase,
    nextActions,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const { flags, values } = parseArgs(argv);
  const env = {
    ...loadEnvFile(".env.local"),
    ...loadEnvFile(".env.production.local"),
    ...loadEnvFile(".env.vercel.local"),
    ...process.env,
  };
  const supabaseUrl = cleanSupabaseUrl(values["supabase-url"] || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL);
  const serviceKey = String(values["service-key"] || env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const anonKey = String(values["anon-key"] || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  const bucket = String(values.bucket || env.SUPABASE_STORAGE_BUCKET || DEFAULT_BUCKET).trim();

  const report = {
    ok: false,
    generatedAt: new Date().toISOString(),
    projectHost: projectHost(supabaseUrl),
    bucket,
    config: {
      hasUrl: Boolean(supabaseUrl),
      hasAnonKey: Boolean(anonKey),
      hasServiceKey: Boolean(serviceKey),
    },
    probes: [],
    classification: null,
  };

  const restUrl = `${supabaseUrl}/rest/v1/articles?select=id&limit=1`;
  const bucketUrl = `${supabaseUrl}/storage/v1/bucket/${encodeURIComponent(bucket)}`;
  const listUrl = `${supabaseUrl}/storage/v1/object/list/${encodeURIComponent(bucket)}`;

  report.probes.push(await probe({
    name: "service_rest_articles",
    method: "GET",
    url: restUrl,
    key: serviceKey,
  }));

  if (anonKey) {
    report.probes.push(await probe({
      name: "anon_rest_articles",
      method: "GET",
      url: restUrl,
      key: anonKey,
    }));
  }

  report.probes.push(await probe({
    name: "service_storage_bucket",
    method: "GET",
    url: bucketUrl,
    key: serviceKey,
  }));

  report.probes.push(await probe({
    name: "service_storage_list",
    method: "POST",
    url: listUrl,
    key: serviceKey,
    body: JSON.stringify({ prefix: "", limit: 1, offset: 0 }),
  }));

  report.classification = classify(report);
  report.ok = flags.has("require-storage")
    ? report.classification.readyForDbExport && report.classification.readyForStorageCopy
    : report.classification.readyForDbExport;

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
