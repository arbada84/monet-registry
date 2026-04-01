const url = "https://www.korea.kr/news/pressReleaseList.do?newsType=dept&deptCode=042&startDate=2023-01-01&endDate=2023-01-31&pageIndex=1";
const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }, signal: AbortSignal.timeout(15000) });
const html = await r.text();

const pattern = /pressReleaseView\.do\?newsId=(\d+)/g;
const ids = new Set();
for (const m of html.matchAll(pattern)) ids.add(m[1]);
console.log("NewsIds:", [...ids].slice(0, 5));

const firstId = [...ids][0];
console.log("\nFetching detail:", firstId);
const dr = await fetch("https://www.korea.kr/briefing/pressReleaseView.do?newsId=" + firstId, {
  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  signal: AbortSignal.timeout(15000),
});
const dhtml = await dr.text();
console.log("HTML length:", dhtml.length);

// 제목
const h2 = dhtml.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1]?.replace(/<[^>]*>/g, "").trim();
console.log("H2 title:", h2?.substring(0, 80));

// 날짜
const dateMatch = dhtml.match(/(\d{4}\.\d{2}\.\d{2})/);
console.log("Date:", dateMatch?.[1]);

// 본문 클래스 검색
const classes = [...dhtml.matchAll(/class="([^"]*(?:article|content|view|body|detail)[^"]*)"/gi)].map(m => m[1]);
console.log("Content classes:", [...new Set(classes)].slice(0, 15));

// article_body 시도
const ab = dhtml.match(/class="article_body[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
console.log("article_body:", ab ? ab[1].substring(0, 200).replace(/<[^>]*>/g, " ").trim() : "NOT FOUND");

// 대안: detail_body
const db = dhtml.match(/class="detail_body[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
console.log("detail_body:", db ? "FOUND" : "NOT FOUND");

// 이미지
const imgs = [...dhtml.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/gi)]
  .map(m => m[1])
  .filter(u => !u.includes("icon") && !u.includes("logo") && !u.includes("btn") && !u.includes("common"));
console.log("Images:", imgs.slice(0, 5));
