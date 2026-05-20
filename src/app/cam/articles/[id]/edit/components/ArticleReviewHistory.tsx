"use client";

import type { AuditEntry } from "@/types/article";

interface ArticleReviewHistoryProps {
  reviewNote: string;
  auditTrail: AuditEntry[];
}

export function ArticleReviewHistory({ reviewNote, auditTrail }: ArticleReviewHistoryProps) {
  return (
    <>
      {reviewNote && (
        <div style={{ background: "#FFF3E0", border: "1px solid #FFE082", borderRadius: 10, padding: "16px 20px", maxWidth: 720 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#E65100", marginBottom: 6 }}>반려 사유</div>
          <div style={{ fontSize: 13, color: "#333", lineHeight: 1.6 }}>{reviewNote}</div>
        </div>
      )}

      {auditTrail.length > 0 && (
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: "16px 20px", maxWidth: 720 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#333", marginBottom: 12 }}>기사 이력</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {auditTrail.map((entry, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, padding: "8px 12px", background: "#FAFAFA", borderRadius: 8, border: "1px solid #F0F0F0" }}>
                <span style={{
                  padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600,
                  background: entry.action === "승인" ? "#E8F5E9" : entry.action === "반려" ? "#FFEBEE" : entry.action === "상신" ? "#E3F2FD" : entry.action === "게시" ? "#F3E5F5" : "#FFF3E0",
                  color: entry.action === "승인" ? "#2E7D32" : entry.action === "반려" ? "#C62828" : entry.action === "상신" ? "#1565C0" : entry.action === "게시" ? "#7B1FA2" : "#E65100",
                }}>
                  {entry.action}
                </span>
                <span style={{ color: "#333" }}>{entry.by}</span>
                {entry.ip && <span style={{ color: "#AAA", fontFamily: "monospace", fontSize: 11 }}>{entry.ip}</span>}
                <span style={{ color: "#999", fontSize: 12, marginLeft: "auto" }}>
                  {new Date(entry.at).toLocaleString("ko-KR")}
                </span>
                {entry.note && <span style={{ color: "#888", fontSize: 12 }}>— {entry.note}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
