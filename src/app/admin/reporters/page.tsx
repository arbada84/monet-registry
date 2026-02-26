"use client";

import { useEffect, useState } from "react";
import { getSetting, saveSetting } from "@/lib/db";
import { inputStyle, labelStyle } from "@/lib/admin-styles";

interface Reporter {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  title: string;
  photo: string;
  bio: string;
  active: boolean;
  articleCount: number;
  joinDate: string;
}

const SAMPLE_REPORTERS: Reporter[] = [
  { id: "rpt-1", name: "김문화", email: "kim@culturepeople.co.kr", phone: "010-1234-5678", department: "문화부", title: "부장", photo: "", bio: "문화예술 분야 10년 경력 기자", active: true, articleCount: 0, joinDate: "2024-01-01" },
  { id: "rpt-2", name: "이연예", email: "lee@culturepeople.co.kr", phone: "010-2345-6789", department: "연예부", title: "기자", photo: "", bio: "K-POP, 드라마, 영화 담당", active: true, articleCount: 0, joinDate: "2024-03-15" },
  { id: "rpt-3", name: "박스포츠", email: "park@culturepeople.co.kr", phone: "010-3456-7890", department: "스포츠부", title: "기자", photo: "", bio: "축구, 야구 등 스포츠 전문", active: true, articleCount: 0, joinDate: "2024-05-01" },
];

const DEPARTMENTS = ["문화부", "연예부", "스포츠부", "사회부", "경제부", "IT부", "라이프부", "포토부", "편집부"];

export default function AdminReportersPage() {
  const [reporters, setReporters] = useState<Reporter[]>([]);
  const [editing, setEditing] = useState<Reporter | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  // F1: 기사 수 자동 계산
  const [articleCounts, setArticleCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    getSetting<Reporter[] | null>("cp-reporters", null).then((stored) => {
      if (stored) {
        setReporters(stored);
      } else {
        saveSetting("cp-reporters", SAMPLE_REPORTERS);
        setReporters(SAMPLE_REPORTERS);
      }
    });
  }, []);

  // F1: 기사 목록 로드 후 기자별 기사 수 계산
  useEffect(() => {
    fetch("/api/db/articles?limit=9999")
      .then((r) => r.json())
      .then((data) => {
        const counts: Record<string, number> = {};
        (data.articles || []).forEach((a: { author?: string }) => {
          if (a.author) counts[a.author] = (counts[a.author] || 0) + 1;
        });
        setArticleCounts(counts);
      })
      .catch(() => {});
  }, []);

  const saveReporters = async (updated: Reporter[]) => {
    setReporters(updated);
    await saveSetting("cp-reporters", updated);
  };

  const handleAddNew = () => {
    setEditing({
      id: `rpt-${Date.now()}`,
      name: "",
      email: "",
      phone: "",
      department: DEPARTMENTS[0],
      title: "기자",
      photo: "",
      bio: "",
      active: true,
      articleCount: 0,
      joinDate: new Date().toISOString().slice(0, 10),
    });
  };

  const handleSave = () => {
    if (!editing || !editing.name.trim()) {
      setFormError("기자 이름을 입력해주세요.");
      return;
    }
    setFormError("");
    const exists = reporters.find((r) => r.id === editing.id);
    const updated = exists ? reporters.map((r) => (r.id === editing.id ? editing : r)) : [...reporters, editing];
    saveReporters(updated);
    setEditing(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDelete = (id: string) => {
    saveReporters(reporters.filter((r) => r.id !== id));
    setConfirmDelete(null);
  };

  // F2: 프로필 사진 업로드 API 전환 (base64 → /api/upload/image)
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editing) return;
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/image", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success && data.url) {
        setEditing((prev) => ({ ...prev!, photo: data.url }));
      }
    } catch {
      // 업로드 실패 시 무시
    }
    e.target.value = "";
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>기자 관리</h1>
        <button onClick={handleAddNew} style={{ padding: "10px 20px", background: "#E8192C", color: "#FFF", borderRadius: 8, fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer" }}>
          + 기자 추가
        </button>
      </div>

      {editing && (
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24, marginBottom: 24, maxWidth: 560 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>
            {reporters.find((r) => r.id === editing.id) ? "기자 정보 수정" : "새 기자 등록"}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>이름</label>
                <input type="text" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>직함</label>
                <input type="text" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="기자, 부장, 선임기자 등" style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>부서</label>
              <select value={editing.department} onChange={(e) => setEditing({ ...editing, department: e.target.value })} style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>이메일</label>
                <input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>연락처</label>
                <input type="text" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>소개</label>
              <textarea value={editing.bio} onChange={(e) => setEditing({ ...editing, bio: e.target.value })} rows={3} placeholder="기자 소개글" style={{ ...inputStyle, resize: "vertical" }} />
            </div>
            <div>
              <label style={labelStyle}>프로필 사진</label>
              <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ fontSize: 14 }} />
              {editing.photo && (
                <div style={{ marginTop: 8 }}>
                  {/* F2: base64 또는 URL 모두 하위호환 표시 */}
                  <img src={editing.photo} alt="프로필" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: "1px solid #EEE" }} />
                </div>
              )}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} style={{ width: 16, height: 16 }} />
              활성 기자 (기사 작성자 목록에 표시)
            </label>
            {formError && (
              <div style={{ fontSize: 13, color: "#E8192C", background: "#FFF0F0", border: "1px solid #FFCDD2", borderRadius: 6, padding: "8px 12px" }}>{formError}</div>
            )}
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={handleSave} style={{ padding: "10px 24px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>저장</button>
              <button onClick={() => { setEditing(null); setFormError(""); }} style={{ padding: "10px 24px", background: "#FFF", color: "#333", border: "1px solid #DDD", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>취소</button>
              {saved && <span style={{ fontSize: 14, color: "#4CAF50", fontWeight: 500, alignSelf: "center" }}>저장됨!</span>}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {reporters.map((reporter) => (
          <div key={reporter.id} style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#F5F5F5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#999", overflow: "hidden", border: "1px solid #EEE", flexShrink: 0 }}>
                {reporter.photo ? <img src={reporter.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : reporter.name.charAt(0)}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{reporter.name}</div>
                <div style={{ fontSize: 12, color: "#666" }}>{reporter.department} · {reporter.title}</div>
              </div>
              {!reporter.active && <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, background: "#F5F5F5", color: "#999", marginLeft: "auto" }}>비활성</span>}
            </div>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 8, lineHeight: 1.5 }}>{reporter.bio || "소개글 없음"}</div>
            {/* F1: articleCount를 자동 계산된 값으로 표시 */}
            <div style={{ fontSize: 12, color: "#999", marginBottom: 12 }}>
              {reporter.email} · 기사 {articleCounts[reporter.name] ?? 0}건
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={() => setEditing(reporter)} style={{ padding: "4px 14px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, color: "#333", fontSize: 12, cursor: "pointer" }}>수정</button>
              {confirmDelete === reporter.id ? (
                <>
                  <button onClick={() => handleDelete(reporter.id)} style={{ padding: "4px 12px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>삭제</button>
                  <button onClick={() => setConfirmDelete(null)} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>취소</button>
                </>
              ) : (
                <button onClick={() => setConfirmDelete(reporter.id)} style={{ padding: "4px 14px", background: "#FFF", border: "1px solid #E8192C", borderRadius: 6, color: "#E8192C", fontSize: 12, cursor: "pointer" }}>삭제</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
