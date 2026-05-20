"use client";

import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import ImageSearchPanel from "@/components/ImageSearchPanel";
import { AdminPreviewImage } from "@/components/ui/AdminPreviewImage";
import { inputStyle, labelStyle } from "@/lib/admin-styles";

type ThumbMode = "file" | "url";

interface ArticleThumbnailControlProps {
  title: string;
  body: string;
  thumbnail: string;
  setThumbnail: Dispatch<SetStateAction<string>>;
  thumbMode: ThumbMode;
  setThumbMode: Dispatch<SetStateAction<ThumbMode>>;
  thumbUrl: string;
  setThumbUrl: Dispatch<SetStateAction<string>>;
  thumbUploading: boolean;
  thumbUploadError: string;
  thumbnailAlt: string;
  setThumbnailAlt: Dispatch<SetStateAction<string>>;
  setBody: Dispatch<SetStateAction<string>>;
  handleThumbnailUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleReuploadImages: () => Promise<void>;
  reuploading: boolean;
  reuploadMsg: string;
}

export function ArticleThumbnailControl({
  title,
  body,
  thumbnail,
  setThumbnail,
  thumbMode,
  setThumbMode,
  thumbUrl,
  setThumbUrl,
  thumbUploading,
  thumbUploadError,
  thumbnailAlt,
  setThumbnailAlt,
  setBody,
  handleThumbnailUpload,
  handleReuploadImages,
  reuploading,
  reuploadMsg,
}: ArticleThumbnailControlProps) {
  return (
    <div>
      <label style={labelStyle}>썸네일 이미지</label>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {(["file", "url"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setThumbMode(m)}
            style={{ padding: "4px 14px", fontSize: 12, border: `1px solid ${thumbMode === m ? "#E8192C" : "#DDD"}`, borderRadius: 6, background: thumbMode === m ? "#FFF0F0" : "#FFF", color: thumbMode === m ? "#E8192C" : "#666", cursor: "pointer" }}
          >
            {m === "file" ? "파일 업로드" : "URL 직접 입력"}
          </button>
        ))}
      </div>
      {thumbMode === "file" ? (
        <div>
          <input type="file" accept="image/*" disabled={thumbUploading} onChange={handleThumbnailUpload} style={{ fontSize: 14 }} />
          {thumbUploading && <span style={{ marginLeft: 8, fontSize: 12, color: "#999" }}>업로드 중...</span>}
          {thumbUploadError && <div style={{ marginTop: 4, fontSize: 12, color: "#E8192C" }}>{thumbUploadError}</div>}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <input type="url" value={thumbUrl} onChange={(e) => setThumbUrl(e.target.value)} placeholder="https://example.com/image.jpg" style={{ ...inputStyle, flex: 1 }} />
          <button type="button" onClick={() => setThumbnail(thumbUrl)} style={{ padding: "8px 16px", background: "#F5F5F5", border: "1px solid #DDD", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>적용</button>
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <input
          type="text"
          value={thumbnailAlt}
          onChange={(e) => setThumbnailAlt(e.target.value)}
          placeholder="이미지 설명 (alt 텍스트, SEO용)"
          style={{ ...inputStyle, fontSize: 12, marginBottom: 8 }}
        />
        {thumbnail && (
          <div style={{ padding: 12, background: "#FAFAFA", borderRadius: 8, border: "1px solid #EEE", display: "flex", alignItems: "center", gap: 12 }}>
            <AdminPreviewImage src={thumbnail} alt={thumbnailAlt || "썸네일 미리보기"} style={{ maxWidth: 240, maxHeight: 160, objectFit: "cover", borderRadius: 6 }} />
            <button
              type="button"
              onClick={() => {
                setThumbnail("");
                setThumbUrl("");
                setThumbnailAlt("");
              }}
              style={{ fontSize: 12, color: "#E8192C", background: "none", border: "none", cursor: "pointer", padding: 4 }}
            >
              삭제
            </button>
          </div>
        )}
      </div>
      <ImageSearchPanel
        title={title}
        body={body}
        onSelectThumbnail={(url, alt) => {
          setThumbnail(url);
          setThumbUrl(url);
          setThumbMode("url");
          if (alt && !thumbnailAlt) setThumbnailAlt(alt);
        }}
        onInsertBody={(url, alt) => {
          setBody((prev) => prev + `<p><img src="${url}" alt="${alt}" /></p>`);
        }}
      />
      <div style={{ marginTop: 12, padding: "10px 14px", background: "#F0F4FF", borderRadius: 8, border: "1px solid #C5D8FF", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={handleReuploadImages}
          disabled={reuploading}
          style={{ padding: "6px 14px", fontSize: 13, background: reuploading ? "#CCC" : "#3366CC", color: "#FFF", border: "none", borderRadius: 6, cursor: reuploading ? "not-allowed" : "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
        >
          {reuploading ? "이관 중…" : "이미지 Supabase 재이관"}
        </button>
        <span style={{ fontSize: 12, color: "#3355AA", flex: 1 }}>
          {reuploadMsg || "본문·썸네일의 외부 이미지를 Supabase Storage에 업로드합니다. 이관 후 저장 필요."}
        </span>
      </div>
    </div>
  );
}
