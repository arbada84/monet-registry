"use client";

import type { Dispatch, SetStateAction } from "react";
import { AdminPreviewImage } from "@/components/ui/AdminPreviewImage";
import { inputStyle, labelStyle } from "@/lib/admin-styles";
import type { WatermarkSettings } from "@/types/article";
import type { SaveSetting } from "../hooks/useSettings";
import { SectionCard } from "./SectionCard";
import { WatermarkImageUpload } from "./WatermarkImageUpload";

interface WatermarkSettingsSectionProps {
  wmSettings: WatermarkSettings;
  setWmSettings: Dispatch<SetStateAction<WatermarkSettings>>;
  wmSaved: boolean;
  setWmSaved: Dispatch<SetStateAction<boolean>>;
  wmSaveError: string;
  setWmSaveError: Dispatch<SetStateAction<string>>;
  wmImgUploading: boolean;
  setWmImgUploading: Dispatch<SetStateAction<boolean>>;
  wmImgError: string;
  setWmImgError: Dispatch<SetStateAction<string>>;
  wmPreviewUrl: string;
  setWmPreviewUrl: Dispatch<SetStateAction<string>>;
  saveSetting: SaveSetting;
}

export function WatermarkSettingsSection({
  wmSettings,
  setWmSettings,
  wmSaved,
  setWmSaved,
  wmSaveError,
  setWmSaveError,
  wmImgUploading,
  setWmImgUploading,
  wmImgError,
  setWmImgError,
  wmPreviewUrl,
  setWmPreviewUrl,
  saveSetting,
}: WatermarkSettingsSectionProps) {
  return (
    <SectionCard title="워터마크 설정">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "#333" }}>이미지 워터마크</div>
          <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>켜면 이미지 업로드 시 자동으로 워터마크가 적용됩니다.</div>
        </div>
        <button
          onClick={() => setWmSettings((prev) => ({ ...prev, enabled: !prev.enabled }))}
          style={{
            width: 52,
            height: 28,
            borderRadius: 14,
            background: wmSettings.enabled ? "#E8192C" : "#CCC",
            border: "none",
            cursor: "pointer",
            position: "relative",
            transition: "background 0.2s",
            flexShrink: 0,
          }}
          aria-label={wmSettings.enabled ? "워터마크 끄기" : "워터마크 켜기"}
        >
          <span
            style={{
              position: "absolute",
              top: 3,
              left: wmSettings.enabled ? 27 : 3,
              width: 22,
              height: 22,
              background: "#FFF",
              borderRadius: "50%",
              transition: "left 0.2s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            }}
          />
        </button>
      </div>

      {wmSettings.enabled && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>워터마크 종류</label>
            <div style={{ display: "flex", gap: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="wmType"
                  checked={wmSettings.type === "text"}
                  onChange={() => setWmSettings((prev) => ({ ...prev, type: "text" }))}
                />
                텍스트
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="wmType"
                  checked={wmSettings.type === "image"}
                  onChange={() => setWmSettings((prev) => ({ ...prev, type: "image" }))}
                />
                이미지 (로고)
              </label>
            </div>
          </div>

          {wmSettings.type === "text" && (
            <div>
              <label style={labelStyle}>워터마크 텍스트</label>
              <input
                type="text"
                value={wmSettings.text}
                onChange={(e) => setWmSettings((prev) => ({ ...prev, text: e.target.value }))}
                placeholder="(C) 컬처피플"
                style={inputStyle}
              />
            </div>
          )}

          {wmSettings.type === "image" && (
            <div>
              <label style={labelStyle}>워터마크 이미지</label>
              <WatermarkImageUpload
                imageUrl={wmSettings.imageUrl}
                setWmSettings={setWmSettings}
                wmImgUploading={wmImgUploading}
                setWmImgUploading={setWmImgUploading}
                wmImgError={wmImgError}
                setWmImgError={setWmImgError}
              />
            </div>
          )}

          <div>
            <label style={labelStyle}>투명도: {Math.round(wmSettings.opacity * 100)}%</label>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={Math.round(wmSettings.opacity * 100)}
              onChange={(e) => setWmSettings((prev) => ({ ...prev, opacity: Number(e.target.value) / 100 }))}
              style={{ width: "100%" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#999" }}>
              <span>10% (투명)</span>
              <span>100% (불투명)</span>
            </div>
          </div>

          <div>
            <label style={labelStyle}>크기 (원본 대비): {wmSettings.size}%</label>
            <input
              type="range"
              min="10"
              max="50"
              step="5"
              value={wmSettings.size}
              onChange={(e) => setWmSettings((prev) => ({ ...prev, size: Number(e.target.value) }))}
              style={{ width: "100%" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#999" }}>
              <span>10% (작게)</span>
              <span>50% (크게)</span>
            </div>
          </div>

          <div>
            <label style={labelStyle}>위치</label>
            <div style={{ fontSize: 14, color: "#666", padding: "8px 12px", background: "#F5F5F5", borderRadius: 6 }}>
              하단 우측 (고정)
            </div>
          </div>

          <div>
            <label style={labelStyle}>워터마크 미리보기 테스트</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={async () => {
                  setWmPreviewUrl("");
                  try {
                    await saveSetting("cp-watermark-settings", wmSettings);
                  } catch {
                    // 미리보기는 저장 실패를 화면 저장 버튼에서 별도로 다룹니다.
                  }
                  const canvas = document.createElement("canvas");
                  canvas.width = 600;
                  canvas.height = 400;
                  const ctx = canvas.getContext("2d");
                  if (ctx) {
                    const grad = ctx.createLinearGradient(0, 0, 600, 400);
                    grad.addColorStop(0, "#667eea");
                    grad.addColorStop(1, "#764ba2");
                    ctx.fillStyle = grad;
                    ctx.fillRect(0, 0, 600, 400);
                    ctx.fillStyle = "#FFF";
                    ctx.font = "bold 24px sans-serif";
                    ctx.textAlign = "center";
                    ctx.fillText("워터마크 테스트 이미지", 300, 200);
                  }
                  canvas.toBlob(async (blob) => {
                    if (!blob) return;
                    const formData = new FormData();
                    formData.append("file", blob, "test.png");
                    try {
                      const res = await fetch("/api/upload/image", { method: "POST", body: formData });
                      const data = await res.json();
                      if (data.success && data.url) {
                        setWmPreviewUrl(data.url);
                      }
                    } catch {
                      // 미리보기 생성 실패는 기존 화면과 동일하게 조용히 무시합니다.
                    }
                  }, "image/png");
                }}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  background: "#F5F5F5",
                  border: "1px solid #DDD",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                미리보기 생성
              </button>
              <span style={{ fontSize: 12, color: "#999" }}>설정 저장 후 테스트 이미지에 워터마크를 적용합니다.</span>
            </div>
            {wmPreviewUrl && (
              <div style={{ marginTop: 12, padding: 12, background: "#FAFAFA", borderRadius: 8, border: "1px solid #EEE", textAlign: "center" }}>
                <AdminPreviewImage
                  src={wmPreviewUrl}
                  alt="워터마크 미리보기"
                  style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 6 }}
                />
                <div style={{ fontSize: 12, color: "#999", marginTop: 6 }}>워터마크 적용 결과</div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <button
          onClick={async () => {
            try {
              await saveSetting("cp-watermark-settings", wmSettings);
              setWmSaved(true);
              setWmSaveError("");
              setTimeout(() => setWmSaved(false), 3000);
            } catch (e) {
              setWmSaveError(e instanceof Error ? e.message : "저장에 실패했습니다.");
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
          워터마크 설정 저장
        </button>
        {wmSaved && (
          <span style={{ marginLeft: 12, fontSize: 14, color: "#4CAF50", fontWeight: 500 }}>
            저장되었습니다!
          </span>
        )}
        {wmSaveError && (
          <div style={{ fontSize: 13, color: "#E8192C", background: "#FFF0F0", border: "1px solid #FFCDD2", borderRadius: 6, padding: "8px 12px", marginTop: 8 }}>
            {wmSaveError}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
