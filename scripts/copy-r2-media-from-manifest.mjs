#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_MANIFEST = "cloudflare/d1/import/media-manifest.json";
const DEFAULT_REPORT = "cloudflare/d1/import/r2-copy-report.json";
const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value).digest(encoding);
}

function encodePathPart(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalUri(bucket, objectKey) {
  return `/${encodePathPart(bucket)}/${objectKey.split("/").map(encodePathPart).join("/")}`;
}

function amzDate(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    long: iso,
    short: iso.slice(0, 8),
  };
}

function signingKey(secretAccessKey, date, region = "auto", service = "s3") {
  const kDate = hmac(`AWS4${secretAccessKey}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function signedHeaders({ method, bucket, objectKey, body, contentType, accountId, accessKeyId, secretAccessKey }) {
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const dates = amzDate();
  const payloadHash = sha256Hex(body || "");
  const uri = canonicalUri(bucket, objectKey);

  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": dates.long,
  };

  if (contentType) headers["content-type"] = contentType;

  const sortedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderNames
    .map((key) => `${key}:${String(headers[key]).trim()}\n`)
    .join("");
  const signedHeaderNames = sortedHeaderNames.join(";");

  const canonicalRequest = [
    method,
    uri,
    "",
    canonicalHeaders,
    signedHeaderNames,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dates.short}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    dates.long,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = hmac(signingKey(secretAccessKey, dates.short), stringToSign, "hex");

  const authorization = [
    "AWS4-HMAC-SHA256",
    `Credential=${accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaderNames}`,
    `Signature=${signature}`,
  ].join(", ");

  const fetchHeaders = { ...headers, Authorization: authorization };
  delete fetchHeaders.host;
  return fetchHeaders;
}

async function r2Request({
  method,
  bucket,
  objectKey,
  body,
  contentType,
  accountId,
  accessKeyId,
  secretAccessKey,
}) {
  const uri = canonicalUri(bucket, objectKey);
  const url = `https://${accountId}.r2.cloudflarestorage.com${uri}`;
  const headers = signedHeaders({
    method,
    bucket,
    objectKey,
    body,
    contentType,
    accountId,
    accessKeyId,
    secretAccessKey,
  });

  return fetch(url, {
    method,
    headers,
    body: method === "HEAD" ? undefined : body,
  });
}

async function fetchWithRetry(url, { attempts = 3, timeoutMs = 30000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, {
        headers: {
          "User-Agent": "CulturePeople-Migration/1.0",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    }
  }
  throw lastError;
}

function toPositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function summarizeError(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function copyOne(entry, config) {
  const startedAt = new Date().toISOString();
  const base = {
    id: entry.id,
    source_url: entry.source_url,
    bucket: entry.bucket,
    object_key: entry.object_key,
    started_at: startedAt,
  };

  if (!entry.should_copy_to_r2) return { ...base, status: "skipped_not_r2" };
  if (!entry.source_url || !entry.bucket || !entry.object_key) {
    return { ...base, status: "failed", error: "missing source_url, bucket, or object_key" };
  }

  if (!config.apply) return { ...base, status: "dry_run" };

  try {
    if (config.skipExisting) {
      const head = await r2Request({
        method: "HEAD",
        bucket: entry.bucket,
        objectKey: entry.object_key,
        accountId: config.accountId,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      });

      if (head.ok) {
        return {
          ...base,
          status: "skipped_exists",
          r2_status: head.status,
          completed_at: new Date().toISOString(),
        };
      }

      if (head.status !== 404) {
        const text = await head.text().catch(() => "");
        return {
          ...base,
          status: "failed",
          r2_status: head.status,
          error: text.slice(0, 300) || `R2 HEAD failed with ${head.status}`,
        };
      }
    }

    const response = await fetchWithRetry(entry.source_url, {
      attempts: config.attempts,
      timeoutMs: config.downloadTimeoutMs,
    });

    if (!response.ok) {
      return {
        ...base,
        status: "failed",
        source_status: response.status,
        error: `source download failed with ${response.status}`,
      };
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > config.maxBytes) {
      return {
        ...base,
        status: "failed",
        source_bytes: contentLength,
        error: `source content-length exceeds maxBytes ${config.maxBytes}`,
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const body = Buffer.from(arrayBuffer);
    if (body.byteLength > config.maxBytes) {
      return {
        ...base,
        status: "failed",
        source_bytes: body.byteLength,
        error: `downloaded object exceeds maxBytes ${config.maxBytes}`,
      };
    }

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
    const put = await r2Request({
      method: "PUT",
      bucket: entry.bucket,
      objectKey: entry.object_key,
      body,
      contentType,
      accountId: config.accountId,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    });

    if (!put.ok) {
      const text = await put.text().catch(() => "");
      return {
        ...base,
        status: "failed",
        r2_status: put.status,
        source_bytes: body.byteLength,
        error: text.slice(0, 500) || `R2 PUT failed with ${put.status}`,
      };
    }

    return {
      ...base,
      status: "copied",
      r2_status: put.status,
      source_bytes: body.byteLength,
      content_type: contentType,
      completed_at: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ...base,
      status: "failed",
      error: summarizeError(error),
    };
  }
}

const { flags, values } = parseArgs(process.argv.slice(2));
const env = {
  ...readDotEnv(path.resolve(values.env || ".env.local")),
  ...process.env,
};

const input = path.resolve(values.input || DEFAULT_MANIFEST);
const reportPath = path.resolve(values.report || DEFAULT_REPORT);
const manifest = readJson(input);
const apply = flags.has("apply");
const skipExisting = !flags.has("no-skip-existing");
const limit = values.limit ? toPositiveInt(values.limit, manifest.length) : manifest.length;

const config = {
  apply,
  skipExisting,
  accountId: values.account || env.R2_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID,
  accessKeyId: values["access-key-id"] || env.R2_ACCESS_KEY_ID || env.CLOUDFLARE_R2_ACCESS_KEY_ID,
  secretAccessKey: values["secret-access-key"] || env.R2_SECRET_ACCESS_KEY || env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  maxBytes: toPositiveInt(values["max-bytes"] || env.R2_COPY_MAX_BYTES, DEFAULT_MAX_BYTES),
  attempts: toPositiveInt(values.attempts, 3),
  downloadTimeoutMs: toPositiveInt(values["download-timeout-ms"], 30000),
};

if (!Array.isArray(manifest)) {
  console.error("Manifest must be a JSON array.");
  process.exit(2);
}

if (apply && (!config.accountId || !config.accessKeyId || !config.secretAccessKey)) {
  console.error("Missing R2 credentials. Set CLOUDFLARE_ACCOUNT_ID plus R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY, or pass --account/--access-key-id/--secret-access-key.");
  process.exit(2);
}

const entries = manifest
  .filter((entry) => entry.should_copy_to_r2)
  .slice(0, limit);
const results = [];

for (const entry of entries) {
  // Sequential copy avoids surprise R2 Class A bursts during recovery migration.
  const result = await copyOne(entry, config);
  results.push(result);
  console.log(`${result.status}: ${entry.object_key || entry.source_url}`);
}

const counts = results.reduce((acc, result) => {
  acc[result.status] = (acc[result.status] || 0) + 1;
  return acc;
}, {});

const report = {
  generated_at: new Date().toISOString(),
  input,
  mode: apply ? "apply" : "dry-run",
  skipExisting,
  maxBytes: config.maxBytes,
  totalManifestEntries: manifest.length,
  selectedEntries: entries.length,
  counts,
  results,
};

ensureDir(reportPath);
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

console.log(JSON.stringify({
  reportPath,
  mode: report.mode,
  selectedEntries: report.selectedEntries,
  counts,
}, null, 2));

if (results.some((result) => result.status === "failed")) {
  process.exitCode = 1;
}
