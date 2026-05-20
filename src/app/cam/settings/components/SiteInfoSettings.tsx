"use client";

import { inputStyle, labelStyle } from "@/lib/admin-styles";
import type { SettingsChangeHandler, SiteSettings } from "../hooks/useSettings";
import { SectionCard } from "./SectionCard";

interface SiteInfoSettingsProps {
  settings: SiteSettings;
  onChange: SettingsChangeHandler;
}

export function SiteInfoSettings({ settings, onChange }: SiteInfoSettingsProps) {
  return (
    <SectionCard title="회사 정보">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={labelStyle}>주소</label>
          <input
            type="text"
            value={settings.address}
            onChange={(e) => onChange("address", e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={labelStyle}>전화번호</label>
            <input
              type="text"
              value={settings.phone}
              onChange={(e) => onChange("phone", e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>팩스</label>
            <input
              type="text"
              value={settings.fax}
              onChange={(e) => onChange("fax", e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
        <div>
          <label style={labelStyle}>이메일</label>
          <input
            type="email"
            value={settings.email}
            onChange={(e) => onChange("email", e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>대표이사</label>
          <input
            type="text"
            value={settings.ceo}
            onChange={(e) => onChange("ceo", e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>
    </SectionCard>
  );
}
