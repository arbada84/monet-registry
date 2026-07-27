"use client";

import type { RefObject } from "react";

type ArticleStatus = "게시" | "임시저장" | "예약" | "상신";

interface ArticleActionBarProps {
  currentRole: string;
  pageLoading: boolean;
  saving: boolean;
  reuploading: boolean;
  status: ArticleStatus;
  setStatus: (status: ArticleStatus) => void;
  saveElapsed: number;
  formRef: RefObject<HTMLFormElement | null>;
  setShowPreview: (show: boolean) => void;
  goToList: () => void;
  confirmDelete: boolean;
  deleting: boolean;
  setConfirmDelete: (confirm: boolean) => void;
  onDelete: () => Promise<void>;
  distIndexNow: boolean;
  distGooglePing: boolean;
}

export function ArticleActionBar({
  currentRole,
  pageLoading,
  saving,
  reuploading,
  status,
  setStatus,
  saveElapsed,
  formRef,
  setShowPreview,
  goToList,
  confirmDelete,
  deleting,
  setConfirmDelete,
  onDelete,
  distIndexNow,
  distGooglePing,
}: ArticleActionBarProps) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      {currentRole !== "reporter" && (
        <button
          type="button"
          disabled={pageLoading || saving || reuploading}
          onClick={() => {
            setStatus("게시");
            setTimeout(() => formRef.current?.requestSubmit(), 0);
          }}
          style={{
            padding: "12px 32px", background: (saving || reuploading) ? "#CCC" : "#1565C0", color: "#FFF",
            border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: (saving || reuploading) ? "default" : "pointer",
          }}
        >
          {saving && status === "게시" ? `게시 중... (${saveElapsed}초)` : "게시"}
        </button>
      )}
      <button
        type="submit"
        disabled={pageLoading || saving || reuploading || status === "게시"}
        style={{
          padding: "12px 32px", background: (pageLoading || saving || reuploading || status === "게시") ? "#CCC" : "#E8192C", color: "#FFF",
          border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: (pageLoading || saving || reuploading || status === "게시") ? "default" : "pointer",
        }}
      >
        {saving && status !== "게시" ? `저장 중... (${saveElapsed}초)` : reuploading ? "이미지 이관 중..." : "저장"}
      </button>
      <button
        type="button"
        onClick={() => setShowPreview(true)}
        style={{
          padding: "12px 32px", background: "#FFF", color: "#333", border: "1px solid #DDD",
          borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: "pointer",
        }}
      >
        미리보기
      </button>
      <button
        type="button"
        onClick={goToList}
        style={{
          padding: "12px 32px", background: "#FFF", color: "#999", border: "1px solid #DDD",
          borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: "pointer",
        }}
      >
        취소
      </button>
      {confirmDelete ? (
        <>
          <span style={{ fontSize: 13, color: "#E8192C", fontWeight: 600 }}>정말 삭제할까요?</span>
          <button
            type="button"
            disabled={deleting}
            onClick={onDelete}
            style={{
              padding: "8px 16px", background: "#E8192C", color: "#FFF",
              border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: deleting ? "default" : "pointer",
            }}
          >
            {deleting ? "삭제 중..." : "삭제 확인"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            style={{
              padding: "8px 16px", background: "#FFF", color: "#666", border: "1px solid #DDD",
              borderRadius: 8, fontSize: 13, cursor: "pointer",
            }}
          >
            취소
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          style={{
            padding: "12px 24px", background: "#FFF", color: "#E8192C", border: "1px solid #E8192C",
            borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer",
          }}
        >
          삭제
        </button>
      )}
      {status === "게시" && (distIndexNow || distGooglePing) && (
        <span style={{ fontSize: 12, color: "#1565C0" }}>
          게시 시: {[distIndexNow && "IndexNow", distGooglePing && "Search Console sitemap"].filter(Boolean).join(" + ")}
        </span>
      )}
    </div>
  );
}
