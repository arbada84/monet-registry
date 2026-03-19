/** 태그 문자열 파싱: JSON 배열 '["a","b"]' 또는 쉼표 구분 'a,b' 모두 지원 */
export function parseTags(tags: string | null | undefined): string[] {
  if (!tags || !tags.trim()) return [];
  const trimmed = tags.trim();
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) return arr.map((t: string) => String(t).trim()).filter(Boolean);
    } catch { /* JSON 파싱 실패 시 쉼표 구분으로 폴백 */ }
  }
  return trimmed.split(",").map((t) => t.trim()).filter(Boolean);
}

/** HTML 엔티티 디코딩 (서버사이드 공통) */
export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
