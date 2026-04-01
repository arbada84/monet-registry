// 문화체육관광부 보도자료 직접 크롤링 테스트
const url = "https://www.mcst.go.kr/kor/s_notice/press/pressList.jsp?pSeq=&pMenuCD=0302000000&pCurrentPage=1&pTypeDept=&pSearchType=01&pSearchWord=";
console.log("Fetching MCST press list...");
const r = await fetch(url, {
  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  signal: AbortSignal.timeout(15000),
});
const html = await r.text();
console.log("HTML length:", html.length);

// 기사 링크 패턴
const pressLinks = [...html.matchAll(/pressView\.jsp[^"']*/gi)].map(m => m[0]);
console.log("Press links:", [...new Set(pressLinks)].slice(0, 5));

// pSeq 값 추출
const seqs = [...html.matchAll(/pSeq=(\d+)/g)].map(m => m[1]);
console.log("pSeq values:", [...new Set(seqs)].slice(0, 10));

// 제목 패턴
const titles = [...html.matchAll(/<td class="[^"]*subject[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/gi)]
  .map(m => m[1].replace(/<[^>]*>/g, "").trim());
console.log("Titles:", titles.slice(0, 5));

// 페이지에서 날짜 추출
const dates = [...html.matchAll(/(\d{4}\.\d{2}\.\d{2})/g)].map(m => m[1]);
console.log("Dates:", [...new Set(dates)].slice(0, 5));

// 상세 페이지 테스트
if (seqs.length > 0) {
  const detailUrl = `https://www.mcst.go.kr/kor/s_notice/press/pressView.jsp?pSeq=${seqs[0]}`;
  console.log("\nFetching detail:", detailUrl);
  const dr = await fetch(detailUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    signal: AbortSignal.timeout(15000),
  });
  const dhtml = await dr.text();
  console.log("Detail HTML length:", dhtml.length);

  // 제목
  const title = dhtml.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1]?.replace(/<[^>]*>/g, "").trim() ||
    dhtml.match(/<title>(.*?)<\/title>/i)?.[1]?.trim();
  console.log("Title:", title?.substring(0, 80));

  // 본문 - view_cont, view_text 등
  const bodyMatch = dhtml.match(/class="[^"]*view[_-]?cont[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
    dhtml.match(/class="[^"]*view[_-]?text[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
    dhtml.match(/class="[^"]*bbs[_-]?cont[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (bodyMatch) {
    const text = bodyMatch[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    console.log("Body length:", text.length);
    console.log("Preview:", text.substring(0, 200));
  } else {
    const contentClasses = [...dhtml.matchAll(/class="([^"]*(?:view|content|body|text|bbs)[^"]*)"/gi)].map(m => m[1]);
    console.log("Content classes:", [...new Set(contentClasses)].slice(0, 15));
  }
}
