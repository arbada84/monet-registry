"use client";

import { useEffect, useState } from "react";

interface Article {
  id: string;
  title: string;
  category: string;
  date: string;
  status: string;
}

interface DistributeLog {
  id: string;
  articleId: string;
  articleTitle: string;
  portal: string;
  status: "success" | "failed" | "pending";
  timestamp: string;
  message: string;
}

const PORTALS = [
  { key: "google", name: "Google Indexing API", desc: "Google 검색에 즉시 색인 요청" },
  { key: "bing", name: "Bing IndexNow", desc: "Bing, Yandex 등에 IndexNow 프로토콜로 색인 요청" },
  { key: "naver", name: "네이버 서치어드바이저", desc: "네이버 검색에 사이트맵 제출 및 색인 요청" },
  { key: "daum", name: "다음 검색등록", desc: "다음(카카오) 검색에 URL 등록 요청" },
  { key: "zum", name: "ZUM 검색등록", desc: "ZUM 검색에 사이트 등록" },
  { key: "rss", name: "RSS 피드 발행", desc: "RSS/Atom 피드를 통한 자동 배포" },
  { key: "syndication", name: "뉴스 신디케이션", desc: "뉴스 통신사 신디케이션 API 전송" },
];

export default function AdminDistributePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [logs, setLogs] = useState<DistributeLog[]>([]);
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  const [selectedPortals, setSelectedPortals] = useState<Set<string>>(new Set());
  const [distributing, setDistributing] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("cp-articles");
    if (stored) setArticles(JSON.parse(stored).filter((a: Article) => a.status === "게시"));
    const logStored = localStorage.getItem("cp-distribute-logs");
    if (logStored) setLogs(JSON.parse(logStored));
  }, []);

  const toggleArticle = (id: string) => {
    setSelectedArticles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllArticles = () => {
    if (selectedArticles.size === articles.length) {
      setSelectedArticles(new Set());
    } else {
      setSelectedArticles(new Set(articles.map((a) => a.id)));
    }
  };

  const togglePortal = (key: string) => {
    setSelectedPortals((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleDistribute = () => {
    if (selectedArticles.size === 0 || selectedPortals.size === 0) {
      alert("기사와 포털을 최소 1개 이상 선택해주세요.");
      return;
    }
    setDistributing(true);

    // Simulate distribution
    setTimeout(() => {
      const newLogs: DistributeLog[] = [];
      selectedArticles.forEach((articleId) => {
        const article = articles.find((a) => a.id === articleId);
        if (!article) return;
        selectedPortals.forEach((portal) => {
          const portalInfo = PORTALS.find((p) => p.key === portal);
          const success = Math.random() > 0.2; // 80% success rate simulation
          newLogs.push({
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            articleId,
            articleTitle: article.title,
            portal: portalInfo?.name || portal,
            status: success ? "success" : "failed",
            timestamp: new Date().toISOString(),
            message: success
              ? "색인 요청이 성공적으로 전송되었습니다."
              : "API 키가 설정되지 않았거나 요청에 실패했습니다. SEO 설정을 확인하세요.",
          });
        });
      });

      const updatedLogs = [...newLogs, ...logs].slice(0, 100); // Keep last 100 logs
      setLogs(updatedLogs);
      localStorage.setItem("cp-distribute-logs", JSON.stringify(updatedLogs));
      setDistributing(false);
      setSelectedArticles(new Set());
      setSelectedPortals(new Set());
    }, 1500);
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 24 }}>
        포털 배포 관리
      </h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Article selection */}
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>기사 선택</h3>
            <button onClick={toggleAllArticles} style={{ fontSize: 12, color: "#E8192C", background: "none", border: "none", cursor: "pointer" }}>
              {selectedArticles.size === articles.length ? "전체 해제" : "전체 선택"}
            </button>
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {articles.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "#999", fontSize: 13 }}>게시된 기사가 없습니다.</div>
            ) : (
              articles.map((article) => (
                <label
                  key={article.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 6,
                    cursor: "pointer",
                    background: selectedArticles.has(article.id) ? "#FFF0F0" : "transparent",
                    marginBottom: 2,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedArticles.has(article.id)}
                    onChange={() => toggleArticle(article.id)}
                    style={{ width: 16, height: 16 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {article.title}
                    </div>
                    <div style={{ fontSize: 11, color: "#999" }}>
                      {article.category} · {article.date}
                    </div>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Portal selection */}
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>배포 대상 포털</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {PORTALS.map((portal) => (
              <label
                key={portal.key}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 6,
                  cursor: "pointer",
                  background: selectedPortals.has(portal.key) ? "#FFF0F0" : "#FAFAFA",
                  border: `1px solid ${selectedPortals.has(portal.key) ? "#E8192C" : "#EEE"}`,
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedPortals.has(portal.key)}
                  onChange={() => togglePortal(portal.key)}
                  style={{ width: 16, height: 16, marginTop: 2 }}
                />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>{portal.name}</div>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{portal.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Distribute button */}
      <div style={{ marginBottom: 32 }}>
        <button
          onClick={handleDistribute}
          disabled={distributing}
          style={{
            padding: "12px 32px",
            background: distributing ? "#CCC" : "#E8192C",
            color: "#FFF",
            border: "none",
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            cursor: distributing ? "default" : "pointer",
          }}
        >
          {distributing ? "전송 중..." : `선택한 기사 배포 (${selectedArticles.size}건 → ${selectedPortals.size}개 포털)`}
        </button>
      </div>

      {/* Distribution logs */}
      <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #EEE", fontWeight: 600, fontSize: 15, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>배포 이력</span>
          {logs.length > 0 && (
            <button
              onClick={() => { setLogs([]); localStorage.removeItem("cp-distribute-logs"); }}
              style={{ fontSize: 12, color: "#999", background: "none", border: "none", cursor: "pointer" }}
            >
              이력 초기화
            </button>
          )}
        </div>
        {logs.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "#999", fontSize: 14 }}>
            배포 이력이 없습니다.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
                <th style={{ padding: "10px 20px", textAlign: "left", fontWeight: 500, color: "#666" }}>기사</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>포털</th>
                <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 500, color: "#666" }}>상태</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>메시지</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>시간</th>
              </tr>
            </thead>
            <tbody>
              {logs.slice(0, 20).map((log) => (
                <tr key={log.id} style={{ borderBottom: "1px solid #EEE" }}>
                  <td style={{ padding: "10px 20px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {log.articleTitle}
                  </td>
                  <td style={{ padding: "10px 16px", color: "#666" }}>{log.portal}</td>
                  <td style={{ padding: "10px 16px", textAlign: "center" }}>
                    <span style={{
                      padding: "2px 10px",
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 500,
                      background: log.status === "success" ? "#E8F5E9" : "#FFEBEE",
                      color: log.status === "success" ? "#2E7D32" : "#C62828",
                    }}>
                      {log.status === "success" ? "성공" : "실패"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 16px", color: "#666", fontSize: 12 }}>{log.message}</td>
                  <td style={{ padding: "10px 16px", color: "#999", fontSize: 12, whiteSpace: "nowrap" }}>
                    {new Date(log.timestamp).toLocaleString("ko-KR")}
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
