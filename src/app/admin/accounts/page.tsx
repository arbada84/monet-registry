"use client";

import { useEffect, useState } from "react";

interface AdminAccount {
  id: string;
  username: string;
  password: string;
  name: string;
  role: "superadmin" | "admin" | "editor";
  createdAt: string;
  lastLogin: string;
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: "최고 관리자",
  admin: "관리자",
  editor: "편집자",
};

const DEFAULT_ACCOUNTS: AdminAccount[] = [
  {
    id: "acc-1",
    username: "admin",
    password: "admin1234",
    name: "관리자",
    role: "superadmin",
    createdAt: "2024-01-01",
    lastLogin: new Date().toISOString().slice(0, 10),
  },
];

export default function AdminAccountsPage() {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [editing, setEditing] = useState<AdminAccount | null>(null);
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("cp-admin-accounts");
    if (stored) {
      setAccounts(JSON.parse(stored));
    } else {
      localStorage.setItem("cp-admin-accounts", JSON.stringify(DEFAULT_ACCOUNTS));
      setAccounts(DEFAULT_ACCOUNTS);
    }
  }, []);

  const saveAccounts = (updated: AdminAccount[]) => {
    setAccounts(updated);
    localStorage.setItem("cp-admin-accounts", JSON.stringify(updated));
  };

  const handleAddNew = () => {
    setEditing({
      id: `acc-${Date.now()}`,
      username: "",
      password: "",
      name: "",
      role: "editor",
      createdAt: new Date().toISOString().slice(0, 10),
      lastLogin: "-",
    });
  };

  const handleSave = () => {
    if (!editing) return;
    if (!editing.username.trim() || !editing.password.trim()) {
      alert("아이디와 비밀번호를 입력해주세요.");
      return;
    }
    const duplicate = accounts.find(
      (a) => a.username === editing.username && a.id !== editing.id
    );
    if (duplicate) {
      alert("이미 사용 중인 아이디입니다.");
      return;
    }
    const exists = accounts.find((a) => a.id === editing.id);
    const updated = exists
      ? accounts.map((a) => (a.id === editing.id ? editing : a))
      : [...accounts, editing];
    saveAccounts(updated);
    setEditing(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDelete = (id: string) => {
    const target = accounts.find((a) => a.id === id);
    if (target?.role === "superadmin" && accounts.filter((a) => a.role === "superadmin").length <= 1) {
      alert("최고 관리자는 최소 1명 이상이어야 합니다.");
      return;
    }
    if (!confirm("이 계정을 삭제하시겠습니까?")) return;
    saveAccounts(accounts.filter((a) => a.id !== id));
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    fontSize: 14,
    border: "1px solid #DDD",
    borderRadius: 8,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    fontWeight: 500,
    color: "#333",
    marginBottom: 6,
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>관리자 계정 관리</h1>
        <button
          onClick={handleAddNew}
          style={{ padding: "10px 20px", background: "#E8192C", color: "#FFF", borderRadius: 8, fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer" }}
        >
          + 계정 추가
        </button>
      </div>

      {/* Edit form */}
      {editing && (
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24, marginBottom: 24, maxWidth: 480 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>
            {accounts.find((a) => a.id === editing.id) ? "계정 수정" : "새 계정 추가"}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>아이디</label>
              <input type="text" value={editing.username} onChange={(e) => setEditing({ ...editing, username: e.target.value })} placeholder="로그인 아이디" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>비밀번호</label>
              <input type="text" value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} placeholder="비밀번호" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>이름</label>
              <input type="text" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="표시 이름" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>권한</label>
              <select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value as AdminAccount["role"] })} style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}>
                <option value="superadmin">최고 관리자</option>
                <option value="admin">관리자</option>
                <option value="editor">편집자</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={handleSave} style={{ padding: "10px 24px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                저장
              </button>
              <button onClick={() => setEditing(null)} style={{ padding: "10px 24px", background: "#FFF", color: "#333", border: "1px solid #DDD", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>
                취소
              </button>
              {saved && <span style={{ fontSize: 14, color: "#4CAF50", fontWeight: 500, alignSelf: "center" }}>저장되었습니다!</span>}
            </div>
          </div>
        </div>
      )}

      {/* Accounts table */}
      <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
              <th style={{ padding: "10px 20px", textAlign: "left", fontWeight: 500, color: "#666" }}>아이디</th>
              <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>이름</th>
              <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>비밀번호</th>
              <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>권한</th>
              <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>생성일</th>
              <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 500, color: "#666", width: 160 }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((acc) => (
              <tr key={acc.id} style={{ borderBottom: "1px solid #EEE" }}>
                <td style={{ padding: "12px 20px", fontWeight: 500 }}>{acc.username}</td>
                <td style={{ padding: "12px 16px", color: "#666" }}>{acc.name || "-"}</td>
                <td style={{ padding: "12px 16px", color: "#666" }}>
                  <span style={{ fontFamily: "monospace", fontSize: 13 }}>
                    {showPassword[acc.id] ? acc.password : "••••••••"}
                  </span>
                  <button
                    onClick={() => setShowPassword((p) => ({ ...p, [acc.id]: !p[acc.id] }))}
                    style={{ marginLeft: 8, padding: "2px 8px", fontSize: 11, background: "transparent", border: "1px solid #DDD", borderRadius: 4, cursor: "pointer", color: "#666" }}
                  >
                    {showPassword[acc.id] ? "숨김" : "보기"}
                  </button>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 500, background: acc.role === "superadmin" ? "#E8192C" : acc.role === "admin" ? "#2196F3" : "#FF9800", color: "#FFF" }}>
                    {ROLE_LABELS[acc.role]}
                  </span>
                </td>
                <td style={{ padding: "12px 16px", color: "#666" }}>{acc.createdAt}</td>
                <td style={{ padding: "12px 16px", textAlign: "center" }}>
                  <button onClick={() => setEditing(acc)} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, color: "#333", fontSize: 12, cursor: "pointer", marginRight: 6 }}>
                    수정
                  </button>
                  <button onClick={() => handleDelete(acc.id)} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #E8192C", borderRadius: 6, color: "#E8192C", fontSize: 12, cursor: "pointer" }}>
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
