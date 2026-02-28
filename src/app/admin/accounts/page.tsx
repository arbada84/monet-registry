"use client";

import { useEffect, useState } from "react";
import { inputStyle, labelStyle } from "@/lib/admin-styles";
import { getSetting, saveSetting } from "@/lib/db";

interface AdminAccount {
  id: string;
  username: string;
  passwordHash: string;
  name: string;
  role: "superadmin" | "admin" | "editor";
  email?: string;
  createdAt: string;
  lastLogin: string;
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: "최고 관리자",
  admin: "관리자",
  editor: "편집자",
};

async function hashPassword(password: string): Promise<string> {
  const resp = await fetch("/api/auth/hash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "hash", password }),
  });
  const data = await resp.json();
  return data.hash;
}

export default function AdminAccountsPage() {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [editing, setEditing] = useState<AdminAccount | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    getSetting<AdminAccount[] | null>("cp-admin-accounts", null).then(async (stored) => {
      if (stored && stored.length > 0) {
        // Migrate old plaintext passwords if needed
        const needsMigration = stored.some(
          (acc) => "password" in acc && !(acc as AdminAccount).passwordHash
        );
        const migrated = await Promise.all(
          stored.map(async (acc) => {
            if ("password" in acc && !(acc as AdminAccount).passwordHash) {
              const old = acc as unknown as { password: string };
              return { ...acc, passwordHash: await hashPassword(old.password) };
            }
            return acc;
          })
        );
        setAccounts(migrated);
        // 마이그레이션된 경우 DB에도 저장 (평문 비밀번호 제거)
        if (needsMigration) {
          await saveSetting("cp-admin-accounts", migrated);
        }
      } else {
        setAccounts([]);
      }
    });
  }, []);

  const saveAccounts = async (updated: AdminAccount[]) => {
    setAccounts(updated);
    await saveSetting("cp-admin-accounts", updated);
  };

  const handleAddNew = () => {
    setNewPassword("");
    setEditing({
      id: `acc-${Date.now()}`,
      username: "",
      passwordHash: "",
      name: "",
      role: "editor",
      email: "",
      createdAt: new Date().toISOString().slice(0, 10),
      lastLogin: "-",
    });
  };

  const handleEdit = (acc: AdminAccount) => {
    setNewPassword("");
    setEditing(acc);
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.username.trim()) {
      setFormError("아이디를 입력해주세요.");
      return;
    }
    const isNew = !accounts.find((a) => a.id === editing.id);
    if (isNew && !newPassword.trim()) {
      setFormError("비밀번호를 입력해주세요.");
      return;
    }
    if (newPassword) {
      if (newPassword.length < 8) {
        setFormError("비밀번호는 8자 이상이어야 합니다.");
        return;
      }
      if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        setFormError("비밀번호는 영문자와 숫자를 모두 포함해야 합니다.");
        return;
      }
    }
    const duplicate = accounts.find(
      (a) => a.username === editing.username && a.id !== editing.id
    );
    if (duplicate) {
      setFormError("이미 사용 중인 아이디입니다.");
      return;
    }
    setFormError("");

    const finalAccount = { ...editing };
    if (newPassword) {
      finalAccount.passwordHash = await hashPassword(newPassword);
    }

    const updated = isNew
      ? [...accounts, finalAccount]
      : accounts.map((a) => (a.id === finalAccount.id ? finalAccount : a));
    try {
      await saveAccounts(updated);
      setEditing(null);
      setNewPassword("");
      setSaved(true);
      setSaveError("");
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장에 실패했습니다. 다시 시도해주세요.");
    }
  };

  const handleDeleteConfirm = (id: string) => {
    const target = accounts.find((a) => a.id === id);
    if (target?.role === "superadmin" && accounts.filter((a) => a.role === "superadmin").length <= 1) {
      setFormError("최고 관리자는 최소 1명 이상이어야 합니다.");
      return;
    }
    setConfirmDelete(id);
  };

  const handleDelete = (id: string) => {
    saveAccounts(accounts.filter((a) => a.id !== id));
    setConfirmDelete(null);
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
              <label style={labelStyle}>
                {accounts.find((a) => a.id === editing.id) ? "새 비밀번호 (변경 시에만 입력)" : "비밀번호"}
              </label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="8자 이상, 영문+숫자 포함" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>이름</label>
              <input type="text" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="표시 이름" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>이메일</label>
              <input type="email" value={editing.email || ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} placeholder="admin@example.com" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>권한</label>
              <select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value as AdminAccount["role"] })} style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}>
                <option value="superadmin">최고 관리자</option>
                <option value="admin">관리자</option>
                <option value="editor">편집자</option>
              </select>
            </div>
            {formError && (
              <div style={{ fontSize: 13, color: "#E8192C", background: "#FFF0F0", border: "1px solid #FFCDD2", borderRadius: 6, padding: "8px 12px" }}>{formError}</div>
            )}
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={handleSave} style={{ padding: "10px 24px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                저장
              </button>
              <button onClick={() => { setEditing(null); setNewPassword(""); setFormError(""); }} style={{ padding: "10px 24px", background: "#FFF", color: "#333", border: "1px solid #DDD", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>
                취소
              </button>
              {saved && <span style={{ fontSize: 14, color: "#4CAF50", fontWeight: 500, alignSelf: "center" }}>저장되었습니다!</span>}
            </div>
            {saveError && (
              <div style={{ fontSize: 13, color: "#E8192C", background: "#FFF0F0", border: "1px solid #FFCDD2", borderRadius: 6, padding: "8px 12px", marginTop: 4 }}>{saveError}</div>
            )}
          </div>
        </div>
      )}

      <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
              <th style={{ padding: "10px 20px", textAlign: "left", fontWeight: 500, color: "#666" }}>아이디</th>
              <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>이름</th>
              <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>이메일</th>
              <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>권한</th>
              <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>생성일</th>
              <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>마지막 로그인</th>
              <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 500, color: "#666", width: 160 }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((acc) => (
              <tr key={acc.id} style={{ borderBottom: "1px solid #EEE" }}>
                <td style={{ padding: "12px 20px", fontWeight: 500 }}>{acc.username}</td>
                <td style={{ padding: "12px 16px", color: "#666" }}>{acc.name || "-"}</td>
                <td style={{ padding: "12px 16px", color: "#666", fontSize: 13 }}>{acc.email || "-"}</td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 500, background: acc.role === "superadmin" ? "#E8192C" : acc.role === "admin" ? "#2196F3" : "#FF9800", color: "#FFF" }}>
                    {ROLE_LABELS[acc.role]}
                  </span>
                </td>
                <td style={{ padding: "12px 16px", color: "#666" }}>{acc.createdAt}</td>
                <td style={{ padding: "12px 16px", color: "#666", fontSize: 12 }}>
                  {acc.lastLogin && acc.lastLogin !== "-"
                    ? new Date(acc.lastLogin).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
                    : "-"}
                </td>
                <td style={{ padding: "12px 16px", textAlign: "center" }}>
                  <button onClick={() => handleEdit(acc)} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, color: "#333", fontSize: 12, cursor: "pointer", marginRight: 6 }}>
                    수정
                  </button>
                  {confirmDelete === acc.id ? (
                    <>
                      <button onClick={() => handleDelete(acc.id)} style={{ padding: "4px 12px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", marginRight: 4 }}>삭제</button>
                      <button onClick={() => setConfirmDelete(null)} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>취소</button>
                    </>
                  ) : (
                    <button onClick={() => handleDeleteConfirm(acc.id)} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #E8192C", borderRadius: 6, color: "#E8192C", fontSize: 12, cursor: "pointer" }}>
                      삭제
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
