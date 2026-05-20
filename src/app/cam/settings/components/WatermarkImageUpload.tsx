"use client";

import type { Dispatch, SetStateAction } from "react";
import { AdminPreviewImage } from "@/components/ui/AdminPreviewImage";
import type { WatermarkSettings } from "@/types/article";

interface WatermarkImageUploadProps {
  imageUrl: string;
  setWmSettings: Dispatch<SetStateAction<WatermarkSettings>>;
  wmImgUploading: boolean;
  setWmImgUploading: Dispatch<SetStateAction<boolean>>;
  wmImgError: string;
  setWmImgError: Dispatch<SetStateAction<string>>;
}

export function WatermarkImageUpload({
  imageUrl,
  setWmSettings,
  wmImgUploading,
  setWmImgUploading,
  wmImgError,
  setWmImgError,
}: WatermarkImageUploadProps) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <input
          type="file"
          accept="image/*"
          disabled={wmImgUploading}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
              setWmImgError("이미지 파일은 2MB 이하여야 합니다.");
              e.target.value = "";
              return;
            }

            setWmImgError("");
            setWmImgUploading(true);
            try {
              const formData = new FormData();
              formData.append("file", file);
              const res = await fetch("/api/upload/image?noWatermark=1", { method: "POST", body: formData });
              const data = await res.json();
              if (data.success && data.url) {
                setWmSettings((prev) => ({ ...prev, imageUrl: data.url }));
              } else {
                setWmImgError(data.error || "업로드에 실패했습니다.");
              }
            } catch {
              setWmImgError("업로드 중 오류가 발생했습니다.");
            } finally {
              setWmImgUploading(false);
              e.target.value = "";
            }
          }}
          style={{ fontSize: 14 }}
        />
        {wmImgUploading && <span style={{ fontSize: 12, color: "#999" }}>업로드 중...</span>}
      </div>

      {wmImgError && (
        <div style={{ fontSize: 13, color: "#E8192C", background: "#FFF0F0", border: "1px solid #FFCDD2", borderRadius: 6, padding: "8px 12px", marginBottom: 8 }}>
          {wmImgError}
        </div>
      )}

      {imageUrl && (
        <div style={{ padding: 12, background: "#FAFAFA", borderRadius: 8, border: "1px solid #EEE", textAlign: "center" }}>
          <AdminPreviewImage
            src={imageUrl}
            alt="워터마크 이미지"
            style={{ maxWidth: 160, maxHeight: 60, objectFit: "contain" }}
          />
          <div style={{ fontSize: 12, color: "#999", marginTop: 6 }}>워터마크 이미지 미리보기</div>
        </div>
      )}
    </>
  );
}
