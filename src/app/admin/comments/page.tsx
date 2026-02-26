"use client";

import { useEffect, useState } from "react";
import { getSetting, saveSetting } from "@/lib/db";

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

function maskIp(ip: string): string {
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
  return ip.replace(/[^.:]/g, "*");
}

export default function AdminCommentsPage() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [filter, setFilter] = useState<"all" | "approved" | "pending" | "spam">("all");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmDeleteAllSpam, setConfirmDeleteAllSpam] = useState(false);
  const [blockedIps, setBlockedIps] = useState<string[]>([]);
  const [showIpBlock, setShowIpBlock] = useState(false);
  const [ipBlockInput, setIpBlockInput] = useState("");
  const [activeTab, setActiveTab] = useState<"list" | "blocked">("list");

  useEffect(() => {
    getSetting<Comment[] | null>("cp-comments", null).then((stored) => {
      setComments(stored ?? []);
    });
    getSetting<string[] | null>("cp-blocked-ips", null).then((ips) => {
      if (ips) setBlockedIps(ips);
    });
  }, []);

  const saveComments = async (updated: Comment[]) => {
    setComments(updated);
    await saveSetting("cp-comments", updated);
  };

  const saveBlockedIps = async (updated: string[]) => {
    setBlockedIps(updated);
    await saveSetting("cp-blocked-ips", updated);
  };

  const handleBlockIp = (ip: string) => {
    if (!ip || blockedIps.includes(ip)) return;
    saveBlockedIps([...blockedIps, ip]);
    // IP가 차단되면 해당 IP의 모든 댓글을 spam으로 변경
    saveComments(comments.map((c) => c.ip === ip ? { ...c, status: "spam" as const } : c));
    setIpBlockInput("");
  };

  const handleUnblockIp = (ip: string) => {
    saveBlockedIps(blockedIps.filter((b) => b !== ip));
  };

  const handleStatusChange = (id: string, status: Comment["status"]) => {
    saveComments(comments.map((c) => (c.id === id ? { ...c, status } : c)));
  };

  const handleDelete = (id: string) => {
    saveComments(comments.filter((c) => c.id !== id));
    setConfirmDelete(null);
  };

  const handleDeleteAllSpam = () => {
    saveComments(comments.filter((c) => c.status !== "spam"));
    setConfirmDeleteAllSpam(false);
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>댓글 관리</h1>
        <div style={{ display: "flex", gap: 4 }}>
          {(["list", "blocked"] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: "7px 16px", fontSize: 14, fontWeight: activeTab === tab ? 600 : 400, color: activeTab === tab ? "#E8192C" : "#666", background: activeTab === tab ? "#FFF0F0" : "#FFF", border: `1px solid ${activeTab === tab ? "#E8192C" : "#DDD"}`, borderRadius: 8, cursor: "pointer" }}>
              {tab === "list" ? "댓글 목록" : `IP 차단 (${blockedIps.length})`}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "blocked" && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24, marginBottom: 16, maxWidth: 500 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>IP 차단 추가</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={ipBlockInput}
                onChange={(e) => setIpBlockInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleBlockIp(ipBlockInput.trim()); }}
                placeholder="차단할 IP 주소 (예: 192.168.1.1)"
                style={{ flex: 1, padding: "8px 12px", border: "1px solid #DDD", borderRadius: 8, fontSize: 14, outline: "none" }}
              />
              <button onClick={() => handleBlockIp(ipBlockInput.trim())} style={{ padding: "8px 18px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>차단</button>
            </div>
            <div style={{ fontSize: 12, color: "#999", marginTop: 8 }}>차단된 IP의 기존 댓글은 자동으로 스팸 처리됩니다.</div>
          </div>
          <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
            {blockedIps.length === 0 ? (
              <div style={{ padding: "30px 20px", textAlign: "center", color: "#999", fontSize: 14 }}>차단된 IP가 없습니다.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
                    <th style={{ padding: "10px 20px", textAlign: "left", fontWeight: 500, color: "#666" }}>IP 주소</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 500, color: "#666", width: 100 }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {blockedIps.map((ip) => (
                    <tr key={ip} style={{ borderBottom: "1px solid #EEE" }}>
                      <td style={{ padding: "12px 20px", fontFamily: "monospace", color: "#333" }}>{ip}</td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <button onClick={() => handleUnblockIp(ip)} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, color: "#666", fontSize: 12, cursor: "pointer" }}>해제</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === "list" && (
      <div>
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
          confirmDeleteAllSpam ? (
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#C62828" }}>스팸 {counts.spam}개를 삭제할까요?</span>
              <button onClick={handleDeleteAllSpam} style={{ padding: "4px 12px", fontSize: 12, background: "#C62828", color: "#FFF", border: "none", borderRadius: 6, cursor: "pointer" }}>삭제</button>
              <button onClick={() => setConfirmDeleteAllSpam(false)} style={{ padding: "4px 12px", fontSize: 12, background: "#FFF", border: "1px solid #DDD", borderRadius: 6, cursor: "pointer" }}>취소</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDeleteAllSpam(true)} style={{ marginLeft: "auto", padding: "6px 16px", fontSize: 13, color: "#C62828", background: "#FFEBEE", border: "1px solid #FFCDD2", borderRadius: 6, cursor: "pointer" }}>
              스팸 일괄 삭제
            </button>
          )
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
                  <span style={{ fontSize: 11, color: "#CCC", marginLeft: 8 }}>IP: {maskIp(comment.ip)}</span>
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
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {comment.status !== "approved" && (
                  <button onClick={() => handleStatusChange(comment.id, "approved")} style={{ padding: "4px 12px", fontSize: 12, background: "#E8F5E9", border: "1px solid #C8E6C9", borderRadius: 6, color: "#2E7D32", cursor: "pointer" }}>승인</button>
                )}
                {comment.status !== "spam" && (
                  <button onClick={() => handleStatusChange(comment.id, "spam")} style={{ padding: "4px 12px", fontSize: 12, background: "#FFF3E0", border: "1px solid #FFE0B2", borderRadius: 6, color: "#E65100", cursor: "pointer" }}>스팸</button>
                )}
                {comment.ip && !blockedIps.includes(comment.ip) && (
                  <button onClick={() => { handleBlockIp(comment.ip); }} title={`IP ${comment.ip} 차단`} style={{ padding: "4px 12px", fontSize: 12, background: "#FFF", border: "1px solid #999", borderRadius: 6, color: "#666", cursor: "pointer" }}>IP차단</button>
                )}
                {comment.ip && blockedIps.includes(comment.ip) && (
                  <span style={{ fontSize: 11, padding: "3px 8px", background: "#FFEBEE", color: "#C62828", borderRadius: 4, fontWeight: 500 }}>차단됨</span>
                )}
                {confirmDelete === comment.id ? (
                  <>
                    <span style={{ fontSize: 12, color: "#E8192C" }}>삭제할까요?</span>
                    <button onClick={() => handleDelete(comment.id)} style={{ padding: "4px 12px", fontSize: 12, background: "#E8192C", color: "#FFF", border: "none", borderRadius: 6, cursor: "pointer" }}>삭제</button>
                    <button onClick={() => setConfirmDelete(null)} style={{ padding: "4px 12px", fontSize: 12, background: "#FFF", border: "1px solid #DDD", borderRadius: 6, cursor: "pointer" }}>취소</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDelete(comment.id)} style={{ padding: "4px 12px", fontSize: 12, background: "#FFF", border: "1px solid #E8192C", borderRadius: 6, color: "#E8192C", cursor: "pointer" }}>삭제</button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
    )}
    </div>
  );
}
