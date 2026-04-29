#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_D1_DATABASES = ["culturepeople-staging", "culturepeople-prod"];
const DEFAULT_R2_BUCKETS = ["culturepeople-media-staging", "culturepeople-media-prod"];

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const values = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function parseArgs(argv) {
  const flags = new Set();
  const values = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      values[rawKey] = inlineValue;
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      values[rawKey] = next;
      i += 1;
    } else {
      flags.add(rawKey);
    }
  }

  return { flags, values };
}

function csv(value, fallback) {
  if (!value) return fallback;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function summarizeErrors(json) {
  const errors = Array.isArray(json?.errors) ? json.errors : [];
  return errors.map((error) => error.message).filter(Boolean).join("; ") || "unknown error";
}

function tokenDiagnostics(value) {
  const token = String(value || "").trim().replace(/^["']|["']$/g, "");
  return [
    `length=${token.length}`,
    `bearerPrefix=${token.startsWith("Bearer ")}`,
    `looksUuid=${/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(token)}`,
    `hasWhitespace=${/\s/.test(token)}`,
  ].join(", ");
}

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

function fail(message, exitCode = 1) {
  throw new CliError(message, exitCode);
}

const args = parseArgs(process.argv.slice(2));
const apply = args.flags.has("apply");
const envFile = path.resolve(args.values.env || ".env.local");
const dotEnv = readDotEnv(envFile);
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || dotEnv.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN || dotEnv.CLOUDFLARE_API_TOKEN;
const d1Databases = csv(args.values.d1, DEFAULT_D1_DATABASES);
const r2Buckets = csv(args.values.r2, DEFAULT_R2_BUCKETS);

async function cloudflare(endpoint, { method = "GET", body } = {}) {
  let response;
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await fetch(`https://api.cloudflare.com/client/v4${endpoint}`, {
        method,
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    }
  }

  if (!response) {
    const reason = lastError?.cause?.code || lastError?.message || "network error";
    throw new CliError(`Cloudflare API request failed before response: ${reason}`);
  }

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { success: false, errors: [{ message: text || response.statusText }] };
  }

  return {
    status: response.status,
    ok: response.ok && json.success !== false,
    json,
  };
}

async function requireOk(label, request) {
  const result = await request;
  if (!result.ok) {
    const errorMessage = summarizeErrors(result.json);
    const tokenHint = label === "Token verify" && result.status === 401
      ? `\nToken diagnostics: ${tokenDiagnostics(apiToken)}\nHint: Revoke and recreate the Cloudflare API Token, then paste the one-time token value into CLOUDFLARE_API_TOKEN. Do not paste the token name, token ID, or add a Bearer prefix.`
      : "";
    fail(`${label} failed (${result.status}): ${errorMessage}${tokenHint}`);
  }
  return result.json.result;
}

function normalizeR2Buckets(result) {
  if (Array.isArray(result?.buckets)) return result.buckets;
  if (Array.isArray(result)) return result;
  return [];
}

async function ensureD1Database(name) {
  const existing = await requireOk("D1 list", cloudflare(`/accounts/${accountId}/d1/database`));
  const databases = Array.isArray(existing) ? existing : [];
  const found = databases.find((database) => database.name === name);

  if (found) {
    console.log(`D1 exists: ${name}`);
    return;
  }

  if (!apply) {
    console.log(`D1 missing: ${name} (dry-run; pass --apply to create)`);
    return;
  }

  await requireOk(
    `D1 create ${name}`,
    cloudflare(`/accounts/${accountId}/d1/database`, {
      method: "POST",
      body: { name },
    }),
  );
  console.log(`D1 created: ${name}`);
}

async function ensureR2Bucket(name) {
  const existing = await requireOk("R2 list", cloudflare(`/accounts/${accountId}/r2/buckets`));
  const buckets = normalizeR2Buckets(existing);
  const found = buckets.find((bucket) => bucket.name === name);

  if (found) {
    console.log(`R2 exists: ${name}`);
    return;
  }

  if (!apply) {
    console.log(`R2 missing: ${name} (dry-run; pass --apply to create)`);
    return;
  }

  await requireOk(
    `R2 create ${name}`,
    cloudflare(`/accounts/${accountId}/r2/buckets/${encodeURIComponent(name)}`, {
      method: "PUT",
    }),
  );
  console.log(`R2 created: ${name}`);
}

async function main() {
  if (!accountId) fail("Missing CLOUDFLARE_ACCOUNT_ID in environment or .env.local.", 2);
  if (!apiToken) fail("Missing CLOUDFLARE_API_TOKEN in environment or .env.local.", 2);

  console.log(`Cloudflare bootstrap mode: ${apply ? "apply" : "dry-run"}`);
  console.log(`Env file: ${envFile}`);

  await requireOk("Token verify", cloudflare("/user/tokens/verify"));
  const account = await requireOk("Account read", cloudflare(`/accounts/${accountId}`));
  console.log(`Account read: ok (${account?.name || "unnamed account"})`);

  await requireOk("Workers Scripts list", cloudflare(`/accounts/${accountId}/workers/scripts`));
  console.log("Workers Scripts access: ok");

  for (const name of d1Databases) {
    await ensureD1Database(name);
  }

  for (const name of r2Buckets) {
    await ensureR2Bucket(name);
  }

  console.log("Cloudflare bootstrap completed.");
}

await main().catch((error) => {
  if (error instanceof CliError) {
    console.error(error.message);
    process.exitCode = error.exitCode;
    return;
  }

  console.error(error?.message || String(error));
  process.exitCode = 1;
});
