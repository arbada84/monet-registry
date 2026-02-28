"use client";

import { useEffect, useState } from "react";
import { getSetting, saveSetting } from "@/lib/db";
import { inputStyle, labelStyle } from "@/lib/admin-styles";

interface AboutData {
  companyName: string;
  ceo: string;
  foundedDate: string;
  bizNumber: string;
  publisher: string;
  editor: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  introText: string;
  history: { year: string; content: string }[];
  organizationChart: string;
  mapEmbedCode: string;
}

const DEFAULT_ABOUT: AboutData = {
  companyName: "컬처피플",
  ceo: "",
  foundedDate: "",
  bizNumber: "",
  publisher: "",
  editor: "",
  address: "서울특별시 중구 세종대로 110",
  phone: "02-1234-5678",
  fax: "",
  email: "contact@culturepeople.co.kr",
  introText: "컬처피플은 문화, 예술, 엔터테인먼트 분야의 다양한 소식을 전하는 종합 뉴스 미디어입니다. 빠르고 정확한 뉴스와 깊이 있는 분석으로 독자 여러분께 가치 있는 정보를 제공합니다.",
  history: [
    { year: "2024", content: "컬처피플 창간" },
    { year: "2024", content: "온라인 뉴스 서비스 오픈" },
  ],
  organizationChart: "",
  mapEmbedCode: "",
};

export default function AdminAboutPage() {
  const [about, setAbout] = useState<AboutData>(DEFAULT_ABOUT);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [activeTab, setActiveTab] = useState<"basic" | "history" | "extra">("basic");

  useEffect(() => {
    getSetting<AboutData | null>("cp-about", null).then((stored) => {
      if (stored) {
        // 구버전 필드명 호환: ceoName→ceo, businessNumber→bizNumber, publisherName→publisher, editorName→editor, historyItems→history
        const migrated: Partial<AboutData> = { ...stored };
        const s = stored as unknown as Record<string, unknown>;
        if (!migrated.ceo && s.ceoName) migrated.ceo = s.ceoName as string;
        if (!migrated.bizNumber && s.businessNumber) migrated.bizNumber = s.businessNumber as string;
        if (!migrated.publisher && s.publisherName) migrated.publisher = s.publisherName as string;
        if (!migrated.editor && s.editorName) migrated.editor = s.editorName as string;
        if (!migrated.history && s.historyItems) migrated.history = s.historyItems as AboutData["history"];
        setAbout({ ...DEFAULT_ABOUT, ...migrated });
      }
    });
  }, []);

  const handleChange = (field: keyof AboutData, value: string) => {
    setAbout((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleHistoryChange = (index: number, field: "year" | "content", value: string) => {
    const updated = [...about.history];
    updated[index] = { ...updated[index], [field]: value };
    setAbout((prev) => ({ ...prev, history: updated }));
    setSaved(false);
  };

  const addHistoryItem = () => {
    setAbout((prev) => ({
      ...prev,
      history: [...prev.history, { year: new Date().getFullYear().toString(), content: "" }],
    }));
  };

  const removeHistoryItem = (index: number) => {
    setAbout((prev) => ({
      ...prev,
      history: prev.history.filter((_, i) => i !== index),
    }));
  };

  const handleSave = async () => {
    try {
      await saveSetting("cp-about", about);
      setSaved(true);
      setSaveError("");
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장에 실패했습니다. 다시 시도해주세요.");
    }
  };

  const tabs = [
    { key: "basic" as const, label: "기본 정보" },
    { key: "history" as const, label: "연혁" },
    { key: "extra" as const, label: "소개글 / 지도" },
  ];

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 24 }}>
        회사 소개 관리
      </h1>

      <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "8px 18px",
              fontSize: 14,
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? "#E8192C" : "#666",
              background: activeTab === tab.key ? "#FFF0F0" : "#FFF",
              border: `1px solid ${activeTab === tab.key ? "#E8192C" : "#DDD"}`,
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 20 }}>
        {activeTab === "basic" && (
          <section style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>
              기본 정보
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>회사명 / 매체명</label>
                  <input type="text" value={about.companyName} onChange={(e) => handleChange("companyName", e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>대표자명</label>
                  <input type="text" value={about.ceo} onChange={(e) => handleChange("ceo", e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>발행인</label>
                  <input type="text" value={about.publisher} onChange={(e) => handleChange("publisher", e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>편집인</label>
                  <input type="text" value={about.editor} onChange={(e) => handleChange("editor", e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>설립일</label>
                  <input type="date" value={about.foundedDate} onChange={(e) => handleChange("foundedDate", e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>사업자등록번호</label>
                  <input type="text" value={about.bizNumber} onChange={(e) => handleChange("bizNumber", e.target.value)} placeholder="000-00-00000" style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>주소</label>
                <input type="text" value={about.address} onChange={(e) => handleChange("address", e.target.value)} style={inputStyle} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>전화</label>
                  <input type="text" value={about.phone} onChange={(e) => handleChange("phone", e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>팩스</label>
                  <input type="text" value={about.fax} onChange={(e) => handleChange("fax", e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>이메일</label>
                  <input type="email" value={about.email} onChange={(e) => handleChange("email", e.target.value)} style={inputStyle} />
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === "history" && (
          <section style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>연혁</h2>
              <button onClick={addHistoryItem} style={{ padding: "6px 14px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 6, fontSize: 13, cursor: "pointer" }}>
                + 항목 추가
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {about.history.map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <input type="text" value={item.year} onChange={(e) => handleHistoryChange(i, "year", e.target.value)} placeholder="연도" style={{ ...inputStyle, width: 100, flexShrink: 0 }} />
                  <input type="text" value={item.content} onChange={(e) => handleHistoryChange(i, "content", e.target.value)} placeholder="내용" style={inputStyle} />
                  <button onClick={() => removeHistoryItem(i)} style={{ padding: "6px 12px", background: "#FFF", border: "1px solid #E8192C", borderRadius: 6, color: "#E8192C", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>
                    삭제
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === "extra" && (
          <>
            <section style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>
                회사 소개글
              </h2>
              <textarea
                value={about.introText}
                onChange={(e) => handleChange("introText", e.target.value)}
                rows={8}
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.8 }}
              />
            </section>
            <section style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>
                조직도 (HTML)
              </h2>
              <textarea
                value={about.organizationChart}
                onChange={(e) => handleChange("organizationChart", e.target.value)}
                rows={6}
                placeholder="조직도 HTML 코드 또는 이미지 URL을 입력하세요"
                style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 13 }}
              />
            </section>
            <section style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>
                오시는 길 (지도 임베드)
              </h2>
              <textarea
                value={about.mapEmbedCode}
                onChange={(e) => handleChange("mapEmbedCode", e.target.value)}
                rows={4}
                placeholder='<iframe src="https://map.naver.com/..." ...></iframe>'
                style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 13 }}
              />
              <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                네이버 지도 또는 구글 지도의 임베드 코드를 붙여넣으세요.
              </div>
            </section>
          </>
        )}

        <div>
          <button onClick={handleSave} style={{ padding: "12px 32px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
            저장
          </button>
          {saved && <span style={{ marginLeft: 12, fontSize: 14, color: "#4CAF50", fontWeight: 500 }}>저장되었습니다!</span>}
          {saveError && <span style={{ marginLeft: 12, fontSize: 13, color: "#E8192C" }}>{saveError}</span>}
        </div>
      </div>
    </div>
  );
}
