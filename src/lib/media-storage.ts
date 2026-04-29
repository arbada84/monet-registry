import "server-only";
import crypto from "node:crypto";

export type MediaStorageProvider = "supabase" | "r2";

interface UploadInput {
  buffer: ArrayBuffer | Uint8Array | Buffer;
  mime: string;
  ext: string;
  objectKey?: string;
}

function normalizeProvider(value: string | undefined): MediaStorageProvider {
  return value?.toLowerCase() === "r2" ? "r2" : "supabase";
}

export function getMediaStorageProvider(): MediaStorageProvider {
  return normalizeProvider(process.env.MEDIA_STORAGE_PROVIDER || process.env.STORAGE_PROVIDER);
}

export function getPublicMediaBaseUrl(): string {
  return (
    process.env.R2_PUBLIC_BASE_URL ||
    process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL ||
    ""
  ).replace(/\/+$/g, "");
}

export function isR2StorageConfigured(): boolean {
  return Boolean(
    (process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID) &&
    (process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID) &&
    (process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY) &&
    (process.env.R2_BUCKET || process.env.CLOUDFLARE_R2_PROD_BUCKET) &&
    getPublicMediaBaseUrl()
  );
}

export function isSupabaseStorageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

export function isMediaStorageConfigured(): boolean {
  return getMediaStorageProvider() === "r2"
    ? isR2StorageConfigured()
    : isSupabaseStorageConfigured();
}

export function isPublicMediaUrl(url: string): boolean {
  const publicBase = getPublicMediaBaseUrl();
  if (!publicBase) return false;

  try {
    return new URL(url).hostname.toLowerCase() === new URL(publicBase).hostname.toLowerCase();
  } catch {
    return false;
  }
}

function toBodyBuffer(input: UploadInput["buffer"]): Buffer {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof ArrayBuffer) return Buffer.from(input);
  return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
}

function buildObjectKey(ext: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = (process.env.R2_UPLOAD_PREFIX || process.env.MEDIA_UPLOAD_PREFIX || "images")
    .replace(/^\/+|\/+$/g, "");
  const rand = crypto.randomBytes(4).toString("hex");
  return `${prefix}/${yyyy}/${mm}/${Date.now()}_${rand}.${ext}`;
}

function encodePathPart(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function canonicalUri(bucket: string, objectKey: string): string {
  return `/${encodePathPart(bucket)}/${objectKey.split("/").map(encodePathPart).join("/")}`;
}

function sha256Hex(value: Buffer | string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key: crypto.BinaryLike, value: crypto.BinaryLike, encoding?: crypto.BinaryToTextEncoding): Buffer | string {
  const digest = crypto.createHmac("sha256", key).update(value).digest();
  return encoding ? digest.toString(encoding) : digest;
}

function amzDate(date = new Date()): { long: string; short: string } {
  const long = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { long, short: long.slice(0, 8) };
}

function signingKey(secretAccessKey: string, date: string): Buffer {
  const kDate = hmac(`AWS4${secretAccessKey}`, date) as Buffer;
  const kRegion = hmac(kDate, "auto") as Buffer;
  const kService = hmac(kRegion, "s3") as Buffer;
  return hmac(kService, "aws4_request") as Buffer;
}

function r2SignedHeaders(input: {
  method: "PUT";
  bucket: string;
  objectKey: string;
  body: Buffer;
  contentType: string;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
}): Record<string, string> {
  const host = `${input.accountId}.r2.cloudflarestorage.com`;
  const dates = amzDate();
  const payloadHash = sha256Hex(input.body);
  const headers: Record<string, string> = {
    "content-type": input.contentType,
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": dates.long,
  };
  const headerNames = Object.keys(headers).sort();
  const canonicalHeaders = headerNames.map((key) => `${key}:${headers[key].trim()}\n`).join("");
  const signedHeaderNames = headerNames.join(";");
  const credentialScope = `${dates.short}/auto/s3/aws4_request`;
  const canonicalRequest = [
    input.method,
    canonicalUri(input.bucket, input.objectKey),
    "",
    canonicalHeaders,
    signedHeaderNames,
    payloadHash,
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    dates.long,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = hmac(signingKey(input.secretAccessKey, dates.short), stringToSign, "hex") as string;

  const fetchHeaders: Record<string, string> = {
    ...headers,
    Authorization: [
      "AWS4-HMAC-SHA256",
      `Credential=${input.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaderNames}`,
      `Signature=${signature}`,
    ].join(", "),
  };
  delete fetchHeaders.host;
  return fetchHeaders;
}

async function uploadToR2(input: UploadInput): Promise<string | null> {
  const accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET || process.env.CLOUDFLARE_R2_PROD_BUCKET;
  const publicBaseUrl = getPublicMediaBaseUrl();

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) return null;

  const objectKey = input.objectKey || buildObjectKey(input.ext);
  const body = toBodyBuffer(input.buffer);
  const res = await fetch(
    `https://${accountId}.r2.cloudflarestorage.com${canonicalUri(bucket, objectKey)}`,
    {
      method: "PUT",
      headers: r2SignedHeaders({
        method: "PUT",
        bucket,
        objectKey,
        body,
        contentType: input.mime,
        accountId,
        accessKeyId,
        secretAccessKey,
      }),
      body: body as unknown as BodyInit,
      cache: "no-store",
    }
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error(`[media-storage] R2 upload failed (${res.status}):`, err.slice(0, 200));
    return null;
  }

  return `${publicBaseUrl}/${objectKey}`;
}

async function uploadToSupabase(input: UploadInput): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "images";

  if (!supabaseUrl || !serviceKey) return null;

  const objectKey = input.objectKey || buildObjectKey(input.ext).replace(/^images\//, "");
  const body = input.buffer instanceof ArrayBuffer ? input.buffer : toBodyBuffer(input.buffer);
  const res = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${objectKey}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": input.mime,
      "x-upsert": "true",
    },
    body: body as unknown as BodyInit,
    cache: "no-store",
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error(`[media-storage] Supabase upload failed (${res.status}):`, err.slice(0, 200));
    return null;
  }

  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectKey}`;
}

export async function uploadBufferToMediaStorage(input: UploadInput): Promise<string | null> {
  return getMediaStorageProvider() === "r2"
    ? uploadToR2(input)
    : uploadToSupabase(input);
}
