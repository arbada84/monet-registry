// 뉴스와이어 문화 카테고리 검색 테스트
// 과거 기사 접근 가능한지 확인

// 1. 뉴스와이어 검색 페이지 테스트
const searchUrl = "https://www.newswire.co.kr/?md=A10&cat=1200&sdate=2023-01-01&edate=2023-01-31";
console.log("Searching:", searchUrl);
const r = await fetch(searchUrl, {
  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  signal: AbortSignal.timeout(15000),
});
const html = await r.text();
console.log("HTML length:", html.length);

// 기사 링크 추출
const links = [...html.matchAll(/newsRead\.php\?no=(\d+)/g)].map(m => m[1]);
console.log("Article IDs:", [...new Set(links)].slice(0, 10));

// 2. 개별 기사 접근 테스트
if (links.length > 0) {
  const articleUrl = `https://www.newswire.co.kr/newsRead.php?no=${links[0]}`;
  console.log("\nFetching article:", articleUrl);
  const ar = await fetch(articleUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    signal: AbortSignal.timeout(15000),
  });
  const ahtml = await ar.text();
  console.log("Article HTML length:", ahtml.length);

  // 제목
  const title = ahtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]*>/g, "").trim() ||
    ahtml.match(/<title>(.*?)<\/title>/i)?.[1]?.trim();
  console.log("Title:", title?.substring(0, 80));

  // 날짜
  const date = ahtml.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ||
    ahtml.match(/(\d{4}\.\d{2}\.\d{2})/)?.[1];
  console.log("Date:", date);

  // 본문
  const bodyMatch = ahtml.match(/class="[^"]*article[^"]*body[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
    ahtml.match(/class="[^"]*view[_-]?content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
    ahtml.match(/class="[^"]*news[_-]?content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
    ahtml.match(/id="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (bodyMatch) {
    const text = bodyMatch[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    console.log("Body length:", text.length);
    console.log("Preview:", text.substring(0, 200));
  } else {
    console.log("Body: NOT FOUND with standard patterns");
    // 모든 class 패턴 출력
    const classes = [...ahtml.matchAll(/class="([^"]*(?:content|article|view|news|body|text)[^"]*)"/gi)].map(m => m[1]);
    console.log("Content classes:", [...new Set(classes)].slice(0, 15));
  }

  // 이미지
  const imgs = [...ahtml.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/gi)]
    .map(m => m[1])
    .filter(u => !u.includes("icon") && !u.includes("logo") && !u.includes("btn") && !u.includes("common") && !u.includes("ad_"));
  console.log("Images:", imgs.slice(0, 3));
}

// 3. 다른 날짜 범위도 테스트
const testUrl2 = "https://www.newswire.co.kr/?md=A10&cat=1200&sdate=2022-10-01&edate=2022-10-31";
const r2 = await fetch(testUrl2, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) });
const html2 = await r2.text();
const links2 = [...new Set([...html2.matchAll(/newsRead\.php\?no=(\d+)/g)].map(m => m[1]))];
console.log("\n2022-10 articles:", links2.length, "건");
