// Puppeteer로 Google News URL 해석 테스트
import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

// Google News RSS에서 첫 3개 URL 테스트
const gnUrl = "https://news.google.com/rss/search?q=" + encodeURIComponent("문화재단 after:2023-01-01 before:2023-02-01") + "&hl=ko&gl=KR&ceid=KR:ko";
const r = await fetch(gnUrl, {
  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  signal: AbortSignal.timeout(15000),
});
const xml = await r.text();
const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];

console.log(`총 ${items.length}건 중 3개 테스트\n`);

for (const item of items.slice(0, 3)) {
  const title = (item[1].match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "")
    .replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
  const gnLink = item[1].match(/<link>\s*(https?[^\s<]+)/i)?.[1]?.trim() || "";

  console.log(`Title: ${title.substring(0, 60)}`);
  console.log(`GN: ${gnLink.substring(0, 80)}`);

  try {
    await page.goto(gnLink, { waitUntil: "domcontentloaded", timeout: 15000 });
    // 잠시 대기 (JS 리다이렉트)
    await new Promise(r => setTimeout(r, 3000));
    const finalUrl = page.url();
    console.log(`Final: ${finalUrl.substring(0, 120)}`);
    console.log(`Resolved: ${!finalUrl.includes("google.com") ? "YES" : "NO"}`);
  } catch (e) {
    console.log(`Error: ${e.message?.substring(0, 60)}`);
  }
  console.log("---");
}

await browser.close();
console.log("\nDone");
