"use client";

import { useEffect, useState } from "react";
import type { Article, DistributeLog } from "@/types/article";
import { getArticles, getDistributeLogs, addDistributeLogs, clearDistributeLogs } from "@/lib/db";
import { PORTALS } from "@/lib/constants";

export default function AdminDistributePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [logs, setLogs] = useState<DistributeLog[]>([]);
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  const [selectedPortals, setSelectedPortals] = useState<Set<string>>(new Set());
  const [distributing, setDistributing] = useState(false);
  const [distributeError, setDistributeError] = useState("");

  useEffect(() => {
    getArticles().then((all) => setArticles(all.filter((a) => a.status === "게시")));
    getDistributeLogs().then(setLogs);
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
      setDistributeError("기사와 포털을 최소 1개 이상 선택해주세요.");
      return;
    }
    setDistributeError("");
    setDistributing(true);

    // Simulate distribution
    setTimeout(async () => {
      const newLogs: DistributeLog[] = [];
      selectedArticles.forEach((articleId) => {
        const article = articles.find((a) => a.id === articleId);
        if (!article) return;
        selectedPortals.forEach((portal) => {
          const portalInfo = PORTALS.find((p) => p.key === portal);
          // NOTE: 실제 API 연동이 필요합니다. 현재는 데모 모드입니다.
          const success = Math.random() > 0.2;
          newLogs.push({
            id: crypto.randomUUID(),
            articleId,
            articleTitle: article.title,
            portal: portalInfo?.name || portal,
            status: success ? "success" : "failed",
            timestamp: new Date().toISOString(),
            message: success
              ? "[데모] 색인 요청이 전송되었습니다."
              : "[데모] API 키 미설정 또는 요청 실패.",
          });
        });
      });

      await addDistributeLogs(newLogs);
      const updatedLogs = [...newLogs, ...logs].slice(0, 100);
      setLogs(updatedLogs);
      setDistributing(false);
      setSelectedArticles(new Set());
      setSelectedPortals(new Set());
    }, 1500);
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 16 }}>
        포털 배포 관리
      </h1>

      {/* 데모 모드 경고 배너 */}
      <div style={{
        background: "#FFF8E1", border: "1px solid #FFD54F", borderRadius: 8,
        padding: "12px 16px", marginBottom: 24, display: "flex", alignItems: "flex-start", gap: 10,
      }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#E65100", marginBottom: 4 }}>데모 모드로 동작 중</div>
          <div style={{ fontSize: 13, color: "#795548", lineHeight: 1.6 }}>
            현재 배포 기능은 실제 포털 API가 연결되지 않은 <strong>시뮬레이션</strong>입니다.
            네이버 뉴스스탠드, 다음 뉴스, 구글 뉴스 등 실제 색인 제출을 위해서는 각 포털의 API 키를 설정해야 합니다.
            실제 연동은 카페24 배포 후 관리자 설정에서 진행하세요.
          </div>
        </div>
      </div>

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
        {distributeError && (
          <div style={{ marginBottom: 12, padding: "10px 16px", background: "#FFEBEE", border: "1px solid #FFCDD2", borderRadius: 8, color: "#C62828", fontSize: 13 }}>
            {distributeError}
          </div>
        )}
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
              onClick={async () => { setLogs([]); await clearDistributeLogs(); }}
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
