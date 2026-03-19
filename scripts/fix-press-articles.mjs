#!/usr/bin/env node
/**
 * 보도자료 카테고리 기사 수정:
 * 1. 내용 기반 카테고리 재분류
 * 2. 썸네일 없는 기사에 Pexels 이미지 검색+등록
 */

const SB_URL = "https://ifducnfrjarmlpktrjkj.supabase.co";
const SB_KEY = "" + process.env.SUPABASE_SERVICE_KEY + "";
const PEXELS_KEY = "" + process.env.PEXELS_KEY + "";

// 카테고리 분류 규칙
function classifyCategory(title, tags, summary) {
  const text = `${title} ${tags} ${summary}`.toLowerCase();

  // 테크·모빌리티
  if (/로보택시|자율주행|ai|반도체|보안|네트워크|서버|클라우드|암호화폐|atm|블록체인|삼성전자|마이크로|rgb|tv|디스플레이|gnss|측위|모빌리티|secon|it|사이버|해킹|IoT/.test(text)) return "테크·모빌리티";

  // 엔터
  if (/공연|음악|앨범|싱글|발매|애니메이션|거인|게임|삼국지|플루티스트|국악|산조|뮤지컬|영화|드라마|아이돌|콘서트|문화예술|bts/.test(text)) return "엔터";

  // 라이프
  if (/출판|에세이|도서|수필|떡볶이|맵닭|음식|맛집|여행|건강|패션|뷰티|인테리어|레시피|출간|책/.test(text)) return "라이프";

  // 비즈
  if (/할인|캠페인|프로모션|협업|판매|출시|투자|기업|스타트업|경제|주식|매출|시장|사업|제품/.test(text)) return "비즈";

  // 공공
  if (/대통령|정부|장관|기후|플라스틱|환경|협회|학술|대학|포럼|정책|법안|국회|공공|문체부|행안부/.test(text)) return "공공";

  // 스포츠
  if (/스포츠|축구|야구|농구|fc|선수|감독|리그|올림픽|경기/.test(text)) return "스포츠";

  return "비즈"; // 기본값
}

// Pexels 이미지 검색
async function searchPexelsImage(query) {
  try {
    const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=3&locale=ko-KR`, {
      headers: { Authorization: PEXELS_KEY },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.photos?.length > 0) {
      return data.photos[0].src.large2x || data.photos[0].src.large;
    }
    return null;
  } catch { return null; }
}

// 이미지 Supabase 업로드
async function uploadToSupabase(imgUrl) {
  try {
    const resp = await fetch(imgUrl, { redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return null;
    const ct = resp.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 100 || buf.length > 5*1024*1024) return null;

    const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
    const now = new Date();
    const path = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,"0")}/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;

    const upRes = await fetch(`${SB_URL}/storage/v1/object/images/${path}`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": ct, "x-upsert": "true" },
      body: buf,
    });
    if (!upRes.ok) return null;
    return `${SB_URL}/storage/v1/object/public/images/${path}`;
  } catch { return null; }
}

// 기사 제목에서 Pexels 검색어 추출
function getSearchQuery(title, tags) {
  // 태그에서 핵심 키워드 추출
  if (tags) {
    const tagList = tags.split(",").map(t => t.trim()).filter(Boolean);
    if (tagList.length > 0) return tagList[0];
  }
  // 제목에서 키워드 추출 (한글 명사 2-4자)
  const nouns = title.match(/[가-힣]{2,4}/g);
  if (nouns && nouns.length > 0) return nouns[0];
  return title.substring(0, 10);
}

async function updateArticle(id, updates) {
  const res = await fetch(`${SB_URL}/rest/v1/articles?id=eq.${id}`, {
    method: "PATCH",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(updates),
  });
  return res.ok;
}

async function run() {
  console.log("=== 보도자료 카테고리 기사 수정 시작 ===\n");

  // 보도자료 + 경제 카테고리 기사 조회
  const res = await fetch(
    `${SB_URL}/rest/v1/articles?select=no,id,title,thumbnail,category,summary,tags&or=(category.eq.보도자료,category.eq.경제)&status=eq.게시&order=no.desc`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  const articles = await res.json();
  console.log(`대상 기사: ${articles.length}건\n`);

  for (const a of articles) {
    const newCategory = classifyCategory(a.title, a.tags || "", a.summary || "");
    const updates = {};
    let actions = [];

    // 1. 카테고리 재분류
    if (newCategory !== a.category) {
      updates.category = newCategory;
      actions.push(`카테고리: ${a.category}→${newCategory}`);
    }

    // 2. 썸네일 없으면 이미지 검색+등록
    if (!a.thumbnail) {
      const query = getSearchQuery(a.title, a.tags);
      console.log(`  이미지 검색: "${query}"`);
      const pexelsUrl = await searchPexelsImage(query);
      if (pexelsUrl) {
        const sbUrl = await uploadToSupabase(pexelsUrl);
        if (sbUrl) {
          updates.thumbnail = sbUrl;
          actions.push("썸네일 등록");
        } else {
          actions.push("썸네일 업로드 실패");
        }
      } else {
        // 대체 검색어로 재시도
        const altQuery = a.title.match(/[가-힣]{2,5}/)?.[0] || "뉴스";
        console.log(`  재검색: "${altQuery}"`);
        const altUrl = await searchPexelsImage(altQuery);
        if (altUrl) {
          const sbUrl = await uploadToSupabase(altUrl);
          if (sbUrl) {
            updates.thumbnail = sbUrl;
            actions.push("썸네일 등록(대체)");
          }
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      const ok = await updateArticle(a.id, updates);
      console.log(`#${a.no} ${a.title.substring(0,40)}… → ${actions.join(", ")} ${ok?"✓":"✗"}`);
    } else {
      console.log(`#${a.no} 변경없음 (${a.category})`);
    }
  }

  console.log("\n=== 완료 ===");
}

run().catch(console.error);
