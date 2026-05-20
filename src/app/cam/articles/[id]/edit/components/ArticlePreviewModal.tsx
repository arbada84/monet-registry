"use client";

import { AdminPreviewImage } from "@/components/ui/AdminPreviewImage";
import DOMPurify from "dompurify";

interface ArticlePreviewModalProps {
  category: string;
  title: string;
  author: string;
  authorEmail: string;
  originalDate: string;
  wordCount: number;
  readingTime: number;
  thumbnail: string;
  summary: string;
  body: string;
  tags: string;
  onClose: () => void;
}

export function ArticlePreviewModal({
  category,
  title,
  author,
  authorEmail,
  originalDate,
  wordCount,
  readingTime,
  thumbnail,
  summary,
  body,
  tags,
  onClose,
}: ArticlePreviewModalProps) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        style={{ background: "#FFF", borderRadius: 12, maxWidth: 720, width: "90%", maxHeight: "90vh", overflow: "auto", padding: 40 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <span style={{ fontSize: 12, color: "#999" }}>기사 미리보기</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#999", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: 11, color: "#E8192C", fontWeight: 600, marginBottom: 8 }}>{category}</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.4, marginBottom: 16 }}>{title || "제목 없음"}</h1>
        <div style={{ display: "flex", gap: 12, fontSize: 13, color: "#999", marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid #EEE" }}>
          <span>{author || "관리자"} 기자{authorEmail ? ` (${authorEmail})` : ""}</span>
          <span>{originalDate || new Date().toISOString().slice(0, 10)}</span>
          <span>{wordCount.toLocaleString()}자</span>
          <span>약 {readingTime}분</span>
        </div>
        {thumbnail && <AdminPreviewImage src={thumbnail} alt="" style={{ width: "100%", borderRadius: 8, marginBottom: 24 }} />}
        {summary && <p style={{ fontSize: 15, color: "#666", lineHeight: 1.8, marginBottom: 24, padding: 16, background: "#F9F9F9", borderRadius: 8 }}>{summary}</p>}
        <div style={{ fontSize: 15, lineHeight: 1.9, color: "#333" }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(body) }} />
        {tags && (
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #EEE", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {tags.split(",").map((tag, i) => (
              <span key={i} style={{ padding: "4px 12px", background: "#F5F5F5", borderRadius: 20, fontSize: 12, color: "#666" }}>#{tag.trim()}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
