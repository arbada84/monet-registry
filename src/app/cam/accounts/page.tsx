"use client";

import { useEffect, useState } from "react";
import { AdminPreviewImage } from "@/components/ui/AdminPreviewImage";
import { inputStyle, labelStyle } from "@/lib/admin-styles";
import { getSetting, saveSetting } from "@/lib/db";

interface AdminAccount {
  id: string;
  username: string;
  passwordHash: string;
  name: string;
  role: "superadmin" | "admin" | "reporter";
  email?: string;
  phone?: string;
  department?: string;
  title?: string;
  photo?: string;
  bio?: string;
  active?: boolean;
  joinDate?: string;
  createdAt: string;
  lastLogin: string;
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: "최고 관리자",
  admin: "관리자",
  reporter: "기자",
};

const DEPARTMENTS = ["문화부", "연예부", "스포츠부", "사회부", "경제부", "IT부", "라이프부", "포토부", "편집부"];

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
  const [tab, setTab] = useState<"all" | "superadmin" | "admin" | "reporter">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      let accs: AdminAccount[] = [];
      const stored = await getSetting<AdminAccount[] | null>("cp-admin-accounts", null);
      if (stored && stored.length > 0) {
        // editor → reporter 마이그레이션
        accs = stored.map((acc) => ({
          ...acc,
          role: (acc.role as string) === "editor" ? "reporter" as const : acc.role,
        }));
        // 비밀번호 마이그레이션
        const needsMigration = accs.some((a) => "password" in a && !a.passwordHash);
        if (needsMigration) {
          accs = await Promise.all(accs.map(async (acc) => {
            if ("password" in acc && !acc.passwordHash) {
              const old = acc as unknown as { password: string };
              return { ...acc, passwordHash: await hashPassword(old.password) };
            }
            return acc;
          }));
        }
        if (needsMigration || stored.some((a) => (a.role as string) === "editor")) {
          await saveSetting("cp-admin-accounts", accs);
        }
      }

      setAccounts(accs);
      setLoading(false);
    })();
  }, []);

  const saveAccounts = async (updated: AdminAccount[]): Promise<boolean> => {
    const previous = accounts;
    setAccounts(updated);
    try {
      await saveSetting("cp-admin-accounts", updated);
      return true;
    } catch (e) {
      setAccounts(previous);
      console.error("계정 저장 실패:", e);
      return false;
    }
  };

  const handleAddNew = () => {
    setNewPassword("");
    setEditing({
      id: `acc-${Date.now()}`,
      username: "",
      passwordHash: "",
      name: "",
      role: "reporter",
      email: "",
      department: DEPARTMENTS[0],
      title: "기자",
      phone: "",
      photo: "",
      bio: "",
      active: true,
      joinDate: new Date().toISOString().slice(0, 10),
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
    if (!editing.name.trim()) { setFormError("이름을 입력해주세요."); return; }
    if (!editing.username.trim()) { setFormError("로그인 아이디를 입력해주세요."); return; }
    const isNew = !accounts.find((a) => a.id === editing.id);
    if (isNew && !newPassword.trim()) { setFormError("비밀번호를 입력해주세요."); return; }
    if (newPassword) {
      if (newPassword.length < 8) { setFormError("비밀번호는 8자 이상이어야 합니다."); return; }
      if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) { setFormError("비밀번호는 영문자와 숫자를 모두 포함해야 합니다."); return; }
    }
    const duplicate = accounts.find((a) => a.username === editing.username && a.id !== editing.id);
    if (duplicate) { setFormError("이미 사용 중인 아이디입니다."); return; }
    setFormError("");
    const finalAccount = { ...editing };
    if (newPassword) finalAccount.passwordHash = await hashPassword(newPassword);
    const updated = isNew ? [...accounts, finalAccount] : accounts.map((a) => (a.id === finalAccount.id ? finalAccount : a));
    const ok = await saveAccounts(updated);
    if (ok) {
      setEditing(null);
      setNewPassword("");
      setSaved(true);
      setSaveError("");
      setTimeout(() => setSaved(false), 3000);
    } else {
      setSaveError("저장에 실패했습니다.");
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

  const handleDelete = async (id: string) => {
    const ok = await saveAccounts(accounts.filter((a) => a.id !== id));
    if (ok) setConfirmDelete(null);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editing) return;
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/image", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success && data.url) setEditing((prev) => ({ ...prev!, photo: data.url }));
    } catch { /* ignore */ }
    e.target.value = "";
  };

  const filtered = tab === "all" ? accounts : accounts.filter((a) => a.role === tab);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>계정 관리</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {saved && <span style={{ fontSize: 14, color: "#4CAF50", fontWeight: 500 }}>저장됨!</span>}
          <button onClick={handleAddNew} style={{ padding: "10px 20px", background: "#E8192C", color: "#FFF", borderRadius: 8, fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer" }}>
            + 계정 추가
          </button>
        </div>
      </div>

      {/* 권한별 필터 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["all", "superadmin", "admin", "reporter"] as const).map((t) => {
          const count = t === "all" ? accounts.length : accounts.filter((a) => a.role === t).length;
          const label = t === "all" ? "전체" : ROLE_LABELS[t];
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: tab === t ? 600 : 400, cursor: "pointer",
              background: tab === t ? "#E8192C" : "#FFF", color: tab === t ? "#FFF" : "#666", border: tab === t ? "none" : "1px solid #DDD",
            }}>
              {label} ({count})
            </button>
          );
        })}
      </div>

      {editing && (
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24, marginBottom: 24, maxWidth: 560 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>
            {accounts.find((a) => a.id === editing.id) ? "계정 수정" : "새 계정 추가"}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>이름 *</label>
                <input type="text" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>권한</label>
                <select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value as AdminAccount["role"] })} style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}>
                  <option value="superadmin">최고 관리자</option>
                  <option value="admin">관리자</option>
                  <option value="reporter">기자</option>
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>로그인 아이디 *</label>
                <input type="text" value={editing.username} onChange={(e) => setEditing({ ...editing, username: e.target.value })} placeholder="필수" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>{accounts.find((a) => a.id === editing.id) ? "비밀번호 변경" : "비밀번호"}</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="8자 이상" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>이메일</label>
                <input type="email" value={editing.email || ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>연락처</label>
                <input type="text" value={editing.phone || ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} style={inputStyle} />
              </div>
            </div>
            {/* 프로필 정보 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>부서</label>
                <select value={editing.department || DEPARTMENTS[0]} onChange={(e) => setEditing({ ...editing, department: e.target.value })} style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}>
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>직함</label>
                <input type="text" value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="기자, 부장 등" style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>소개</label>
              <textarea value={editing.bio || ""} onChange={(e) => setEditing({ ...editing, bio: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
            </div>
            <div>
              <label style={labelStyle}>프로필 사진</label>
              <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ fontSize: 14 }} />
              {editing.photo && <AdminPreviewImage src={editing.photo} alt="" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", marginTop: 8, border: "1px solid #EEE" }} />}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={editing.active !== false} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} style={{ width: 16, height: 16 }} />
              활성 (기사 작성자 목록에 표시)
            </label>
            {formError && <div style={{ fontSize: 13, color: "#E8192C", background: "#FFF0F0", border: "1px solid #FFCDD2", borderRadius: 6, padding: "8px 12px" }}>{formError}</div>}
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={handleSave} style={{ padding: "10px 24px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>저장</button>
              <button onClick={() => { setEditing(null); setNewPassword(""); setFormError(""); }} style={{ padding: "10px 24px", background: "#FFF", color: "#333", border: "1px solid #DDD", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>취소</button>
            </div>
            {saveError && <div style={{ fontSize: 13, color: "#E8192C", background: "#FFF0F0", border: "1px solid #FFCDD2", borderRadius: 6, padding: "8px 12px", marginTop: 4 }}>{saveError}</div>}
          </div>
        </div>
      )}

      <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 700 }}>
          <thead>
            <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
              <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>이름</th>
              <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>아이디</th>
              <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 500, color: "#666" }}>부서/직함</th>
              <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 500, color: "#666" }}>권한</th>
              <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 500, color: "#666" }}>상태</th>
              <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 500, color: "#666" }}>최근 로그인</th>
              <th style={{ padding: "10px 12px", textAlign: "center", fontWeight: 500, color: "#666", width: 140 }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((acc) => (
              <tr key={acc.id} style={{ borderBottom: "1px solid #EEE" }}>
                <td style={{ padding: "12px 16px", fontWeight: 500 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {acc.photo ? <AdminPreviewImage src={acc.photo} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} /> : <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#F0F0F0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#999" }}>{acc.name?.charAt(0)}</div>}
                    {acc.name || "-"}
                  </div>
                </td>
                <td style={{ padding: "12px 16px", color: "#666", fontSize: 13 }}>{acc.username || <span style={{ color: "#CCC" }}>미설정</span>}</td>
                <td style={{ padding: "12px 12px", color: "#666", fontSize: 13 }}>{acc.department ? `${acc.department} · ${acc.title || ""}` : "-"}</td>
                <td style={{ padding: "12px 12px" }}>
                  <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 500, background: acc.role === "superadmin" ? "#E8192C" : acc.role === "admin" ? "#2196F3" : "#FF9800", color: "#FFF" }}>
                    {ROLE_LABELS[acc.role] || acc.role}
                  </span>
                </td>
                <td style={{ padding: "12px 12px" }}>
                  <span style={{ fontSize: 12, color: acc.active !== false ? "#4CAF50" : "#999" }}>{acc.active !== false ? "활성" : "비활성"}</span>
                </td>
                <td style={{ padding: "12px 12px", color: "#666", fontSize: 12 }}>
                  {acc.lastLogin && acc.lastLogin !== "-" ? new Date(acc.lastLogin).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}
                </td>
                <td style={{ padding: "12px 12px", textAlign: "center" }}>
                  <button onClick={() => handleEdit(acc)} style={{ padding: "4px 10px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, color: "#333", fontSize: 12, cursor: "pointer", marginRight: 4 }}>수정</button>
                  {confirmDelete === acc.id ? (
                    <>
                      <button onClick={() => handleDelete(acc.id)} style={{ padding: "4px 10px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", marginRight: 4 }}>삭제</button>
                      <button onClick={() => setConfirmDelete(null)} style={{ padding: "4px 10px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>취소</button>
                    </>
                  ) : (
                    <button onClick={() => handleDeleteConfirm(acc.id)} style={{ padding: "4px 10px", background: "#FFF", border: "1px solid #E8192C", borderRadius: 6, color: "#E8192C", fontSize: 12, cursor: "pointer" }}>삭제</button>
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
