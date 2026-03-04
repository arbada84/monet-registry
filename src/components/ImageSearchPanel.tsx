"use client";

import { useState, useCallback } from "react";

interface PexelsImage {
  id: number;
  url: string;
  thumb: string;
  alt: string;
  photographer: string;
  pexelsUrl: string;
}

export interface ImageSearchPanelProps {
  title: string;
  body: string;
  onSelectThumbnail: (url: string, alt: string) => void;
  onInsertBody: (url: string, alt: string) => void;
}

export default function ImageSearchPanel({ title, body, onSelectThumbnail, onInsertBody }: ImageSearchPanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [customKeyword, setCustomKeyword] = useState("");
  const [images, setImages] = useState<PexelsImage[]>([]);
  const [searchedOnce, setSearchedOnce] = useState(false);

  const search = useCallback(async (overrideKeywords?: string[]) => {
    setLoading(true);
    setError("");

    try {
      const bodyText = body.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").slice(0, 1500);
      const resp = await fetch("/api/ai/image-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          overrideKeywords
            ? { keywords: overrideKeywords }
            : { title, bodyText }
        ),
      });
      const data = await resp.json();
      if (data.success) {
        setKeywords(data.keywords || []);
        setImages(data.images || []);
        setSearchedOnce(true);
      } else {
        setError(data.error || "이미지 검색에 실패했습니다.");
      }
    } catch {
      setError("이미지 검색 중 오류가 발생했습니다.");
    }
    setLoading(false);
  }, [title, body]);

  const handleOpen = async () => {
    setOpen(true);
    if (!searchedOnce && !loading) {
      await search();
    }
  };

  const handleClose = () => setOpen(false);

  const handleResearch = () => {
    const kw = customKeyword.trim()
      ? customKeyword.split(/[,\s]+/).map((k) => k.trim()).filter(Boolean)
      : keywords;
    search(kw);
  };

  const handleKeywordClick = (kw: string) => {
    setCustomKeyword(kw);
    search([kw]);
  };

  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={open ? handleClose : handleOpen}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 16px",
          fontSize: 13,
          fontWeight: 500,
          border: `1px solid ${open ? "#E8192C" : "#DDD"}`,
          borderRadius: 8,
          background: open ? "#FFF0F0" : "#FFF",
          color: open ? "#E8192C" : "#555",
          cursor: "pointer",
          transition: "all 0.15s",
        }}
      >
        <span style={{ fontSize: 15 }}>🔍</span>
        AI 이미지 검색
        {open && <span style={{ fontSize: 11, marginLeft: 2 }}>▲</span>}
        {!open && <span style={{ fontSize: 11, marginLeft: 2 }}>▼</span>}
      </button>

      {open && (
        <div style={{
          marginTop: 10,
          border: "1px solid #E0E0E0",
          borderRadius: 10,
          padding: 20,
          background: "#FAFAFA",
        }}>
          {/* 키워드 chips */}
          {keywords.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
                AI가 추출한 키워드 <span style={{ color: "#BBB" }}>(클릭하면 해당 키워드로 재검색)</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {keywords.map((kw) => (
                  <button
                    key={kw}
                    type="button"
                    onClick={() => handleKeywordClick(kw)}
                    style={{
                      padding: "3px 12px",
                      fontSize: 12,
                      border: "1px solid #E8192C",
                      borderRadius: 20,
                      background: "#FFF0F0",
                      color: "#E8192C",
                      cursor: "pointer",
                    }}
                  >
                    {kw}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 커스텀 검색어 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input
              type="text"
              value={customKeyword}
              onChange={(e) => setCustomKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleResearch()}
              placeholder="직접 검색어 입력 (영어 권장)"
              style={{
                flex: 1,
                padding: "8px 12px",
                fontSize: 13,
                border: "1px solid #DDD",
                borderRadius: 8,
                outline: "none",
                background: "#FFF",
              }}
            />
            <button
              type="button"
              onClick={handleResearch}
              disabled={loading}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 500,
                border: "none",
                borderRadius: 8,
                background: loading ? "#CCC" : "#333",
                color: "#FFF",
                cursor: loading ? "default" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {loading ? "검색 중..." : "재검색"}
            </button>
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div style={{
              padding: "10px 14px",
              background: "#FFF0F0",
              border: "1px solid #FFCDD2",
              borderRadius: 8,
              fontSize: 13,
              color: "#C62828",
              marginBottom: 12,
            }}>
              {error}
            </div>
          )}

          {/* 로딩 스피너 */}
          {loading && (
            <div style={{ textAlign: "center", padding: "24px 0", color: "#999", fontSize: 13 }}>
              이미지를 검색하고 있습니다...
            </div>
          )}

          {/* 이미지 그리드 */}
          {!loading && images.length > 0 && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 10,
            }}>
              {images.map((img) => (
                <div
                  key={img.id}
                  style={{
                    border: "1px solid #EEE",
                    borderRadius: 8,
                    overflow: "hidden",
                    background: "#FFF",
                  }}
                >
                  <div style={{ position: "relative", paddingTop: "66%", background: "#F5F5F5" }}>
                    <img
                      src={img.thumb}
                      alt={img.alt}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                      loading="lazy"
                    />
                  </div>
                  <div style={{ padding: "8px 10px" }}>
                    <div style={{ fontSize: 11, color: "#999", marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      📷 {img.photographer}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => onSelectThumbnail(img.url, img.alt)}
                        style={{
                          flex: 1,
                          padding: "5px 0",
                          fontSize: 11,
                          fontWeight: 600,
                          border: "none",
                          borderRadius: 5,
                          background: "#E8192C",
                          color: "#FFF",
                          cursor: "pointer",
                        }}
                      >
                        대표이미지
                      </button>
                      <button
                        type="button"
                        onClick={() => onInsertBody(img.url, img.alt)}
                        style={{
                          flex: 1,
                          padding: "5px 0",
                          fontSize: 11,
                          fontWeight: 500,
                          border: "1px solid #DDD",
                          borderRadius: 5,
                          background: "#FFF",
                          color: "#333",
                          cursor: "pointer",
                        }}
                      >
                        본문 삽입
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && searchedOnce && images.length === 0 && !error && (
            <div style={{ textAlign: "center", padding: "20px 0", color: "#999", fontSize: 13 }}>
              검색 결과가 없습니다. 다른 키워드로 검색해보세요.
            </div>
          )}

          {/* Pexels 저작권 표기 */}
          <div style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid #EEE",
            fontSize: 11,
            color: "#AAA",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}>
            <span>이미지 제공:</span>
            <a
              href="https://www.pexels.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#05A081", fontWeight: 600, textDecoration: "none" }}
            >
              Pexels
            </a>
            <span>· 무료 사용 가능 (출처 표기 권장)</span>
          </div>
        </div>
      )}
    </div>
  );
}
