/**
 * 외부 이미지 URL → Supabase Storage 재업로드 유틸리티
 * 브라우저(클라이언트)에서만 사용
 */

const OWN_HOSTS = ["supabase", "culturepeople.co.kr"];

function isOwnUrl(url: string): boolean {
  return OWN_HOSTS.some((h) => url.includes(h));
}

/**
 * 브라우저에서 직접 이미지를 Blob으로 가져온다.
 * - fetch CORS 모드 시도 (Wikimedia, imgur 등 CORS 허용 CDN에서 작동)
 * - 실패 시 null 반환 → 서버 사이드 URL 전송으로 폴백
 */
async function fetchBlobFromBrowser(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

/**
 * 이미지 blob을 /api/upload/image 에 multipart로 업로드
 */
async function uploadBlob(blob: Blob, origUrl: string): Promise<{ success: boolean; url?: string; error?: string }> {
  const ext = origUrl.match(/\.(png|gif|webp)$/i)?.[1]?.toLowerCase() ?? "jpg";
  const formData = new FormData();
  formData.append("file", blob, `image.${ext}`);
  const resp = await fetch("/api/upload/image", { method: "POST", body: formData });
  return resp.json();
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
): Promise<{ html: string; uploaded: number; failed: number; firstError?: string }> {
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
  let firstError: string | undefined;

  for (let i = 0; i < urls.length; i += 5) {
    const batch = urls.slice(i, i + 5);
    await Promise.all(
      batch.map(async (origUrl) => {
        try {
          // 1) 브라우저에서 직접 CORS fetch → blob 업로드 (CDN 차단 우회)
          const blob = await fetchBlobFromBrowser(origUrl);
          const data = blob
            ? await uploadBlob(blob, origUrl)
            : await fetch("/api/upload/image", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: origUrl }),
              }).then((r) => r.json());

          if (data.success && data.url) {
            urlMap.set(origUrl, data.url);
          } else {
            failed++;
            if (!firstError) firstError = data.error || "업로드 실패";
          }
        } catch (e) {
          failed++;
          if (!firstError) firstError = e instanceof Error ? e.message : "네트워크 오류";
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

  return { html: result, uploaded, failed, firstError };
}

/**
 * 단일 이미지 URL을 Supabase에 재업로드한다.
 * 실패 시 원본 URL 반환.
 */
export async function reuploadImageUrl(url: string): Promise<string> {
  if (!url || isOwnUrl(url)) return url;
  try {
    // 브라우저 CORS fetch 먼저 시도, 실패 시 서버 URL 전송
    const blob = await fetchBlobFromBrowser(url);
    const data = blob
      ? await uploadBlob(blob, url)
      : await fetch("/api/upload/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        }).then((r) => r.json());
    if (data.success && data.url) return data.url;
  } catch { /* ignore */ }
  return url;
}
