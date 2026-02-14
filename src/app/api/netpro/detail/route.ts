import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const bo_table = searchParams.get("bo_table") || "rss";
  const wr_id = searchParams.get("wr_id") || "";

  if (!wr_id) {
    return NextResponse.json({ success: false, error: "wr_id required" }, { status: 400 });
  }

  const url = `http://www.netpro.kr/rss/board.php?bo_table=${bo_table}&wr_id=${wr_id}&version=&access_url=`;

  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
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

    // Extract body content
    const bodyMatch = html.match(/<div[^>]*id="bo_v_con"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>|<div)/);
    let bodyHtml = bodyMatch ? bodyMatch[1].trim() : "";

    // Clean body - convert to text
    let bodyText = bodyHtml
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // Extract images
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

    // Extract outbound links
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
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
