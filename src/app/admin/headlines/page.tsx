"use client";

import { useEffect, useState } from "react";

interface Article {
  id: string;
  title: string;
  category: string;
  date: string;
  status: string;
  thumbnail: string;
}

export default function AdminHeadlinesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("cp-articles");
    if (raw) {
      setArticles(JSON.parse(raw).filter((a: Article) => a.status === "게시").sort((a: Article, b: Article) => b.date.localeCompare(a.date)));
    }
    const headlines = localStorage.getItem("cp-headline-articles");
    if (headlines) setSelectedIds(JSON.parse(headlines));
  }, []);

  const toggleArticle = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 10) { alert("최대 10개까지 선택할 수 있습니다."); return prev; }
      return [...prev, id];
    });
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setSelectedIds((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  };

  const moveDown = (idx: number) => {
    if (idx >= selectedIds.length - 1) return;
    setSelectedIds((prev) => {
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  };

  const handleSave = () => {
    localStorage.setItem("cp-headline-articles", JSON.stringify(selectedIds));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const selectedArticles = selectedIds.map((id) => articles.find((a) => a.id === id)).filter(Boolean) as Article[];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>헤드라인 기사 관리</h1>
          <div style={{ fontSize: 13, color: "#999", marginTop: 4 }}>메인 페이지 상단 슬라이더에 표시할 기사를 선택합니다 (최대 10개)</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={handleSave} style={{ padding: "10px 24px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            저장
          </button>
          {saved && <span style={{ fontSize: 13, color: "#4CAF50", fontWeight: 500 }}>저장되었습니다!</span>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 20 }}>
        {/* Selected Headlines */}
        <div style={{ width: 400, flexShrink: 0 }}>
          <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>선택된 헤드라인 ({selectedIds.length}/10)</h3>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>위에서 아래 순서로 슬라이더에 표시됩니다</div>

            {selectedArticles.length === 0 ? (
              <div style={{ padding: "40px 0", textAlign: "center", color: "#BBB", fontSize: 13 }}>
                오른쪽 목록에서 기사를 선택하세요
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {selectedArticles.map((article, idx) => (
                  <div key={article.id} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: 10,
                    background: "#FAFAFA", border: "1px solid #EEE", borderRadius: 8,
                  }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 24, height: 24, borderRadius: 4, fontSize: 11, fontWeight: 700, color: "#FFF",
                      background: "#E8192C", flexShrink: 0,
                    }}>{idx + 1}</span>
                    {article.thumbnail && (
                      <img src={article.thumbnail} alt="" style={{ width: 48, height: 32, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {article.title}
                      </div>
                      <div style={{ fontSize: 11, color: "#999" }}>{article.category} · {article.date}</div>
                    </div>
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <button onClick={() => moveUp(idx)} disabled={idx === 0} style={{ width: 24, height: 24, border: "1px solid #DDD", borderRadius: 4, background: "#FFF", cursor: idx === 0 ? "default" : "pointer", fontSize: 11, color: idx === 0 ? "#CCC" : "#666" }}>▲</button>
                      <button onClick={() => moveDown(idx)} disabled={idx >= selectedIds.length - 1} style={{ width: 24, height: 24, border: "1px solid #DDD", borderRadius: 4, background: "#FFF", cursor: idx >= selectedIds.length - 1 ? "default" : "pointer", fontSize: 11, color: idx >= selectedIds.length - 1 ? "#CCC" : "#666" }}>▼</button>
                      <button onClick={() => toggleArticle(article.id)} style={{ width: 24, height: 24, border: "1px solid #FFCDD2", borderRadius: 4, background: "#FFF0F0", cursor: "pointer", fontSize: 11, color: "#E8192C" }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Article List */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #EEE", fontWeight: 600, fontSize: 15 }}>
              게시된 기사 ({articles.length}건)
            </div>
            {articles.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#999", fontSize: 14 }}>게시된 기사가 없습니다.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
                    <th style={{ padding: "8px 16px", textAlign: "center", fontWeight: 500, color: "#666", width: 50 }}>선택</th>
                    <th style={{ padding: "8px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>제목</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 500, color: "#666", width: 70 }}>카테고리</th>
                    <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 500, color: "#666", width: 90 }}>날짜</th>
                  </tr>
                </thead>
                <tbody>
                  {articles.map((article) => {
                    const isSelected = selectedIds.includes(article.id);
                    return (
                      <tr key={article.id} style={{ borderBottom: "1px solid #EEE", background: isSelected ? "#FFF0F0" : "transparent", cursor: "pointer" }} onClick={() => toggleArticle(article.id)}>
                        <td style={{ padding: "8px 16px", textAlign: "center" }}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleArticle(article.id)} style={{ width: 16, height: 16, cursor: "pointer" }} />
                        </td>
                        <td style={{ padding: "8px 16px", fontWeight: isSelected ? 600 : 400, color: isSelected ? "#E8192C" : "#333" }}>
                          {article.title}
                        </td>
                        <td style={{ padding: "8px 12px", color: "#666" }}>{article.category}</td>
                        <td style={{ padding: "8px 12px", textAlign: "center", color: "#999", fontSize: 12 }}>{article.date}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
