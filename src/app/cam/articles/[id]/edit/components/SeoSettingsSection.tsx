"use client";

import type { Dispatch, SetStateAction } from "react";
import { inputStyle, labelStyle } from "@/lib/admin-styles";

interface SeoSettingsSectionProps {
  title: string;
  summary: string;
  slug: string;
  setSlug: Dispatch<SetStateAction<string>>;
  metaDescription: string;
  setMetaDescription: Dispatch<SetStateAction<string>>;
  ogImage: string;
  setOgImage: Dispatch<SetStateAction<string>>;
}

export function SeoSettingsSection({
  title,
  summary,
  slug,
  setSlug,
  metaDescription,
  setMetaDescription,
  ogImage,
  setOgImage,
}: SeoSettingsSectionProps) {
  const generateSlug = () => {
    const generated = title.trim()
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s]/g, "")
      .replace(/\s+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || `article-${Date.now()}`;
    setSlug(generated);
  };

  return (
    <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>SEO 설정</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={labelStyle}>URL 슬러그</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.replace(/[^a-z0-9가-힣-]/g, ""))}
              placeholder="url-friendly-slug"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              type="button"
              onClick={generateSlug}
              style={{ padding: "8px 16px", background: "#F5F5F5", border: "1px solid #DDD", borderRadius: 8, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              자동생성
            </button>
          </div>
        </div>
        <div>
          <label style={labelStyle}>메타 설명 ({metaDescription.length}/160)</label>
          <textarea
            value={metaDescription}
            onChange={(e) => setMetaDescription(e.target.value.slice(0, 160))}
            placeholder="검색결과에 표시될 설명 (50~160자 권장)"
            rows={2}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
          />
        </div>
        <div>
          <label style={labelStyle}>
            OG 이미지 URL <span style={{ fontSize: 11, color: "#999", fontWeight: 400 }}>(SNS 공유 시 표시 - 미입력 시 썸네일 사용)</span>
          </label>
          <input
            type="url"
            value={ogImage}
            onChange={(e) => setOgImage(e.target.value)}
            placeholder="https://example.com/og-image.jpg (1200x630 권장)"
            style={inputStyle}
          />
        </div>
        {(title || metaDescription) && (
          <div style={{ background: "#FAFAFA", borderRadius: 8, padding: 16, border: "1px solid #EEE" }}>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>검색결과 미리보기</div>
            <div style={{ fontSize: 16, color: "#1A0DAB", fontWeight: 500, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {title || "기사 제목"}
            </div>
            <div style={{ fontSize: 12, color: "#006621", marginBottom: 4 }}>culturepeople.co.kr/article/{slug || "..."}</div>
            <div style={{ fontSize: 13, color: "#545454", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {metaDescription || summary || "기사 요약문이 여기에 표시됩니다."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
