/**
 * /api/press-feed — RSS 피드 기사 목록 반환
 *
 * Query params:
 *   tab: "rss" (정부/korea.kr) | "newswire" (뉴스와이어)
 *   page: 페이지 번호 (1-based)
 *   sca: 카테고리 키 (빈 문자열이면 전체)
 *   stx: 검색어 (제목 필터)
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/cookie-auth";
import { decodeHtmlEntities as sharedDecodeHtml } from "@/lib/html-utils";

// ── RSS 카테고리별 URL 매핑 ──

const RSS_FEEDS: Record<string, string> = {
  "": "https://www.korea.kr/rss/pressrelease.xml",
  policy: "https://www.korea.kr/rss/policy.xml",
  photo: "https://www.korea.kr/rss/photo.xml",
  media: "https://www.korea.kr/rss/media.xml",
  fact: "https://www.korea.kr/rss/fact.xml",
  reporter: "https://www.korea.kr/rss/reporter.xml",
  pressrelease: "https://www.korea.kr/rss/ebriefing.xml",
  mofa: "https://www.korea.kr/rss/dept_mofa.xml",
  unikorea: "https://www.korea.kr/rss/dept_unikorea.xml",
  moj: "https://www.korea.kr/rss/dept_moj.xml",
  nts: "https://www.korea.kr/rss/dept_nts.xml",
  customs: "https://www.korea.kr/rss/dept_customs.xml",
  pps: "https://www.korea.kr/rss/dept_pps.xml",
  kostat: "https://www.korea.kr/rss/dept_kostat.xml",
  kcc: "https://www.korea.kr/rss/dept_kcc.xml",
  nssc: "https://www.korea.kr/rss/dept_nssc.xml",
  president: "https://www.korea.kr/rss/president.xml",
  ebriefing: "https://www.korea.kr/rss/ebriefing.xml",
  cabinet: "https://www.korea.kr/rss/cabinet.xml",
  npa: "https://www.korea.kr/rss/dept_npa.xml",
  moel: "https://www.korea.kr/rss/dept_moel.xml",
  ftc: "https://www.korea.kr/rss/dept_ftc.xml",
  msit: "https://www.korea.kr/rss/dept_msit.xml",
  moe: "https://www.korea.kr/rss/dept_moe.xml",
  mpva: "https://www.korea.kr/rss/dept_mpva.xml",
  opm: "https://www.korea.kr/rss/dept_opm.xml",
  acrc: "https://www.korea.kr/rss/dept_acrc.xml",
  mnd: "https://www.korea.kr/rss/dept_mnd.xml",
  molit: "https://www.korea.kr/rss/dept_molit.xml",
  fsc: "https://www.korea.kr/rss/dept_fsc.xml",
  kma: "https://www.korea.kr/rss/dept_kma.xml",
  mafra: "https://www.korea.kr/rss/dept_mafra.xml",
  rda: "https://www.korea.kr/rss/dept_rda.xml",
  cha: "https://www.korea.kr/rss/dept_cha.xml",
  mcst: "https://www.korea.kr/rss/dept_mcst.xml",
  dapa: "https://www.korea.kr/rss/dept_dapa.xml",
  moleg: "https://www.korea.kr/rss/dept_moleg.xml",
  mma: "https://www.korea.kr/rss/dept_mma.xml",
  mw: "https://www.korea.kr/rss/dept_mw.xml",
  forest: "https://www.korea.kr/rss/dept_forest.xml",
  motie: "https://www.korea.kr/rss/dept_motie.xml",
  sda: "https://www.korea.kr/rss/dept_sda.xml",
  nfa: "https://www.korea.kr/rss/dept_nfa.xml",
  mfds: "https://www.korea.kr/rss/dept_mfds.xml",
  mogef: "https://www.korea.kr/rss/dept_mogef.xml",
  mpm: "https://www.korea.kr/rss/dept_mpm.xml",
  mss: "https://www.korea.kr/rss/dept_mss.xml",
  kipo: "https://www.korea.kr/rss/dept_kipo.xml",
  kcg: "https://www.korea.kr/rss/dept_kcg.xml",
  mof: "https://www.korea.kr/rss/dept_mof.xml",
  mois: "https://www.korea.kr/rss/dept_mois.xml",
  macc: "https://www.korea.kr/rss/dept_macc.xml",
  mcee: "https://www.korea.kr/rss/dept_mcee.xml",
  chungnam: "https://www.korea.kr/rss/dept_chungnam.xml",
  naju: "https://www.korea.kr/rss/dept_naju.xml",
  busan: "https://www.korea.kr/rss/dept_busan.xml",
  gyeongnam: "https://www.korea.kr/rss/dept_gyeongnam.xml",
  jeonnam: "https://www.korea.kr/rss/dept_jeonnam.xml",
  jeonbuk: "https://www.korea.kr/rss/dept_jeonbuk.xml",
  yeonggwang: "https://www.korea.kr/rss/dept_yeonggwang.xml",
  daegu: "https://www.korea.kr/rss/dept_daegu.xml",
};

const NEWSWIRE_FEEDS: Record<string, string> = {
  "": "https://api.newswire.co.kr/rss/all",
  "100": "https://api.newswire.co.kr/rss/industry/100",
  "200": "https://api.newswire.co.kr/rss/industry/200",
  "300": "https://api.newswire.co.kr/rss/industry/300",
  "400": "https://api.newswire.co.kr/rss/industry/400",
  "500": "https://api.newswire.co.kr/rss/industry/500",
  "600": "https://api.newswire.co.kr/rss/industry/600",
  "700": "https://api.newswire.co.kr/rss/industry/700",
  "800": "https://api.newswire.co.kr/rss/industry/800",
  "900": "https://api.newswire.co.kr/rss/industry/900",
  "1000": "https://api.newswire.co.kr/rss/industry/1000",
  "1100": "https://api.newswire.co.kr/rss/industry/1100",
  "1200": "https://api.newswire.co.kr/rss/industry/1200",
  "1300": "https://api.newswire.co.kr/rss/industry/1300",
  "1400": "https://api.newswire.co.kr/rss/industry/1400",
  "1500": "https://api.newswire.co.kr/rss/industry/1500",
  "1600": "https://api.newswire.co.kr/rss/industry/1600",
  "1700": "https://api.newswire.co.kr/rss/industry/1700",
  "1800": "https://api.newswire.co.kr/rss/industry/1800",
  "1900": "https://api.newswire.co.kr/rss/industry/1900",
};

// ── RSS XML 파서 (auto-press와 동일 패턴) ──

function decodeHtmlEntities(text: string): string {
  return sharedDecodeHtml(text);
}

function stripDangerousHtml(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "");
}

interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  category: string;
  author: string;
}

function parseRssXml(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const extract = (tag: string) => {
      const cdataRe = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i");
      const cm = block.match(cdataRe);
      if (cm) return decodeHtmlEntities(cm[1].trim());
      const plainRe = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
      const pm = block.match(plainRe);
      return pm ? decodeHtmlEntities(pm[1].trim()) : "";
    };
    const title = stripDangerousHtml(extract("title"));
    let link = extract("link");
    if (!link) {
      const hrefMatch = block.match(/href="([^"]+)"/);
      if (hrefMatch) link = hrefMatch[1];
    }
    if (!title || !link) continue;

    const category = extract("category");
    const author = extract("dc:creator") || extract("author") || "";

    items.push({
      title,
      link,
      pubDate: extract("pubDate") || extract("dc:date") || "",
      description: stripDangerousHtml(extract("description")).replace(/<[^>]+>/g, "").slice(0, 300),
      category,
      author,
    });
  }
  return items;
}

async function fetchRssFeed(url: string): Promise<RssItem[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(25000),
        headers: { "User-Agent": "CulturePeople-Bot/1.0" },
        next: { revalidate: 0 },
      });
      if (!resp.ok) {
        console.warn(`[press-feed] RSS ${resp.status}: ${url}`);
        continue;
      }
      const xml = await resp.text();
      const items = parseRssXml(xml);
      if (items.length > 0) return items;
      console.warn(`[press-feed] RSS 파싱 결과 0건 (시도 ${attempt + 1}): ${url}`);
    } catch (e) {
      console.error(`[press-feed] RSS 수집 실패 (시도 ${attempt + 1}): ${url}`, e instanceof Error ? e.message : e);
    }
    if (attempt < 1) await new Promise(r => setTimeout(r, 1000));
  }
  return [];
}

// ── 날짜 포맷 (RSS pubDate → YYYY-MM-DD) ──

function formatDate(pubDate: string): string {
  if (!pubDate) return "";
  try {
    const d = new Date(pubDate);
    if (isNaN(d.getTime())) return pubDate.slice(0, 10);
    return d.toISOString().slice(0, 10);
  } catch {
    return pubDate.slice(0, 10);
  }
}

// ── GET 핸들러 ──

export async function GET(req: NextRequest) {
  // 인증 확인
  const cookie = req.cookies.get("cp-admin-auth");
  const auth = await verifyAuthToken(cookie?.value ?? "");
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: "인증 필요" }, { status: 401 });
  }

  const url = req.nextUrl.searchParams;
  const tab = url.get("tab") || "rss";
  const pageNum = Math.max(1, parseInt(url.get("page") || "1"));
  const sca = url.get("sca") || "";
  const stx = url.get("stx") || "";
  const PAGE_SIZE = 20;

  // RSS URL 결정
  const feedMap = tab === "newswire" ? NEWSWIRE_FEEDS : RSS_FEEDS;
  const feedUrl = feedMap[sca] || feedMap[""];
  if (!feedUrl) {
    return NextResponse.json({ success: false, error: "잘못된 카테고리" }, { status: 400 });
  }

  const allItems = await fetchRssFeed(feedUrl);

  // 검색어 필터
  const filtered = stx
    ? allItems.filter((item) => item.title.toLowerCase().includes(stx.toLowerCase()))
    : allItems;

  const total = filtered.length;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = (pageNum - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  // FeedItem 형태로 변환 (기존 NetproItem 호환)
  const items = pageItems.map((item, idx) => ({
    wr_id: Buffer.from(item.link).toString("base64url").slice(0, 40),
    title: item.title,
    category: item.category || "",
    writer: item.author || (tab === "newswire" ? "뉴스와이어" : "정부 보도자료"),
    date: formatDate(item.pubDate),
    hits: "",
    detail_url: item.link,
    description: item.description,
    _index: start + idx + 1,
  }));

  return NextResponse.json({
    success: true,
    items,
    total,
    lastPage,
    page: pageNum,
  }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export const dynamic = "force-dynamic";

