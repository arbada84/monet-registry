const SB_URL = "https://ifducnfrjarmlpktrjkj.supabase.co";
const SB_KEY = "" + process.env.SUPABASE_SERVICE_KEY + "";

async function run() {
  // 쓱7클럽 티빙형 출시 보도자료 대표 이미지
  const imgUrl = "https://shinsegae-prd-data.s3.ap-northeast-2.amazonaws.com/wp-content/uploads/2026/03/NR_Press_Details_03-1.png";
  const resp = await fetch(imgUrl, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) { console.log("다운로드 실패:", resp.status); return; }
  const buf = Buffer.from(await resp.arrayBuffer());
  console.log("이미지 크기:", (buf.length / 1024).toFixed(0) + "KB");

  const path = `2026/03/${Date.now()}_ssg7club_main.png`;
  const up = await fetch(`${SB_URL}/storage/v1/object/images/${path}`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "image/png", "x-upsert": "true" },
    body: buf,
  });
  if (!up.ok) { console.log("업로드 실패:", up.status); return; }
  const newUrl = `${SB_URL}/storage/v1/object/public/images/${path}`;
  console.log("업로드:", newUrl);

  const upd = await fetch(`${SB_URL}/rest/v1/articles?no=eq.2992`, {
    method: "PATCH",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ thumbnail: newUrl, thumbnail_alt: "SSG닷컴 쓱7클럽 티빙형 멤버십 공식 이미지" }),
  });
  console.log("썸네일 교체:", upd.ok ? "완료 ✓" : "실패");
}
run();
