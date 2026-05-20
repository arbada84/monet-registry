"use client";

import type { ChangeEvent } from "react";
import { AdminPreviewImage } from "@/components/ui/AdminPreviewImage";
import type { SiteSettings } from "../hooks/useSettings";
import { SectionCard } from "./SectionCard";

interface LogoUploadSettingsProps {
  settings: SiteSettings;
  logoError: string;
  logoUploading: boolean;
  onLogoUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function LogoUploadSettings({
  settings,
  logoError,
  logoUploading,
  onLogoUpload,
}: LogoUploadSettingsProps) {
  return (
    <SectionCard title="로고 / 마크 업로드">
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: logoError ? 8 : 16 }}>
          <input
            type="file"
            accept="image/*"
            disabled={logoUploading}
            onChange={onLogoUpload}
            style={{ fontSize: 14 }}
          />
          {logoUploading && <span style={{ fontSize: 12, color: "#999" }}>업로드 중...</span>}
        </div>
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
            <AdminPreviewImage
              src={settings.logo}
              alt="로고 미리보기"
              style={{ maxWidth: 200, maxHeight: 80, objectFit: "contain" }}
            />
            <div style={{ fontSize: 12, color: "#999", marginTop: 8 }}>로고 미리보기</div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
