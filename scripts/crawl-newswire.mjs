/**
 * 뉴스와이어 보도자료 크롤러
 *
 * 사용법:
 *   node scripts/crawl-newswire.mjs               # 최신 페이지부터 수집
 *   node scripts/crawl-newswire.mjs --pages 100   # 100페이지 수집 (10,000건)
 *   node scripts/crawl-newswire.mjs --from 500    # 500페이지부터 시작
 *   node scripts/crawl-newswire.mjs --all         # 전체 수집 (매우 오래 걸림)
 */

import pg from "pg";
const { Pool } = pg;

const COCKROACH_URL = process.env.COCKROACH_DATABASE_URL ||
  "postgresql://curpy:eHVt39D0uchMn3L9T08aXQ@dream-mammoth-23905.j77.aws-ap-southeast-1.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full";

const pool = new Pool({
  connectionString: COCKROACH_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 20000,
});

// ── 인자 파싱 ──
const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  return idx >= 0 && args[idx + 1] ? parseInt(args[idx + 1]) : null;
};
const MAX_PAGES = args.includes("--all") ? 99999 : (getArg("--pages") || 50);
const START_PAGE = getArg("--from") || 1;
const PER_PAGE = 100;
const BASE_URL = "https://www.newswire.co.kr";
const DELAY_MS = 1500; // 요청 간 1.5초 대기 (서버 부하 방지)

// ── HTML 파서 ──
function decodeEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&middot;/g, "·")
    .replace(/&#\d+;/g, m => String.fromCharCode(parseInt(m.slice(2, -1))));
}

function parseListPage(html) {
  const items = new Map(); // no -> item (중복 방지)

  // 패턴 1: text-truncate 클래스 링크 (제목 전용)
  const truncRegex = /newsRead\.php\?no=(\d+)"[^>]*class="[^"]*text-truncate[^"]*"[^>]*>([^<]+)/gi;
  let m;
  while ((m = truncRegex.exec(html)) !== null) {
    const no = m[1];
    const title = decodeEntities(m[2].trim());
    if (title.length >= 3 && !items.has(no)) {
      items.set(no, { source_no: parseInt(no), url: `${BASE_URL}/newsRead.php?no=${no}`, title });
    }
  }

  // 패턴 2: h5 > a 링크 (제목)
  const h5Regex = /<h5[^>]*>\s*<a[^>]*newsRead\.php\?no=(\d+)[^>]*>([^<]+)/gi;
  while ((m = h5Regex.exec(html)) !== null) {
    const no = m[1];
    const title = decodeEntities(m[2].trim());
    if (title.length >= 3 && !items.has(no)) {
      items.set(no, { source_no: parseInt(no), url: `${BASE_URL}/newsRead.php?no=${no}`, title });
    }
  }

  // 패턴 3: 일반 링크에서 5자 이상 텍스트
  const genRegex = /newsRead\.php\?no=(\d+)"[^>]*>([^<]{5,})/gi;
  while ((m = genRegex.exec(html)) !== null) {
    const no = m[1];
    const text = decodeEntities(m[2].trim());
    // 요약문(... 으로 끝나는 긴 텍스트)은 제외, 짧은 제목만
    if (text.length >= 5 && text.length <= 200 && !text.endsWith("...") && !items.has(no)) {
      items.set(no, { source_no: parseInt(no), url: `${BASE_URL}/newsRead.php?no=${no}`, title: text });
    }
  }

  return Array.from(items.values());
}

function parseArticlePage(html) {
  // 본문: article_column 또는 articleBody
  let body = "";
  const bodyMatch = html.match(/<section[^>]*class="[^"]*article_column[^"]*"[^>]*>([\s\S]*?)<\/section>/i)
    || html.match(/<div[^>]*itemprop="articleBody"[^>]*>([\s\S]*?)<\/div>/i)
    || html.match(/<div[^>]*class="[^"]*news_body[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (bodyMatch) {
    body = bodyMatch[1]
      .replace(/<div[^>]*class="[^"]*release-contact[^"]*"[\s\S]*?<\/div>/gi, "")
      .replace(/<div[^>]*class="[^"]*release-source-news[^"]*"[\s\S]*?<\/div>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .trim();
  }

  // 날짜: 1) meta article:published_time  2) YYYY-MM-DD  3) 영문(Feb. 25, 2026)
  const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
  let date = "";
  const metaDate = html.match(/<meta[^>]+property="article:published_time"[^>]+content="([^"]+)"/i)
    || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="article:published_time"/i);
  if (metaDate) {
    const md = metaDate[1].trim();
    const iso = md.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) date = `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  if (!date) {
    const dateMatch = html.match(/(\d{4})[.-](\d{1,2})[.-](\d{1,2})\s+(\d{1,2}):(\d{2})/);
    if (dateMatch) date = `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`;
  }
  if (!date) {
    // 영문: "Feb. 25, 2026 16:40" 또는 "February 25, 2026"
    const engMatch = html.match(/(\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?)\s+(\d{1,2}),?\s+(\d{4})/i);
    if (engMatch) {
      const mon = MONTHS[engMatch[1].slice(0, 3).toLowerCase()];
      if (mon) date = `${engMatch[3]}-${String(mon).padStart(2, "0")}-${engMatch[2].padStart(2, "0")}`;
    }
  }

  // 카테고리
  const cats = [];
  const catRegex = /md=A01&cat=\d+&cat1=\d+"[^>]*>([^<]+)/gi;
  let cm;
  while ((cm = catRegex.exec(html)) !== null) {
    cats.push(cm[1].trim());
  }

  // 기업명
  const companyMatch = html.match(/<h4[^>]*class="[^"]*company[^"]*"[^>]*>([^<]+)/i)
    || html.match(/<a[^>]*class="[^"]*company[^"]*"[^>]*>([^<]+)/i)
    || html.match(/<meta[^>]*property="og:site_name"[^>]*content="([^"]+)"/i);
  const company = companyMatch ? companyMatch[1].trim() : "";

  // 썸네일
  const thumbMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
  const thumbnail = thumbMatch ? thumbMatch[1] : "";

  // 요약
  const descMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i)
    || html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
  const summary = descMatch ? descMatch[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').slice(0, 300) : "";

  // 이미지 목록
  const images = [];
  const imgRegex = /<img[^>]*(?:src|data-src)="(https?:\/\/file\.newswire\.co\.kr[^"]+)"/gi;
  let im;
  while ((im = imgRegex.exec(body)) !== null) {
    images.push(im[1]);
  }

  // 태그
  const tags = cats.slice(0, 5);

  return { body_html: body, date, category: cats[0] || "", company, thumbnail, summary, images, tags };
}

// ── DB 저장 ──
async function saveItems(items) {
  let saved = 0, skipped = 0;
  for (const item of items) {
    try {
      const res = await pool.query(
        `INSERT INTO press_feeds (source, source_no, title, url, date, category, company, summary, body_html, thumbnail, images, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (url) DO NOTHING`,
        [
          "newswire", item.source_no, item.title, item.url,
          item.date || null, item.category || null, item.company || null,
          item.summary || null, item.body_html || null, item.thumbnail || null,
          JSON.stringify(item.images || []), JSON.stringify(item.tags || []),
        ]
      );
      if (res.rowCount > 0) saved++;
      else skipped++;
    } catch (e) {
      if (!e.message.includes("duplicate")) console.error(`  저장 실패 [${item.source_no}]:`, e.message.slice(0, 80));
      skipped++;
    }
  }
  return { saved, skipped };
}

// ── 메인 크롤러 ──
async function crawl() {
  console.log(`\n뉴스와이어 크롤러 시작`);
  console.log(`  페이지: ${START_PAGE} ~ ${START_PAGE + MAX_PAGES - 1} (페이지당 ${PER_PAGE}건)`);
  console.log(`  대기: 요청 간 ${DELAY_MS}ms\n`);

  let totalSaved = 0, totalSkipped = 0, emptyPages = 0;

  for (let page = START_PAGE; page < START_PAGE + MAX_PAGES; page++) {
    const listUrl = `${BASE_URL}/?md=A00&perpage=${PER_PAGE}&page=${page}`;

    try {
      // 목록 페이지 가져오기
      const listResp = await fetch(listUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; CulturePeople-Bot/1.0)" },
        signal: AbortSignal.timeout(15000),
      });
      if (!listResp.ok) {
        console.error(`  페이지 ${page} HTTP ${listResp.status}`);
        emptyPages++;
        if (emptyPages >= 3) { console.log("  연속 3회 실패 → 중단"); break; }
        continue;
      }

      const listHtml = await listResp.text();
      const listItems = parseListPage(listHtml);

      if (listItems.length === 0) {
        console.log(`  페이지 ${page}: 기사 0건 → 종료`);
        emptyPages++;
        if (emptyPages >= 3) break;
        continue;
      }
      emptyPages = 0;

      // 각 기사 상세 페이지 크롤링
      const enriched = [];
      for (const item of listItems) {
        // 이미 DB에 있는지 체크
        const exists = await pool.query("SELECT 1 FROM press_feeds WHERE source_no = $1 LIMIT 1", [item.source_no]);
        if (exists.rows.length > 0) {
          totalSkipped++;
          continue;
        }

        try {
          await new Promise(r => setTimeout(r, 500)); // 상세 페이지 간 0.5초 대기
          const artResp = await fetch(item.url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; CulturePeople-Bot/1.0)" },
            signal: AbortSignal.timeout(15000),
          });
          if (!artResp.ok) continue;
          const artHtml = await artResp.text();
          const detail = parseArticlePage(artHtml);
          enriched.push({ ...item, ...detail });
        } catch {
          // 상세 페이지 실패 → 제목만 저장
          enriched.push(item);
        }
      }

      // DB 저장
      const { saved, skipped } = await saveItems(enriched);
      totalSaved += saved;
      totalSkipped += skipped;

      const total = await pool.query("SELECT count(*) FROM press_feeds");
      console.log(`  페이지 ${page}: +${saved}건 저장, ${skipped}건 스킵 | DB 총 ${total.rows[0].count}건`);

      // 페이지 간 대기
      await new Promise(r => setTimeout(r, DELAY_MS));

    } catch (e) {
      console.error(`  페이지 ${page} 에러:`, e.message.slice(0, 80));
      emptyPages++;
      if (emptyPages >= 3) break;
    }
  }

  console.log(`\n크롤링 완료: ${totalSaved}건 저장, ${totalSkipped}건 스킵`);
  const final = await pool.query("SELECT count(*) FROM press_feeds");
  console.log(`DB 총 건수: ${final.rows[0].count}건\n`);

  await pool.end();
}

crawl().catch(e => { console.error("크롤러 에러:", e); pool.end(); process.exit(1); });
