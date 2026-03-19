"use client";

import { useEffect, useState, useMemo } from "react";
import type { Article, ViewLogEntry } from "@/types/article";
import { getArticles, getViewLogs } from "@/lib/db";

interface DailyStat {
  date: string;
  pageviews: number;
  adminViews: number;
  externalViews: number;
}

interface CategoryStat {
  category: string;
  views: number;
  count: number;
}

interface ReporterStat {
  reporter: string;
  views: number;
  count: number;
}

type ViewFilter = "all" | "external" | "admin" | "bot";

export default function AdminAnalyticsPage() {
  const [allLogs, setAllLogs] = useState<ViewLogEntry[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [topPages, setTopPages] = useState<{ title: string; url: string; views: number; adminViews: number; externalViews: number }[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [reporterStats, setReporterStats] = useState<ReporterStat[]>([]);
  const [totalViews, setTotalViews] = useState(0);
  const [todayViews, setTodayViews] = useState(0);
  const [weekViews, setWeekViews] = useState(0);
  const [avgDaily, setAvgDaily] = useState(0);
  const [period, setPeriod] = useState<"7" | "14" | "30">("30");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");

  // 필터된 로그 요약 수치
  const [filteredTodayViews, setFilteredTodayViews] = useState(0);
  const [filteredWeekViews, setFilteredWeekViews] = useState(0);
  const [filteredAvgDaily, setFilteredAvgDaily] = useState(0);

  // 관리자/외부/봇 총 비율
  const botCount = useMemo(() => allLogs.filter((l) => l.isBot).length, [allLogs]);
  const adminCount = useMemo(() => allLogs.filter((l) => l.isAdmin && !l.isBot).length, [allLogs]);
  const externalCount = useMemo(() => allLogs.filter((l) => !l.isAdmin && !l.isBot).length, [allLogs]);

  // 봇 종류별 통계
  const botStats = useMemo(() => {
    const map: Record<string, number> = {};
    allLogs.filter((l) => l.isBot).forEach((l) => {
      const name = l.botName || "알 수 없는 봇";
      map[name] = (map[name] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [allLogs]);

  useEffect(() => {
    (async () => {
      const viewLog = await getViewLogs();
      const arts = await getArticles();
      setAllLogs(viewLog);
      setArticles(arts);

      // Total views from articles
      const total = arts.reduce((s, a) => s + (a.views || 0), 0);
      setTotalViews(total);
    })();
  }, []);

  // 필터 적용된 통계 재계산
  useEffect(() => {
    const filteredLogs = viewFilter === "all" ? allLogs.filter((l) => !l.isBot)
      : viewFilter === "admin" ? allLogs.filter((l) => l.isAdmin && !l.isBot)
      : viewFilter === "bot" ? allLogs.filter((l) => l.isBot)
      : allLogs.filter((l) => !l.isAdmin && !l.isBot);

    // KST 기준 날짜 헬퍼
    const toKstDateStr = (date: Date) =>
      date.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    const timestampToKstDate = (ts: string) =>
      new Date(ts).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

    const todayStr = toKstDateStr(new Date());

    // Build daily stats for the last 30 days (KST 기준)
    const dailyMap: Record<string, { all: number; admin: number; external: number }> = {};
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dailyMap[toKstDateStr(d)] = { all: 0, admin: 0, external: 0 };
    }

    allLogs.forEach((v) => {
      const day = timestampToKstDate(v.timestamp);
      if (dailyMap[day] !== undefined) {
        dailyMap[day].all++;
        if (v.isAdmin) dailyMap[day].admin++;
        else dailyMap[day].external++;
      }
    });

    const daily = Object.entries(dailyMap).map(([date, d]) => ({
      date,
      pageviews: viewFilter === "all" ? d.all : viewFilter === "admin" ? d.admin : d.external,
      adminViews: d.admin,
      externalViews: d.external,
    }));
    setDailyStats(daily);

    // Today views
    setFilteredTodayViews(filteredLogs.filter((v) => timestampToKstDate(v.timestamp) === todayStr).length);
    setTodayViews(allLogs.filter((v) => timestampToKstDate(v.timestamp) === todayStr).length);

    // Week views
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = toKstDateStr(weekAgo);
    setFilteredWeekViews(filteredLogs.filter((v) => timestampToKstDate(v.timestamp) >= weekAgoStr).length);
    setWeekViews(allLogs.filter((v) => timestampToKstDate(v.timestamp) >= weekAgoStr).length);

    // Avg daily
    const daysWithData = daily.filter((d) => d.pageviews > 0).length || 1;
    const totalFromLog = daily.reduce((s, d) => s + d.pageviews, 0);
    setFilteredAvgDaily(Math.round(totalFromLog / daysWithData));
    setAvgDaily(Math.round(allLogs.length > 0 ? daily.reduce((s, d) => s + d.adminViews + d.externalViews, 0) / (daily.filter((d) => (d.adminViews + d.externalViews) > 0).length || 1) : 0));

    // Top pages: group by articleId
    const pageMap: Record<string, { total: number; admin: number; external: number }> = {};
    filteredLogs.forEach((v) => {
      if (!pageMap[v.articleId]) pageMap[v.articleId] = { total: 0, admin: 0, external: 0 };
      pageMap[v.articleId].total++;
    });
    // 전체 로그에서 admin/external 비율도 계산
    allLogs.forEach((v) => {
      if (!pageMap[v.articleId]) return; // 필터에 없으면 스킵
      if (v.isAdmin) pageMap[v.articleId].admin++;
      else pageMap[v.articleId].external++;
    });

    const topP = Object.entries(pageMap)
      .map(([articleId, stats]) => {
        const art = articles.find((a) => a.id === articleId);
        return {
          title: art?.title || articleId,
          url: `/article/${art?.no ?? articleId}`,
          views: stats.total,
          adminViews: stats.admin,
          externalViews: stats.external,
        };
      })
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);

    setTopPages(topP);

    // 카테고리별 조회수 (게시 기사 기준)
    const catMap: Record<string, { views: number; count: number }> = {};
    articles.filter((a) => a.status === "게시").forEach((a) => {
      const cat = a.category || "미분류";
      if (!catMap[cat]) catMap[cat] = { views: 0, count: 0 };
      catMap[cat].views += a.views || 0;
      catMap[cat].count++;
    });
    const catStats = Object.entries(catMap)
      .map(([category, d]) => ({ category, ...d }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);
    setCategoryStats(catStats);

    // 기자별 조회수 (게시 기사 기준)
    const repMap: Record<string, { views: number; count: number }> = {};
    articles.filter((a) => a.status === "게시" && a.author).forEach((a) => {
      const rep = a.author!;
      if (!repMap[rep]) repMap[rep] = { views: 0, count: 0 };
      repMap[rep].views += a.views || 0;
      repMap[rep].count++;
    });
    const repStats = Object.entries(repMap)
      .map(([reporter, d]) => ({ reporter, ...d }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);
    setReporterStats(repStats);
  }, [allLogs, articles, viewFilter]);

  const filteredDaily = dailyStats.slice(-parseInt(period));
  const maxPageviews = Math.max(...filteredDaily.map((d) => d.pageviews), 1);
  const periodTotal = filteredDaily.reduce((s, d) => s + d.pageviews, 0);

  const filterLabel = viewFilter === "all" ? "" : viewFilter === "admin" ? " (관리자)" : " (외부)";

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

      {/* 관리자/외부 필터 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "#666", fontWeight: 500 }}>조회수 필터:</span>
        {([
          { key: "all" as const, label: "전체 (봇 제외)", count: externalCount + adminCount },
          { key: "external" as const, label: "외부 방문자", count: externalCount },
          { key: "admin" as const, label: "관리자", count: adminCount },
          { key: "bot" as const, label: "AI/봇", count: botCount },
        ]).map((f) => (
          <button key={f.key} onClick={() => setViewFilter(f.key)} style={{
            padding: "5px 14px", fontSize: 12, fontWeight: viewFilter === f.key ? 600 : 400,
            color: viewFilter === f.key ? "#FFF" : "#555",
            background: viewFilter === f.key
              ? f.key === "admin" ? "#FF9800" : f.key === "external" ? "#2196F3" : f.key === "bot" ? "#9C27B0" : "#E8192C"
              : "#F5F5F5",
            border: viewFilter === f.key ? "none" : "1px solid #DDD",
            borderRadius: 20, cursor: "pointer",
          }}>
            {f.label} ({f.count.toLocaleString()})
          </button>
        ))}
        {allLogs.length > 0 && (
          <span style={{ fontSize: 11, color: "#999", marginLeft: 8 }}>
            봇 비율: {botCount > 0 ? ((botCount / allLogs.length) * 100).toFixed(1) : 0}%
          </span>
        )}
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        {[
          { label: "총 조회수", value: totalViews.toLocaleString(), sub: viewFilter !== "all" ? `필터${filterLabel}: 로그 ${periodTotal}건` : undefined, color: "#E8192C" },
          { label: `${period}일 조회${filterLabel}`, value: periodTotal.toLocaleString(), color: "#2196F3" },
          { label: `오늘 조회${filterLabel}`, value: (viewFilter === "all" ? todayViews : filteredTodayViews).toLocaleString(), color: "#4CAF50" },
          { label: `일평균${filterLabel}`, value: (viewFilter === "all" ? avgDaily : filteredAvgDaily).toLocaleString(), color: "#FF9800" },
        ].map((stat) => (
          <div key={stat.label} style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: "20px 24px" }}>
            <div style={{ fontSize: 13, color: "#999", marginBottom: 8 }}>{stat.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{stat.value}</div>
            {stat.sub && <div style={{ fontSize: 11, color: "#BBB", marginTop: 4 }}>{stat.sub}</div>}
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 20, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>일별 페이지뷰{filterLabel}</h3>
          {viewFilter === "all" && (
            <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#999" }}>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#E8192C", borderRadius: 2, marginRight: 4 }} />외부</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#FF9800", borderRadius: 2, marginRight: 4 }} />관리자</span>
            </div>
          )}
        </div>
        {periodTotal === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "#999", fontSize: 14 }}>
            아직 조회 데이터가 없습니다. 기사를 열람하면 통계가 기록됩니다.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 160 }}>
              {filteredDaily.map((d) => {
                const isToday = d.date === new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
                if (viewFilter === "all") {
                  // 스택 바 차트: 외부(빨강) + 관리자(주황)
                  const totalH = Math.max(4, (d.pageviews / maxPageviews) * 140);
                  const adminH = d.pageviews > 0 ? (d.adminViews / d.pageviews) * totalH : 0;
                  const externalH = totalH - adminH;
                  return (
                    <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", width: "100%", maxWidth: 24, minHeight: 4 }}
                        title={`${d.date}: 전체 ${d.pageviews} (외부 ${d.externalViews} / 관리자 ${d.adminViews})`}
                      >
                        <div style={{ height: `${adminH}px`, background: isToday ? "#FF9800" : "#FF980080", borderRadius: "4px 4px 0 0" }} />
                        <div style={{ height: `${externalH}px`, background: isToday ? "#E8192C" : "#E8192C80", borderRadius: adminH > 0 ? "0" : "4px 4px 0 0" }} />
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div
                      style={{
                        width: "100%", maxWidth: 24,
                        height: `${Math.max(4, (d.pageviews / maxPageviews) * 140)}px`,
                        background: isToday
                          ? (viewFilter === "admin" ? "#FF9800" : "#E8192C")
                          : (viewFilter === "admin" ? "#FF980080" : "#E8192C80"),
                        borderRadius: "4px 4px 0 0", minHeight: 4,
                      }}
                      title={`${d.date}: ${d.pageviews} PV`}
                    />
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <span style={{ fontSize: 11, color: "#999" }}>{filteredDaily[0]?.date}</span>
              <span style={{ fontSize: 11, color: "#999" }}>{filteredDaily[filteredDaily.length - 1]?.date}</span>
            </div>
          </>
        )}
      </div>

      {/* Top pages + Category/Reporter stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }}>
        {/* 인기 페이지 */}
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #EEE", fontWeight: 600, fontSize: 15 }}>인기 페이지{filterLabel}</div>
          {topPages.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "#999", fontSize: 14 }}>데이터가 없습니다.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
                  <th style={{ padding: "8px 20px", textAlign: "left", fontWeight: 500, color: "#666", width: 40 }}>순위</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 500, color: "#666" }}>페이지</th>
                  <th style={{ padding: "8px 16px", textAlign: "right", fontWeight: 500, color: "#666" }}>조회수</th>
                  <th style={{ padding: "8px 20px", textAlign: "right", fontWeight: 500, color: "#666" }}>외부/관리자</th>
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
                    <td style={{ padding: "10px 16px", textAlign: "right", color: "#E8192C", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {page.views.toLocaleString()} PV
                    </td>
                    <td style={{ padding: "10px 20px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <span style={{ color: "#2196F3", fontSize: 12 }}>{page.externalViews}</span>
                      <span style={{ color: "#CCC", margin: "0 4px" }}>/</span>
                      <span style={{ color: "#FF9800", fontSize: 12 }}>{page.adminViews}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 카테고리 / 기자 통계 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* 카테고리별 조회수 */}
          <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #EEE", fontWeight: 600, fontSize: 15 }}>카테고리별 조회수</div>
            {categoryStats.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center", color: "#999", fontSize: 14 }}>데이터가 없습니다.</div>
            ) : (
              <div style={{ padding: "8px 0" }}>
                {categoryStats.map((cat, i) => {
                  const maxViews = categoryStats[0].views || 1;
                  return (
                    <div key={cat.category} style={{ padding: "8px 20px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 13, color: "#333", fontWeight: i === 0 ? 600 : 400 }}>{cat.category}</span>
                        <span style={{ fontSize: 12, color: "#999" }}>{cat.count}건 · {cat.views.toLocaleString()}회</span>
                      </div>
                      <div style={{ height: 4, background: "#F5F5F5", borderRadius: 2 }}>
                        <div style={{ height: "100%", width: `${(cat.views / maxViews) * 100}%`, background: "#E8192C", borderRadius: 2 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 기자별 조회수 */}
          <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #EEE", fontWeight: 600, fontSize: 15 }}>기자별 조회수</div>
            {reporterStats.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center", color: "#999", fontSize: 14 }}>데이터가 없습니다.</div>
            ) : (
              <div style={{ padding: "8px 0" }}>
                {reporterStats.map((rep, i) => {
                  const maxViews = reporterStats[0].views || 1;
                  return (
                    <div key={rep.reporter} style={{ padding: "8px 20px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 13, color: "#333", fontWeight: i === 0 ? 600 : 400 }}>{rep.reporter} 기자</span>
                        <span style={{ fontSize: 12, color: "#999" }}>{rep.count}건 · {rep.views.toLocaleString()}회</span>
                      </div>
                      <div style={{ height: 4, background: "#F5F5F5", borderRadius: 2 }}>
                        <div style={{ height: "100%", width: `${(rep.views / maxViews) * 100}%`, background: "#2196F3", borderRadius: 2 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 봇 트래픽 상세 */}
      {botCount > 0 && (
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden", marginTop: 20 }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #EEE", fontWeight: 600, fontSize: 15, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>AI/봇 트래픽 상세</span>
            <span style={{ fontSize: 12, fontWeight: 400, color: "#9C27B0" }}>총 {botCount.toLocaleString()}건</span>
          </div>
          <div style={{ padding: "8px 0" }}>
            {botStats.map((bot, i) => {
              const maxCount = botStats[0].count || 1;
              const isAiSearch = ["ChatGPT", "Perplexity"].includes(bot.name);
              const isSearchEngine = ["Googlebot", "Bingbot", "Yeti (네이버)", "Daumoa (다음)"].includes(bot.name);
              return (
                <div key={bot.name} style={{ padding: "8px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: "#333", fontWeight: i === 0 ? 600 : 400 }}>
                      {bot.name}
                      {isAiSearch && <span style={{ fontSize: 10, color: "#4CAF50", marginLeft: 6, fontWeight: 500 }}>유입 가능</span>}
                      {isSearchEngine && <span style={{ fontSize: 10, color: "#2196F3", marginLeft: 6, fontWeight: 500 }}>검색엔진</span>}
                      {!isAiSearch && !isSearchEngine && <span style={{ fontSize: 10, color: "#FF5722", marginLeft: 6, fontWeight: 500 }}>차단됨</span>}
                    </span>
                    <span style={{ fontSize: 12, color: "#999" }}>{bot.count.toLocaleString()}건 ({((bot.count / botCount) * 100).toFixed(1)}%)</span>
                  </div>
                  <div style={{ height: 4, background: "#F5F5F5", borderRadius: 2 }}>
                    <div style={{
                      height: "100%",
                      width: `${(bot.count / maxCount) * 100}%`,
                      background: isSearchEngine ? "#2196F3" : isAiSearch ? "#4CAF50" : "#9C27B0",
                      borderRadius: 2,
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
