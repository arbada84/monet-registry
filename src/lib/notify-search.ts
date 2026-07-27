import { getBaseUrl } from "@/lib/get-base-url";

export type IndexNowAction = "URL_UPDATED" | "URL_DELETED";

export interface IndexNowNotifyResult {
  ok: boolean;
  submitted: boolean;
  skipped: boolean;
  status?: number;
  url: string;
  action: IndexNowAction;
  reason?: string;
  error?: string;
}

function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  return undefined;
}

function indexNowApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) headers.Authorization = `Bearer ${cronSecret}`;
  return headers;
}

/** Google sitemap ping endpoint is retired; keep this as a no-network compatibility shim. */
export async function submitGooglePing() {
  const baseUrl = getBaseUrl();
  return {
    ok: true,
    submitted: false,
    skipped: true,
    url: `${baseUrl}/sitemap.xml`,
    reason: "Google sitemap ping은 종료되었습니다. Search Console에 sitemap을 등록해 자동 수집되게 합니다.",
  };
}

/** IndexNow 호출 (실패해도 무시) — no(기사번호) 우선, 없으면 id(UUID) */
export async function notifyIndexNow(
  articleIdOrNo: string | number,
  action: IndexNowAction = "URL_UPDATED",
): Promise<IndexNowNotifyResult> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/article/${articleIdOrNo}`;

  try {
    const res = await fetch(`${baseUrl}/api/seo/index-now`, {
      method: "POST",
      headers: indexNowApiHeaders(),
      body: JSON.stringify({ url, action }),
      signal: timeoutSignal(5000),
    });
    const data = await res.json().catch(() => ({})) as {
      success?: boolean;
      skipped?: boolean;
      reason?: string;
      error?: string;
      indexNow?: { submitted?: boolean; status?: number };
    };

    return {
      ok: res.ok && data.success !== false,
      submitted: Boolean(data.indexNow?.submitted),
      skipped: Boolean(data.skipped),
      status: data.indexNow?.status ?? res.status,
      url,
      action,
      reason: data.reason,
      error: data.error,
    };
  } catch {
    return {
      ok: false,
      submitted: false,
      skipped: false,
      url,
      action,
      error: "IndexNow 요청 중 오류가 발생했습니다.",
    };
  }
}
