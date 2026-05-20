"use client";

import { inputStyle, labelStyle } from "@/lib/admin-styles";
import type { SettingsChangeHandler, SiteSettings } from "../hooks/useSettings";
import { SectionCard } from "./SectionCard";

interface BrandSettingsProps {
  settings: SiteSettings;
  onChange: SettingsChangeHandler;
}

export function BrandSettings({ settings, onChange }: BrandSettingsProps) {
  return (
    <SectionCard title="브랜드 설정">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={labelStyle}>사이트명</label>
          <input
            type="text"
            value={settings.siteName}
            onChange={(e) => onChange("siteName", e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>슬로건</label>
          <input
            type="text"
            value={settings.slogan}
            onChange={(e) => onChange("slogan", e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>악센트 컬러</label>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input
              type="color"
              value={settings.accentColor}
              onChange={(e) => onChange("accentColor", e.target.value)}
              style={{
                width: 48,
                height: 40,
                border: "1px solid #DDD",
                borderRadius: 8,
                cursor: "pointer",
                padding: 2,
              }}
            />
            <span style={{ fontSize: 14, color: "#666" }}>{settings.accentColor}</span>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
