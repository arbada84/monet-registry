/**
 * 동적 OG 이미지 API
 * /api/og?title=제목&category=카테고리&author=기자명&date=날짜
 * /api/og?id=articleId  ← 기사 ID로 자동 조회
 *
 * 사용법 (article page generateMetadata):
 *   openGraph: { images: [`${baseUrl}/api/og?id=${article.id}`] }
 */
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { serverGetArticleById, serverGetArticleByNo } from "@/lib/db-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  let title    = searchParams.get("title")    || "";
  let category = searchParams.get("category") || "";
  let author   = searchParams.get("author")   || "";
  let date     = searchParams.get("date")      || "";
  const siteName = "컬처피플";

  // ?id= 로 기사 ID를 받으면 내부 API에서 기사 데이터 조회
  const id = searchParams.get("id");
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ID_RE = /^(api_)?\d+[_a-z0-9]*$/i;
  if (id && (UUID_RE.test(id) || ID_RE.test(id))) {
    try {
      const article = await serverGetArticleById(id)
        ?? (/^\d+$/.test(id) ? await serverGetArticleByNo(Number(id)) : null);
      if (article) {
        title    = article.title || title;
        category = article.category || category;
        author   = article.author || author;
        date     = article.date || date;
      }
    } catch { /* 조회 실패 시 기본값 사용 */ }
  }

  title    = title    || "컬처피플 뉴스";
  category = category || "뉴스";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          padding: "60px",
          fontFamily: "sans-serif",
        }}
      >
        {/* 카테고리 배지 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              background: "#E8192C",
              color: "#fff",
              padding: "6px 16px",
              borderRadius: "4px",
              fontSize: "18px",
              fontWeight: 700,
              letterSpacing: "1px",
            }}
          >
            {category}
          </div>
        </div>

        {/* 제목 */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
          }}
        >
          <h1
            style={{
              fontSize: title.length > 30 ? "44px" : "52px",
              fontWeight: 900,
              color: "#ffffff",
              lineHeight: 1.3,
              margin: 0,
              wordBreak: "keep-all",
            }}
          >
            {title.length > 60 ? title.slice(0, 60) + "…" : title}
          </h1>
        </div>

        {/* 하단 정보 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderTop: "1px solid rgba(255,255,255,0.2)",
            paddingTop: "24px",
            marginTop: "24px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {author && (
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "18px" }}>
                {author?.replace(/ 기자$/, "")} 기자
              </span>
            )}
            {date && (
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "16px" }}>
                {date}
              </span>
            )}
          </div>

          {/* 사이트명 + 엠블럼 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <svg viewBox="0 0 100 100" width="40" height="40">
              <circle cx="36" cy="62" r="27" fill="#C8BDE4" />
              <circle cx="64" cy="62" r="27" fill="#8B7BBE" />
              <circle cx="36" cy="38" r="27" fill="#6B5BAE" />
              <circle cx="64" cy="38" r="27" fill="#4A3A8E" />
            </svg>
            <span
              style={{
                color: "#ffffff",
                fontSize: "28px",
                fontWeight: 900,
                letterSpacing: "-0.5px",
              }}
            >
              {siteName}
            </span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
