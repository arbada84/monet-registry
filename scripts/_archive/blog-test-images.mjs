const BLOG_ID = "curpy";

async function analyzeImages(logNo) {
  const url = `https://blog.naver.com/PostView.naver?blogId=${BLOG_ID}&logNo=${logNo}&redirect=Dlog&widgetTypeCall=true&noTrackingCode=true&directAccess=false`;
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", Referer: `https://blog.naver.com/${BLOG_ID}` },
  });
  const html = await r.text();

  console.log("=== logNo:", logNo, "===");
  console.log("HTML length:", html.length);

  // 모든 이미지 관련 패턴
  const allImgs = [...html.matchAll(/(?:data-lazy-src|src)="(https?:\/\/[^"]+)"/gi)];
  console.log("\n모든 이미지 URL:", allImgs.length);
  for (const m of allImgs) {
    const u = m[1];
    if (u.includes("static.naver.net")) continue;
    if (u.includes("blogimgs.pstatic.net/nblog")) continue;
    if (u.includes("ssl.pstatic.net/static")) continue;
    if (u.includes("profile")) continue;
    if (u.includes("spc.gif")) continue;
    console.log("  ", u.substring(0, 150));
  }

  // se-section-image 블록 분석
  const imageBlocks = [...html.matchAll(/<div class="se-section se-section-image[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi)];
  console.log("\nse-section-image 블록:", imageBlocks.length);
  for (let i = 0; i < imageBlocks.length; i++) {
    const block = imageBlocks[i][0];
    const hasErrorState = block.includes("se-state-error");
    const imgMatch = block.match(/src="([^"]+)"/);
    const lazyMatch = block.match(/data-lazy-src="([^"]+)"/);
    const imgUrl = lazyMatch?.[1] || imgMatch?.[1] || "NO_URL";
    console.log(`  [${i}] error:${hasErrorState} url:${imgUrl.substring(0, 120)}`);
  }

  // se-module-image 블록 (더 상세)
  const moduleBlocks = [...html.matchAll(/<div class="se-module se-module-image"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi)];
  console.log("\nse-module-image 블록:", moduleBlocks.length);
  for (let i = 0; i < Math.min(moduleBlocks.length, 5); i++) {
    const block = moduleBlocks[i][0].substring(0, 300);
    console.log(`  [${i}]:`, block.replace(/\n/g, " ").substring(0, 250));
  }

  // 원본 이미지 src 중 접근 불가능한 URL 확인
  const contentImgs = allImgs
    .map((m) => m[1])
    .filter((u) => !u.includes("static.naver.net") && !u.includes("blogimgs.pstatic.net") && !u.includes("ssl.pstatic.net") && !u.includes("profile") && !u.includes("spc.gif"));

  console.log("\n콘텐츠 이미지 접근 테스트:");
  for (const img of contentImgs.slice(0, 5)) {
    try {
      const resp = await fetch(img, { method: "HEAD", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000), redirect: "follow" });
      const ct = resp.headers.get("content-type") || "";
      console.log(`  ${resp.ok ? "✅" : "❌"} ${resp.status} ${ct.substring(0, 20)} ${img.substring(0, 100)}`);
    } catch (e) {
      console.log(`  ❌ ERR ${e.message?.substring(0, 30)} ${img.substring(0, 100)}`);
    }
  }
}

// 유저가 보여준 글
await analyzeImages("223754239820");

// 추가 테스트: 더 오래된 글 (2020년 초)
console.log("\n\n");
const listUrl = `https://blog.naver.com/PostTitleListAsync.naver?blogId=curpy&viewdate=&currentPage=78&categoryNo=0&parentCategoryNo=0&countPerPage=30`;
const lr = await fetch(listUrl, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://blog.naver.com/curpy" } });
const listText = await lr.text();
const logNos = [...listText.matchAll(/"logNo"\s*:\s*"(\d+)"/g)].map((m) => m[1]);
if (logNos[0]) await analyzeImages(logNos[0]);
