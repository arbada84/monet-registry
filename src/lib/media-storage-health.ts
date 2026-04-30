import "server-only";

import { getMediaStorageProvider, getPublicMediaBaseUrl, isMediaStorageConfigured, uploadBufferToMediaStorage } from "@/lib/media-storage";
import { escapeTelegramHtml } from "@/lib/telegram-notify";

type CheckLevel = "ok" | "warning" | "error";

interface StorageCheck {
  ok: boolean;
  level: CheckLevel;
  status?: number;
  code?: string;
  message: string;
}

export interface MediaStorageHealthReport {
  ok: boolean;
  provider: ReturnType<typeof getMediaStorageProvider>;
  configured: boolean;
  generatedAt: string;
  checks: Record<string, StorageCheck>;
  warnings: string[];
  errors: string[];
  recommendations: string[];
}

export interface MediaStorageRunSummary {
  ok: boolean;
  provider: ReturnType<typeof getMediaStorageProvider>;
  configured: boolean;
  errors: string[];
  warnings: string[];
  recommendations: string[];
}

interface HealthOptions {
  remote?: boolean;
  writeProbe?: boolean;
  fetchImpl?: typeof fetch;
}

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

function has(value: string): boolean {
  return value.length > 0;
}

function supabaseBucket(): string {
  return env("SUPABASE_STORAGE_BUCKET") || "images";
}

function r2Bucket(): string {
  return env("R2_BUCKET") || env("CLOUDFLARE_R2_PROD_BUCKET");
}

function safeErrorMessage(json: unknown, fallback: string): string {
  if (json && typeof json === "object") {
    const data = json as Record<string, unknown>;
    if (typeof data.message === "string") return data.message;
    if (typeof data.error === "string") return data.error;
    if (Array.isArray(data.errors)) {
      const messages = data.errors
        .map((item) => item && typeof item === "object" ? (item as Record<string, unknown>).message : null)
        .filter((message): message is string => typeof message === "string");
      if (messages.length > 0) return messages.join("; ");
    }
  }
  return fallback;
}

async function fetchJson(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal, cache: "no-store" });
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { message: text.slice(0, 300) };
    }
    return { response, json };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal, cache: "no-store" });
    const text = await response.text().catch(() => "");
    return { response, text };
  } finally {
    clearTimeout(timeout);
  }
}

function addCheck(report: MediaStorageHealthReport, name: string, check: StorageCheck) {
  report.checks[name] = check;
  if (check.level === "warning") report.warnings.push(check.message);
  if (check.level === "error") report.errors.push(check.message);
}

async function checkSupabase(report: MediaStorageHealthReport, options: Required<HealthOptions>) {
  const url = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/g, "");
  const serviceKey = env("SUPABASE_SERVICE_KEY");
  const bucket = supabaseBucket();

  addCheck(report, "supabaseConfig", {
    ok: has(url) && has(serviceKey),
    level: has(url) && has(serviceKey) ? "ok" : "error",
    code: has(url) && has(serviceKey) ? undefined : "missing_supabase_storage_env",
    message: has(url) && has(serviceKey)
      ? `Supabase Storage env is configured for bucket '${bucket}'.`
      : "Supabase Storage env is missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY.",
  });

  if (!has(url) || !has(serviceKey) || !options.remote) return;

  try {
    const { response, json } = await fetchJson(
      options.fetchImpl,
      `${url}/storage/v1/bucket/${encodeURIComponent(bucket)}`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          accept: "application/json",
        },
      },
    );
    const message = safeErrorMessage(json, response.ok ? "Supabase Storage bucket is reachable." : "Supabase Storage bucket check failed.");
    const isQuota = response.status === 402 || /quota|exceed/i.test(message);
    addCheck(report, "supabaseRemote", {
      ok: response.ok,
      level: response.ok ? "ok" : isQuota ? "error" : "warning",
      status: response.status,
      code: response.ok ? undefined : isQuota ? "supabase_storage_quota_restricted" : "supabase_storage_unreachable",
      message: response.ok
        ? `Supabase Storage bucket '${bucket}' is reachable.`
        : `Supabase Storage bucket '${bucket}' returned HTTP ${response.status}: ${message}`,
    });
    if (isQuota) {
      report.recommendations.push("Move new media writes to Cloudflare R2 before resuming heavy publishing, or wait for Supabase quota reset before legacy media migration.");
    }
  } catch (error) {
    addCheck(report, "supabaseRemote", {
      ok: false,
      level: "warning",
      code: "supabase_storage_probe_failed",
      message: `Supabase Storage probe failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

function normalizeR2Buckets(result: unknown): Array<{ name?: string }> {
  if (Array.isArray(result)) return result as Array<{ name?: string }>;
  if (result && typeof result === "object") {
    const data = result as Record<string, unknown>;
    if (Array.isArray(data.buckets)) return data.buckets as Array<{ name?: string }>;
  }
  return [];
}

async function checkR2(report: MediaStorageHealthReport, options: Required<HealthOptions>) {
  const accountId = env("R2_ACCOUNT_ID") || env("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = env("CLOUDFLARE_API_TOKEN");
  const accessKeyId = env("R2_ACCESS_KEY_ID") || env("CLOUDFLARE_R2_ACCESS_KEY_ID");
  const secretAccessKey = env("R2_SECRET_ACCESS_KEY") || env("CLOUDFLARE_R2_SECRET_ACCESS_KEY");
  const bucket = r2Bucket();
  const publicBaseUrl = getPublicMediaBaseUrl();
  const missing = [
    ["account id", accountId],
    ["access key id", accessKeyId],
    ["secret access key", secretAccessKey],
    ["bucket", bucket],
    ["public base url", publicBaseUrl],
  ].filter(([, value]) => !has(value)).map(([label]) => label);

  addCheck(report, "r2Config", {
    ok: missing.length === 0,
    level: missing.length === 0 ? "ok" : "error",
    code: missing.length === 0 ? undefined : "missing_r2_storage_env",
    message: missing.length === 0
      ? `R2 env is configured for bucket '${bucket}'.`
      : `R2 env is incomplete: missing ${missing.join(", ")}.`,
  });

  if (!options.remote) return;
  if (!has(accountId) || !has(apiToken)) {
    addCheck(report, "r2Dashboard", {
      ok: false,
      level: "warning",
      code: "missing_cloudflare_api_env",
      message: "Cloudflare API env is missing, so R2 account/bucket status could not be verified.",
    });
    return;
  }

  try {
    const { response, json } = await fetchJson(
      options.fetchImpl,
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${apiToken}`,
          accept: "application/json",
        },
      },
    );
    const message = safeErrorMessage(json, response.ok ? "R2 bucket list is reachable." : "R2 bucket list failed.");
    const r2NotEnabled = response.status === 403 && /enable R2|not enabled/i.test(message);
    if (!response.ok) {
      addCheck(report, "r2Dashboard", {
        ok: false,
        level: r2NotEnabled ? "error" : "warning",
        status: response.status,
        code: r2NotEnabled ? "r2_not_enabled" : "r2_dashboard_unreachable",
        message: `Cloudflare R2 bucket list returned HTTP ${response.status}: ${message}`,
      });
      if (r2NotEnabled) {
        report.recommendations.push("Enable R2 once in the Cloudflare dashboard, then rerun Cloudflare bootstrap to create/verify media buckets.");
      }
      return;
    }

    const result = json && typeof json === "object" ? (json as Record<string, unknown>).result : null;
    const buckets = normalizeR2Buckets(result);
    const bucketExists = has(bucket) && buckets.some((item) => item.name === bucket);
    addCheck(report, "r2Dashboard", {
      ok: bucketExists,
      level: bucketExists ? "ok" : "error",
      status: response.status,
      code: bucketExists ? undefined : "r2_bucket_missing",
      message: bucketExists
        ? `Cloudflare R2 bucket '${bucket}' exists.`
        : `Cloudflare R2 is enabled, but bucket '${bucket || "(unset)"}' was not found.`,
    });
    if (!bucketExists) {
      report.recommendations.push("Create the configured R2 bucket or update CLOUDFLARE_R2_PROD_BUCKET/R2_BUCKET before switching MEDIA_STORAGE_PROVIDER=r2.");
    }
  } catch (error) {
    addCheck(report, "r2Dashboard", {
      ok: false,
      level: "warning",
      code: "r2_dashboard_probe_failed",
      message: `Cloudflare R2 dashboard probe failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function checkWriteProbe(report: MediaStorageHealthReport, options: Required<HealthOptions>) {
  if (!options.writeProbe) return;

  if (!isMediaStorageConfigured()) {
    addCheck(report, "writeProbe", {
      ok: false,
      level: "error",
      code: "media_storage_write_probe_not_configured",
      message: "Media storage write probe was requested, but the active provider is not fully configured.",
    });
    return;
  }

  const probeBody = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
  const objectKey = "health/media-storage-probe.png";

  try {
    const publicUrl = await uploadBufferToMediaStorage({
      buffer: probeBody,
      mime: "image/png",
      ext: "png",
      objectKey,
    });

    if (!publicUrl) {
      addCheck(report, "writeProbe", {
        ok: false,
        level: "error",
        code: "media_storage_write_probe_upload_failed",
        message: "Media storage write probe upload failed. Check provider write credentials and quota.",
      });
      return;
    }

    const { response, text } = await fetchText(
      options.fetchImpl,
      `${publicUrl}${publicUrl.includes("?") ? "&" : "?"}healthProbe=${Date.now()}`,
      { method: "GET", headers: { accept: "image/png,*/*" } },
      15000,
    );

    addCheck(report, "writeProbe", {
      ok: response.ok,
      level: response.ok ? "ok" : "error",
      status: response.status,
      code: response.ok ? undefined : "media_storage_write_probe_public_read_failed",
      message: response.ok
        ? `Media storage write probe uploaded and is publicly readable at ${publicUrl}.`
        : `Media storage write probe uploaded but public read returned HTTP ${response.status}: ${text.slice(0, 180) || response.statusText}`,
    });
    if (!response.ok) {
      report.recommendations.push("Fix the public media domain/base URL before switching high-volume uploads to this provider.");
    }
  } catch (error) {
    addCheck(report, "writeProbe", {
      ok: false,
      level: "error",
      code: "media_storage_write_probe_failed",
      message: `Media storage write probe failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

export async function checkMediaStorageHealth(options: HealthOptions = {}): Promise<MediaStorageHealthReport> {
  const provider = getMediaStorageProvider();
  const report: MediaStorageHealthReport = {
    ok: false,
    provider,
    configured: isMediaStorageConfigured(),
    generatedAt: new Date().toISOString(),
    checks: {},
    warnings: [],
    errors: [],
    recommendations: [],
  };
  const normalizedOptions: Required<HealthOptions> = {
    remote: options.remote ?? true,
    writeProbe: options.writeProbe ?? false,
    fetchImpl: options.fetchImpl ?? fetch,
  };

  if (provider === "r2") {
    await checkR2(report, normalizedOptions);
  } else {
    await checkSupabase(report, normalizedOptions);
    if (env("CLOUDFLARE_API_TOKEN") || env("CLOUDFLARE_R2_PROD_BUCKET") || env("R2_BUCKET")) {
      await checkR2(report, normalizedOptions);
    }
  }

  await checkWriteProbe(report, normalizedOptions);

  report.ok = Object.values(report.checks).every((check) => check.level !== "error");
  if (!report.ok && report.recommendations.length === 0) {
    report.recommendations.push("Fix the failing media storage checks before enabling high-volume image uploads.");
  }
  return report;
}

export function summarizeMediaStorageHealth(report: MediaStorageHealthReport): MediaStorageRunSummary {
  return {
    ok: report.ok,
    provider: report.provider,
    configured: report.configured,
    errors: report.errors.slice(0, 3),
    warnings: report.warnings.slice(0, 3),
    recommendations: report.recommendations.slice(0, 3),
  };
}

export async function getMediaStorageRunSummary(options: HealthOptions = {}): Promise<MediaStorageRunSummary> {
  return summarizeMediaStorageHealth(await checkMediaStorageHealth(options));
}

export function formatMediaStorageHealthSection(report: MediaStorageHealthReport): string {
  const status = report.ok ? "OK" : "ACTION REQUIRED";
  const lines = [
    "<b>Media Storage Health</b>",
    `Status: ${escapeTelegramHtml(status)}`,
    `Provider: ${escapeTelegramHtml(report.provider)}`,
    `Configured: ${report.configured ? "yes" : "no"}`,
    "",
    ...Object.entries(report.checks).map(([name, check]) =>
      `${check.ok ? "OK" : check.level.toUpperCase()} ${escapeTelegramHtml(name)}: ${escapeTelegramHtml(check.message)}`),
  ];
  if (report.recommendations.length > 0) {
    lines.push("", "<b>Next</b>", ...report.recommendations.slice(0, 3).map((item) => `- ${escapeTelegramHtml(item)}`));
  }
  return lines.join("\n");
}
