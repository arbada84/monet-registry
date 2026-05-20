"use client";

interface ArticleSourceBannerProps {
  sourceUrl: string;
}

export function ArticleSourceBanner({ sourceUrl }: ArticleSourceBannerProps) {
  if (!sourceUrl) return null;

  return (
    <div style={{ background: "#FFF8E1", border: "1px solid #FFE082", borderRadius: 10, padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
      <span style={{ fontSize: 16 }}>📰</span>
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: 600, color: "#F57F17" }}>보도자료 원문</span>
        <span style={{ color: "#888", marginLeft: 8, fontSize: 12, wordBreak: "break-all" }}>{sourceUrl}</span>
      </div>
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ padding: "5px 14px", background: "#FF8F00", color: "#FFF", borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}
      >
        원문 보기
      </a>
    </div>
  );
}
