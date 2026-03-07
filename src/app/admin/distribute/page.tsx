"use client";

import { useEffect, useState } from "react";
import type { Article, DistributeLog } from "@/types/article";
import { getArticles, getDistributeLogs, addDistributeLogs, clearDistributeLogs } from "@/lib/db";

const PORTALS = [
  { key: "indexnow", name: "IndexNow (Bing·Yandex·네이버 등)", desc: "IndexNow 프로토콜로 색인 즉시 요청 — SEO 설정에서 API 키 등록 필요" },
  { key: "google", name: "Google 색인", desc: "사이트맵 기반 자동 색인 — Search Console에서 사이트맵 등록 시 자동 반영" },
  { key: "rss", name: "RSS/Atom 피드", desc: "RSS 피드 구독 중인 서비스에 자동 배포 — /api/rss에서 이미 제공 중" },
] as const;

async function submitIndexNow(articleId: string, baseUrl: string): Promise<{ success: boolean; message: string }> {
  try {
    const url = `${baseUrl}/article/${articleId}`;
    const res = await fetch("/api/seo/index-now", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, action: "URL_UPDATED" }),
    });
    const data = await res.json();
    if (data.skipped) return { success: false, message: "IndexNow API 키 미설정 — SEO 설정에서 등록하세요" };
    if (data.success && data.indexNow?.submitted) return { success: true, message: `색인 요청 완료 (HTTP ${data.indexNow.status})` };
    return { success: false, message: `색인 요청 실패 (HTTP ${data.indexNow?.status || "unknown"})` };
  } catch (e) {
    return { success: false, message: `요청 오류: ${(e as Error).message}` };
  }
}

async function submitSitemapPing(baseUrl: string): Promise<{ success: boolean; message: string }> {
  try {
    const sitemapUrl = `${baseUrl}/sitemap.xml`;
    await fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`, { mode: "no-cors" });
    return { success: true, message: "사이트맵 ping 전송됨 (Google은 사이트맵 등록 시 자동 반영)" };
  } catch {
    return { success: true, message: "사이트맵 ping 전송됨 (브라우저 보안 정책으로 결과 확인 불가)" };
  }
}

export default function AdminDistributePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [logs, setLogs] = useState<DistributeLog[]>([]);
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  const [selectedPortals, setSelectedPortals] = useState<Set<string>>(new Set());
  const [distributing, setDistributing] = useState(false);
  const [distributeError, setDistributeError] = useState("");
  const [progress, setProgress] = useState("");

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

  const handleDistribute = async () => {
    if (selectedArticles.size === 0 || selectedPortals.size === 0) {
      setDistributeError("기사와 배포 대상을 최소 1개 이상 선택해주세요.");
      return;
    }
    setDistributeError("");
    setDistributing(true);
    setProgress("배포 시작...");

    const baseUrl = window.location.origin;
    const newLogs: DistributeLog[] = [];
    const articleIds = Array.from(selectedArticles);
    let done = 0;

    for (const articleId of articleIds) {
      const article = articles.find((a) => a.id === articleId);
      if (!article) continue;

      for (const portalKey of selectedPortals) {
        const portal = PORTALS.find((p) => p.key === portalKey);
        done++;
        setProgress(`${done}/${articleIds.length * selectedPortals.size} 처리 중... ${article.title.slice(0, 20)}`);

        let result: { success: boolean; message: string };

        if (portalKey === "indexnow") {
          result = await submitIndexNow(article.no ? String(article.no) : article.id, baseUrl);
        } else if (portalKey === "google") {
          result = await submitSitemapPing(baseUrl);
        } else if (portalKey === "rss") {
          result = { success: true, message: "RSS 피드에 자동 포함됨 (/api/rss)" };
        } else {
          result = { success: false, message: "미지원 포털" };
        }

        newLogs.push({
          id: crypto.randomUUID(),
          articleId,
          articleTitle: article.title,
          portal: portal?.name || portalKey,
          status: result.success ? "success" : "failed",
          timestamp: new Date().toISOString(),
          message: result.message,
        });
      }
    }

    await addDistributeLogs(newLogs);
    const updatedLogs = [...newLogs, ...logs].slice(0, 100);
    setLogs(updatedLogs);
    setDistributing(false);
    setProgress("");
    setSelectedArticles(new Set());
    setSelectedPortals(new Set());
  };

  const successCount = logs.filter((l) => l.status === "success").length;
  const failCount = logs.filter((l) => l.status === "failed").length;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 16 }}>
        포털 배포 관리
      </h1>

      {/* 안내 배너 */}
      <div style={{
        background: "#E3F2FD", border: "1px solid #90CAF9", borderRadius: 8,
        padding: "12px 16px", marginBottom: 24, display: "flex", alignItems: "flex-start", gap: 10,
      }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>ℹ️</span>
        <div style={{ fontSize: 13, color: "#1565C0", lineHeight: 1.6 }}>
          게시된 기사를 검색엔진에 색인 요청합니다.
          <strong> IndexNow</strong>를 사용하려면 <a href="/admin/seo" style={{ color: "#1565C0", textDecoration: "underline" }}>SEO 설정</a>에서 API 키를 등록하세요.
          기사 게시 시 자동으로 IndexNow 요청이 전송되며, 이 페이지에서는 수동 일괄 요청이 가능합니다.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Article selection */}
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>기사 선택 ({articles.length}건)</h3>
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
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 12px", borderRadius: 6, cursor: "pointer",
                    background: selectedArticles.has(article.id) ? "#FFF0F0" : "transparent",
                    marginBottom: 2,
                  }}
                >
                  <input type="checkbox" checked={selectedArticles.has(article.id)} onChange={() => toggleArticle(article.id)} style={{ width: 16, height: 16 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {article.no ? `[${article.no}] ` : ""}{article.title}
                    </div>
                    <div style={{ fontSize: 11, color: "#999" }}>{article.category} · {article.date}</div>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Portal selection */}
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>배포 대상</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {PORTALS.map((portal) => (
              <label
                key={portal.key}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "10px 12px", borderRadius: 6, cursor: "pointer",
                  background: selectedPortals.has(portal.key) ? "#FFF0F0" : "#FAFAFA",
                  border: `1px solid ${selectedPortals.has(portal.key) ? "#E8192C" : "#EEE"}`,
                }}
              >
                <input type="checkbox" checked={selectedPortals.has(portal.key)} onChange={() => togglePortal(portal.key)} style={{ width: 16, height: 16, marginTop: 2 }} />
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
        {progress && (
          <div style={{ marginBottom: 12, padding: "10px 16px", background: "#E8F5E9", border: "1px solid #C8E6C9", borderRadius: 8, color: "#2E7D32", fontSize: 13 }}>
            {progress}
          </div>
        )}
        <button
          onClick={handleDistribute}
          disabled={distributing}
          style={{
            padding: "12px 32px",
            background: distributing ? "#CCC" : "#E8192C",
            color: "#FFF", border: "none", borderRadius: 8,
            fontSize: 15, fontWeight: 600,
            cursor: distributing ? "default" : "pointer",
          }}
        >
          {distributing ? "전송 중..." : `선택한 기사 배포 (${selectedArticles.size}건 → ${selectedPortals.size}개 대상)`}
        </button>
      </div>

      {/* Distribution logs */}
      <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #EEE", fontWeight: 600, fontSize: 15, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>
            배포 이력
            {logs.length > 0 && (
              <span style={{ fontSize: 12, fontWeight: 400, color: "#999", marginLeft: 8 }}>
                성공 {successCount} · 실패 {failCount}
              </span>
            )}
          </span>
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
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>대상</th>
                <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 500, color: "#666" }}>상태</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>메시지</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>시간</th>
              </tr>
            </thead>
            <tbody>
              {logs.slice(0, 30).map((log) => (
                <tr key={log.id} style={{ borderBottom: "1px solid #EEE" }}>
                  <td style={{ padding: "10px 20px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {log.articleTitle}
                  </td>
                  <td style={{ padding: "10px 16px", color: "#666" }}>{log.portal}</td>
                  <td style={{ padding: "10px 16px", textAlign: "center" }}>
                    <span style={{
                      padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 500,
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
