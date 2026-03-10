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
  robotsTxt: `User-agent: *\nAllow: /\nDisallow: /cam/\nDisallow: /api/\n\nUser-agent: Googlebot\nAllow: /\n\nUser-agent: Yeti\nAllow: /\n\nUser-agent: Bingbot\nAllow: /\n\nSitemap: https://culturepeople.co.kr/sitemap.xml`,
  sitemapAutoGenerate: true,
  ogDefaultImage: "",
  ogTitle: "",
  ogDescription: "",
  canonicalUrl: "https://culturepeople.co.kr",
  indexNowApiKey: "",
  googleSearchConsoleApiKey: "",
  naverSearchAdvisorApiKey: "",
};

/** 메타태그 전체 또는 name=value 형식에서 content 값만 추출 */
function cleanVerification(raw: string): string {
  if (!raw) return "";
  const v = raw.trim();
  const contentMatch = v.match(/content\s*=\s*["']([^"']*)["']/i);
  if (contentMatch) return contentMatch[1];
  const eqIdx = v.indexOf("=");
  if (eqIdx > 0 && !v.startsWith("<")) return v.slice(eqIdx + 1);
  return v;
}

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
      // 인증 코드 자동 정리 (전체 메타태그 입력해도 content 값만 추출)
      const cleaned = {
        ...settings,
        googleVerification: cleanVerification(settings.googleVerification),
        naverVerification: cleanVerification(settings.naverVerification),
        bingVerification: cleanVerification(settings.bingVerification),
        googleAnalyticsId: settings.googleAnalyticsId.trim(),
        naverAnalyticsId: settings.naverAnalyticsId.trim(),
        canonicalUrl: settings.canonicalUrl.trim().replace(/\/$/, ""),
        indexNowApiKey: settings.indexNowApiKey.trim(),
      };
      setSettings(cleaned);
      await saveSetting("cp-seo-settings", cleaned);
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
                  placeholder="jSqtLng2Z6fGHCZ-7AHqQidxgkqV9T7ZrqGUMhxSGFI"
                  style={inputStyle}
                />
                <div style={hintStyle}>
                  content 값, 전체 메타태그, name=value 형식 모두 입력 가능합니다. 저장 시 자동 정리됩니다.
                </div>
              </div>
              <div>
                <label style={labelStyle}>네이버 서치어드바이저 인증 코드</label>
                <input
                  type="text"
                  value={settings.naverVerification}
                  onChange={(e) => handleChange("naverVerification", e.target.value)}
                  placeholder="8cc19bb8161e852a74b4e261a6cee054e5a6dfb2"
                  style={inputStyle}
                />
                <div style={hintStyle}>
                  content 값, 전체 메타태그, name=value 형식 모두 입력 가능합니다. 저장 시 자동 정리됩니다.
                </div>
              </div>
              <div>
                <label style={labelStyle}>Bing Webmaster 인증 코드</label>
                <input
                  type="text"
                  value={settings.bingVerification}
                  onChange={(e) => handleChange("bingVerification", e.target.value)}
                  placeholder="인증 코드 content 값"
                  style={inputStyle}
                />
                <div style={hintStyle}>
                  content 값, 전체 메타태그, name=value 형식 모두 입력 가능합니다. 저장 시 자동 정리됩니다.
                </div>
              </div>
              <div>
                <label style={labelStyle}>Google Analytics 추적 ID (GA4)</label>
                <input
                  type="text"
                  value={settings.googleAnalyticsId}
                  onChange={(e) => handleChange("googleAnalyticsId", e.target.value)}
                  placeholder="G-XXXXXXXXXX"
                  style={inputStyle}
                />
                <div style={hintStyle}>
                  Google Analytics &gt; 관리 &gt; 데이터 스트림에서 G-로 시작하는 측정 ID를 입력하세요.
                </div>
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
                <div style={hintStyle}>
                  analytics.naver.com에서 사이트 등록 후 발급받은 ID를 입력하세요.
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === "api" && (
          <>
            {/* 포털 등록 안내 */}
            <section style={{ background: "#E3F2FD", border: "1px solid #90CAF9", borderRadius: 10, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "#1565C0", marginBottom: 12 }}>
                검색엔진 등록 안내
              </h3>
              <div style={{ fontSize: 13, color: "#1565C0", lineHeight: 1.8 }}>
                검색엔진에 사이트를 등록하면 기사가 더 빠르게 노출됩니다. 아래 링크에서 사이트를 등록하고 인증 코드와 API 키를 발급받으세요.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
                {[
                  { name: "Google Search Console", url: "https://search.google.com/search-console", desc: "Google 검색 등록 + 색인 API" },
                  { name: "네이버 서치어드바이저", url: "https://searchadvisor.naver.com", desc: "네이버 검색 등록 + 웹마스터 도구" },
                  { name: "Bing Webmaster Tools", url: "https://www.bing.com/webmasters", desc: "Bing 검색 등록 + IndexNow 키 발급" },
                  { name: "IndexNow 공식 사이트", url: "https://www.indexnow.org", desc: "IndexNow 프로토콜 안내 + 키 생성" },
                  { name: "Daum 검색등록", url: "https://register.search.daum.net/index.daum", desc: "Daum/카카오 검색 등록" },
                  { name: "Google Analytics", url: "https://analytics.google.com", desc: "방문자 분석 + 추적 ID 발급" },
                ].map((item) => (
                  <a
                    key={item.name}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "block", padding: "10px 14px", background: "#FFF", borderRadius: 8,
                      border: "1px solid #BBDEFB", textDecoration: "none", transition: "border-color 0.2s",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1565C0" }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: "#64B5F6", marginTop: 2 }}>{item.desc}</div>
                  </a>
                ))}
              </div>
            </section>

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
                    IndexNow 프로토콜을 통해 Bing, Yandex, 네이버 등에 새 기사를 즉시 알릴 수 있습니다.
                    임의의 32자 hex 문자열을 입력하고, 같은 값으로 된 .txt 파일을 사이트 루트에 배치하세요.
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
                    Google Cloud Console &gt; API &amp; 서비스 &gt; 사용자 인증 정보에서 서비스 계정 키를 생성하세요.
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
                    네이버 서치어드바이저에서 사이트를 등록한 후 API 키를 발급받으세요.
                  </div>
                </div>
              </div>
            </section>
          </>
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
                  placeholder="https://culturepeople.co.kr"
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
                  placeholder="https://culturepeople.co.kr/og-image.jpg"
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
