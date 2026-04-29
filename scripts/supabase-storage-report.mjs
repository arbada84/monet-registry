#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const maxDepth = Number(getArgValue("--max-depth") || 6);
const bucketFilter = getArgValue("--bucket");
const topLimit = Number(getArgValue("--top") || 30);
const pageSize = Number(getArgValue("--page-size") || 100);

const env = {
  ...loadEnvFile(".env.local"),
  ...loadEnvFile(".env.production.local"),
  ...loadEnvFile(".env.vercel.local"),
  ...process.env,
};

const supabaseUrl = (env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const serviceKey = (env.SUPABASE_SERVICE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const result = {};
  const text = fs.readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!value) continue;
    result[key] = value;
  }
  return result;
}

function headers() {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "n/a";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function storageError(status, body) {
  const text = String(body || "");
  const normalized = text.toLowerCase();
  if (status === 402 && normalized.includes("exceed_storage_size_quota")) {
    return "Supabase Storage API is restricted because the storage size quota was exceeded. Free space or upgrade the project in the Supabase dashboard first, then rerun this report.";
  }
  return `Supabase Storage API failed with HTTP ${status}: ${text.slice(0, 220)}`;
}

async function requestJson(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { ...headers(), ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(storageError(res.status, text));
  }
  return text ? JSON.parse(text) : null;
}

function objectSize(object) {
  const metadata = object?.metadata || {};
  const size = Number(metadata.size ?? metadata.contentLength ?? metadata.content_length ?? object?.size ?? 0);
  return Number.isFinite(size) ? size : 0;
}

function isFolderLike(object) {
  if (!object) return false;
  if (!object.id && object.name) return true;
  return object.metadata === null || object.metadata === undefined;
}

async function listObjects(bucketId, prefix = "", depth = 0) {
  if (depth > maxDepth) return [];
  const objects = [];
  let offset = 0;

  while (true) {
    const page = await requestJson(`${supabaseUrl}/storage/v1/object/list/${encodeURIComponent(bucketId)}`, {
      method: "POST",
      body: JSON.stringify({
        limit: pageSize,
        offset,
        prefix,
        sortBy: { column: "name", order: "asc" },
      }),
    });

    const items = Array.isArray(page) ? page : [];
    for (const item of items) {
      if (!item?.name) continue;
      const objectPath = prefix ? `${prefix.replace(/\/$/, "")}/${item.name}` : item.name;
      if (isFolderLike(item)) {
        objects.push(...await listObjects(bucketId, objectPath, depth + 1));
      } else {
        objects.push({
          bucket: bucketId,
          path: objectPath,
          size: objectSize(item),
          updatedAt: item.updated_at || item.created_at || "",
          mimeType: item.metadata?.mimetype || item.metadata?.cacheControl || "",
        });
      }
    }

    if (items.length < pageSize) break;
    offset += pageSize;
  }

  return objects;
}

function summarizeByPrefix(objects) {
  const groups = new Map();
  for (const object of objects) {
    const parts = object.path.split("/");
    const key = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0] || "(root)";
    const current = groups.get(key) || { prefix: key, objects: 0, bytes: 0 };
    current.objects += 1;
    current.bytes += object.size;
    groups.set(key, current);
  }
  return [...groups.values()].sort((a, b) => b.bytes - a.bytes);
}

async function main() {
  const result = {
    ok: false,
    configured: Boolean(supabaseUrl && serviceKey),
    generatedAt: new Date().toISOString(),
    buckets: [],
    totals: { objects: 0, bytes: 0 },
    largestObjects: [],
    notes: [],
  };

  if (!supabaseUrl || !serviceKey) {
    result.notes.push("Supabase URL or API key is not configured.");
    output(result);
    process.exitCode = 1;
    return;
  }

  try {
    const buckets = await requestJson(`${supabaseUrl}/storage/v1/bucket`);
    const selectedBuckets = (Array.isArray(buckets) ? buckets : [])
      .filter((bucket) => !bucketFilter || bucket.id === bucketFilter || bucket.name === bucketFilter);

    for (const bucket of selectedBuckets) {
      const objects = await listObjects(bucket.id);
      const bytes = objects.reduce((sum, object) => sum + object.size, 0);
      result.buckets.push({
        id: bucket.id,
        name: bucket.name,
        public: Boolean(bucket.public),
        objects: objects.length,
        bytes,
        formattedBytes: formatBytes(bytes),
        byPrefix: summarizeByPrefix(objects).slice(0, topLimit),
      });
      result.totals.objects += objects.length;
      result.totals.bytes += bytes;
      result.largestObjects.push(...objects);
    }

    result.largestObjects = result.largestObjects
      .sort((a, b) => b.size - a.size)
      .slice(0, topLimit)
      .map((object) => ({
        ...object,
        formattedSize: formatBytes(object.size),
      }));

    result.ok = true;
  } catch (error) {
    result.notes.push(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }

  output(result);
}

function output(result) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log("Supabase Storage report");
  console.log(`- generated: ${result.generatedAt}`);
  console.log(`- configured: ${result.configured}`);
  console.log(`- ok: ${result.ok}`);
  console.log(`- total: ${result.totals.objects} objects / ${formatBytes(result.totals.bytes)}`);
  for (const note of result.notes) console.log(`- note: ${note}`);

  for (const bucket of result.buckets) {
    console.log("");
    console.log(`Bucket: ${bucket.id} (${bucket.public ? "public" : "private"})`);
    console.log(`- objects: ${bucket.objects}`);
    console.log(`- size: ${bucket.formattedBytes}`);
    console.log("- largest prefixes:");
    for (const group of bucket.byPrefix.slice(0, 10)) {
      console.log(`  ${group.prefix}: ${group.objects} objects / ${formatBytes(group.bytes)}`);
    }
  }

  if (result.largestObjects.length > 0) {
    console.log("");
    console.log("Largest objects:");
    for (const object of result.largestObjects) {
      console.log(`- ${object.formattedSize} ${path.posix.join(object.bucket, object.path)}`);
    }
  }
}

await main();
