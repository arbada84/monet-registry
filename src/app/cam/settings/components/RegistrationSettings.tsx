"use client";

import { inputStyle, labelStyle } from "@/lib/admin-styles";
import type { SettingsChangeHandler, SiteSettings } from "../hooks/useSettings";
import { SectionCard } from "./SectionCard";

interface RegistrationSettingsProps {
  settings: SiteSettings;
  onChange: SettingsChangeHandler;
}

export function RegistrationSettings({ settings, onChange }: RegistrationSettingsProps) {
  return (
    <SectionCard title="법인 / 등록 정보">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={labelStyle}>등록번호</label>
            <input
              type="text"
              value={settings.registerNo}
              onChange={(e) => onChange("registerNo", e.target.value)}
              placeholder="서울 아 00000"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>등록일</label>
            <input
              type="text"
              value={settings.registerDate}
              onChange={(e) => onChange("registerDate", e.target.value)}
              placeholder="2024.01.01"
              style={inputStyle}
            />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={labelStyle}>발행인</label>
            <input
              type="text"
              value={settings.publisher}
              onChange={(e) => onChange("publisher", e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>편집인</label>
            <input
              type="text"
              value={settings.editor}
              onChange={(e) => onChange("editor", e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
        <div>
          <label style={labelStyle}>인터넷신문 등록번호</label>
          <input
            type="text"
            value={settings.internetRegisterNo}
            onChange={(e) => onChange("internetRegisterNo", e.target.value)}
            placeholder="서울 아 00000"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>청소년보호책임자</label>
          <input
            type="text"
            value={settings.youthManager}
            onChange={(e) => onChange("youthManager", e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>
    </SectionCard>
  );
}
