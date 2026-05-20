"use client";

import { ArticleActionBar } from "./ArticleActionBar";
import { ArticleAiToolsSection } from "./ArticleAiToolsSection";
import { ArticleMetadataForm } from "./ArticleMetadataForm";
import { ArticlePreviewModal } from "./ArticlePreviewModal";
import { ArticleReviewHistory } from "./ArticleReviewHistory";
import { ArticleSourceBanner } from "./ArticleSourceBanner";
import { PortalDistributionSettings } from "./PortalDistributionSettings";
import { SaveProgressNotice } from "./SaveProgressNotice";
import { SeoChecklist } from "./SeoChecklist";
import { SeoSettingsSection } from "./SeoSettingsSection";
import { useArticleEditor } from "../hooks/useArticleEditor";

export function AdminArticleEditForm() {
  const editor = useArticleEditor();

  if (editor.pageLoading) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 16, color: "#666" }}>기사 데이터를 불러오는 중...</div>
      </div>
    );
  }

  if (editor.notFound) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 18, color: "#666", marginBottom: 20 }}>기사를 찾을 수 없습니다.</div>
        <button
          onClick={editor.goToList}
          style={{ padding: "10px 24px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
        >
          목록으로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>기사 수정</h1>
        {editor.saveSuccess && (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#4CAF50", fontWeight: 600 }}>저장되었습니다!</span>
            <button
              type="button"
              onClick={editor.goToList}
              style={{ padding: "5px 14px", fontSize: 13, background: "#4CAF50", color: "#FFF", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}
            >
              목록으로
            </button>
          </div>
        )}
      </div>

      <form ref={editor.formRef} onSubmit={editor.handleSubmit} style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 20 }}>
        <ArticleSourceBanner sourceUrl={editor.sourceUrl} />
        <ArticleMetadataForm {...editor.metadataProps} />
        <SeoSettingsSection {...editor.seoSettingsProps} />
        <ArticleAiToolsSection {...editor.aiToolsProps} />
        <PortalDistributionSettings {...editor.portalSettingsProps} />

        {editor.submitError && (
          <div style={{ padding: "10px 16px", background: "#FFEBEE", border: "1px solid #FFCDD2", borderRadius: 8, color: "#C62828", fontSize: 13 }}>
            {editor.submitError}
          </div>
        )}

        <SeoChecklist {...editor.seoChecklistProps} />
        <ArticleActionBar {...editor.actionBarProps} />
        <SaveProgressNotice {...editor.saveProgressNoticeProps} />
      </form>

      <ArticleReviewHistory {...editor.reviewHistoryProps} />

      {editor.showPreview && (
        <ArticlePreviewModal {...editor.previewModalProps} />
      )}
    </div>
  );
}
