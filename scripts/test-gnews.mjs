// Google News RSS 날짜 범위 검색 테스트
// 문화재단 관련 뉴스를 과거 날짜 범위로 검색

const queries = [
  { q: "문화재단", after: "2023-01-01", before: "2023-02-01" },
  { q: "문화예술위원회", after: "2023-03-01", before: "2023-04-01" },
  { q: "콘텐츠진흥원", after: "2022-10-01", before: "2022-11-01" },
];

for (const { q, after, before } of queries) {
  const searchQ = encodeURIComponent(`${q} after:${after} before:${before}`);
  const url = `https://news.google.com/rss/search?q=${searchQ}&hl=ko&gl=KR&ceid=KR:ko`;
  console.log(`\n🔍 "${q}" ${after} ~ ${before}`);

  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(15000),
    });
    const xml = await r.text();

    // RSS 아이템 추출
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
    console.log(`  결과: ${items.length}건`);

    for (const item of items.slice(0, 3)) {
      const title = item[1].match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
      const link = item[1].match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim() ||
                   item[1].match(/<link[^>]*href="([^"]+)"/i)?.[1];
      const pubDate = item[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim();
      const source = item[1].match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1]?.trim();
      console.log(`  📰 ${title?.substring(0, 60)}`);
      console.log(`     ${source} | ${pubDate}`);
      console.log(`     ${link?.substring(0, 80)}`);
    }
  } catch (e) {
    console.log(`  ❌ ${e.message?.substring(0, 60)}`);
  }

  await new Promise(r => setTimeout(r, 500));
}
