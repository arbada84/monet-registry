"use client";

import { useEffect, useState } from "react";

interface AccessLog {
  id: string;
  username: string;
  name: string;
  role: string;
  ip: string;
  userAgent: string;
  timestamp: string;
}

interface ActivityLog {
  id: string;
  username: string;
  name: string;
  role: string;
  action: string;
  target?: string;
  targetId?: string;
  detail?: string;
  ip: string;
  timestamp: string;
}

type Tab = "access" | "activity";

export default function LogsPage() {
  const [tab, setTab] = useState<Tab>("access");
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    if (tab === "access") {
      fetch("/api/db/access-logs", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => setAccessLogs(d.data || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      fetch("/api/db/activity-logs", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => setActivityLogs(d.data || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [tab]);

  const roleLabel = (role: string) => {
    if (role === "superadmin") return "최고관리자";
    if (role === "admin") return "관리자";
    if (role === "reporter") return "기자";
    return role;
  };

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch { return ts; }
  };

  const tabStyle = (active: boolean) => ({
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: active ? 700 : 400,
    color: active ? "#E8192C" : "#666",
    background: active ? "#FFF" : "transparent",
    border: "none",
    borderBottom: active ? "2px solid #E8192C" : "2px solid transparent",
    cursor: "pointer" as const,
  });

  const thStyle = { padding: "10px 14px", textAlign: "left" as const, fontWeight: 500, color: "#666", fontSize: 13 };
  const tdStyle = { padding: "10px 14px", fontSize: 13, color: "#333", borderTop: "1px solid #F0F0F0" };

  const filteredAccessLogs = search
    ? accessLogs.filter((l) => l.name.includes(search) || l.username.includes(search) || l.ip.includes(search))
    : accessLogs;

  const filteredActivityLogs = search
    ? activityLogs.filter((l) => l.name.includes(search) || l.action.includes(search) || (l.target || "").includes(search))
    : activityLogs;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 20 }}>로그 관리</h1>

      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #EEE", marginBottom: 20 }}>
        <button onClick={() => setTab("access")} style={tabStyle(tab === "access")}>접속 로그</button>
        <button onClick={() => setTab("activity")} style={tabStyle(tab === "activity")}>활동 기록</button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름, IP, 행동 검색..."
          style={{ padding: "8px 14px", border: "1px solid #DDD", borderRadius: 8, fontSize: 13, width: 300, outline: "none" }}
        />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#999" }}>불러오는 중...</div>
      ) : tab === "access" ? (
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
          {filteredAccessLogs.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 14 }}>접속 기록이 없습니다.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#FAFAFA" }}>
                    <th style={thStyle}>이름</th>
                    <th style={thStyle}>아이디</th>
                    <th style={thStyle}>역할</th>
                    <th style={thStyle}>IP</th>
                    <th style={thStyle}>접속일시</th>
                    <th style={thStyle}>브라우저</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccessLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={tdStyle}>{log.name}</td>
                      <td style={tdStyle}>{log.username}</td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 500,
                          background: log.role === "superadmin" ? "#EDE7F6" : log.role === "reporter" ? "#E3F2FD" : "#F5F5F5",
                          color: log.role === "superadmin" ? "#5E35B1" : log.role === "reporter" ? "#1565C0" : "#666",
                        }}>
                          {roleLabel(log.role)}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12 }}>{log.ip}</td>
                      <td style={{ ...tdStyle, fontSize: 12, color: "#888" }}>{formatTime(log.timestamp)}</td>
                      <td style={{ ...tdStyle, fontSize: 11, color: "#AAA", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.userAgent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
          {filteredActivityLogs.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 14 }}>활동 기록이 없습니다.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#FAFAFA" }}>
                    <th style={thStyle}>이름</th>
                    <th style={thStyle}>역할</th>
                    <th style={thStyle}>행동</th>
                    <th style={thStyle}>대상</th>
                    <th style={thStyle}>상세</th>
                    <th style={thStyle}>IP</th>
                    <th style={thStyle}>일시</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActivityLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={tdStyle}>{log.name}</td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 500,
                          background: log.role === "superadmin" ? "#EDE7F6" : log.role === "reporter" ? "#E3F2FD" : "#F5F5F5",
                          color: log.role === "superadmin" ? "#5E35B1" : log.role === "reporter" ? "#1565C0" : "#666",
                        }}>
                          {roleLabel(log.role)}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 500,
                          background: log.action.includes("삭제") ? "#FFEBEE" : log.action.includes("작성") ? "#E8F5E9" : "#FFF3E0",
                          color: log.action.includes("삭제") ? "#C62828" : log.action.includes("작성") ? "#2E7D32" : "#E65100",
                        }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.target || "-"}</td>
                      <td style={{ ...tdStyle, fontSize: 12, color: "#888" }}>{log.detail || "-"}</td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12 }}>{log.ip}</td>
                      <td style={{ ...tdStyle, fontSize: 12, color: "#888" }}>{formatTime(log.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 12, color: "#AAA" }}>
        {tab === "access" ? `최근 ${filteredAccessLogs.length}건` : `최근 ${filteredActivityLogs.length}건`} (최대 {tab === "access" ? 500 : 1000}건 보관)
      </div>
    </div>
  );
}
