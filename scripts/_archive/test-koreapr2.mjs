const firstId = "156550135";
const dr = await fetch("https://www.korea.kr/briefing/pressReleaseView.do?newsId=" + firstId, {
  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  signal: AbortSignal.timeout(15000),
});
const dhtml = await dr.text();

// iframe src 추출
const iframeMatch = dhtml.match(/<iframe[^>]*id="content_press"[^>]*src="([^"]+)"/i) ||
                    dhtml.match(/<iframe[^>]*src="([^"]*docViewer[^"]*)"/i);
console.log("iframe src:", iframeMatch?.[1]?.substring(0, 150));

if (iframeMatch) {
  let iframeSrc = iframeMatch[1];
  if (iframeSrc.startsWith("/")) iframeSrc = "https://www.korea.kr" + iframeSrc;

  console.log("\nFetching iframe:", iframeSrc.substring(0, 150));
  const ir = await fetch(iframeSrc, {
    headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.korea.kr/" },
    signal: AbortSignal.timeout(15000),
  });
  const ihtml = await ir.text();
  console.log("iframe HTML length:", ihtml.length);

  // 본문 텍스트
  const bodyText = ihtml.replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  console.log("Body text length:", bodyText.length);
  console.log("Preview:", bodyText.substring(0, 300));

  // 이미지
  const imgs = [...ihtml.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/gi)]
    .map(m => m[1])
    .filter(u => !u.includes("icon") && !u.includes("logo") && !u.includes("btn"));
  console.log("\nImages in iframe:", imgs.length);
  imgs.slice(0, 3).forEach(u => console.log("  ", u.substring(0, 120)));
}

// 제목 추출 개선
const titleMatch = dhtml.match(/<h3 class="tit"[^>]*>([\s\S]*?)<\/h3>/i) ||
                   dhtml.match(/class="view_title"[^>]*>[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/i) ||
                   dhtml.match(/<h2[^>]*class="[^"]*tit[^"]*"[^>]*>([\s\S]*?)<\/h2>/i);
const title = titleMatch?.[1]?.replace(/<[^>]*>/g, "").trim();
console.log("\nTitle:", title?.substring(0, 80));

// 부처명
const dept = dhtml.match(/class="dept"[^>]*>([\s\S]*?)<\//i)?.[1]?.trim();
console.log("Dept:", dept);
