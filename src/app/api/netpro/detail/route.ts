import { NextRequest, NextResponse } from "next/server";

const BASE = "http://www.netpro.kr";

function toAbsolute(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("//")) return "http:" + url;
  if (url.startsWith("/")) return BASE + url;
  return BASE + "/" + url;
}

// Extract div content by id using balanced tag tracking (fixes lazy regex bug)
function extractDivById(html: string, id: string): string {
  let markerIdx = html.indexOf(`id="${id}"`);
  if (markerIdx === -1) markerIdx = html.indexOf(`id='${id}'`);
  if (markerIdx === -1) return "";

  const tagEnd = html.indexOf(">", markerIdx);
  if (tagEnd === -1) return "";

  let depth = 1;
  let i = tagEnd + 1;
  const contentStart = i;

  while (i < html.length && depth > 0) {
    const nextOpen = html.indexOf("<div", i);
    const nextClose = html.indexOf("</div>", i);

    if (nextClose === -1) break;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      i = nextOpen + 4;
    } else {
      depth--;
      if (depth === 0) {
        return html.slice(contentStart, nextClose);
      }
      i = nextClose + 6;
    }
  }

  return "";
}

// Clean HTML: remove scripts/styles/event handlers, convert relative URLs to absolute
function cleanBodyHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    // 이벤트 핸들러 제거 (onclick, onerror, onload, onmouseover 등)
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "")
    .replace(/\bsrc="([^"]*)"/gi, (_, src) => `src="${toAbsolute(src)}"`)
    .replace(/href="([^"]*)"/gi, (_, href) => {
      // javascript: URL 차단
      if (!href || href.trimStart().toLowerCase().startsWith("javascript:")) return 'href="#"';
      if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return `href="${href}"`;
      }
      return `href="${toAbsolute(href)}"`;
    })
    .trim();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const boTableRaw = searchParams.get("bo_table") || "rss";
  // bo_table: 영숫자+밑줄만 허용
  const bo_table = /^[a-zA-Z0-9_]{1,32}$/.test(boTableRaw) ? boTableRaw : "rss";
  const wr_id = searchParams.get("wr_id") || "";

  if (!wr_id) {
    return NextResponse.json({ success: false, error: "wr_id required" }, { status: 400 });
  }
  // wr_id: 숫자만 허용
  if (!/^\d+$/.test(wr_id)) {
    return NextResponse.json({ success: false, error: "wr_id must be numeric" }, { status: 400 });
  }

  const url = `${BASE}/rss/board.php?bo_table=${encodeURIComponent(bo_table)}&wr_id=${wr_id}&version=&access_url=`;

  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
    });
    const html = await resp.text();

    // Extract title
    const titleMatch = html.match(/<h1[^>]*id="bo_v_title"[^>]*>([\s\S]*?)<\/h1>/);
    let title = "";
    if (titleMatch) {
      title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
    } else {
      const altTitle = html.match(/<title>([^<]+)<\/title>/);
      title = altTitle ? altTitle[1].replace(/\|.*$/, "").trim() : "";
    }

    // Extract body using balanced div tracking (preserves nested divs and images)
    const rawBodyHtml = extractDivById(html, "bo_v_con");

    // Clean HTML: fix relative URLs, strip scripts/styles
    const bodyHtml = cleanBodyHtml(rawBodyHtml);

    // Convert to plain text for preview
    const bodyText = bodyHtml
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // Extract images from cleaned body HTML
    const images: string[] = [];
    const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/g;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(bodyHtml)) !== null) {
      if (!imgMatch[1].includes("icon") && !imgMatch[1].includes("btn")) {
        images.push(imgMatch[1]);
      }
    }

    // Extract date
    const dateMatch = html.match(/class="if_date"[^>]*>([^<]+)</);
    const date = dateMatch ? dateMatch[1].trim() : "";

    // Extract writer/source
    const writerMatch = html.match(/class="if_name"[^>]*>([^<]+)</);
    const writer = writerMatch ? writerMatch[1].replace("글쓴이 :", "").trim() : "";

    // Extract outbound links from cleaned body HTML
    const links: string[] = [];
    const linkRegex = /href="(https?:\/\/[^"]+)"/g;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(bodyHtml)) !== null) {
      if (!linkMatch[1].includes("netpro.kr")) {
        links.push(linkMatch[1]);
      }
    }

    return NextResponse.json({
      success: true,
      wr_id,
      bo_table,
      title,
      bodyHtml,
      bodyText,
      date,
      writer,
      images,
      outboundLinks: links,
      sourceUrl: url,
    });
  } catch (error) {
    console.error("[netpro/detail]", error);
    return NextResponse.json(
      { success: false, error: "보도자료 상세 내용을 불러오는데 실패했습니다." },
      { status: 500 }
    );
  }
}
