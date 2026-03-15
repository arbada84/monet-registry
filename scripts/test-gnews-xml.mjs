// Google News RSS XML 구조 분석 - 원본 URL 추출 방법 확인
const gnUrl = "https://news.google.com/rss/search?q=" + encodeURIComponent("문화재단 after:2023-01-01 before:2023-02-01") + "&hl=ko&gl=KR&ceid=KR:ko";

const r = await fetch(gnUrl, {
  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  signal: AbortSignal.timeout(15000),
});
const xml = await r.text();

// 첫 번째 item 전체 XML 출력
const firstItem = xml.match(/<item>([\s\S]*?)<\/item>/i)?.[1];
console.log("=== First item XML ===");
console.log(firstItem?.substring(0, 2000));

// source url 속성 확인
const sourceUrls = [...xml.matchAll(/<source[^>]*url="([^"]+)"[^>]*>/gi)].map(m => m[1]);
console.log("\n=== Source URLs ===");
sourceUrls.slice(0, 5).forEach(u => console.log(u));

// 모든 URL 패턴 찾기
const urls = [...(firstItem || "").matchAll(/https?:\/\/[^\s<>"']+/g)].map(m => m[0]);
console.log("\n=== All URLs in first item ===");
urls.forEach(u => console.log(u));
