"use client";

import { useEffect, useState } from "react";

interface Comment {
  id: string;
  articleId: string;
  articleTitle: string;
  author: string;
  content: string;
  date: string;
  status: "approved" | "pending" | "spam";
  ip: string;
}

const SAMPLE_COMMENTS: Comment[] = [
  { id: "cmt-1", articleId: "sample-1", articleTitle: "2024 한국 문화예술 트렌드 분석", author: "문화사랑", content: "좋은 기사 감사합니다. 올해 문화계 동향을 한눈에 볼 수 있어서 유익합니다.", date: "2024-12-02", status: "approved", ip: "192.168.1.10" },
  { id: "cmt-2", articleId: "sample-2", articleTitle: "신인 배우 김하늘 인터뷰", author: "드라마팬", content: "앞으로 활약이 기대됩니다!", date: "2024-12-06", status: "approved", ip: "192.168.1.20" },
  { id: "cmt-3", articleId: "sample-1", articleTitle: "2024 한국 문화예술 트렌드 분석", author: "스팸봇", content: "최고의 수익 기회! 지금 바로 클릭하세요...", date: "2024-12-03", status: "spam", ip: "10.0.0.99" },
  { id: "cmt-4", articleId: "sample-4", articleTitle: "겨울 여행지 추천 BEST 10", author: "여행러", content: "5번 여행지 정보가 좀 다른 것 같은데 확인 부탁드립니다.", date: "2024-12-13", status: "pending", ip: "192.168.1.30" },
];

export default function AdminCommentsPage() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [filter, setFilter] = useState<"all" | "approved" | "pending" | "spam">("all");

  useEffect(() => {
    const stored = localStorage.getItem("cp-comments");
    if (stored) {
      setComments(JSON.parse(stored));
    } else {
      localStorage.setItem("cp-comments", JSON.stringify(SAMPLE_COMMENTS));
      setComments(SAMPLE_COMMENTS);
    }
  }, []);

  const saveComments = (updated: Comment[]) => {
    setComments(updated);
    localStorage.setItem("cp-comments", JSON.stringify(updated));
  };

  const handleStatusChange = (id: string, status: Comment["status"]) => {
    saveComments(comments.map((c) => (c.id === id ? { ...c, status } : c)));
  };

  const handleDelete = (id: string) => {
    if (!confirm("이 댓글을 삭제하시겠습니까?")) return;
    saveComments(comments.filter((c) => c.id !== id));
  };

  const handleDeleteAllSpam = () => {
    if (!confirm("모든 스팸 댓글을 삭제하시겠습니까?")) return;
    saveComments(comments.filter((c) => c.status !== "spam"));
  };

  const filtered = filter === "all" ? comments : comments.filter((c) => c.status === filter);

  const counts = {
    all: comments.length,
    approved: comments.filter((c) => c.status === "approved").length,
    pending: comments.filter((c) => c.status === "pending").length,
    spam: comments.filter((c) => c.status === "spam").length,
  };

  const STATUS_LABELS: Record<Comment["status"], { label: string; bg: string; color: string }> = {
    approved: { label: "승인", bg: "#E8F5E9", color: "#2E7D32" },
    pending: { label: "대기", bg: "#FFF3E0", color: "#E65100" },
    spam: { label: "스팸", bg: "#FFEBEE", color: "#C62828" },
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 24 }}>댓글 관리</h1>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center" }}>
        {(["all", "approved", "pending", "spam"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: "6px 16px",
              fontSize: 13,
              fontWeight: filter === key ? 600 : 400,
              color: filter === key ? "#E8192C" : "#666",
              background: filter === key ? "#FFF0F0" : "#FFF",
              border: `1px solid ${filter === key ? "#E8192C" : "#DDD"}`,
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {key === "all" ? "전체" : STATUS_LABELS[key].label} ({counts[key]})
          </button>
        ))}
        {counts.spam > 0 && (
          <button onClick={handleDeleteAllSpam} style={{ marginLeft: "auto", padding: "6px 16px", fontSize: 13, color: "#C62828", background: "#FFEBEE", border: "1px solid #FFCDD2", borderRadius: 6, cursor: "pointer" }}>
            스팸 일괄 삭제
          </button>
        )}
      </div>

      {/* Comments list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.length === 0 ? (
          <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: "40px 20px", textAlign: "center", color: "#999", fontSize: 14 }}>
            댓글이 없습니다.
          </div>
        ) : (
          filtered.map((comment) => (
            <div key={comment.id} style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14, color: "#111" }}>{comment.author}</span>
                  <span style={{ fontSize: 12, color: "#999", marginLeft: 8 }}>{comment.date}</span>
                  <span style={{ fontSize: 11, color: "#CCC", marginLeft: 8 }}>IP: {comment.ip}</span>
                </div>
                <span style={{ padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 500, background: STATUS_LABELS[comment.status].bg, color: STATUS_LABELS[comment.status].color }}>
                  {STATUS_LABELS[comment.status].label}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
                기사: {comment.articleTitle}
              </div>
              <div style={{ fontSize: 14, color: "#333", lineHeight: 1.6, marginBottom: 12, padding: "8px 12px", background: "#FAFAFA", borderRadius: 6 }}>
                {comment.content}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {comment.status !== "approved" && (
                  <button onClick={() => handleStatusChange(comment.id, "approved")} style={{ padding: "4px 12px", fontSize: 12, background: "#E8F5E9", border: "1px solid #C8E6C9", borderRadius: 6, color: "#2E7D32", cursor: "pointer" }}>승인</button>
                )}
                {comment.status !== "spam" && (
                  <button onClick={() => handleStatusChange(comment.id, "spam")} style={{ padding: "4px 12px", fontSize: 12, background: "#FFF3E0", border: "1px solid #FFE0B2", borderRadius: 6, color: "#E65100", cursor: "pointer" }}>스팸</button>
                )}
                <button onClick={() => handleDelete(comment.id)} style={{ padding: "4px 12px", fontSize: 12, background: "#FFF", border: "1px solid #E8192C", borderRadius: 6, color: "#E8192C", cursor: "pointer" }}>삭제</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
