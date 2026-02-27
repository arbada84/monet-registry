"use client";

import { useEffect, useState } from "react";
import { getSetting, saveSetting } from "@/lib/db";
import { inputStyle, labelStyle } from "@/lib/admin-styles";

interface PopupBanner {
  id: string;
  name: string;
  type: "popup" | "topbanner" | "bottombanner";
  enabled: boolean;
  imageUrl: string;
  linkUrl: string;
  htmlContent: string;
  startDate: string;
  endDate: string;
  showOnce: boolean;
  width: string;
  height: string;
  position: "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

const TYPE_LABELS: Record<PopupBanner["type"], string> = {
  popup: "팝업",
  topbanner: "상단 띠배너",
  bottombanner: "하단 띠배너",
};

export default function AdminPopupsPage() {
  const [popups, setPopups] = useState<PopupBanner[]>([]);
  const [editing, setEditing] = useState<PopupBanner | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    getSetting<PopupBanner[] | null>("cp-popups", null).then((stored) => {
      if (stored) setPopups(stored);
    });
  }, []);

  const savePopups = async (updated: PopupBanner[]) => {
    setPopups(updated);
    try {
      await saveSetting("cp-popups", updated);
      setSaveError("");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장에 실패했습니다. 다시 시도해주세요.");
    }
  };

  const handleAddNew = () => {
    setEditing({
      id: `popup-${Date.now()}`,
      name: "",
      type: "popup",
      enabled: true,
      imageUrl: "",
      linkUrl: "",
      htmlContent: "",
      startDate: new Date().toISOString().slice(0, 10),
      endDate: "",
      showOnce: false,
      width: "500",
      height: "400",
      position: "center",
    });
  };

  const handleSave = () => {
    if (!editing || !editing.name.trim()) {
      setFormError("팝업/배너 이름을 입력해주세요.");
      return;
    }
    setFormError("");
    const exists = popups.find((p) => p.id === editing.id);
    const updated = exists
      ? popups.map((p) => (p.id === editing.id ? editing : p))
      : [...popups, editing];
    savePopups(updated);
    setEditing(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDelete = (id: string) => {
    savePopups(popups.filter((p) => p.id !== id));
    setConfirmDelete(null);
  };

  const handleToggle = (id: string) => {
    savePopups(popups.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)));
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>팝업 / 배너 관리</h1>
        <button onClick={handleAddNew} style={{ padding: "10px 20px", background: "#E8192C", color: "#FFF", borderRadius: 8, fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer" }}>
          + 팝업/배너 추가
        </button>
      </div>

      {editing && (
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24, marginBottom: 24, maxWidth: 560 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>
            {popups.find((p) => p.id === editing.id) ? "수정" : "새 팝업/배너"}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>이름</label>
              <input type="text" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="예: 신년 이벤트 팝업" style={inputStyle} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: 16 }}>
              <div>
                <label style={labelStyle}>유형</label>
                <select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value as PopupBanner["type"] })} style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              {editing.type === "popup" && (
                <div>
                  <label style={labelStyle}>위치</label>
                  <select value={editing.position} onChange={(e) => setEditing({ ...editing, position: e.target.value as PopupBanner["position"] })} style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}>
                    <option value="center">중앙</option>
                    <option value="top-left">좌상단</option>
                    <option value="top-right">우상단</option>
                    <option value="bottom-left">좌하단</option>
                    <option value="bottom-right">우하단</option>
                  </select>
                </div>
              )}
            </div>
            {editing.type === "popup" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: 16 }}>
                <div>
                  <label style={labelStyle}>너비 (px)</label>
                  <input type="text" value={editing.width} onChange={(e) => setEditing({ ...editing, width: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>높이 (px)</label>
                  <input type="text" value={editing.height} onChange={(e) => setEditing({ ...editing, height: e.target.value })} style={inputStyle} />
                </div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: 16 }}>
              <div>
                <label style={labelStyle}>시작일</label>
                <input type="date" value={editing.startDate} onChange={(e) => setEditing({ ...editing, startDate: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>종료일</label>
                <input type="date" value={editing.endDate} onChange={(e) => setEditing({ ...editing, endDate: e.target.value })} style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>이미지 URL</label>
              <input type="text" value={editing.imageUrl} onChange={(e) => setEditing({ ...editing, imageUrl: e.target.value })} placeholder="https://..." style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>링크 URL</label>
              <input type="text" value={editing.linkUrl} onChange={(e) => setEditing({ ...editing, linkUrl: e.target.value })} placeholder="클릭 시 이동할 URL" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>HTML 콘텐츠 (이미지 대신 사용)</label>
              <textarea value={editing.htmlContent} onChange={(e) => setEditing({ ...editing, htmlContent: e.target.value })} rows={4} placeholder="HTML 코드 직접 입력" style={{ ...inputStyle, fontFamily: "monospace", fontSize: 13, resize: "vertical" }} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={editing.showOnce} onChange={(e) => setEditing({ ...editing, showOnce: e.target.checked })} style={{ width: 16, height: 16 }} />
              오늘 하루 보지 않기 옵션 표시
            </label>
            {formError && (
              <div style={{ fontSize: 13, color: "#E8192C", background: "#FFF0F0", border: "1px solid #FFCDD2", borderRadius: 6, padding: "8px 12px" }}>{formError}</div>
            )}
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={handleSave} style={{ padding: "10px 24px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>저장</button>
              <button onClick={() => { setEditing(null); setFormError(""); }} style={{ padding: "10px 24px", background: "#FFF", color: "#333", border: "1px solid #DDD", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>취소</button>
              {saved && <span style={{ fontSize: 14, color: "#4CAF50", fontWeight: 500, alignSelf: "center" }}>저장됨!</span>}
            </div>
            {saveError && (
              <div style={{ fontSize: 13, color: "#E8192C", background: "#FFF0F0", border: "1px solid #FFCDD2", borderRadius: 6, padding: "8px 12px", marginTop: 4 }}>{saveError}</div>
            )}
          </div>
        </div>
      )}

      <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
        {popups.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "#999", fontSize: 14 }}>등록된 팝업/배너가 없습니다.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
                <th style={{ padding: "10px 20px", textAlign: "left", fontWeight: 500, color: "#666" }}>이름</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>유형</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>기간</th>
                <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 500, color: "#666" }}>상태</th>
                <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 500, color: "#666", width: 160 }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {popups.map((popup) => (
                <tr key={popup.id} style={{ borderBottom: "1px solid #EEE" }}>
                  <td style={{ padding: "12px 20px" }}>{popup.name}</td>
                  <td style={{ padding: "12px 16px", color: "#666" }}>{TYPE_LABELS[popup.type]}</td>
                  <td style={{ padding: "12px 16px", color: "#666", fontSize: 13 }}>
                    {popup.startDate} ~ {popup.endDate || "무기한"}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    <button onClick={() => handleToggle(popup.id)} style={{ padding: "3px 12px", borderRadius: 12, fontSize: 12, fontWeight: 500, border: "none", cursor: "pointer", background: popup.enabled ? "#E8F5E9" : "#F5F5F5", color: popup.enabled ? "#2E7D32" : "#999" }}>
                      {popup.enabled ? "활성" : "비활성"}
                    </button>
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    <button onClick={() => setEditing(popup)} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, color: "#333", fontSize: 12, cursor: "pointer", marginRight: 6 }}>수정</button>
                    {confirmDelete === popup.id ? (
                      <>
                        <button onClick={() => handleDelete(popup.id)} style={{ padding: "4px 12px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", marginRight: 4 }}>삭제</button>
                        <button onClick={() => setConfirmDelete(null)} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>취소</button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmDelete(popup.id)} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #E8192C", borderRadius: 6, color: "#E8192C", fontSize: 12, cursor: "pointer" }}>삭제</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
