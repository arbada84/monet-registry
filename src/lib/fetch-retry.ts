/**
 * 재시도 가능한 fetch 래퍼
 * 외부 API 호출 시 일시 오류(네트워크, 5xx)에 대해 최대 N회 재시도
 */
export async function fetchWithRetry(
  url: string,
  opts?: RequestInit & { maxRetries?: number; retryDelayMs?: number }
): Promise<Response> {
  const { maxRetries = 2, retryDelayMs = 1000, ...fetchOpts } = opts ?? {};
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, fetchOpts);
      // 5xx 서버 에러 시 재시도 (4xx는 재시도 불필요)
      if (resp.status >= 500 && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1)));
        continue;
      }
      return resp;
    } catch (e) {
      lastError = e;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1)));
      }
    }
  }
  throw lastError;
}
