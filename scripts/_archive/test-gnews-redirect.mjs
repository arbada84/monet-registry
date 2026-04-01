// Google News 리다이렉트 URL → 원본 기사 URL 추출 테스트
const gnUrl = "https://news.google.com/rss/search?q=" + encodeURIComponent("문화재단 after:2023-01-01 before:2023-02-01") + "&hl=ko&gl=KR&ceid=KR:ko";

const r = await fetch(gnUrl, {
  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  signal: AbortSignal.timeout(15000),
});
const xml = await r.text();
const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];

for (const item of items.slice(0, 5)) {
  const title = item[1].match(/<title>([\s\S]*?)<\/title>/i)?.[1]
    ?.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
  const gnLink = item[1].match(/<link>\s*(https?[^\s<]+)/i)?.[1]?.trim();
  const pubDate = item[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim();
  const source = item[1].match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1]?.trim();

  console.log(`\nTitle: ${title?.substring(0, 70)}`);
  console.log(`Source: ${source} | ${pubDate}`);
  console.log(`GN Link: ${gnLink?.substring(0, 80)}`);

  try {
    const resp = await fetch(gnLink, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    console.log(`Final URL: ${resp.url?.substring(0, 120)}`);
    console.log(`Status: ${resp.status}`);
    const html = await resp.text();
    console.log(`HTML length: ${html.length}`);

    // og:image
    const ogImg = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i)?.[1] ||
                  html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/i)?.[1];
    console.log(`OG Image: ${ogImg?.substring(0, 100) || "N/A"}`);

    // article body patterns
    const bodyMatch = html.match(/class="[^"]*article[_-]?body[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
      html.match(/class="[^"]*article[_-]?content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (bodyMatch) {
      const text = bodyMatch[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      console.log(`Body: ${text.length} chars - ${text.substring(0, 100)}...`);
    } else {
      console.log("Body: pattern not matched");
    }
  } catch (e) {
    console.log(`Error: ${e.message?.substring(0, 80)}`);
  }
}
