import { getBaseUrl } from "@/lib/get-base-url";

/** Google 사이트맵 ping (실패해도 무시) */
export async function submitGooglePing() {
  try {
    const baseUrl = getBaseUrl();
    await fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(`${baseUrl}/sitemap.xml`)}`);
  } catch { /* 실패 무시 */ }
}

/** IndexNow 호출 (실패해도 무시) — no(기사번호) 우선, 없으면 id(UUID) */
export async function notifyIndexNow(articleIdOrNo: string | number, action: "URL_UPDATED" | "URL_DELETED" = "URL_UPDATED") {
  try {
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/article/${articleIdOrNo}`;
    await fetch(`${baseUrl}/api/seo/index-now`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, action }),
    });
  } catch {
    // IndexNow 실패는 무시
  }
}
