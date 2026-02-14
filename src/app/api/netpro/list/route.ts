import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const bo_table = searchParams.get("bo_table") || "rss";
  const page = searchParams.get("page") || "1";
  const sca = searchParams.get("sca") || "";
  const stx = searchParams.get("stx") || "";

  const url = `http://www.netpro.kr/rss/board.php?bo_table=${bo_table}&page=${page}&sca=${encodeURIComponent(sca)}&sfl=${stx ? "wr_subject" : ""}&stx=${encodeURIComponent(stx)}&version=&access_url=`;

  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
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

      // Extract category
      const cateMatch = row.match(
        /class="bo_cate_link"[^>]*>([^<]*)<\/a>/
      );
      const category = cateMatch ? cateMatch[1].trim() : "";

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
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
