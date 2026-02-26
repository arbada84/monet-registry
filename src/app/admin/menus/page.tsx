"use client";

import { useEffect, useState } from "react";
import { getSetting, saveSetting } from "@/lib/db";
import { inputStyle, labelStyle } from "@/lib/admin-styles";

interface MenuItem {
  id: string;
  label: string;
  url: string;
  target: "_self" | "_blank";
  visible: boolean;
  order: number;
  location: "header" | "footer" | "both";
}

const DEFAULT_MENUS: MenuItem[] = [
  { id: "menu-1", label: "홈", url: "/", target: "_self", visible: true, order: 1, location: "header" },
  { id: "menu-2", label: "뉴스", url: "/category/news", target: "_self", visible: true, order: 2, location: "header" },
  { id: "menu-3", label: "연예", url: "/category/entertainment", target: "_self", visible: true, order: 3, location: "header" },
  { id: "menu-4", label: "스포츠", url: "/category/sports", target: "_self", visible: true, order: 4, location: "header" },
  { id: "menu-5", label: "문화", url: "/category/culture", target: "_self", visible: true, order: 5, location: "header" },
  { id: "menu-6", label: "라이프", url: "/category/life", target: "_self", visible: true, order: 6, location: "header" },
  { id: "menu-7", label: "포토", url: "/category/photo", target: "_self", visible: true, order: 7, location: "header" },
  { id: "menu-8", label: "회사소개", url: "/about", target: "_self", visible: true, order: 1, location: "footer" },
  { id: "menu-9", label: "이용약관", url: "/terms", target: "_self", visible: true, order: 2, location: "footer" },
  { id: "menu-10", label: "개인정보처리방침", url: "/privacy", target: "_self", visible: true, order: 3, location: "footer" },
  { id: "menu-11", label: "청소년보호정책", url: "/youth-policy", target: "_self", visible: true, order: 4, location: "footer" },
  { id: "menu-12", label: "광고안내", url: "/advertising", target: "_self", visible: true, order: 5, location: "footer" },
];

const LOCATION_LABELS: Record<string, string> = {
  header: "상단 메뉴",
  footer: "하단 메뉴",
  both: "상단 + 하단",
};

export default function AdminMenusPage() {
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [filterLocation, setFilterLocation] = useState<"all" | "header" | "footer">("all");
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    getSetting<MenuItem[] | null>("cp-menus", null).then((stored) => {
      if (stored) {
        setMenus(stored);
      } else {
        saveSetting("cp-menus", DEFAULT_MENUS);
        setMenus(DEFAULT_MENUS);
      }
    });
  }, []);

  const saveMenus = async (updated: MenuItem[]) => {
    setMenus(updated);
    await saveSetting("cp-menus", updated);
  };

  const handleAddNew = () => {
    setEditing({
      id: `menu-${Date.now()}`,
      label: "",
      url: "",
      target: "_self",
      visible: true,
      order: menus.length + 1,
      location: "header",
    });
  };

  const handleSave = () => {
    if (!editing || !editing.label.trim()) {
      setFormError("메뉴 이름을 입력해주세요.");
      return;
    }
    setFormError("");
    const exists = menus.find((m) => m.id === editing.id);
    const updated = exists
      ? menus.map((m) => (m.id === editing.id ? editing : m))
      : [...menus, editing];
    saveMenus(updated);
    setEditing(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDelete = (id: string) => {
    saveMenus(menus.filter((m) => m.id !== id));
    setConfirmDelete(null);
  };

  const handleToggle = (id: string) => {
    saveMenus(menus.map((m) => (m.id === id ? { ...m, visible: !m.visible } : m)));
  };

  const filtered = filterLocation === "all"
    ? menus
    : menus.filter((m) => m.location === filterLocation || m.location === "both");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>메뉴 관리</h1>
        <button onClick={handleAddNew} style={{ padding: "10px 20px", background: "#E8192C", color: "#FFF", borderRadius: 8, fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer" }}>
          + 메뉴 추가
        </button>
      </div>

      {editing && (
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24, marginBottom: 24, maxWidth: 480 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>
            {menus.find((m) => m.id === editing.id) ? "메뉴 수정" : "새 메뉴"}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>메뉴 이름</label>
              <input type="text" value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>URL</label>
              <input type="text" value={editing.url} onChange={(e) => setEditing({ ...editing, url: e.target.value })} placeholder="/category/news 또는 https://..." style={inputStyle} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>위치</label>
                <select value={editing.location} onChange={(e) => setEditing({ ...editing, location: e.target.value as MenuItem["location"] })} style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}>
                  <option value="header">상단 메뉴</option>
                  <option value="footer">하단 메뉴</option>
                  <option value="both">상단 + 하단</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>열기 방식</label>
                <select value={editing.target} onChange={(e) => setEditing({ ...editing, target: e.target.value as "_self" | "_blank" })} style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}>
                  <option value="_self">현재 창</option>
                  <option value="_blank">새 창</option>
                </select>
              </div>
            </div>
            <div>
              <label style={labelStyle}>순서</label>
              <input type="number" value={editing.order} onChange={(e) => setEditing({ ...editing, order: parseInt(e.target.value) || 0 })} style={inputStyle} />
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

      {/* Filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["all", "header", "footer"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setFilterLocation(key)}
            style={{
              padding: "6px 16px",
              fontSize: 13,
              fontWeight: filterLocation === key ? 600 : 400,
              color: filterLocation === key ? "#E8192C" : "#666",
              background: filterLocation === key ? "#FFF0F0" : "#FFF",
              border: `1px solid ${filterLocation === key ? "#E8192C" : "#DDD"}`,
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {key === "all" ? "전체" : LOCATION_LABELS[key]}
          </button>
        ))}
      </div>

      <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
              <th style={{ padding: "10px 20px", textAlign: "left", fontWeight: 500, color: "#666", width: 60 }}>순서</th>
              <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>메뉴명</th>
              <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>URL</th>
              <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>위치</th>
              <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 500, color: "#666" }}>노출</th>
              <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 500, color: "#666", width: 160 }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.sort((a, b) => a.order - b.order).map((menu) => (
              <tr key={menu.id} style={{ borderBottom: "1px solid #EEE" }}>
                <td style={{ padding: "12px 20px", color: "#999" }}>{menu.order}</td>
                <td style={{ padding: "12px 16px", fontWeight: 500 }}>{menu.label}</td>
                <td style={{ padding: "12px 16px", color: "#666", fontFamily: "monospace", fontSize: 13 }}>{menu.url}</td>
                <td style={{ padding: "12px 16px", color: "#666" }}>{LOCATION_LABELS[menu.location]}</td>
                <td style={{ padding: "12px 16px", textAlign: "center" }}>
                  <button onClick={() => handleToggle(menu.id)} style={{ padding: "3px 12px", borderRadius: 12, fontSize: 12, fontWeight: 500, border: "none", cursor: "pointer", background: menu.visible ? "#E8F5E9" : "#F5F5F5", color: menu.visible ? "#2E7D32" : "#999" }}>
                    {menu.visible ? "노출" : "숨김"}
                  </button>
                </td>
                <td style={{ padding: "12px 16px", textAlign: "center" }}>
                  <button onClick={() => setEditing(menu)} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, color: "#333", fontSize: 12, cursor: "pointer", marginRight: 6 }}>수정</button>
                  {confirmDelete === menu.id ? (
                    <>
                      <button onClick={() => handleDelete(menu.id)} style={{ padding: "4px 12px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", marginRight: 4 }}>삭제</button>
                      <button onClick={() => setConfirmDelete(null)} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>취소</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDelete(menu.id)} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #E8192C", borderRadius: 6, color: "#E8192C", fontSize: 12, cursor: "pointer" }}>삭제</button>
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
