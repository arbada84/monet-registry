"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Article {
  id: string;
  title: string;
  category: string;
  date: string;
  status: string;
  views: number;
}

interface ViewLogEntry {
  articleId: string;
  timestamp: string;
  path: string;
}

interface Comment {
  id: string;
  status: string;
}

interface DistributeLog {
  id: string;
  status: string;
  timestamp: string;
  portal: string;
  articleTitle: string;
}

export default function AdminDashboardPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [viewLog, setViewLog] = useState<ViewLogEntry[]>([]);
  const [commentCount, setCommentCount] = useState({ total: 0, pending: 0 });
  const [adCount, setAdCount] = useState(0);
  const [distributeLogs, setDistributeLogs] = useState<DistributeLog[]>([]);
  const [categoryStats, setCategoryStats] = useState<{ name: string; count: number }[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("cp-articles");
    const arts: Article[] = stored ? JSON.parse(stored) : [];
    setArticles(arts);

    const vl: ViewLogEntry[] = JSON.parse(localStorage.getItem("cp-view-log") || "[]");
    setViewLog(vl);

    const comments = localStorage.getItem("cp-comments");
    if (comments) {
      const parsed: Comment[] = JSON.parse(comments);
      setCommentCount({ total: parsed.length, pending: parsed.filter((c) => c.status === "pending").length });
    }

    const ads = localStorage.getItem("cp-ads");
    if (ads) setAdCount(JSON.parse(ads).filter((a: { enabled: boolean }) => a.enabled).length);

    const logs = localStorage.getItem("cp-distribute-logs");
    if (logs) setDistributeLogs(JSON.parse(logs));

    // Category stats
    const catMap: Record<string, number> = {};
    arts.filter((a) => a.status === "게시").forEach((a) => {
      catMap[a.category || "뉴스"] = (catMap[a.category || "뉴스"] || 0) + 1;
    });
    setCategoryStats(Object.entries(catMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count));
  }, []);

  const totalArticles = articles.length;
  const publishedArticles = articles.filter((a) => a.status === "게시").length;
  const draftArticles = articles.filter((a) => a.status === "임시저장").length;

  // Today's stats from view log
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayArticles = articles.filter((a) => a.date === todayStr).length;
  const todayViews = viewLog.filter((v) => v.timestamp.startsWith(todayStr)).length;

  // Total views from articles
  const totalViews = articles.reduce((sum, a) => sum + (a.views || 0), 0);

  // This week views
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekCutoff = weekAgo.toISOString();
  const weekViews = viewLog.filter((v) => v.timestamp >= weekCutoff).length;

  // Unique visitors (approximate by unique days in view log)
  const uniqueDays = new Set(viewLog.map((v) => v.timestamp.slice(0, 10))).size;

  // Recent articles sorted by date descending
  const recentArticles = [...articles].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const recentLogs = distributeLogs.slice(0, 5);

  // Top articles by views
  const topArticles = [...articles]
    .filter((a) => a.status === "게시")
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 5);

  const stats = [
    { label: "총 기사 수", value: totalArticles, color: "#E8192C" },
    { label: "오늘 작성", value: todayArticles, color: "#2196F3" },
    { label: "총 조회수", value: totalViews.toLocaleString(), color: "#4CAF50" },
    { label: "오늘 조회", value: todayViews.toLocaleString(), color: "#FF9800" },
    { label: "주간 조회", value: weekViews.toLocaleString(), color: "#9C27B0" },
    { label: "게시 / 임시", value: `${publishedArticles} / ${draftArticles}`, color: "#009688" },
  ];

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 24 }}>대시보드</h1>

      {/* Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 28 }}>
        {stats.map((stat) => (
          <div key={stat.label} style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 6 }}>{stat.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div style={{ display: "flex", gap: 10, marginBottom: 28, flexWrap: "wrap" }}>
        <Link href="/admin/articles/new" style={{ padding: "9px 18px", background: "#E8192C", color: "#FFF", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>+ 기사 작성</Link>
        <Link href="/admin/press-import" style={{ padding: "9px 18px", background: "#FF9800", color: "#FFF", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>보도자료 수집</Link>
        <Link href="/admin/headlines" style={{ padding: "9px 18px", background: "#2196F3", color: "#FFF", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>헤드라인 관리</Link>
        <Link href="/admin/comments" style={{ padding: "9px 18px", background: "#FFF", color: "#333", borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: "none", border: "1px solid #DDD" }}>
          댓글 관리 {commentCount.pending > 0 && `(${commentCount.pending})`}
        </Link>
        <Link href="/admin/settings" style={{ padding: "9px 18px", background: "#FFF", color: "#333", borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: "none", border: "1px solid #DDD" }}>사이트 설정</Link>
        <Link href="/admin/analytics" style={{ padding: "9px 18px", background: "#FFF", color: "#333", borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: "none", border: "1px solid #DDD" }}>방문자 통계</Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Recent Articles */}
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #EEE", fontWeight: 600, fontSize: 15, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>최근 기사</span>
            <Link href="/admin/articles" style={{ fontSize: 12, color: "#E8192C", textDecoration: "none" }}>전체보기</Link>
          </div>
          {recentArticles.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "#999", fontSize: 14 }}>등록된 기사가 없습니다.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
                  <th style={{ padding: "8px 20px", textAlign: "left", fontWeight: 500, color: "#666" }}>제목</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 500, color: "#666" }}>카테고리</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 500, color: "#666" }}>조회수</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 500, color: "#666" }}>상태</th>
                </tr>
              </thead>
              <tbody>
                {recentArticles.map((article) => (
                  <tr key={article.id} style={{ borderBottom: "1px solid #EEE" }}>
                    <td style={{ padding: "10px 20px", color: "#111", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{article.title}</td>
                    <td style={{ padding: "10px 12px", color: "#666" }}>{article.category}</td>
                    <td style={{ padding: "10px 12px", color: "#E8192C", fontWeight: 600, textAlign: "right" }}>{(article.views || 0).toLocaleString()}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{
                        padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 500,
                        background: article.status === "게시" ? "#E8F5E9" : "#FFF3E0",
                        color: article.status === "게시" ? "#2E7D32" : "#E65100",
                      }}>{article.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Top Articles by Views */}
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #EEE", fontWeight: 600, fontSize: 15 }}>인기 기사 TOP 5</div>
          {topArticles.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "#999", fontSize: 14 }}>데이터가 없습니다.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {topArticles.map((article, idx) => (
                  <tr key={article.id} style={{ borderBottom: "1px solid #EEE" }}>
                    <td style={{ padding: "10px 20px", width: 30 }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 24, height: 24, borderRadius: 4, fontSize: 11, fontWeight: 700, color: "#FFF",
                        background: idx < 3 ? "#E8192C" : "#999",
                      }}>{idx + 1}</span>
                    </td>
                    <td style={{ padding: "10px 0", color: "#111", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{article.title}</td>
                    <td style={{ padding: "10px 20px", color: "#E8192C", fontWeight: 600, textAlign: "right", whiteSpace: "nowrap" }}>{(article.views || 0).toLocaleString()}회</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Category Stats */}
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #EEE", fontWeight: 600, fontSize: 15 }}>카테고리별 기사 수</div>
          {categoryStats.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "#999", fontSize: 14 }}>데이터가 없습니다.</div>
          ) : (
            <div style={{ padding: 20 }}>
              {categoryStats.map((cat) => (
                <div key={cat.name} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, width: 60, color: "#333" }}>{cat.name}</span>
                  <div style={{ flex: 1, height: 20, background: "#F5F5F5", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{
                      width: `${Math.min(100, (cat.count / Math.max(...categoryStats.map((c) => c.count))) * 100)}%`,
                      height: "100%", background: "#E8192C", borderRadius: 4, minWidth: 4,
                    }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#E8192C", minWidth: 30, textAlign: "right" }}>{cat.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Distribution Logs */}
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #EEE", fontWeight: 600, fontSize: 15, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>최근 배포 이력</span>
            <Link href="/admin/distribute" style={{ fontSize: 12, color: "#E8192C", textDecoration: "none" }}>전체보기</Link>
          </div>
          {recentLogs.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "#999", fontSize: 14 }}>배포 이력이 없습니다.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
                  <th style={{ padding: "8px 20px", textAlign: "left", fontWeight: 500, color: "#666" }}>기사</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 500, color: "#666" }}>포털</th>
                  <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 500, color: "#666" }}>결과</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: "1px solid #EEE" }}>
                    <td style={{ padding: "10px 20px", color: "#111", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.articleTitle}</td>
                    <td style={{ padding: "10px 12px", color: "#666" }}>{log.portal}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <span style={{
                        padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 500,
                        background: log.status === "success" ? "#E8F5E9" : "#FFEBEE",
                        color: log.status === "success" ? "#2E7D32" : "#C62828",
                      }}>{log.status === "success" ? "성공" : "실패"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
