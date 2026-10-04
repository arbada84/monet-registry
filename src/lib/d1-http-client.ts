import "server-only";

export interface D1HttpConfig {
  accountId: string;
  databaseId: string;
  apiToken: string;
  configured: boolean;
  endpoint: string;
  missing: string[];
}

export interface D1HttpQueryOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface D1HttpQueryResult<T = Record<string, unknown>> {
  success: boolean;
  rows: T[];
  meta?: Record<string, unknown>;
}

interface CloudflareD1QueryItem {
  success?: boolean;
  results?: unknown[];
  meta?: Record<string, unknown>;
  error?: string;
}

interface CloudflareD1QueryResponse {
  success?: boolean;
  errors?: Array<{ message?: string }>;
  result?: CloudflareD1QueryItem | CloudflareD1QueryItem[];
}

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const DEFAULT_TIMEOUT_MS = 12000;
let quotaBlockedUntil = 0;
let quotaBlockedEndpoint = "";

export class D1QuotaError extends Error {
  constructor(public retryAfter = 60) {
    super("D1 daily operation limit exceeded; temporarily unavailable");
    this.name = "D1QuotaError";
  }
}

function clean(value?: string): string {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

function missingConfig(config: Pick<D1HttpConfig, "accountId" | "databaseId" | "apiToken">): string[] {
  return [
    !config.accountId ? "CLOUDFLARE_ACCOUNT_ID" : "",
    !config.databaseId ? "CLOUDFLARE_D1_DATABASE_ID or D1_DATABASE_ID" : "",
    !config.apiToken ? "CLOUDFLARE_API_TOKEN" : "",
  ].filter(Boolean);
}

function summarizeErrors(json: CloudflareD1QueryResponse): string {
  const errors = Array.isArray(json.errors) ? json.errors : [];
  return errors.map((error) => error.message).filter(Boolean).join("; ") || "unknown error";
}

function withTimeout(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timeout),
  };
}

export function getD1HttpConfig(): D1HttpConfig {
  const accountId = clean(process.env.CLOUDFLARE_ACCOUNT_ID);
  const databaseId = clean(process.env.CLOUDFLARE_D1_DATABASE_ID || process.env.D1_DATABASE_ID);
  const apiToken = clean(process.env.CLOUDFLARE_API_TOKEN);
  const missing = missingConfig({ accountId, databaseId, apiToken });
  const endpoint = accountId && databaseId
    ? `${CLOUDFLARE_API_BASE}/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`
    : "";
  return {
    accountId,
    databaseId,
    apiToken,
    configured: missing.length === 0,
    endpoint,
    missing,
  };
}

export function getD1HttpStatus() {
  const config = getD1HttpConfig();
  return {
    configured: config.configured,
    hasAccountId: Boolean(config.accountId),
    hasDatabaseId: Boolean(config.databaseId),
    hasApiToken: Boolean(config.apiToken),
    missing: config.missing,
  };
}

function normalizeQueryResult<T>(json: CloudflareD1QueryResponse): D1HttpQueryResult<T> {
  if (json.success === false) {
    throw new Error(`Cloudflare D1 query failed: ${summarizeErrors(json)}`);
  }

  const result = Array.isArray(json.result) ? json.result[0] : json.result;
  if (!result) {
    return { success: Boolean(json.success), rows: [] };
  }
  if (result.success === false) {
    throw new Error(`Cloudflare D1 query failed: ${result.error || summarizeErrors(json)}`);
  }

  return {
    success: true,
    rows: Array.isArray(result.results) ? result.results as T[] : [],
    meta: result.meta,
  };
}

export async function d1HttpQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  options: D1HttpQueryOptions = {},
): Promise<D1HttpQueryResult<T>> {
  const config = getD1HttpConfig();
  if (!config.configured) {
    throw new Error(`Cloudflare D1 HTTP API is not configured. Missing: ${config.missing.join(", ")}`);
  }
  if (quotaBlockedEndpoint === config.endpoint && Date.now() < quotaBlockedUntil) {
    throw new D1QuotaError(Math.max(1, Math.ceil((quotaBlockedUntil - Date.now()) / 1000)));
  }

  const timeout = withTimeout(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await (options.fetchImpl || fetch)(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
      signal: timeout.signal,
      cache: "no-store",
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) as CloudflareD1QueryResponse : {};
    if (!response.ok) {
      throw new Error(`Cloudflare D1 query failed with HTTP ${response.status}: ${summarizeErrors(json)}`);
    }
    return normalizeQueryResult<T>(json);
  } catch (error) {
    if (error instanceof Error && /(?:daily|operation|row.?read|row.?write).*(?:limit|quota).*exceed|exceed.*(?:daily|limit|quota)/i.test(error.message)) {
      // Per warm instance only; a short pause also permits paid-plan recovery.
      quotaBlockedEndpoint = config.endpoint;
      quotaBlockedUntil = Date.now() + 60_000;
      throw new D1QuotaError();
    }
    throw error;
  } finally {
    timeout.cancel();
  }
}

export async function d1HttpFirst<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  options: D1HttpQueryOptions = {},
): Promise<T | null> {
  const result = await d1HttpQuery<T>(sql, params, options);
  return result.rows[0] || null;
}

export async function d1HttpHealthCheck(options: D1HttpQueryOptions = {}) {
  const row = await d1HttpFirst<{ ok?: number }>("SELECT 1 AS ok FROM site_settings WHERE key = ? LIMIT 1", ["cp-site-type"], options);
  return {
    ok: true,
    row,
  };
}
