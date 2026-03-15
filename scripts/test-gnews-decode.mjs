// Google News 인코딩된 URL에서 원본 URL 디코딩 시도
const encoded = "CBMiYkFVX3lxTE1tek5tLTR3UkV1WEZzeHNoZWdiWkdaOTFLZUdKWUxhMFFseVpnUGp5MFBWUkpqTXp1UVVRcGxOWXpFcDNpSzJ5R0MtWEdXekxwdWhXUXpKM0I3ZjhDUldiYUd3";

// base64url → base64 → binary
const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
const padded = b64 + "=".repeat((4 - b64.length % 4) % 4);
const buf = Buffer.from(padded, "base64");
console.log("Decoded bytes:", buf.length);
console.log("Hex:", buf.toString("hex").substring(0, 200));

// 문자열로 변환해서 URL 찾기
const str = buf.toString("utf8");
console.log("UTF8:", str.substring(0, 500));

// URL 패턴 검색
const urlMatch = str.match(/https?:\/\/[^\x00-\x1f\x7f]+/);
console.log("URL found:", urlMatch?.[0]);

// 다른 방식: Google News 페이지에서 원본 URL 찾기
console.log("\n=== Google News 페이지에서 원본 URL 찾기 ===");
const gnLink = `https://news.google.com/rss/articles/${encoded}?oc=5`;
const resp = await fetch(gnLink, {
  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  signal: AbortSignal.timeout(10000),
});
const html = await resp.text();

// canonical, og:url, redirect 찾기
const canonical = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/i)?.[1];
const ogUrl = html.match(/<meta[^>]*property="og:url"[^>]*content="([^"]+)"/i)?.[1] ||
              html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:url"/i)?.[1];
const metaRefresh = html.match(/<meta[^>]*http-equiv="refresh"[^>]*content="[^"]*url=([^"]+)"/i)?.[1];
const jsRedirect = html.match(/window\.location\s*=\s*["']([^"']+)["']/i)?.[1];
const dataUrl = html.match(/data-redirect="([^"]+)"/i)?.[1] || html.match(/data-url="([^"]+)"/i)?.[1];

console.log("Canonical:", canonical?.substring(0, 120));
console.log("og:url:", ogUrl?.substring(0, 120));
console.log("Meta refresh:", metaRefresh?.substring(0, 120));
console.log("JS redirect:", jsRedirect?.substring(0, 120));
console.log("Data URL:", dataUrl?.substring(0, 120));

// 페이지 내 외부 URL 모두 찾기 (google.com 제외)
const extUrls = [...html.matchAll(/href="(https?:\/\/(?!news\.google\.com|www\.google\.com|play\.google\.com|accounts\.google\.com)[^"]+)"/gi)]
  .map(m => m[1])
  .filter(u => !u.includes("google.com") && !u.includes("googleapis.com") && !u.includes("gstatic.com"));
console.log("\nExternal URLs found:", extUrls.length);
extUrls.slice(0, 10).forEach(u => console.log("  ", u.substring(0, 120)));
