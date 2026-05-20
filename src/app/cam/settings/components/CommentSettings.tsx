"use client";

import type { Dispatch, SetStateAction } from "react";
import type { CommentSettings as CommentSettingsState, SaveSetting } from "../hooks/useSettings";
import { SectionCard } from "./SectionCard";

interface CommentSettingsProps {
  commentSettings: CommentSettingsState;
  setCommentSettings: Dispatch<SetStateAction<CommentSettingsState>>;
  commentSaved: boolean;
  setCommentSaved: Dispatch<SetStateAction<boolean>>;
  saveSetting: SaveSetting;
}

export function CommentSettings({
  commentSettings,
  setCommentSettings,
  commentSaved,
  setCommentSaved,
  saveSetting,
}: CommentSettingsProps) {
  return (
    <SectionCard title="댓글 설정">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "#333" }}>전체 댓글 기능</div>
          <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>끄면 모든 기사의 댓글 섹션이 숨겨집니다.</div>
        </div>
        <button
          onClick={async () => {
            const next = { enabled: !commentSettings.enabled };
            setCommentSettings(next);
            try {
              await saveSetting("cp-comment-settings", next);
              setCommentSaved(true);
              setTimeout(() => setCommentSaved(false), 2000);
            } catch {
              // 자동 저장 실패는 기존 화면과 동일하게 조용히 무시합니다.
            }
          }}
          style={{
            width: 52,
            height: 28,
            borderRadius: 14,
            background: commentSettings.enabled ? "#E8192C" : "#CCC",
            border: "none",
            cursor: "pointer",
            position: "relative",
            transition: "background 0.2s",
            flexShrink: 0,
          }}
          aria-label={commentSettings.enabled ? "댓글 끄기" : "댓글 켜기"}
        >
          <span
            style={{
              position: "absolute",
              top: 3,
              left: commentSettings.enabled ? 27 : 3,
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
      {commentSaved && (
        <div style={{ fontSize: 13, color: "#4CAF50", fontWeight: 500 }}>자동 저장됨</div>
      )}
    </SectionCard>
  );
}
