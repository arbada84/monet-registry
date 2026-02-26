"use client";

import { useEffect, useState } from "react";
import { getSetting, saveSetting } from "@/lib/db";
import { inputStyle, labelStyle } from "@/lib/admin-styles";

interface SiteSettings {
  siteName: string;
  slogan: string;
  accentColor: string;
  address: string;
  phone: string;
  email: string;
  logo: string;
}

const DEFAULT_SETTINGS: SiteSettings = {
  siteName: "컬처피플",
  slogan: "문화를 전하는 사람들",
  accentColor: "#E8192C",
  address: "서울특별시 중구 세종대로 110",
  phone: "02-1234-5678",
  email: "contact@culturepeople.co.kr",
  logo: "",
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [logoError, setLogoError] = useState("");

  useEffect(() => {
    getSetting<SiteSettings | null>("cp-site-settings", null).then((stored) => {
      if (stored) {
        setSettings({ ...DEFAULT_SETTINGS, ...stored });
      }
    });
  }, []);

  const handleChange = (field: keyof SiteSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("이미지 파일은 2MB 이하여야 합니다.");
      e.target.value = "";
      return;
    }
    setLogoError("");
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      handleChange("logo", result);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    await saveSetting("cp-site-settings", settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <h1
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "#111",
          marginBottom: 24,
        }}
      >
        사이트 설정
      </h1>

      <div
        style={{
          maxWidth: 640,
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {/* Brand Settings */}
        <section
          style={{
            background: "#FFFFFF",
            border: "1px solid #EEEEEE",
            borderRadius: 10,
            padding: 24,
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#111",
              marginBottom: 20,
              paddingBottom: 12,
              borderBottom: "1px solid #EEEEEE",
            }}
          >
            브랜드 설정
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>사이트명</label>
              <input
                type="text"
                value={settings.siteName}
                onChange={(e) => handleChange("siteName", e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>슬로건</label>
              <input
                type="text"
                value={settings.slogan}
                onChange={(e) => handleChange("slogan", e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>악센트 컬러</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <input
                  type="color"
                  value={settings.accentColor}
                  onChange={(e) => handleChange("accentColor", e.target.value)}
                  style={{
                    width: 48,
                    height: 40,
                    border: "1px solid #DDD",
                    borderRadius: 8,
                    cursor: "pointer",
                    padding: 2,
                  }}
                />
                <span style={{ fontSize: 14, color: "#666" }}>
                  {settings.accentColor}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Logo Upload */}
        <section
          style={{
            background: "#FFFFFF",
            border: "1px solid #EEEEEE",
            borderRadius: 10,
            padding: 24,
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#111",
              marginBottom: 20,
              paddingBottom: 12,
              borderBottom: "1px solid #EEEEEE",
            }}
          >
            로고 / 마크 업로드
          </h2>
          <div>
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              style={{ fontSize: 14, marginBottom: logoError ? 8 : 16 }}
            />
            {logoError && (
              <div style={{ fontSize: 13, color: "#E8192C", background: "#FFF0F0", border: "1px solid #FFCDD2", borderRadius: 6, padding: "8px 12px", marginBottom: 12 }}>
                {logoError}
              </div>
            )}
            {settings.logo && (
              <div
                style={{
                  marginTop: 12,
                  padding: 16,
                  background: "#FAFAFA",
                  borderRadius: 8,
                  border: "1px solid #EEE",
                  textAlign: "center",
                }}
              >
                <img
                  src={settings.logo}
                  alt="로고 미리보기"
                  style={{ maxWidth: 200, maxHeight: 80, objectFit: "contain" }}
                />
                <div style={{ fontSize: 12, color: "#999", marginTop: 8 }}>
                  로고 미리보기
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Company Info */}
        <section
          style={{
            background: "#FFFFFF",
            border: "1px solid #EEEEEE",
            borderRadius: 10,
            padding: 24,
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#111",
              marginBottom: 20,
              paddingBottom: 12,
              borderBottom: "1px solid #EEEEEE",
            }}
          >
            회사 정보
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>주소</label>
              <input
                type="text"
                value={settings.address}
                onChange={(e) => handleChange("address", e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>전화번호</label>
              <input
                type="text"
                value={settings.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>이메일</label>
              <input
                type="email"
                value={settings.email}
                onChange={(e) => handleChange("email", e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
        </section>

        {/* Save Button */}
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
            <span
              style={{
                marginLeft: 12,
                fontSize: 14,
                color: "#4CAF50",
                fontWeight: 500,
              }}
            >
              저장되었습니다!
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
