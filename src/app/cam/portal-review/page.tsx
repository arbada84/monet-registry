"use client";

import { useEffect, useMemo, useState } from "react";
import type { PortalReviewReport } from "@/lib/portal-review";

type LoadState = "idle" | "loading" | "ready" | "error";

function percent(part: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((part / total) * 1000) / 10}%`;
}

function formatDate(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR");
}

export default function PortalReviewPage() {
  const [months, setMonths] = useState(6);
  const [report, setReport] = useState<PortalReviewReport | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState("");

  const query = useMemo(() => new URLSearchParams({ months: String(months) }).toString(), [months]);
  const csvUrl = `/api/cam/portal-review?format=csv&${query}`;
  const jsonUrl = `/api/cam/portal-review?format=json&${query}`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState("loading");
      setError("");
      try {
        const response = await fetch(jsonUrl, { credentials: "include", cache: "no-store" });
        const data = await response.json();
        if (!response.ok || data.success === false) {
          throw new Error(data.error || "리포트를 불러오지 못했습니다.");
        }
        if (!cancelled) {
          setReport(data.report);
          setState("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "리포트를 불러오지 못했습니다.");
          setState("error");
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [jsonUrl]);

  const summary = report?.summary;
  const rows = report?.rows ?? [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 8 }}>
            검색 유입 운영 리포트
          </h1>
          <div style={{ fontSize: 13, color: "#666" }}>
            기사 목록, 자체기사 후보, 기자/카테고리/월별 발행량을 검색 색인과 내부 품질 점검 기준으로 확인합니다.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <select
            value={months}
            onChange={(event) => setMonths(Number(event.target.value))}
            style={{ height: 36, border: "1px solid #DDD", borderRadius: 8, padding: "0 10px", background: "#FFF", fontSize: 13 }}
          >
            <option value={3}>최근 3개월</option>
            <option value={6}>최근 6개월</option>
            <option value={12}>최근 12개월</option>
            <option value={24}>최근 24개월</option>
          </select>
          <a
            href={jsonUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ height: 36, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: 8, border: "1px solid #DDD", color: "#333", textDecoration: "none", fontSize: 13, background: "#FFF" }}
          >
            JSON
          </a>
          <a
            href={csvUrl}
            style={{ height: 36, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: 8, border: "1px solid #E8192C", color: "#FFF", textDecoration: "none", fontSize: 13, fontWeight: 600, background: "#E8192C" }}
          >
            CSV 다운로드
          </a>
        </div>
      </div>

      {state === "loading" && (
        <div style={{ padding: 24, background: "#FFF", border: "1px solid #EEE", borderRadius: 10, color: "#666", fontSize: 14 }}>
          리포트를 불러오는 중입니다.
        </div>
      )}

      {state === "error" && (
        <div style={{ padding: 16, background: "#FFEBEE", border: "1px solid #FFCDD2", borderRadius: 10, color: "#C62828", fontSize: 13 }}>
          {error}
        </div>
      )}

      {summary && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 20 }}>
            {[
              { label: "대상 기사", value: summary.total.toLocaleString(), sub: `${months}개월 기준` },
              { label: "자체기사 후보", value: summary.ownArticleCandidate.toLocaleString(), sub: percent(summary.ownArticleCandidate, summary.total) },
              { label: "외부출처 후보", value: summary.externalSource.toLocaleString(), sub: percent(summary.externalSource, summary.total) },
              { label: "AI 생성 후보", value: summary.aiGenerated.toLocaleString(), sub: percent(summary.aiGenerated, summary.total) },
            ].map((item) => (
              <div key={item.label} style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 12, color: "#777", marginBottom: 8 }}>{item.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#111" }}>{item.value}</div>
                <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>{item.sub}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
            {[
              { title: "카테고리별 발행량", rows: summary.byCategory.slice(0, 8) },
              { title: "기자별 발행량", rows: summary.byAuthor.slice(0, 8) },
              { title: "월별 발행량", rows: summary.byMonth.slice(0, 8) },
            ].map((section) => (
              <div key={section.title} style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #EEE", fontSize: 14, fontWeight: 600 }}>{section.title}</div>
                <div style={{ padding: 12 }}>
                  {section.rows.length === 0 ? (
                    <div style={{ padding: 12, color: "#999", fontSize: 13 }}>데이터가 없습니다.</div>
                  ) : section.rows.map((row) => (
                    <div key={row.name} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 4px", borderBottom: "1px solid #F5F5F5", fontSize: 13 }}>
                      <span style={{ color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</span>
                      <span style={{ color: "#111", fontWeight: 600 }}>{row.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #EEE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>운영 점검용 기사 목록</h2>
              <span style={{ color: "#999", fontSize: 12 }}>최대 10,000건</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#666" }}>번호</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#666" }}>제목</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#666" }}>카테고리</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#666" }}>기자</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#666" }}>발행일</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#666" }}>구분 후보</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#666" }}>URL</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((row) => (
                    <tr key={row.id} style={{ borderBottom: "1px solid #F1F1F1" }}>
                      <td style={{ padding: "9px 12px", color: "#666" }}>{row.no || "-"}</td>
                      <td style={{ padding: "9px 12px", color: "#111", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</td>
                      <td style={{ padding: "9px 12px", color: "#666" }}>{row.category || "-"}</td>
                      <td style={{ padding: "9px 12px", color: "#666" }}>{row.author || "-"}</td>
                      <td style={{ padding: "9px 12px", color: "#666" }}>{formatDate(row.publishedAt)}</td>
                      <td style={{ padding: "9px 12px", color: "#666" }}>{row.reviewType}</td>
                      <td style={{ padding: "9px 12px" }}>
                        <a href={row.articleUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1565C0", textDecoration: "none" }}>
                          열기
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 100 && (
              <div style={{ padding: 12, background: "#FAFAFA", color: "#777", fontSize: 12, textAlign: "center" }}>
                화면에는 100건만 표시합니다. 전체 목록은 CSV/JSON으로 다운로드하세요.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
