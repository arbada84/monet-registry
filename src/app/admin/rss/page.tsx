"use client";

import { useEffect, useState } from "react";
import { getSetting, saveSetting } from "@/lib/db";
import { inputStyle, labelStyle } from "@/lib/admin-styles";

interface RssSettings {
  enabled: boolean;
  feedTitle: string;
  feedDescription: string;
  feedLanguage: string;
  feedCopyright: string;
  feedImageUrl: string;
  itemCount: number;
  fullContent: boolean;
  categoryFeeds: boolean;
  atomEnabled: boolean;
  jsonFeedEnabled: boolean;
  customNamespaces: string;
  naverNewsStandPartner: boolean;
  naverNewsStandCode: string;
  daumNewsPartner: boolean;
  daumNewsCode: string;
}

const DEFAULT_RSS: RssSettings = {
  enabled: true,
  feedTitle: "컬처피플",
  feedDescription: "문화를 전하는 사람들 - 컬처피플 뉴스",
  feedLanguage: "ko",
  feedCopyright: "Copyright (c) 컬처피플. All rights reserved.",
  feedImageUrl: "",
  itemCount: 20,
  fullContent: false,
  categoryFeeds: true,
  atomEnabled: true,
  jsonFeedEnabled: false,
  customNamespaces: "",
  naverNewsStandPartner: false,
  naverNewsStandCode: "",
  daumNewsPartner: false,
  daumNewsCode: "",
};

export default function AdminRssPage() {
  const [settings, setSettings] = useState<RssSettings>(DEFAULT_RSS);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [activeTab, setActiveTab] = useState<"basic" | "format" | "partner">("basic");

  useEffect(() => {
    getSetting<RssSettings | null>("cp-rss-settings", null).then((stored) => {
      if (stored) setSettings({ ...DEFAULT_RSS, ...stored });
    });
  }, []);

  const handleSave = async () => {
    try {
      await saveSetting("cp-rss-settings", settings);
      setSaved(true);
      setSaveError("");
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장에 실패했습니다. 다시 시도해주세요.");
    }
  };

  const hintStyle: React.CSSProperties = { fontSize: 12, color: "#999", marginTop: 4 };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 24 }}>RSS / 피드 설정</h1>

      <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
        {[
          { key: "basic" as const, label: "기본 설정" },
          { key: "format" as const, label: "피드 형식" },
          { key: "partner" as const, label: "뉴스 제휴" },
        ].map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ padding: "8px 18px", fontSize: 14, fontWeight: activeTab === tab.key ? 600 : 400, color: activeTab === tab.key ? "#E8192C" : "#666", background: activeTab === tab.key ? "#FFF0F0" : "#FFF", border: `1px solid ${activeTab === tab.key ? "#E8192C" : "#DDD"}`, borderRadius: 8, cursor: "pointer" }}>
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 20 }}>
        {activeTab === "basic" && (
          <section style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>RSS 피드 기본 설정</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} style={{ width: 16, height: 16 }} />
                RSS 피드 활성화
              </label>
              <div>
                <label style={labelStyle}>피드 제목</label>
                <input type="text" value={settings.feedTitle} onChange={(e) => setSettings({ ...settings, feedTitle: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>피드 설명</label>
                <textarea value={settings.feedDescription} onChange={(e) => setSettings({ ...settings, feedDescription: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>언어 코드</label>
                  <input type="text" value={settings.feedLanguage} onChange={(e) => setSettings({ ...settings, feedLanguage: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>피드 아이템 수</label>
                  <input type="number" value={settings.itemCount} onChange={(e) => setSettings({ ...settings, itemCount: parseInt(e.target.value) || 20 })} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>저작권 표시</label>
                <input type="text" value={settings.feedCopyright} onChange={(e) => setSettings({ ...settings, feedCopyright: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>피드 이미지 URL</label>
                <input type="text" value={settings.feedImageUrl} onChange={(e) => setSettings({ ...settings, feedImageUrl: e.target.value })} placeholder="https://..." style={inputStyle} />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={settings.fullContent} onChange={(e) => setSettings({ ...settings, fullContent: e.target.checked })} style={{ width: 16, height: 16 }} />
                전문 제공 (체크 해제 시 요약문만 제공)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={settings.categoryFeeds} onChange={(e) => setSettings({ ...settings, categoryFeeds: e.target.checked })} style={{ width: 16, height: 16 }} />
                카테고리별 개별 피드 생성
              </label>
            </div>
          </section>
        )}

        {activeTab === "format" && (
          <section style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>피드 형식</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ padding: 12, background: "#E8F5E9", borderRadius: 8, fontSize: 13, color: "#2E7D32", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>RSS 2.0 피드: <code>/api/rss</code> (기본 활성)</span>
                <a href="/api/rss" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#2E7D32", textDecoration: "underline" }}>피드 확인</a>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={settings.atomEnabled} onChange={(e) => setSettings({ ...settings, atomEnabled: e.target.checked })} style={{ width: 16, height: 16 }} />
                Atom 1.0 피드 활성화 (<code>/atom.xml</code>)
                {settings.atomEnabled && <a href="/atom.xml" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#666", textDecoration: "underline", marginLeft: 4 }}>확인</a>}
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={settings.jsonFeedEnabled} onChange={(e) => setSettings({ ...settings, jsonFeedEnabled: e.target.checked })} style={{ width: 16, height: 16 }} />
                JSON Feed 활성화 (<code>/feed.json</code>)
              </label>
              <div>
                <label style={labelStyle}>커스텀 네임스페이스 (XML)</label>
                <textarea value={settings.customNamespaces} onChange={(e) => setSettings({ ...settings, customNamespaces: e.target.value })} rows={3} placeholder='xmlns:media="http://search.yahoo.com/mrss/"' style={{ ...inputStyle, fontFamily: "monospace", fontSize: 13, resize: "vertical" }} />
                <div style={hintStyle}>미디어 RSS 등 추가 네임스페이스가 필요한 경우 입력하세요.</div>
              </div>
            </div>
          </section>
        )}

        {activeTab === "partner" && (
          <section style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>뉴스 제휴 설정</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ padding: 16, background: "#FAFAFA", borderRadius: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500, marginBottom: 12 }}>
                  <input type="checkbox" checked={settings.naverNewsStandPartner} onChange={(e) => setSettings({ ...settings, naverNewsStandPartner: e.target.checked })} style={{ width: 16, height: 16 }} />
                  네이버 뉴스스탠드 제휴
                </label>
                <div>
                  <label style={labelStyle}>네이버 뉴스스탠드 코드</label>
                  <input type="text" value={settings.naverNewsStandCode} onChange={(e) => setSettings({ ...settings, naverNewsStandCode: e.target.value })} placeholder="뉴스스탠드 제휴 코드" style={inputStyle} />
                  <div style={hintStyle}>네이버 뉴스스탠드 제휴 승인 후 발급받은 코드를 입력하세요.</div>
                </div>
              </div>
              <div style={{ padding: 16, background: "#FAFAFA", borderRadius: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500, marginBottom: 12 }}>
                  <input type="checkbox" checked={settings.daumNewsPartner} onChange={(e) => setSettings({ ...settings, daumNewsPartner: e.target.checked })} style={{ width: 16, height: 16 }} />
                  다음(카카오) 뉴스 제휴
                </label>
                <div>
                  <label style={labelStyle}>다음 뉴스 코드</label>
                  <input type="text" value={settings.daumNewsCode} onChange={(e) => setSettings({ ...settings, daumNewsCode: e.target.value })} placeholder="다음 뉴스 제휴 코드" style={inputStyle} />
                  <div style={hintStyle}>다음 뉴스 제휴 승인 후 발급받은 코드를 입력하세요.</div>
                </div>
              </div>
            </div>
          </section>
        )}

        <div>
          <button onClick={handleSave} style={{ padding: "12px 32px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>저장</button>
          {saved && <span style={{ marginLeft: 12, fontSize: 14, color: "#4CAF50", fontWeight: 500 }}>저장되었습니다!</span>}
          {saveError && <span style={{ marginLeft: 12, fontSize: 13, color: "#E8192C" }}>{saveError}</span>}
        </div>
      </div>
    </div>
  );
}
