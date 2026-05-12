export const DEFAULT_PRESS_IMAGE_MAX_PER_ARTICLE = 3;

const NOISY_IMAGE_PATTERNS = [
  /\/images?\/icon\//i,
  /\/images?\/v\d+\/common\//i,
  /\/common\/open_type/i,
  /\/rss\//i,
  /btn[_-]/i,
  /button/i,
  /badge/i,
  /blank/i,
  /spacer/i,
  /pixel/i,
  /tracking/i,
  /logo/i,
  /icon/i,
  /sns/i,
  /facebook/i,
  /twitter/i,
  /kakao/i,
  /naver/i,
];

export function getPressImageLimit(value?: string | number | null): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed);
  return DEFAULT_PRESS_IMAGE_MAX_PER_ARTICLE;
}

export function isManagedPressImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host.endsWith("supabase.co")
      || host.includes("r2.dev")
      || host.includes("r2.cloudflarestorage.com")
      || host.endsWith("culturepeople.co.kr");
  } catch {
    return false;
  }
}

export function isNoisyPressImageUrl(url: string): boolean {
  if (!url || !/^https?:\/\//i.test(url)) return true;
  try {
    const parsed = new URL(url);
    const target = `${parsed.hostname}${parsed.pathname}`.toLowerCase();
    return NOISY_IMAGE_PATTERNS.some((pattern) => pattern.test(target));
  } catch {
    return true;
  }
}

export function filterPressImageUrls(
  urls: string[],
  options: { maxImages?: number; keepManaged?: boolean } = {},
): string[] {
  const maxImages = getPressImageLimit(options.maxImages);
  const keepManaged = options.keepManaged ?? true;
  const result: string[] = [];
  const seen = new Set<string>();

  for (const rawUrl of urls) {
    const url = String(rawUrl || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    if (!/^https?:\/\//i.test(url)) continue;
    if (keepManaged && isManagedPressImageUrl(url)) {
      result.push(url);
    } else if (!isNoisyPressImageUrl(url)) {
      result.push(url);
    }
    if (maxImages > 0 && result.length >= maxImages) break;
  }

  return result;
}

export function cleanEmptyImageWrappers(html: string): string {
  return html
    .replace(/<figure\b[^>]*>\s*<\/figure>/gi, "")
    .replace(/<p>\s*<\/p>/gi, "")
    .replace(/(?:<br\s*\/?>\s*){3,}/gi, "<br><br>")
    .trim();
}
