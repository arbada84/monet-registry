const BLOG_ID = "curpy";

async function test(logNo) {
  const url = `https://blog.naver.com/PostView.naver?blogId=${BLOG_ID}&logNo=${logNo}&redirect=Dlog&widgetTypeCall=true&noTrackingCode=true&directAccess=false`;
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", Referer: `https://blog.naver.com/${BLOG_ID}` },
  });
  const html = await r.text();

  // 이미지 분석
  const workingImgs = [...html.matchAll(/(?:data-lazy-src|src)="(https?:\/\/(?:postfiles|blogfiles)\.pstatic\.net\/[^"]+)"/gi)].map((m) => m[1]).filter((u) => !u.includes("profile") && !u.includes("spc.gif"));
  const brokenCount = (html.match(/se-state-error/g) || []).length;

  // 에디터 타입
  const hasSE3 = html.includes("se-main-container");
  const hasSE2 = html.includes("postViewArea");

  // 텍스트 단락
  const textParagraphs = [...html.matchAll(/<p class="se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p>/gi)];
  const plainText = textParagraphs
    .map((m) => m[1].replace(/<[^>]*>/g, "").trim())
    .filter((t) => t && t !== "&nbsp;")
    .join(" ");

  console.log("logNo:", logNo);
  console.log("Working images:", workingImgs.length);
  workingImgs.slice(0, 3).forEach((u) => console.log("  ", u.substring(0, 120)));
  console.log("Broken images:", brokenCount);
  console.log("Editor:", hasSE3 ? "SE3" : hasSE2 ? "SE2" : "unknown");
  console.log("Text paragraphs:", textParagraphs.length);
  console.log("Plain text length:", plainText.length);
  console.log("Preview:", plainText.substring(0, 200));
  console.log("---");

  // 깨진 이미지 본문 패턴 확인
  if (brokenCount > 0) {
    const errorBlocks = [...html.matchAll(/se-state-error[\s\S]{0,300}/g)];
    console.log("Broken image HTML samples:");
    errorBlocks.slice(0, 2).forEach((m) => console.log("  ", m[0].substring(0, 200)));
  }
}

// 유저가 제시한 깨진 이미지 글
await test("223754239820");

// 본문 짧음으로 스킵된 글도 테스트
console.log("\n=== 본문 짧음 문제 디버그 ===\n");

// 부영그룹 글 (page 75, 3번째)
const listUrl = `https://blog.naver.com/PostTitleListAsync.naver?blogId=curpy&viewdate=&currentPage=75&categoryNo=0&parentCategoryNo=0&countPerPage=30`;
const lr = await fetch(listUrl, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://blog.naver.com/curpy" } });
const listText = await lr.text();
const logNos = [...listText.matchAll(/"logNo"\s*:\s*"(\d+)"/g)].map((m) => m[1]);
const titles = [...listText.matchAll(/"title"\s*:\s*"([^"]*)"/g)].map((m) => decodeURIComponent(m[1].replace(/\+/g, " ")));

// 3번째 글 (본문 짧음 발생)
if (logNos[2]) {
  console.log("Testing short body post:", titles[2]);
  await test(logNos[2]);
}
