"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Article, DistributeLog } from "@/types/article";
import { getArticles, getDistributeLogs, addDistributeLogs, clearDistributeLogs } from "@/lib/db";

const PORTALS = [
  { key: "indexnow", name: "IndexNow (Bing·Yandex·네이버 등)", desc: "IndexNow 프로토콜로 색인 즉시 요청 — SEO 설정에서 API 키 등록 필요" },
  { key: "google", name: "Google Search Console", desc: "Google ping은 종료됨 — Search Console에 sitemap/news sitemap 등록 후 자동 수집" },
  { key: "rss", name: "RSS/Atom 피드", desc: "RSS 피드 구독 중인 서비스에 자동 배포 — /rss.xml에서 직접 제공 중" },
] as const;

type PortalKey = typeof PORTALS[number]["key"];
type PortalSubmitResult = { status: DistributeLog["status"]; message: string };

async function submitIndexNow(articleId: string, baseUrl: string): Promise<PortalSubmitResult> {
  try {
    const url = `${baseUrl}/article/${articleId}`;
    const res = await fetch("/api/seo/index-now", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, action: "URL_UPDATED" }),
    });
    const data = await res.json();
    if (data.skipped) return { status: "pending", message: "IndexNow API 키 미설정 — SEO 설정에서 등록하세요" };
    if (data.success && data.indexNow?.submitted) return { status: "success", message: `색인 요청 완료 (HTTP ${data.indexNow.status})` };
    return { status: "failed", message: `색인 요청 실패 (HTTP ${data.indexNow?.status || "unknown"})` };
  } catch (e) {
    return { status: "failed", message: `요청 오류: ${(e as Error).message}` };
  }
}

async function checkSearchConsoleSitemap(baseUrl: string): Promise<PortalSubmitResult> {
  return {
    status: "pending",
    message: `Search Console에 ${baseUrl}/sitemap.xml 및 ${baseUrl}/news-sitemap.xml 등록 필요`,
  };
}

async function runPortalSubmit(portalKey: PortalKey, article: Article, baseUrl: string): Promise<PortalSubmitResult> {
  if (portalKey === "indexnow") {
    return submitIndexNow(article.no ? String(article.no) : article.id, baseUrl);
  }
  if (portalKey === "google") {
    return checkSearchConsoleSitemap(baseUrl);
  }
  if (portalKey === "rss") {
    return { status: "success", message: "RSS 피드에 자동 포함됨 (/rss.xml)" };
  }
  return { status: "failed", message: "미지원 포털" };
}

export default function AdminDistributePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [logs, setLogs] = useState<DistributeLog[]>([]);
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  const [selectedPortals, setSelectedPortals] = useState<Set<PortalKey>>(new Set());
  const [distributing, setDistributing] = useState(false);
  const [retryingLogId, setRetryingLogId] = useState("");
  const [distributeError, setDistributeError] = useState("");
  const [progress, setProgress] = useState("");

  useEffect(() => {
    getArticles().then(({ articles: all }) => setArticles(all.filter((a) => a.status === "게시")));
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

  const togglePortal = (key: PortalKey) => {
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

        const result = await runPortalSubmit(portalKey, article, baseUrl);

        newLogs.push({
          id: crypto.randomUUID(),
          articleId,
          articleTitle: article.title,
          portal: portal?.name || portalKey,
          status: result.status,
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
    setSelectedPortals(new Set<PortalKey>());
  };

  const getPortalKeyFromLog = (log: DistributeLog): PortalKey => {
    if (log.portal.includes("IndexNow")) return "indexnow";
    if (log.portal.includes("Search Console") || log.portal.includes("Google")) return "google";
    return "rss";
  };

  const getArticleForLog = (log: DistributeLog) => articles.find((article) =>
    article.id === log.articleId
    || String(article.no ?? "") === log.articleId
    || article.title === log.articleTitle,
  );

  const handleRetryLog = async (log: DistributeLog) => {
    const article = getArticleForLog(log);
    if (!article) {
      setDistributeError("재시도할 기사를 찾을 수 없습니다.");
      return;
    }
    setDistributeError("");
    setRetryingLogId(log.id);
    const portalKey = getPortalKeyFromLog(log);
    const portal = PORTALS.find((p) => p.key === portalKey);
    const result = await runPortalSubmit(portalKey, article, window.location.origin);
    const retryLog: DistributeLog = {
      id: crypto.randomUUID(),
      articleId: article.id,
      articleTitle: article.title,
      portal: portal?.name || log.portal,
      status: result.status,
      timestamp: new Date().toISOString(),
      message: `[재시도] ${result.message}`,
    };
    await addDistributeLogs([retryLog]);
    setLogs((prev) => [retryLog, ...prev].slice(0, 100));
    setRetryingLogId("");
  };

  const successCount = logs.filter((l) => l.status === "success").length;
  const failCount = logs.filter((l) => l.status === "failed").length;
  const pendingCount = logs.filter((l) => l.status === "pending").length;

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
          <strong> IndexNow</strong>를 사용하려면 <Link href="/cam/seo" style={{ color: "#1565C0", textDecoration: "underline" }}>SEO 설정</Link>에서 API 키를 등록하세요.
          기사 게시 시 자동으로 IndexNow 요청이 전송되며, Google은 Search Console에 sitemap을 등록해 수집 상태를 확인합니다.
          포털 제휴 신청용 기사 목록과 발행량 리포트는 <Link href="/cam/portal-review" style={{ color: "#1565C0", textDecoration: "underline" }}>제휴 심사 자료</Link>에서 다운로드할 수 있습니다.
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
                성공 {successCount} · 실패 {failCount} · 확인 필요 {pendingCount}
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
	                <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 500, color: "#666" }}>관리</th>
	              </tr>
	            </thead>
	            <tbody>
	              {logs.slice(0, 30).map((log) => {
	                const retryable = (log.status === "failed" || log.status === "pending") && Boolean(getArticleForLog(log));
	                return (
	                <tr key={log.id} style={{ borderBottom: "1px solid #EEE" }}>
	                  <td style={{ padding: "10px 20px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
	                    {log.articleTitle}
                  </td>
                  <td style={{ padding: "10px 16px", color: "#666" }}>{log.portal}</td>
                  <td style={{ padding: "10px 16px", textAlign: "center" }}>
                    <span style={{
                      padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 500,
                      background: log.status === "success" ? "#E8F5E9" : log.status === "pending" ? "#E3F2FD" : "#FFEBEE",
                      color: log.status === "success" ? "#2E7D32" : log.status === "pending" ? "#1565C0" : "#C62828",
                    }}>
                      {log.status === "success" ? "성공" : log.status === "pending" ? "확인" : "실패"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 16px", color: "#666", fontSize: 12 }}>{log.message}</td>
	                  <td style={{ padding: "10px 16px", color: "#999", fontSize: 12, whiteSpace: "nowrap" }}>
	                    {new Date(log.timestamp).toLocaleString("ko-KR")}
	                  </td>
	                  <td style={{ padding: "10px 16px", textAlign: "center" }}>
	                    <button
	                      onClick={() => handleRetryLog(log)}
	                      disabled={!retryable || retryingLogId === log.id}
	                      style={{
	                        padding: "4px 10px",
	                        border: "1px solid #DDD",
	                        borderRadius: 6,
	                        background: retryable ? "#FFF" : "#F5F5F5",
	                        color: retryable ? "#333" : "#AAA",
	                        fontSize: 12,
	                        cursor: retryable ? "pointer" : "default",
	                      }}
	                    >
	                      {retryingLogId === log.id ? "처리 중" : "재시도"}
	                    </button>
	                  </td>
	                </tr>
	                );
	              })}
	            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
