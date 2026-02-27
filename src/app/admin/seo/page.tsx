"use client";

import { useEffect, useState } from "react";
import { getSetting, saveSetting } from "@/lib/db";
import { inputStyle, labelStyle } from "@/lib/admin-styles";

interface SeoSettings {
  googleVerification: string;
  naverVerification: string;
  bingVerification: string;
  googleAnalyticsId: string;
  naverAnalyticsId: string;
  robotsTxt: string;
  sitemapAutoGenerate: boolean;
  ogDefaultImage: string;
  ogTitle: string;
  ogDescription: string;
  canonicalUrl: string;
  indexNowApiKey: string;
  googleSearchConsoleApiKey: string;
  naverSearchAdvisorApiKey: string;
}

const DEFAULT_SEO: SeoSettings = {
  googleVerification: "",
  naverVerification: "",
  bingVerification: "",
  googleAnalyticsId: "",
  naverAnalyticsId: "",
  robotsTxt: `User-agent: *\nAllow: /\n\nUser-agent: Googlebot\nAllow: /\n\nUser-agent: Yeti\nAllow: /\n\nUser-agent: Bingbot\nAllow: /\n\nSitemap: https://example.com/sitemap.xml`,
  sitemapAutoGenerate: true,
  ogDefaultImage: "",
  ogTitle: "",
  ogDescription: "",
  canonicalUrl: "",
  indexNowApiKey: "",
  googleSearchConsoleApiKey: "",
  naverSearchAdvisorApiKey: "",
};

export default function AdminSeoPage() {
  const [settings, setSettings] = useState<SeoSettings>(DEFAULT_SEO);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [activeTab, setActiveTab] = useState<"verify" | "robots" | "og" | "api">("verify");

  useEffect(() => {
    getSetting<SeoSettings | null>("cp-seo-settings", null).then((stored) => {
      if (stored) setSettings({ ...DEFAULT_SEO, ...stored });
    });
  }, []);

  const handleChange = (field: keyof SeoSettings, value: string | boolean) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    try {
      await saveSetting("cp-seo-settings", settings);
      setSaved(true);
      setSaveError("");
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장에 실패했습니다. 다시 시도해주세요.");
    }
  };

  const hintStyle: React.CSSProperties = {
    fontSize: 12,
    color: "#999",
    marginTop: 4,
  };

  const tabs = [
    { key: "verify" as const, label: "사이트 인증" },
    { key: "api" as const, label: "API 키 / 연동" },
    { key: "robots" as const, label: "robots.txt / 사이트맵" },
    { key: "og" as const, label: "OG 메타태그" },
  ];

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 24 }}>
        SEO / 검색엔진 설정
      </h1>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "8px 18px",
              fontSize: 14,
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? "#E8192C" : "#666",
              background: activeTab === tab.key ? "#FFF0F0" : "#FFF",
              border: `1px solid ${activeTab === tab.key ? "#E8192C" : "#DDD"}`,
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 20 }}>
        {activeTab === "verify" && (
          <section style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>
              검색엔진 사이트 인증
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>Google Search Console 인증 코드</label>
                <input
                  type="text"
                  value={settings.googleVerification}
                  onChange={(e) => handleChange("googleVerification", e.target.value)}
                  placeholder="google-site-verification=xxxxxxx"
                  style={inputStyle}
                />
                <div style={hintStyle}>
                  Google Search Console &gt; 설정 &gt; 소유권 확인에서 HTML 태그의 content 값을 입력하세요.
                </div>
              </div>
              <div>
                <label style={labelStyle}>네이버 서치어드바이저 인증 코드</label>
                <input
                  type="text"
                  value={settings.naverVerification}
                  onChange={(e) => handleChange("naverVerification", e.target.value)}
                  placeholder="naver-site-verification=xxxxxxx"
                  style={inputStyle}
                />
                <div style={hintStyle}>
                  네이버 서치어드바이저 &gt; 웹마스터 도구 &gt; 사이트 소유 확인에서 메타태그 content 값을 입력하세요.
                </div>
              </div>
              <div>
                <label style={labelStyle}>Bing Webmaster 인증 코드</label>
                <input
                  type="text"
                  value={settings.bingVerification}
                  onChange={(e) => handleChange("bingVerification", e.target.value)}
                  placeholder="msvalidate.01=xxxxxxx"
                  style={inputStyle}
                />
                <div style={hintStyle}>
                  Bing Webmaster Tools &gt; 사이트 확인에서 메타태그 content 값을 입력하세요.
                </div>
              </div>
              <div>
                <label style={labelStyle}>Google Analytics 추적 ID</label>
                <input
                  type="text"
                  value={settings.googleAnalyticsId}
                  onChange={(e) => handleChange("googleAnalyticsId", e.target.value)}
                  placeholder="G-XXXXXXXXXX"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>네이버 애널리틱스 사이트 ID</label>
                <input
                  type="text"
                  value={settings.naverAnalyticsId}
                  onChange={(e) => handleChange("naverAnalyticsId", e.target.value)}
                  placeholder="네이버 애널리틱스 사이트 ID"
                  style={inputStyle}
                />
              </div>
            </div>
          </section>
        )}

        {activeTab === "api" && (
          <section style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>
              검색엔진 API 키 설정
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>IndexNow API 키</label>
                <input
                  type="text"
                  value={settings.indexNowApiKey}
                  onChange={(e) => handleChange("indexNowApiKey", e.target.value)}
                  placeholder="IndexNow API Key (Bing, Yandex 등에 즉시 색인 요청)"
                  style={inputStyle}
                />
                <div style={hintStyle}>
                  IndexNow 프로토콜을 통해 Bing, Yandex 등에 새 기사를 즉시 알릴 수 있습니다.
                </div>
              </div>
              <div>
                <label style={labelStyle}>Google Search Console API 키 (JSON)</label>
                <textarea
                  value={settings.googleSearchConsoleApiKey}
                  onChange={(e) => handleChange("googleSearchConsoleApiKey", e.target.value)}
                  placeholder="Google Cloud 서비스 계정 JSON 키 내용을 붙여넣기 하세요"
                  rows={4}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
                <div style={hintStyle}>
                  Google Indexing API를 통해 기사 발행 시 자동 색인 요청에 사용됩니다.
                </div>
              </div>
              <div>
                <label style={labelStyle}>네이버 서치어드바이저 API 키</label>
                <input
                  type="text"
                  value={settings.naverSearchAdvisorApiKey}
                  onChange={(e) => handleChange("naverSearchAdvisorApiKey", e.target.value)}
                  placeholder="네이버 서치어드바이저 API 키"
                  style={inputStyle}
                />
                <div style={hintStyle}>
                  네이버 웹마스터 도구 API를 통한 사이트맵 제출 및 색인 요청에 사용됩니다.
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === "robots" && (
          <section style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>
              robots.txt / 사이트맵
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>robots.txt 내용</label>
                <textarea
                  value={settings.robotsTxt}
                  onChange={(e) => handleChange("robotsTxt", e.target.value)}
                  rows={10}
                  style={{ ...inputStyle, fontFamily: "monospace", fontSize: 13, resize: "vertical" }}
                />
                <div style={hintStyle}>
                  검색 봇의 크롤링 허용/차단 규칙을 설정합니다. AI 봇(GPTBot, ChatGPT-User, Bard 등)도 여기서 제어합니다.
                </div>
              </div>
              <div>
                <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={settings.sitemapAutoGenerate}
                    onChange={(e) => handleChange("sitemapAutoGenerate", e.target.checked)}
                    style={{ width: 16, height: 16 }}
                  />
                  사이트맵 자동 생성
                </label>
                <div style={hintStyle}>
                  기사 발행 시 sitemap.xml을 자동으로 갱신합니다.
                </div>
              </div>
              <div>
                <label style={labelStyle}>Canonical URL (기본 도메인)</label>
                <input
                  type="text"
                  value={settings.canonicalUrl}
                  onChange={(e) => handleChange("canonicalUrl", e.target.value)}
                  placeholder="https://www.example.com"
                  style={inputStyle}
                />
              </div>
            </div>
          </section>
        )}

        {activeTab === "og" && (
          <section style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>
              기본 OG 메타태그
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>기본 OG 제목</label>
                <input
                  type="text"
                  value={settings.ogTitle}
                  onChange={(e) => handleChange("ogTitle", e.target.value)}
                  placeholder="컬처피플 - 문화를 전하는 사람들"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>기본 OG 설명</label>
                <textarea
                  value={settings.ogDescription}
                  onChange={(e) => handleChange("ogDescription", e.target.value)}
                  placeholder="사이트 공유 시 표시되는 기본 설명"
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>
              <div>
                <label style={labelStyle}>기본 OG 이미지 URL</label>
                <input
                  type="text"
                  value={settings.ogDefaultImage}
                  onChange={(e) => handleChange("ogDefaultImage", e.target.value)}
                  placeholder="https://example.com/og-image.jpg"
                  style={inputStyle}
                />
                <div style={hintStyle}>
                  개별 기사에 OG 이미지가 없을 때 사용되는 기본 이미지입니다.
                </div>
              </div>
            </div>
          </section>
        )}

        <div>
          <button
            onClick={handleSave}
            style={{
              padding: "12px 32px",
              background: "#E8192C",
              color: "#FFF",
              border: "none",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            저장
          </button>
          {saved && (
            <span style={{ marginLeft: 12, fontSize: 14, color: "#4CAF50", fontWeight: 500 }}>
              저장되었습니다!
            </span>
          )}
          {saveError && (
            <span style={{ marginLeft: 12, fontSize: 13, color: "#E8192C" }}>{saveError}</span>
          )}
        </div>
      </div>
    </div>
  );
}
