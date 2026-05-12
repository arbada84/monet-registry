import "server-only";

export interface SupabaseHealthResult {
  configured: boolean;
  ok: boolean;
  status?: number;
  articleCount?: number | null;
  siteSettingsReachable?: boolean;
  errorCode?: "not_configured" | "quota_exceeded" | "request_failed";
  message?: string;
}

function getSupabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  return { url, key };
}

function headers(key: string): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Prefer: "count=exact",
  };
}

function parseCount(contentRange: string | null): number | null {
  if (!contentRange || !contentRange.includes("/")) return null;
  const total = Number(contentRange.split("/").pop());
  return Number.isFinite(total) ? total : null;
}

function classifySupabaseError(status: number, body: string): Pick<SupabaseHealthResult, "errorCode" | "message"> {
  const normalized = body.toLowerCase();
  if (status === 402 && normalized.includes("exceed_storage_size_quota")) {
    return {
      errorCode: "quota_exceeded",
      message: "Supabase project is restricted because storage size quota was exceeded.",
    };
  }

  return {
    errorCode: "request_failed",
    message: `Supabase request failed with HTTP ${status}.`,
  };
}

export async function checkSupabaseHealth(): Promise<SupabaseHealthResult> {
  const env = getSupabaseEnv();
  if (!env) {
    return {
      configured: false,
      ok: false,
      errorCode: "not_configured",
      message: "Supabase URL or API key is not configured.",
    };
  }

  try {
    const articles = await fetch(`${env.url}/rest/v1/articles?select=id&limit=1`, {
      headers: headers(env.key),
      cache: "no-store",
    });

    if (!articles.ok) {
      const body = await articles.text().catch(() => "");
      return {
        configured: true,
        ok: false,
        status: articles.status,
        articleCount: null,
        siteSettingsReachable: false,
        ...classifySupabaseError(articles.status, body),
      };
    }

    const settings = await fetch(`${env.url}/rest/v1/site_settings?select=key&limit=1`, {
      headers: headers(env.key),
      cache: "no-store",
    });

    return {
      configured: true,
      ok: settings.ok,
      status: settings.ok ? 200 : settings.status,
      articleCount: parseCount(articles.headers.get("content-range")),
      siteSettingsReachable: settings.ok,
      ...(settings.ok ? {} : classifySupabaseError(settings.status, await settings.text().catch(() => ""))),
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      errorCode: "request_failed",
      message: error instanceof Error ? error.message : "Supabase request failed.",
    };
  }
}
