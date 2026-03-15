const searchUrl = "https://www.newswire.co.kr/?md=A10&cat=1200&sdate=2023-01-01&edate=2023-01-31";
const r = await fetch(searchUrl, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }, signal: AbortSignal.timeout(15000) });
const html = await r.text();

// 모든 링크 패턴 확인
const allLinks = [...html.matchAll(/href="([^"]*(?:news|view|article|read|detail)[^"]*)"/gi)].map(m => m[1]);
console.log("All news-like links:", [...new Set(allLinks)].slice(0, 20));

// a 태그 텍스트 추출 (기사 제목 같은 것)
const titles = [...html.matchAll(/<a[^>]*href="([^"]*)"[^>]*>([^<]{10,})<\/a>/gi)]
  .map(m => ({ href: m[1], title: m[2].trim() }))
  .filter(t => t.title.length > 15 && !t.href.includes("javascript"));
console.log("\nTitled links:", titles.slice(0, 10));

// 뉴스와이어 URL 패턴 다시 확인
const nwLinks = [...html.matchAll(/href="([^"]*newswire[^"]*)"/gi)].map(m => m[1]);
console.log("\nnewswire links:", [...new Set(nwLinks)].slice(0, 10));

// /newsRead 패턴
const readLinks = [...html.matchAll(/(?:href="|'|)(\/newsRead[^"'\s>]*)/gi)].map(m => m[1]);
console.log("\nnewsRead links:", [...new Set(readLinks)].slice(0, 10));

// no= 패턴
const noLinks = [...html.matchAll(/no=(\d+)/g)].map(m => m[1]);
console.log("\nno= values:", [...new Set(noLinks)].slice(0, 10));
