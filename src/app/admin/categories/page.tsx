"use client";

import { useEffect, useState } from "react";
import { getSetting, saveSetting } from "@/lib/db";
import { inputStyle, labelStyle } from "@/lib/admin-styles";

interface Category {
  id: string;
  name: string;
  slug: string;
  order: number;
  visible: boolean;
  parentId: string | null;
}

const DEFAULT_CATEGORIES: Category[] = [
  { id: "cat-1", name: "뉴스", slug: "news", order: 1, visible: true, parentId: null },
  { id: "cat-2", name: "연예", slug: "entertainment", order: 2, visible: true, parentId: null },
  { id: "cat-3", name: "스포츠", slug: "sports", order: 3, visible: true, parentId: null },
  { id: "cat-4", name: "문화", slug: "culture", order: 4, visible: true, parentId: null },
  { id: "cat-5", name: "라이프", slug: "life", order: 5, visible: true, parentId: null },
  { id: "cat-6", name: "포토", slug: "photo", order: 6, visible: true, parentId: null },
];

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Category | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    getSetting<Category[] | null>("cp-categories", null).then((stored) => {
      if (stored) {
        setCategories(stored);
      } else {
        saveSetting("cp-categories", DEFAULT_CATEGORIES);
        setCategories(DEFAULT_CATEGORIES);
      }
    });
  }, []);

  const saveCategories = async (updated: Category[]) => {
    setCategories(updated);
    await saveSetting("cp-categories", updated);
  };

  const handleAddNew = () => {
    setEditing({
      id: `cat-${Date.now()}`,
      name: "",
      slug: "",
      order: categories.length + 1,
      visible: true,
      parentId: null,
    });
  };

  const handleSave = () => {
    if (!editing || !editing.name.trim()) {
      setFormError("카테고리 이름을 입력해주세요.");
      return;
    }
    setFormError("");
    const exists = categories.find((c) => c.id === editing.id);
    const updated = exists
      ? categories.map((c) => (c.id === editing.id ? editing : c))
      : [...categories, editing];
    saveCategories(updated.sort((a, b) => a.order - b.order));
    setEditing(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDelete = (id: string) => {
    saveCategories(categories.filter((c) => c.id !== id));
    setConfirmDelete(null);
  };

  const handleToggleVisibility = (id: string) => {
    saveCategories(categories.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)));
  };

  // 순환 참조 방지: 자기 자신 + 모든 자식/후손 카테고리 ID 반환
  const getDescendantIds = (id: string): string[] => {
    const children = categories.filter((c) => c.parentId === id);
    return children.flatMap((c) => [c.id, ...getDescendantIds(c.id)]);
  };

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const updated = [...categories];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    updated.forEach((c, i) => (c.order = i + 1));
    saveCategories(updated);
  };

  const moveDown = (index: number) => {
    if (index >= categories.length - 1) return;
    const updated = [...categories];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    updated.forEach((c, i) => (c.order = i + 1));
    saveCategories(updated);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>카테고리 관리</h1>
        <button onClick={handleAddNew} style={{ padding: "10px 20px", background: "#E8192C", color: "#FFF", borderRadius: 8, fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer" }}>
          + 카테고리 추가
        </button>
      </div>

      {editing && (
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24, marginBottom: 24, maxWidth: 480 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>
            {categories.find((c) => c.id === editing.id) ? "카테고리 수정" : "새 카테고리"}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>카테고리 이름</label>
              <input type="text" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="예: 정치" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>슬러그 (URL용 영문)</label>
              <input type="text" value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} placeholder="예: politics" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>상위 카테고리</label>
              <select value={editing.parentId || ""} onChange={(e) => setEditing({ ...editing, parentId: e.target.value || null })} style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}>
                <option value="">없음 (최상위)</option>
                {categories.filter((c) => {
                  const excluded = new Set([editing.id, ...getDescendantIds(editing.id)]);
                  return !excluded.has(c.id);
                }).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
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

      <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
              <th style={{ padding: "10px 20px", textAlign: "left", fontWeight: 500, color: "#666", width: 60 }}>순서</th>
              <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>이름</th>
              <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>슬러그</th>
              <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 500, color: "#666" }}>노출</th>
              <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 500, color: "#666", width: 120 }}>정렬</th>
              <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 500, color: "#666", width: 160 }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat, i) => (
              <tr key={cat.id} style={{ borderBottom: "1px solid #EEE" }}>
                <td style={{ padding: "12px 20px", color: "#999" }}>{cat.order}</td>
                <td style={{ padding: "12px 16px", fontWeight: 500 }}>
                  {cat.parentId && <span style={{ color: "#CCC", marginRight: 4 }}>└</span>}
                  {cat.name}
                </td>
                <td style={{ padding: "12px 16px", color: "#666", fontFamily: "monospace", fontSize: 13 }}>{cat.slug}</td>
                <td style={{ padding: "12px 16px", textAlign: "center" }}>
                  <button onClick={() => handleToggleVisibility(cat.id)} style={{ padding: "3px 12px", borderRadius: 12, fontSize: 12, fontWeight: 500, border: "none", cursor: "pointer", background: cat.visible ? "#E8F5E9" : "#F5F5F5", color: cat.visible ? "#2E7D32" : "#999" }}>
                    {cat.visible ? "노출" : "숨김"}
                  </button>
                </td>
                <td style={{ padding: "12px 16px", textAlign: "center" }}>
                  <button onClick={() => moveUp(i)} disabled={i === 0} style={{ padding: "2px 8px", background: "#FFF", border: "1px solid #DDD", borderRadius: 4, cursor: i === 0 ? "default" : "pointer", marginRight: 4, opacity: i === 0 ? 0.3 : 1 }}>▲</button>
                  <button onClick={() => moveDown(i)} disabled={i === categories.length - 1} style={{ padding: "2px 8px", background: "#FFF", border: "1px solid #DDD", borderRadius: 4, cursor: i === categories.length - 1 ? "default" : "pointer", opacity: i === categories.length - 1 ? 0.3 : 1 }}>▼</button>
                </td>
                <td style={{ padding: "12px 16px", textAlign: "center" }}>
                  <button onClick={() => setEditing(cat)} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, color: "#333", fontSize: 12, cursor: "pointer", marginRight: 6 }}>수정</button>
                  {confirmDelete === cat.id ? (
                    <>
                      <button onClick={() => handleDelete(cat.id)} style={{ padding: "4px 12px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", marginRight: 4 }}>삭제</button>
                      <button onClick={() => setConfirmDelete(null)} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>취소</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDelete(cat.id)} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #E8192C", borderRadius: 6, color: "#E8192C", fontSize: 12, cursor: "pointer" }}>삭제</button>
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
