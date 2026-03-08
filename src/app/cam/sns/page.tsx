"use client";

import { useEffect, useState } from "react";
import { getSetting, saveSetting } from "@/lib/db";
import { inputStyle, labelStyle } from "@/lib/admin-styles";

interface SnsSettings {
  facebook: string;
  instagram: string;
  twitter: string;
  youtube: string;
  naverBlog: string;
  naverPost: string;
  kakaoChannel: string;
  tiktok: string;
  shareButtons: {
    facebook: boolean;
    twitter: boolean;
    kakao: boolean;
    naver: boolean;
    link: boolean;
    email: boolean;
  };
  ogAutoGenerate: boolean;
  kakaoJsKey: string;
  twitterHandle: string;
}

const DEFAULT_SNS: SnsSettings = {
  facebook: "",
  instagram: "",
  twitter: "",
  youtube: "",
  naverBlog: "",
  naverPost: "",
  kakaoChannel: "",
  tiktok: "",
  shareButtons: { facebook: true, twitter: true, kakao: true, naver: true, link: true, email: false },
  ogAutoGenerate: true,
  kakaoJsKey: "",
  twitterHandle: "",
};

const SNS_FIELDS = [
  { key: "facebook" as const, label: "Facebook", placeholder: "https://facebook.com/yourpage", color: "#1877F2" },
  { key: "instagram" as const, label: "Instagram", placeholder: "https://instagram.com/yourpage", color: "#E4405F" },
  { key: "twitter" as const, label: "X (Twitter)", placeholder: "https://x.com/yourhandle", color: "#000000" },
  { key: "youtube" as const, label: "YouTube", placeholder: "https://youtube.com/@yourchannel", color: "#FF0000" },
  { key: "naverBlog" as const, label: "네이버 블로그", placeholder: "https://blog.naver.com/yourid", color: "#03C75A" },
  { key: "naverPost" as const, label: "네이버 포스트", placeholder: "https://post.naver.com/yourid", color: "#03C75A" },
  { key: "kakaoChannel" as const, label: "카카오톡 채널", placeholder: "https://pf.kakao.com/yourcode", color: "#FEE500" },
  { key: "tiktok" as const, label: "TikTok", placeholder: "https://tiktok.com/@yourhandle", color: "#000000" },
];

const SHARE_BUTTONS = [
  { key: "facebook" as const, label: "Facebook" },
  { key: "twitter" as const, label: "X (Twitter)" },
  { key: "kakao" as const, label: "카카오톡" },
  { key: "naver" as const, label: "네이버" },
  { key: "link" as const, label: "링크 복사" },
  { key: "email" as const, label: "이메일" },
];

export default function AdminSnsPage() {
  const [settings, setSettings] = useState<SnsSettings>(DEFAULT_SNS);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [activeTab, setActiveTab] = useState<"accounts" | "share" | "api">("accounts");

  useEffect(() => {
    getSetting<SnsSettings | null>("cp-sns-settings", null).then((stored) => {
      if (stored) setSettings({ ...DEFAULT_SNS, ...stored });
    });
  }, []);

  const handleSave = async () => {
    try {
      await saveSetting("cp-sns-settings", settings);
      setSaved(true);
      setSaveError("");
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장에 실패했습니다. 다시 시도해주세요.");
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 24 }}>SNS / 소셜미디어</h1>

      <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
        {[
          { key: "accounts" as const, label: "SNS 계정" },
          { key: "share" as const, label: "공유 버튼" },
          { key: "api" as const, label: "API 키" },
        ].map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ padding: "8px 18px", fontSize: 14, fontWeight: activeTab === tab.key ? 600 : 400, color: activeTab === tab.key ? "#E8192C" : "#666", background: activeTab === tab.key ? "#FFF0F0" : "#FFF", border: `1px solid ${activeTab === tab.key ? "#E8192C" : "#DDD"}`, borderRadius: 8, cursor: "pointer" }}>
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 640 }}>
        {activeTab === "accounts" && (
          <section style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>SNS 계정 링크</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {SNS_FIELDS.map((sns) => (
                <div key={sns.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 28, height: 28, background: sns.color, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: sns.key === "kakaoChannel" ? "#000" : "#FFF", fontSize: 10, fontWeight: 700 }}>
                    {sns.label.charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <input
                      type="text"
                      value={settings[sns.key]}
                      onChange={(e) => setSettings({ ...settings, [sns.key]: e.target.value })}
                      placeholder={sns.placeholder}
                      style={{ ...inputStyle, fontSize: 13 }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "#999", marginTop: 12 }}>사이트 헤더/푸터에 SNS 아이콘 링크로 표시됩니다.</div>
          </section>
        )}

        {activeTab === "share" && (
          <section style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>기사 공유 버튼 설정</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {SHARE_BUTTONS.map((btn) => (
                <label key={btn.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 6, background: settings.shareButtons[btn.key] ? "#FFF0F0" : "#FAFAFA", border: `1px solid ${settings.shareButtons[btn.key] ? "#FFCCCC" : "#EEE"}`, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={settings.shareButtons[btn.key]}
                    onChange={(e) => setSettings({ ...settings, shareButtons: { ...settings.shareButtons, [btn.key]: e.target.checked } })}
                    style={{ width: 16, height: 16 }}
                  />
                  <span style={{ fontSize: 14 }}>{btn.label}</span>
                </label>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={settings.ogAutoGenerate} onChange={(e) => setSettings({ ...settings, ogAutoGenerate: e.target.checked })} style={{ width: 16, height: 16 }} />
                기사별 OG 메타태그 자동 생성
              </label>
              <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>공유 시 기사 제목, 요약문, 썸네일이 자동 표시됩니다.</div>
            </div>
          </section>
        )}

        {activeTab === "api" && (
          <section style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>소셜 API 키</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>카카오 JavaScript 앱 키</label>
                <input type="text" value={settings.kakaoJsKey} onChange={(e) => setSettings({ ...settings, kakaoJsKey: e.target.value })} placeholder="카카오 개발자 > 내 애플리케이션 > JavaScript 키" style={inputStyle} />
                <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>카카오톡 공유 기능에 필수입니다.</div>
              </div>
              <div>
                <label style={labelStyle}>Twitter/X 핸들</label>
                <input type="text" value={settings.twitterHandle} onChange={(e) => setSettings({ ...settings, twitterHandle: e.target.value })} placeholder="@yourhandle" style={inputStyle} />
                <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>Twitter 카드에 via 정보로 표시됩니다.</div>
              </div>
            </div>
          </section>
        )}

        <div style={{ marginTop: 20 }}>
          <button onClick={handleSave} style={{ padding: "12px 32px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>저장</button>
          {saved && <span style={{ marginLeft: 12, fontSize: 14, color: "#4CAF50", fontWeight: 500 }}>저장되었습니다!</span>}
          {saveError && <span style={{ marginLeft: 12, fontSize: 13, color: "#E8192C" }}>{saveError}</span>}
        </div>
      </div>
    </div>
  );
}
