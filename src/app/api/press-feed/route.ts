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
import { getPressFeeds } from "@/lib/cockroach-db";
import { safeFetch } from "@/lib/safe-remote-url";

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
      const resp = await safeFetch(url, {
        signal: AbortSignal.timeout(25000),
        headers: { "User-Agent": "CulturePeople-Bot/1.0" },
        cache: "no-store",
        maxRedirects: 5,
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

// ── 유틸리티: 문자열 해싱 (숫자 ID 생성) ──

function generateNumericHash(text: string): string {
  if (!text) return "0";
  // 32-bit signed integer hash (deterministic)
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0; // 32-bit int 변환
  }
  return String(Math.abs(hash)).slice(0, 10);
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

  // ── 뉴스와이어 탭: 실시간 RSS 우선 수집 (최신 기사 보장) ──
  if (tab === "newswire") {
    const rssUrl = NEWSWIRE_FEEDS[sca] || NEWSWIRE_FEEDS[""];
    const rssItems = await fetchRssFeed(rssUrl);
    
    // RSS 성공 시 즉시 반환
    if (rssItems.length > 0) {
      // 검색어 필터 (RSS는 전체 리스트이므로 메모리 필터)
      const filteredRss = stx
        ? rssItems.filter((it) => it.title.toLowerCase().includes(stx.toLowerCase()))
        : rssItems;

      const total = filteredRss.length;
      const start = (pageNum - 1) * PAGE_SIZE;
      const pageItems = filteredRss.slice(start, start + PAGE_SIZE);
      
      const items = pageItems.map((item, idx) => ({
        // URL을 해시하여 짧은 숫자로 변환
        wr_id: generateNumericHash(item.link),
        title: item.title,
        category: item.category || "경제",
        writer: item.author || "뉴스와이어",
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
        lastPage: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        page: pageNum,
      }, {
        headers: { "Cache-Control": "no-store, max-age=0" },
      });
    }

    // RSS 실패 시에만 CockroachDB fallback
    try {
      const { items: feeds, total } = await getPressFeeds({
        source: "newswire",
        category: sca || undefined,
        search: stx || undefined,
        page: pageNum,
        pageSize: PAGE_SIZE,
      });
      
      if (feeds.length > 0) {
        const items = feeds.map((feed, idx) => ({
          wr_id: String(feed.source_no || feed.id.slice(0, 8)),
          title: feed.title,
          category: feed.category || "",
          writer: feed.company || "뉴스와이어",
          date: feed.date || "",
          hits: "",
          detail_url: feed.url,
          description: feed.summary || "",
          _index: (pageNum - 1) * PAGE_SIZE + idx + 1,
        }));

        return NextResponse.json({
          success: true,
          items,
          total,
          lastPage: Math.max(1, Math.ceil(total / PAGE_SIZE)),
          page: pageNum,
        }, {
          headers: { "Cache-Control": "no-store, max-age=0" },
        });
      }
    } catch (e) {
      console.warn("[press-feed] CockroachDB 조회 실패:", e instanceof Error ? e.message : e);
    }
  }

  // ── 정부 보도자료(rss) 탭 또는 뉴스와이어 DB fallback: 기존 RSS 파싱 ──
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
    // URL을 해시하여 짧은 숫자로 변환 (사용자 요청: 숫자 ID 선호)
    wr_id: generateNumericHash(item.link),
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
