"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface NetproItem {
  wr_id: string;
  title: string;
  category: string;
  writer: string;
  date: string;
  hits: string;
  detail_url: string;
}

interface NetproDetail {
  title: string;
  bodyText: string;
  bodyHtml: string;
  date: string;
  writer: string;
  images: string[];
  outboundLinks: string[];
  sourceUrl: string;
}

const RSS_CATEGORIES: Record<string, string> = {
  "": "전체", policy: "정책뉴스", photo: "포토뉴스", media: "영상뉴스",
  fact: "사실은 이렇습니다", mofa: "외교부", moj: "법무부", nts: "국세청",
  moel: "고용노동부", ftc: "공정거래위원회", msit: "과학기술정보통신부",
  moe: "교육부", mnd: "국방부", molit: "국토교통부", fsc: "금융위원회",
  mafra: "농림축산식품부", mcst: "문화체육관광부", mw: "보건복지부",
  motie: "산업통상자원부", mois: "행정안전부", mof: "해양수산부",
  mcee: "기후에너지환경부", mss: "중소벤처기업부",
};

const NEWSWIRE_CATEGORIES: Record<string, string> = {
  "": "전체", "100": "경제", "200": "금융", "300": "건설/부동산",
  "400": "산업", "500": "자동차", "600": "기술/IT", "700": "미디어",
  "800": "유통", "900": "라이프스타일", "1000": "건강", "1100": "교육",
  "1200": "문화/연예", "1300": "레저", "1400": "정책/정부",
  "1500": "에너지/환경", "1600": "스포츠", "1700": "농수산",
  "1800": "물류/교통", "1900": "사회",
};

export default function AdminPressImportPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"rss" | "newswire">("rss");
  const [items, setItems] = useState<NetproItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [sca, setSca] = useState("");
  const [searchText, setSearchText] = useState("");
  const [previewItem, setPreviewItem] = useState<NetproDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedWrId, setSelectedWrId] = useState<string | null>(null);

  const categories = activeTab === "rss" ? RSS_CATEGORIES : NEWSWIRE_CATEGORIES;

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        bo_table: activeTab,
        page: String(page),
        sca,
        stx: searchText,
      });
      const resp = await fetch(`/api/netpro/list?${params}`);
      const data = await resp.json();
      if (data.success) {
        setItems(data.items);
        setTotal(data.total);
        setLastPage(data.lastPage);
      }
    } catch {
      // silently fail
    }
    setLoading(false);
  }, [activeTab, page, sca, searchText]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleTabChange = (tab: "rss" | "newswire") => {
    setActiveTab(tab);
    setPage(1);
    setSca("");
    setSearchText("");
    setPreviewItem(null);
    setSelectedWrId(null);
  };

  const handlePreview = async (item: NetproItem) => {
    setSelectedWrId(item.wr_id);
    setPreviewLoading(true);
    try {
      const params = new URLSearchParams({ bo_table: activeTab, wr_id: item.wr_id });
      const resp = await fetch(`/api/netpro/detail?${params}`);
      const data = await resp.json();
      if (data.success) {
        setPreviewItem(data);
      }
    } catch {
      // silently fail
    }
    setPreviewLoading(false);
  };

  const handleImport = () => {
    if (!previewItem) return;
    // Save to sessionStorage and redirect to article editor
    const importData = {
      title: previewItem.title,
      body: previewItem.bodyText,
      source: previewItem.writer,
      sourceUrl: previewItem.sourceUrl,
      date: previewItem.date,
      images: previewItem.images,
    };
    sessionStorage.setItem("cp-press-import", JSON.stringify(importData));
    router.push("/admin/articles/new?from=press");
  };

  const inputStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 14, border: "1px solid #DDD", borderRadius: 8, outline: "none" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>보도자료 수집</h1>
        <div style={{ fontSize: 13, color: "#666" }}>
          넷프로 보도자료 · 뉴스와이어에서 기사를 가져옵니다
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {[
          { key: "rss" as const, label: "보도자료 (정부/정책)", count: "205,698+" },
          { key: "newswire" as const, label: "뉴스와이어 (기업/산업)", count: "64,896+" },
        ].map((tab) => (
          <button key={tab.key} onClick={() => handleTabChange(tab.key)} style={{
            padding: "10px 20px", fontSize: 14, fontWeight: activeTab === tab.key ? 600 : 400,
            color: activeTab === tab.key ? "#E8192C" : "#666",
            background: activeTab === tab.key ? "#FFF0F0" : "#FFF",
            border: `1px solid ${activeTab === tab.key ? "#E8192C" : "#DDD"}`,
            borderRadius: 8, cursor: "pointer",
          }}>
            {tab.label} <span style={{ fontSize: 11, color: "#999" }}>({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select value={sca} onChange={(e) => { setSca(e.target.value); setPage(1); }} style={{ ...inputStyle, minWidth: 160, background: "#FFF", cursor: "pointer" }}>
          {Object.entries(categories).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <div style={{ display: "flex" }}>
          <input
            type="text"
            placeholder="검색어"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); fetchList(); } }}
            style={{ ...inputStyle, borderRadius: "8px 0 0 8px", width: 200 }}
          />
          <button onClick={() => { setPage(1); fetchList(); }} style={{ padding: "8px 16px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: "0 8px 8px 0", fontSize: 13, cursor: "pointer" }}>
            검색
          </button>
        </div>
        <span style={{ fontSize: 13, color: "#999" }}>
          총 {total.toLocaleString()}건 · {page}/{lastPage} 페이지
        </span>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        {/* Article List */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 14 }}>불러오는 중...</div>
            ) : items.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 14 }}>결과가 없습니다.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666", width: 60 }}>번호</th>
                    {activeTab === "newswire" && <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 500, color: "#666", width: 80 }}>분류</th>}
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>제목</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 500, color: "#666", width: 100 }}>출처</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", fontWeight: 500, color: "#666", width: 70 }}>날짜</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", fontWeight: 500, color: "#666", width: 80 }}>미리보기</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.wr_id} style={{
                      borderBottom: "1px solid #EEE",
                      background: selectedWrId === item.wr_id ? "#FFF0F0" : "transparent",
                      cursor: "pointer",
                    }} onClick={() => handlePreview(item)}>
                      <td style={{ padding: "10px 16px", color: "#999" }}>{item.wr_id}</td>
                      {activeTab === "newswire" && <td style={{ padding: "10px 12px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, background: "#F0F0F0", color: "#666" }}>{item.category}</span>
                      </td>}
                      <td style={{ padding: "10px 16px", fontWeight: 500, color: "#333" }}>
                        {item.title}
                      </td>
                      <td style={{ padding: "10px 12px", color: "#666", fontSize: 12 }}>{item.writer}</td>
                      <td style={{ padding: "10px 12px", textAlign: "center", color: "#999", fontSize: 12 }}>{item.date}</td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePreview(item); }}
                          style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, fontSize: 12, cursor: "pointer", color: "#333" }}
                        >
                          보기
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 16 }}>
            <button disabled={page <= 1} onClick={() => setPage(1)} style={{ padding: "6px 12px", border: "1px solid #DDD", borderRadius: 6, background: "#FFF", cursor: page > 1 ? "pointer" : "default", color: page > 1 ? "#333" : "#CCC", fontSize: 12 }}>처음</button>
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} style={{ padding: "6px 12px", border: "1px solid #DDD", borderRadius: 6, background: "#FFF", cursor: page > 1 ? "pointer" : "default", color: page > 1 ? "#333" : "#CCC", fontSize: 12 }}>이전</button>
            <span style={{ padding: "6px 16px", fontSize: 13, fontWeight: 600, color: "#E8192C" }}>{page}</span>
            <button disabled={page >= lastPage} onClick={() => setPage(page + 1)} style={{ padding: "6px 12px", border: "1px solid #DDD", borderRadius: 6, background: "#FFF", cursor: page < lastPage ? "pointer" : "default", color: page < lastPage ? "#333" : "#CCC", fontSize: 12 }}>다음</button>
            <button disabled={page >= lastPage} onClick={() => setPage(lastPage)} style={{ padding: "6px 12px", border: "1px solid #DDD", borderRadius: 6, background: "#FFF", cursor: page < lastPage ? "pointer" : "default", color: page < lastPage ? "#333" : "#CCC", fontSize: 12 }}>마지막</button>
          </div>
        </div>

        {/* Preview Panel */}
        <div style={{ width: 420, flexShrink: 0 }}>
          <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 20, position: "sticky", top: 80 }}>
            {previewLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 14 }}>로딩 중...</div>
            ) : previewItem ? (
              <>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#111", marginBottom: 12, lineHeight: 1.4 }}>
                  {previewItem.title}
                </h3>
                <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#999", marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>
                  <span>{previewItem.writer}</span>
                  <span>{previewItem.date}</span>
                </div>
                <div style={{ fontSize: 13, color: "#444", lineHeight: 1.8, maxHeight: 400, overflowY: "auto", whiteSpace: "pre-wrap", marginBottom: 16 }}>
                  {previewItem.bodyText.slice(0, 1500)}
                  {previewItem.bodyText.length > 1500 && "..."}
                </div>
                {previewItem.images.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#666", marginBottom: 6 }}>첨부 이미지 ({previewItem.images.length})</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {previewItem.images.slice(0, 4).map((img, i) => (
                        <img key={i} src={img} alt="" style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 4, border: "1px solid #EEE" }} />
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleImport} style={{ flex: 1, padding: "10px 0", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                    기사 작성으로 가져오기
                  </button>
                </div>
                <div style={{ fontSize: 11, color: "#999", marginTop: 8, textAlign: "center" }}>
                  AI 편집은 기사 작성 페이지에서 사용할 수 있습니다
                </div>
              </>
            ) : (
              <div style={{ padding: 40, textAlign: "center", color: "#BBB", fontSize: 14 }}>
                왼쪽 목록에서 기사를 선택하면<br />미리보기가 표시됩니다
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
