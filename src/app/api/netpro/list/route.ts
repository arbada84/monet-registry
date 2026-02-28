import { NextRequest, NextResponse } from "next/server";

const RSS_SCA_LABELS: Record<string, string> = {
  policy: "정책뉴스", photo: "포토뉴스", media: "영상뉴스", fact: "사실은 이렇습니다",
  reporter: "국민이 말하는 정책", pressrelease: "브리핑룸", mofa: "외교부",
  unikorea: "통일부", moj: "법무부", nts: "국세청", customs: "관세청",
  pps: "조달청", kostat: "통계청", kcc: "방송통신위원회", nssc: "원자력안전위원회",
  president: "청와대", ebriefing: "e브리핑", cabinet: "국무회의", npa: "경찰청",
  moel: "고용노동부", ftc: "공정거래위원회", msit: "과학기술정보통신부", moe: "교육부",
  mpva: "국가보훈처", opm: "국무조정실", acrc: "국민권익위원회", mnd: "국방부",
  molit: "국토교통부", fsc: "금융위원회", kma: "기상청", mafra: "농림축산식품부",
  rda: "농촌진흥청", cha: "문화재청", mcst: "문화체육관광부", dapa: "방위사업청",
  moleg: "법제처", mma: "병무청", mw: "보건복지부", forest: "산림청",
  motie: "산업통상자원부", sda: "새만금개발청", nfa: "소방청", mfds: "식품의약품안전처",
  mogef: "여성가족부", mpm: "인사혁신처", mss: "중소벤처기업부", kipo: "특허청",
  kcg: "해양경찰청", mof: "해양수산부", mois: "행정안전부", macc: "행정중심복합도시건설청",
  mcee: "기후에너지환경부", chungnam: "충청남도", naju: "나주시", busan: "부산시청",
  gyeongnam: "경상남도", jeonnam: "전라남도", jeonbuk: "전라북도",
  yeonggwang: "영광군청", daegu: "대구시청",
};

const ALLOWED_TABLES = new Set([
  "rss", "newswire", "policy", "photo", "media", "pressrelease", "ebriefing", "cabinet",
]);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const boTableRaw = searchParams.get("bo_table") || "rss";
  // bo_table: 허용된 값 또는 영숫자+밑줄만 허용
  const bo_table = ALLOWED_TABLES.has(boTableRaw) || /^[a-zA-Z0-9_]{1,32}$/.test(boTableRaw)
    ? boTableRaw : "rss";
  // page: 숫자만
  const pageRaw = searchParams.get("page") || "1";
  const page = /^\d+$/.test(pageRaw) ? pageRaw : "1";
  const sca = searchParams.get("sca") || "";
  const stx = searchParams.get("stx") || "";

  const url = `http://www.netpro.kr/rss/board.php?bo_table=${encodeURIComponent(bo_table)}&page=${page}&sca=${encodeURIComponent(sca)}&sfl=${stx ? "wr_subject" : ""}&stx=${encodeURIComponent(stx)}&version=&access_url=`;

  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
    });
    const html = await resp.text();

    // Parse HTML to extract articles
    const items: {
      wr_id: string;
      title: string;
      category: string;
      writer: string;
      date: string;
      hits: string;
      detail_url: string;
    }[] = [];

    // Extract rows from table
    const rowRegex = /<tr[^>]*>\s*([\s\S]*?)<\/tr>/g;
    let match;
    while ((match = rowRegex.exec(html)) !== null) {
      const row = match[1];

      // Extract wr_id
      const wrIdMatch = row.match(/name="chk_wr_id\[\]"\s+value="(\d+)"/);
      if (!wrIdMatch) continue;

      const wr_id = wrIdMatch[1];

      // Extract title
      const titleMatch = row.match(
        /href="[^"]*wr_id=\d+[^"]*">([^<]+)<\/a>/
      );
      const title = titleMatch ? titleMatch[1].trim() : "";

      // Extract category (newswire: text node, rss: extract sca from href)
      const cateMatch = row.match(/class="bo_cate_link"[^>]*>([^<]*)<\/a>/);
      let category = cateMatch ? cateMatch[1].trim() : "";
      if (!category && bo_table === "rss") {
        const scaMatch = row.match(/class="bo_cate_link"[^>]*href="[^"]*[?&]sca=([^&"]+)/);
        if (scaMatch) {
          const scaKey = decodeURIComponent(scaMatch[1]);
          category = RSS_SCA_LABELS[scaKey] || scaKey;
        }
      }

      // Extract writer
      const writerMatch = row.match(
        /class="td_name"[^>]*>([^<]+)<\/td>/
      );
      const writer = writerMatch ? writerMatch[1].trim() : "";

      // Extract date
      const dateMatch = row.match(
        /class="td_date"[^>]*>([^<]+)<\/td>/
      );
      const date = dateMatch ? dateMatch[1].trim() : "";

      // Extract hits
      const hitsMatches = row.match(/class="td_num"[^>]*>([^<]*)<\/td>/g);
      const hits =
        hitsMatches && hitsMatches.length >= 2
          ? (hitsMatches[1].match(/>(\d+)</) || ["", "0"])[1]
          : "0";

      const detail_url = `http://www.netpro.kr/rss/board.php?bo_table=${bo_table}&wr_id=${wr_id}&version=&access_url=`;

      items.push({ wr_id, title, category, writer, date, hits, detail_url });
    }

    // Extract total count
    const totalMatch = html.match(/Total\s+([\d,]+)건/);
    const total = totalMatch ? parseInt(totalMatch[1].replace(/,/g, "")) : 0;

    // Extract last page
    const lastPageMatch = html.match(/class="pg_end"[^>]*href="[^"]*page=(\d+)/);
    const lastPage = lastPageMatch ? parseInt(lastPageMatch[1]) : Math.ceil(total / 25);

    return NextResponse.json({
      success: true,
      bo_table,
      page: parseInt(page),
      total,
      lastPage,
      items,
    });
  } catch (error) {
    console.error("[netpro/list]", error);
    return NextResponse.json(
      { success: false, error: "보도자료 목록을 불러오는데 실패했습니다." },
      { status: 500 }
    );
  }
}
