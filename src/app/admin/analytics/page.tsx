"use client";

import { useEffect, useState } from "react";

interface Article {
  id: string;
  title: string;
  views: number;
  status: string;
}

interface ViewLogEntry {
  articleId: string;
  timestamp: string;
  path: string;
}

interface DailyStat {
  date: string;
  pageviews: number;
}

export default function AdminAnalyticsPage() {
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [topPages, setTopPages] = useState<{ title: string; url: string; views: number }[]>([]);
  const [totalViews, setTotalViews] = useState(0);
  const [todayViews, setTodayViews] = useState(0);
  const [weekViews, setWeekViews] = useState(0);
  const [avgDaily, setAvgDaily] = useState(0);
  const [period, setPeriod] = useState<"7" | "14" | "30">("30");

  useEffect(() => {
    const viewLog: ViewLogEntry[] = JSON.parse(localStorage.getItem("cp-view-log") || "[]");
    const articles: Article[] = JSON.parse(localStorage.getItem("cp-articles") || "[]");

    const todayStr = new Date().toISOString().slice(0, 10);

    // Build daily stats for the last 30 days
    const dailyMap: Record<string, number> = {};
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dailyMap[d.toISOString().slice(0, 10)] = 0;
    }

    viewLog.forEach((v) => {
      const day = v.timestamp.slice(0, 10);
      if (dailyMap[day] !== undefined) {
        dailyMap[day]++;
      }
    });

    const daily = Object.entries(dailyMap).map(([date, pageviews]) => ({ date, pageviews }));
    setDailyStats(daily);

    // Total views from articles
    const total = articles.reduce((s, a) => s + (a.views || 0), 0);
    setTotalViews(total);

    // Today views
    setTodayViews(viewLog.filter((v) => v.timestamp.startsWith(todayStr)).length);

    // Week views
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    setWeekViews(viewLog.filter((v) => v.timestamp >= weekAgo.toISOString()).length);

    // Avg daily (from view log)
    const daysWithData = daily.filter((d) => d.pageviews > 0).length || 1;
    const totalFromLog = daily.reduce((s, d) => s + d.pageviews, 0);
    setAvgDaily(Math.round(totalFromLog / daysWithData));

    // Top pages: group by articleId
    const pageMap: Record<string, number> = {};
    viewLog.forEach((v) => {
      pageMap[v.articleId] = (pageMap[v.articleId] || 0) + 1;
    });

    const topP = Object.entries(pageMap)
      .map(([articleId, views]) => {
        const art = articles.find((a) => a.id === articleId);
        return {
          title: art?.title || articleId,
          url: `/article/${articleId}`,
          views,
        };
      })
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);

    // Add homepage if total views exist
    if (total > 0) {
      topP.unshift({ title: "메인 페이지", url: "/", views: Math.round(total * 0.3) });
    }

    setTopPages(topP);
  }, []);

  const filteredDaily = dailyStats.slice(-parseInt(period));
  const maxPageviews = Math.max(...filteredDaily.map((d) => d.pageviews), 1);
  const periodTotal = filteredDaily.reduce((s, d) => s + d.pageviews, 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>방문자 통계</h1>
        <div style={{ display: "flex", gap: 4 }}>
          {(["7", "14", "30"] as const).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: "6px 16px", fontSize: 13, fontWeight: period === p ? 600 : 400,
              color: period === p ? "#E8192C" : "#666",
              background: period === p ? "#FFF0F0" : "#FFF",
              border: `1px solid ${period === p ? "#E8192C" : "#DDD"}`,
              borderRadius: 6, cursor: "pointer",
            }}>{p}일</button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        {[
          { label: "총 조회수", value: totalViews.toLocaleString(), color: "#E8192C" },
          { label: `${period}일 조회`, value: periodTotal.toLocaleString(), color: "#2196F3" },
          { label: "오늘 조회", value: todayViews.toLocaleString(), color: "#4CAF50" },
          { label: "일평균 조회", value: avgDaily.toLocaleString(), color: "#FF9800" },
        ].map((stat) => (
          <div key={stat.label} style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: "20px 24px" }}>
            <div style={{ fontSize: 13, color: "#999", marginBottom: 8 }}>{stat.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 20, marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>일별 페이지뷰</h3>
        {periodTotal === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "#999", fontSize: 14 }}>
            아직 조회 데이터가 없습니다. 기사를 열람하면 통계가 기록됩니다.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 160 }}>
              {filteredDaily.map((d) => (
                <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div
                    style={{
                      width: "100%", maxWidth: 24,
                      height: `${Math.max(4, (d.pageviews / maxPageviews) * 140)}px`,
                      background: d.date === new Date().toISOString().slice(0, 10) ? "#E8192C" : "#E8192C80",
                      borderRadius: "4px 4px 0 0", minHeight: 4,
                    }}
                    title={`${d.date}: ${d.pageviews} PV`}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <span style={{ fontSize: 11, color: "#999" }}>{filteredDaily[0]?.date}</span>
              <span style={{ fontSize: 11, color: "#999" }}>{filteredDaily[filteredDaily.length - 1]?.date}</span>
            </div>
          </>
        )}
      </div>

      {/* Top pages */}
      <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #EEE", fontWeight: 600, fontSize: 15 }}>인기 페이지</div>
        {topPages.length === 0 ? (
          <div style={{ padding: "32px 20px", textAlign: "center", color: "#999", fontSize: 14 }}>데이터가 없습니다.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
                <th style={{ padding: "8px 20px", textAlign: "left", fontWeight: 500, color: "#666", width: 40 }}>순위</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 500, color: "#666" }}>페이지</th>
                <th style={{ padding: "8px 20px", textAlign: "right", fontWeight: 500, color: "#666" }}>조회수</th>
              </tr>
            </thead>
            <tbody>
              {topPages.map((page, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #EEE" }}>
                  <td style={{ padding: "10px 20px" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 24, height: 24, borderRadius: 4, fontSize: 11, fontWeight: 700, color: "#FFF",
                      background: i < 3 ? "#E8192C" : "#999",
                    }}>{i + 1}</span>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: 500, color: "#111", marginBottom: 2 }}>{page.title}</div>
                    <div style={{ fontSize: 11, color: "#999" }}>{page.url}</div>
                  </td>
                  <td style={{ padding: "10px 20px", textAlign: "right", color: "#E8192C", fontWeight: 600, whiteSpace: "nowrap" }}>
                    {page.views.toLocaleString()} PV
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
