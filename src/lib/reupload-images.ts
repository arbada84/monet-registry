/**
 * 외부 이미지 URL → Supabase Storage 재업로드 유틸리티
 * 브라우저(클라이언트)에서만 사용
 */

const OWN_HOSTS = ["supabase", "culturepeople.co.kr"];

function isOwnUrl(url: string): boolean {
  return OWN_HOSTS.some((h) => url.includes(h));
}

/**
 * HTML 본문의 <img src="..."> 외부 URL을 Supabase에 재업로드하고 URL을 교체한다.
 * - 이미 Supabase/자사 URL이면 스킵
 * - 업로드 실패 시 원본 URL 유지 (깨질 수 있음을 UI에서 별도 안내)
 * - 5개씩 병렬 처리
 */
export async function reuploadImagesInHtml(
  html: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ html: string; uploaded: number; failed: number }> {
  // img src만 추출 (iframe/video src 제외)
  const urlSet = new Set<string>();
  const imgSrcRegex = /<img[^>]+src="(https?:\/\/[^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = imgSrcRegex.exec(html)) !== null) {
    if (!isOwnUrl(m[1])) urlSet.add(m[1]);
  }

  const urls = [...urlSet];
  if (urls.length === 0) return { html, uploaded: 0, failed: 0 };

  const urlMap = new Map<string, string>();
  let done = 0;
  let failed = 0;

  for (let i = 0; i < urls.length; i += 5) {
    const batch = urls.slice(i, i + 5);
    await Promise.all(
      batch.map(async (origUrl) => {
        try {
          const resp = await fetch("/api/upload/image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: origUrl }),
          });
          const data = await resp.json();
          if (data.success && data.url) {
            urlMap.set(origUrl, data.url);
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
        done++;
        onProgress?.(done, urls.length);
      })
    );
  }

  const uploaded = urlMap.size;
  const result = html.replace(/<img([^>]+)src="(https?:\/\/[^"]+)"/gi, (full, attrs, url) => {
    const replaced = urlMap.get(url);
    return replaced ? `<img${attrs}src="${replaced}"` : full;
  });

  return { html: result, uploaded, failed };
}

/**
 * 단일 이미지 URL을 Supabase에 재업로드한다.
 * 실패 시 원본 URL 반환.
 */
export async function reuploadImageUrl(url: string): Promise<string> {
  if (!url || isOwnUrl(url)) return url;
  try {
    const resp = await fetch("/api/upload/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await resp.json();
    if (data.success && data.url) return data.url;
  } catch { /* ignore */ }
  return url;
}
