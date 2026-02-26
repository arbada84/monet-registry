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

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const title    = searchParams.get("title")    || "컬처피플 뉴스";
  const category = searchParams.get("category") || "뉴스";
  const author   = searchParams.get("author")   || "";
  const date     = searchParams.get("date")      || "";
  const siteName = "컬처피플";

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
                {author} 기자
              </span>
            )}
            {date && (
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "16px" }}>
                {date}
              </span>
            )}
          </div>

          {/* 사이트명 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <div
              style={{
                width: "10px",
                height: "36px",
                background: "#E8192C",
                borderRadius: "2px",
              }}
            />
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
