"use client";

import type { Dispatch, SetStateAction } from "react";
import { inputStyle, labelStyle } from "@/lib/admin-styles";
import type { ImageUploadSettings as ImageUploadSettingsState, SaveSetting } from "../hooks/useSettings";
import { SectionCard } from "./SectionCard";

interface ImageUploadSettingsProps {
  imageSettings: ImageUploadSettingsState;
  setImageSettings: Dispatch<SetStateAction<ImageUploadSettingsState>>;
  imgSettSaved: boolean;
  setImgSettSaved: Dispatch<SetStateAction<boolean>>;
  imgSettSaveError: string;
  setImgSettSaveError: Dispatch<SetStateAction<string>>;
  saveSetting: SaveSetting;
}

export function ImageUploadSettings({
  imageSettings,
  setImageSettings,
  imgSettSaved,
  setImgSettSaved,
  imgSettSaveError,
  setImgSettSaveError,
  saveSetting,
}: ImageUploadSettingsProps) {
  return (
    <SectionCard title="이미지 업로드 설정">
      <div style={{ marginBottom: 16 }}>
        <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={imageSettings.enabled}
            onChange={(e) => setImageSettings({ ...imageSettings, enabled: e.target.checked })}
          />
          업로드 시 자동 WebP 변환
        </label>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>최대 가로 크기 (px)</label>
        <input
          type="number"
          style={inputStyle}
          value={imageSettings.maxWidth}
          min={100}
          max={4096}
          onChange={(e) => setImageSettings({ ...imageSettings, maxWidth: Number(e.target.value) || 1920 })}
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>WebP 변환 품질 (1-100)</label>
        <input
          type="number"
          style={inputStyle}
          value={imageSettings.quality}
          min={1}
          max={100}
          onChange={(e) => setImageSettings({ ...imageSettings, quality: Math.max(1, Math.min(100, Number(e.target.value) || 80)) })}
        />
      </div>
      <p style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>새로 업로드하는 이미지에만 적용됩니다. 기존 이미지는 변환되지 않습니다.</p>
      <div>
        <button
          onClick={async () => {
            try {
              await saveSetting("cp-image-settings", imageSettings);
              setImgSettSaved(true);
              setImgSettSaveError("");
              setTimeout(() => setImgSettSaved(false), 3000);
            } catch (e) {
              setImgSettSaveError(e instanceof Error ? e.message : "저장에 실패했습니다.");
            }
          }}
          style={{
            padding: "10px 24px",
            background: "#E8192C",
            color: "#FFF",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          이미지 설정 저장
        </button>
        {imgSettSaved && (
          <span style={{ marginLeft: 12, fontSize: 14, color: "#4CAF50", fontWeight: 500 }}>
            저장되었습니다!
          </span>
        )}
        {imgSettSaveError && (
          <div style={{ fontSize: 13, color: "#E8192C", background: "#FFF0F0", border: "1px solid #FFCDD2", borderRadius: 6, padding: "8px 12px", marginTop: 8 }}>
            {imgSettSaveError}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
