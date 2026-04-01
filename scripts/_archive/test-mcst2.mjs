const detailUrl = "https://www.mcst.go.kr/kor/s_notice/press/pressView.jsp?pSeq=22291";
const dr = await fetch(detailUrl, {
  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  signal: AbortSignal.timeout(15000),
});
const dhtml = await dr.text();

// view_title
const titleMatch = dhtml.match(/class="view_title"[^>]*>([\s\S]*?)<\/div>/i);
const title = titleMatch?.[1]?.replace(/<[^>]*>/g, "").trim();
console.log("Title:", title?.substring(0, 100));

// view_con
const bodyMatch = dhtml.match(/class="view_con"[^>]*>([\s\S]*?)<\/div>/i);
if (bodyMatch) {
  const bodyHtml = bodyMatch[1];
  const text = bodyHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  console.log("Body length:", text.length);
  console.log("Preview:", text.substring(0, 300));
  // 이미지
  const imgs = [...bodyHtml.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/gi)].map(m => m[1]);
  console.log("Images:", imgs.length);
  imgs.slice(0, 3).forEach(u => console.log("  ", u.substring(0, 120)));
} else {
  console.log("view_con NOT FOUND");
}

// 날짜
const dateMatch = dhtml.match(/(\d{4}\.\d{2}\.\d{2})/);
console.log("Date:", dateMatch?.[1]);

// 과거 페이지 테스트 (pCurrentPage 파라미터로 과거 기사)
console.log("\n=== 과거 기사 목록 (page 100) ===");
const listUrl = "https://www.mcst.go.kr/kor/s_notice/press/pressList.jsp?pMenuCD=0302000000&pCurrentPage=100";
const lr = await fetch(listUrl, {
  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  signal: AbortSignal.timeout(15000),
});
const lhtml = await lr.text();
const seqs = [...new Set([...lhtml.matchAll(/pSeq=(\d+)/g)].map(m => m[1]))].filter(s => s !== "");
const dates = [...lhtml.matchAll(/(\d{4}\.\d{2}\.\d{2})/g)].map(m => m[1]);
console.log("Seqs:", seqs.slice(0, 5));
console.log("Dates:", [...new Set(dates)].slice(0, 5));
