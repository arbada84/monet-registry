"use client";

import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import dynamic from "next/dynamic";
import { inputStyle, labelStyle } from "@/lib/admin-styles";
import DOMPurify from "dompurify";
import { ArticleThumbnailControl } from "./ArticleThumbnailControl";

const RichEditor = dynamic(() => import("@/components/RichEditor"), {
  ssr: false,
  loading: () => <div className="h-96 bg-gray-50 animate-pulse rounded" />,
});

type ArticleStatus = "게시" | "임시저장" | "예약" | "상신";
type ThumbMode = "file" | "url";

interface ArticleMetadataFormProps {
  title: string;
  setTitle: Dispatch<SetStateAction<string>>;
  categories: string[];
  category: string;
  setCategory: Dispatch<SetStateAction<string>>;
  status: ArticleStatus;
  setStatus: Dispatch<SetStateAction<ArticleStatus>>;
  currentRole: string;
  scheduledPublishAt: string;
  setScheduledPublishAt: Dispatch<SetStateAction<string>>;
  authors: { id: string; name: string; email: string }[];
  author: string;
  setAuthor: Dispatch<SetStateAction<string>>;
  authorEmail: string;
  setAuthorEmail: Dispatch<SetStateAction<string>>;
  tags: string;
  setTags: Dispatch<SetStateAction<string>>;
  summary: string;
  setSummary: Dispatch<SetStateAction<string>>;
  body: string;
  setBody: Dispatch<SetStateAction<string>>;
  wordGoal: number;
  setWordGoal: Dispatch<SetStateAction<number>>;
  showMobilePreview: boolean;
  setShowMobilePreview: Dispatch<SetStateAction<boolean>>;
  wordCount: number;
  readingTime: number;
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
  handleThumbnailUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleReuploadImages: () => Promise<void>;
  reuploading: boolean;
  reuploadMsg: string;
}

export function ArticleMetadataForm({
  title,
  setTitle,
  categories,
  category,
  setCategory,
  status,
  setStatus,
  currentRole,
  scheduledPublishAt,
  setScheduledPublishAt,
  authors,
  author,
  setAuthor,
  authorEmail,
  setAuthorEmail,
  tags,
  setTags,
  summary,
  setSummary,
  body,
  setBody,
  wordGoal,
  setWordGoal,
  showMobilePreview,
  setShowMobilePreview,
  wordCount,
  readingTime,
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
  handleThumbnailUpload,
  handleReuploadImages,
  reuploading,
  reuploadMsg,
}: ArticleMetadataFormProps) {
  return (
    <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>제목</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="기사 제목을 입력하세요" style={inputStyle} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>카테고리</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}>
            {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>상태</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as ArticleStatus)} style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}>
            {currentRole === "reporter" ? (
              <>
                <option value="상신">상신</option>
                <option value="임시저장">임시저장</option>
              </>
            ) : (
              <>
                <option value="게시">게시</option>
                <option value="임시저장">임시저장</option>
                <option value="예약">예약 발행</option>
                <option value="상신">상신</option>
              </>
            )}
          </select>
        </div>
      </div>

      {status === "예약" && (
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>예약 발행 일시</label>
          <input type="datetime-local" value={scheduledPublishAt} onChange={(e) => setScheduledPublishAt(e.target.value)} style={inputStyle} />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>작성자</label>
          <select
            value={authors.find((a) => a.name === author)?.id || (author && !authors.some((a) => a.name === author) ? "__unlisted__" : "")}
            onChange={(e) => {
              if (!e.target.value) { setAuthor(""); setAuthorEmail(""); return; }
              if (e.target.value === "__unlisted__") { setAuthorEmail(""); return; }
              const a = authors.find((a) => a.id === e.target.value);
              if (a) { setAuthor(a.name); setAuthorEmail(a.email ?? ""); }
            }}
            style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}
          >
            <option value="">-- 작성자 선택 --</option>
            {author && !authors.some((a) => a.name === author) && (
              <option value="__unlisted__">{author} (미등록)</option>
            )}
            {authors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>작성자 이메일</label>
          <input
            type="email"
            value={authorEmail}
            readOnly
            placeholder="기자 선택 시 자동 입력"
            style={{ ...inputStyle, background: "#F5F5F5", cursor: "default", color: authorEmail ? "#333" : "#AAA" }}
          />
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>태그</label>
        <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="쉼표로 구분 (예: 문화, 예술, 전시)" style={inputStyle} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>요약문</label>
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="기사 요약문 (SNS 공유, 검색결과에 표시)" rows={2} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <label style={labelStyle}>본문</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="number"
              min={0}
              step={500}
              placeholder="목표 글자수"
              value={wordGoal || ""}
              onChange={(e) => setWordGoal(Number(e.target.value))}
              style={{ width: 100, padding: "3px 8px", fontSize: 12, border: "1px solid #DDD", borderRadius: 6, outline: "none" }}
            />
            <button
              type="button"
              onClick={() => setShowMobilePreview(!showMobilePreview)}
              title="모바일 미리보기 (320px)"
              style={{ padding: "3px 10px", fontSize: 12, border: `1px solid ${showMobilePreview ? "#E8192C" : "#DDD"}`, borderRadius: 6, background: showMobilePreview ? "#FFF0F0" : "#FFF", color: showMobilePreview ? "#E8192C" : "#666", cursor: "pointer" }}
            >
              📱 모바일
            </button>
          </div>
        </div>
        {showMobilePreview ? (
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <RichEditor content={body} onChange={setBody} placeholder="기사 본문을 입력하세요" />
            </div>
            <div style={{ width: 320, flexShrink: 0, border: "1px solid #DDD", borderRadius: 8, overflow: "hidden", background: "#FFF" }}>
              <div style={{ background: "#333", padding: "6px 12px", fontSize: 11, color: "#FFF", textAlign: "center" }}>모바일 미리보기 (320px)</div>
              <div style={{ padding: 16, fontSize: 14, lineHeight: 1.7, maxHeight: 400, overflowY: "auto" }}>
                {title && <h1 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, lineHeight: 1.4 }}>{title}</h1>}
                <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(body) }} style={{ color: "#333" }} />
              </div>
            </div>
          </div>
        ) : (
          <RichEditor content={body} onChange={setBody} placeholder="기사 본문을 입력하세요" />
        )}
        {wordGoal > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: wordCount >= wordGoal ? "#4CAF50" : "#999", marginBottom: 2 }}>
              <span>{wordCount.toLocaleString()} / {wordGoal.toLocaleString()}자 목표</span>
              <span>{Math.min(100, Math.round((wordCount / wordGoal) * 100))}%</span>
            </div>
            <div style={{ height: 4, background: "#EEE", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(100, (wordCount / wordGoal) * 100)}%`, background: wordCount >= wordGoal ? "#4CAF50" : "#E8192C", borderRadius: 2, transition: "width 0.3s" }} />
            </div>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12, color: "#999" }}>
          <span>{wordCount.toLocaleString()}자 · 약 {readingTime}분 읽기</span>
          <span>Ctrl+S로 저장</span>
        </div>
      </div>

      <ArticleThumbnailControl
        title={title}
        body={body}
        thumbnail={thumbnail}
        setThumbnail={setThumbnail}
        thumbMode={thumbMode}
        setThumbMode={setThumbMode}
        thumbUrl={thumbUrl}
        setThumbUrl={setThumbUrl}
        thumbUploading={thumbUploading}
        thumbUploadError={thumbUploadError}
        thumbnailAlt={thumbnailAlt}
        setThumbnailAlt={setThumbnailAlt}
        setBody={setBody}
        handleThumbnailUpload={handleThumbnailUpload}
        handleReuploadImages={handleReuploadImages}
        reuploading={reuploading}
        reuploadMsg={reuploadMsg}
      />
    </div>
  );
}
