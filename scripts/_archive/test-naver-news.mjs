// 네이버 뉴스 검색 API로 과거 문화 기사 검색 테스트
// 방법 1: 네이버 검색 RSS
const queries = [
  { q: "문화재단", ds: "2023.01.01", de: "2023.01.31" },
  { q: "문화예술", ds: "2022.10.01", de: "2022.10.31" },
];

for (const { q, ds, de } of queries) {
  console.log(`\n=== "${q}" ${ds} ~ ${de} ===`);

  // 네이버 뉴스 검색 페이지 (날짜 필터)
  const nso = `p:from${ds.replace(/\./g, "")}to${de.replace(/\./g, "")}`;
  const url = `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(q)}&sm=tab_opt&sort=1&photo=0&field=0&pd=3&ds=${ds}&de=${de}&nso=so:dd,${nso},a:all`;

  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });
    const html = await r.text();
    console.log(`HTML length: ${html.length}`);

    // 네이버 뉴스 링크 추출 (naver.com/article/)
    const articleLinks = [...new Set([...html.matchAll(/href="(https:\/\/n\.news\.naver\.com\/[^"]+)"/gi)].map(m => m[1]))];
    console.log(`Naver article links: ${articleLinks.length}`);
    articleLinks.slice(0, 5).forEach(u => console.log(`  ${u.substring(0, 120)}`));

    // 원본 기사 링크
    const origLinks = [...new Set([...html.matchAll(/href="(https?:\/\/(?!search\.naver|n\.news\.naver|naver\.com)[^"]*(?:news|article|view|press)[^"]*)"/gi)].map(m => m[1]))];
    console.log(`Original links: ${origLinks.length}`);
    origLinks.slice(0, 5).forEach(u => console.log(`  ${u.substring(0, 120)}`));

    // 제목 추출
    const titles = [...html.matchAll(/class="news_tit"[^>]*title="([^"]+)"/gi)].map(m => m[1]);
    console.log(`Titles: ${titles.length}`);
    titles.slice(0, 5).forEach(t => console.log(`  ${t.substring(0, 70)}`));

  } catch (e) {
    console.log(`Error: ${e.message?.substring(0, 80)}`);
  }

  await new Promise(r => setTimeout(r, 500));
}

// 방법 2: 네이버 뉴스 개별 기사 접근 테스트
console.log("\n=== 네이버 뉴스 개별 기사 접근 테스트 ===");
const testArticle = "https://n.news.naver.com/mnews/article/001/0013708800";
try {
  const r = await fetch(testArticle, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
    signal: AbortSignal.timeout(10000),
  });
  const html = await r.text();
  console.log(`HTML: ${html.length}`);

  // og:title, og:image, og:description
  const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i)?.[1];
  const ogImg = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i)?.[1];
  const ogDesc = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i)?.[1];
  console.log(`Title: ${ogTitle?.substring(0, 80)}`);
  console.log(`Image: ${ogImg?.substring(0, 100)}`);
  console.log(`Desc: ${ogDesc?.substring(0, 100)}`);

  // 본문
  const bodyMatch = html.match(/id="dic_area"[^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/id="newsct_article"[^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/class="[^"]*article[_-]?body[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (bodyMatch) {
    const text = bodyMatch[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    console.log(`Body: ${text.length} chars`);
    console.log(`Preview: ${text.substring(0, 200)}`);
  } else {
    console.log("Body: NOT FOUND");
  }
} catch (e) {
  console.log(`Error: ${e.message}`);
}
