"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { Article, ViewLogEntry, DistributeLog } from "@/types/article";
import { getArticles, getViewLogs, getDistributeLogs, getSetting } from "@/lib/db";
import versionData from "@/config/version.json";

interface DashboardNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

async function runScheduledPublish(): Promise<{ published: number }> {
  const res = await fetch("/api/cron/publish", { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `서버 오류 (${res.status})`);
  return { published: typeof data.published === "number" ? data.published : 0 };
}

interface AutoRunEntry {
  id: string;
  startedAt: string;
  completedAt: string;
  source: string;
  articlesPublished: number;
  articlesSkipped: number;
  articlesFailed: number;
}

interface ChartDataPoint {
  date: string;
  success: number;
  failure: number;
}

const DashboardHistoryChart = dynamic(() => import("./DashboardHistoryChart"), {
  ssr: false,
  loading: () => (
    <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 13 }}>
      Loading chart...
    </div>
  ),
});

function toChartData(runs: AutoRunEntry[]): ChartDataPoint[] {
  const byDate: Record<string, { success: number; failure: number }> = {};
  for (const run of runs) {
    const date = run.startedAt?.slice(0, 10) || "unknown";
    if (!byDate[date]) byDate[date] = { success: 0, failure: 0 };
    byDate[date].success += run.articlesPublished || 0;
    byDate[date].failure += run.articlesFailed || 0;
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-10)
    .map(([date, counts]) => ({
      date: date.slice(5), // MM-DD 형식
      success: counts.success,
      failure: counts.failure,
    }));
}

export default function AdminDashboardPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [totalInDb, setTotalInDb] = useState(0); // 실제 DB의 전체 기사 수
  const [viewLogs, setViewLogs] = useState<ViewLogEntry[]>([]);

  const [commentCount, setCommentCount] = useState({ total: 0, pending: 0 });
  const [adCount, setAdCount] = useState(0);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [distributeLogs, setDistributeLogs] = useState<DistributeLog[]>([]);
  const [categoryStats, setCategoryStats] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [publishingScheduled, setPublishingScheduled] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);
  const [migratingNo, setMigratingNo] = useState(false);
  const [migrateNoResult, setMigrateNoResult] = useState<{ msg: string; ok: boolean } | null>(null);
  const [fixingThumbs, setFixingThumbs] = useState(false);
  const [fixThumbResult, setFixThumbResult] = useState<{ msg: string; ok: boolean } | null>(null);
  const [fixingImages, setFixingImages] = useState(false);
  const [fixImageResult, setFixImageResult] = useState<{ msg: string; ok: boolean } | null>(null);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [markingRead, setMarkingRead] = useState(false);
  const [pressHistory, setPressHistory] = useState<AutoRunEntry[]>([]);
  const [newsHistory, setNewsHistory] = useState<AutoRunEntry[]>([]);
  const [historyTab, setHistoryTab] = useState<"press" | "news">("press");

  useEffect(() => {
    (async () => {
      try {
        const results = await Promise.allSettled([
          getArticles(),
          getViewLogs(),
          getDistributeLogs(),
          getSetting<{ id: string; status: string }[] | null>("cp-comments", null),
          getSetting<{ enabled: boolean }[] | null>("cp-ads", null),
          getSetting<{ id: string; status: string }[] | null>("cp-newsletter-subscribers", null),
          fetch("/api/db/notifications").then(r => r.json()).then(d => d.notifications || []),
          fetch("/api/db/auto-press-settings?history=1").then(r => r.json()).then(d => d.history || []),
          fetch("/api/db/auto-news-settings?history=1").then(r => r.json()).then(d => d.history || []),
        ]);

        const arts = results[0].status === "fulfilled"
          ? results[0].value.articles.map(({ body, ...rest }: Article & { body?: string }) => rest as Article)
          : [];
        const total = results[0].status === "fulfilled" ? results[0].value.total : 0;
        const vl = results[1].status === "fulfilled" ? results[1].value : [];
        const logs = results[2].status === "fulfilled" ? results[2].value : [];
        const comments = results[3].status === "fulfilled" ? results[3].value : null;
        const ads = results[4].status === "fulfilled" ? results[4].value : null;
        const subscribers = results[5].status === "fulfilled" ? results[5].value : null;
        const notifs = results[6].status === "fulfilled" ? results[6].value as DashboardNotification[] : [];
        const pressHist = results[7].status === "fulfilled" ? results[7].value : [];
        const newsHist = results[8].status === "fulfilled" ? results[8].value : [];

        setArticles(arts);
        setTotalInDb(total);
        setNotifications(notifs);
        setViewLogs(vl);
        setDistributeLogs(logs);
        setPressHistory(pressHist);
        setNewsHistory(newsHist);

        // Category stats
        const catMap: Record<string, number> = {};
        arts.filter((a) => a.status === "게시").forEach((a) => {
          catMap[a.category || "뉴스"] = (catMap[a.category || "뉴스"] || 0) + 1;
        });
        setCategoryStats(Object.entries(catMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count));
      } catch (e) {
        setLoadError("데이터를 불러오는 중 오류가 발생했습니다.");
        console.error("[dashboard] load error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalArticles = totalInDb;
  const publishedArticles = articles.filter((a) => a.status === "게시").length;
  const draftArticles = articles.filter((a) => a.status === "임시저장").length;
  const scheduledArticles = articles
    .filter((a) => a.status === "예약" && a.scheduledPublishAt)
    .sort((a, b) => new Date(a.scheduledPublishAt!).getTime() - new Date(b.scheduledPublishAt!).getTime())
    .slice(0, 5);

  // KST 기준 날짜 헬퍼
  const toKstDateStr = (date: Date) =>
    date.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const timestampToKstDate = (ts: string) =>
    new Date(ts).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

  // Today's stats from view log (KST)
  const todayStr = toKstDateStr(new Date());
  const todayArticles = articles.filter((a) => a.date === todayStr).length;
  const todayViews = viewLogs.filter((v) => timestampToKstDate(v.timestamp) === todayStr).length;

  // Total views from articles
  const totalViews = articles.reduce((sum, a) => sum + (a.views || 0), 0);

  // This week views (KST)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = toKstDateStr(weekAgo);
  const weekViews = viewLogs.filter((v) => timestampToKstDate(v.timestamp) >= weekAgoStr).length;

  // Recent articles sorted by date descending
  const recentArticles = [...articles].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const recentLogs = distributeLogs.slice(0, 5);

  // Top articles by views (최근 30일 이내 게시된 기사 중 정렬)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

  const topArticles = [...articles]
    .filter((a) => a.status === "게시" && a.date >= thirtyDaysAgoStr)
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 5);

  const handleMarkAllRead = async () => {
    setMarkingRead(true);
    try {
      await fetch("/api/db/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch { /* 에러 무시 */ }
    setMarkingRead(false);
  };

  const stats = [
    { label: "총 기사 수", value: totalArticles, color: "#E8192C" },
    { label: "오늘 작성", value: todayArticles, color: "#2196F3" },
    { label: "총 조회수", value: totalViews.toLocaleString(), color: "#4CAF50" },
    { label: "오늘 조회", value: todayViews.toLocaleString(), color: "#FF9800" },
    { label: "주간 조회", value: weekViews.toLocaleString(), color: "#9C27B0" },
    { label: "게시 / 임시 / 예약", value: `${publishedArticles} / ${draftArticles} / ${articles.filter((a) => a.status === "예약").length}`, color: "#009688" },
    { label: "뉴스레터 구독자", value: subscriberCount.toLocaleString(), color: "#3F51B5" },
  ];

  if (loading) {
    return (
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 24 }}>대시보드</h1>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 28 }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} style={{ background: "#F5F5F5", border: "1px solid #EEE", borderRadius: 10, padding: "16px 18px", height: 72, animation: "pulse 1.5s infinite" }} />
          ))}
        </div>
        <p style={{ color: "#999", fontSize: 13 }}>데이터를 불러오는 중...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 24 }}>대시보드</h1>
        <div style={{ padding: 20, background: "#FFF3F3", border: "1px solid #FFCDD2", borderRadius: 8, color: "#C62828" }}>
          {loadError}
          <button onClick={() => window.location.reload()} style={{ marginLeft: 12, padding: "4px 12px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
            새로고침
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", margin: 0 }}>대시보드</h1>
        <span style={{ fontSize: 11, color: "#E8192C", fontWeight: 700, background: "#FFF0F0", padding: "4px 8px", borderRadius: 4, border: "1px solid #FFCDD2" }}>{versionData.version}</span>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 28 }}>
        {stats.map((stat) => (
          <div key={stat.label} style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 6 }}>{stat.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div style={{ display: "flex", gap: 10, marginBottom: 28, flexWrap: "wrap" }}>
        <Link href="/cam/articles/new" style={{ padding: "9px 18px", background: "#E8192C", color: "#FFF", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>+ 기사 작성</Link>
        <Link href="/cam/press-import" style={{ padding: "9px 18px", background: "#FF9800", color: "#FFF", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>보도자료 수집</Link>
        <Link href="/cam/auto-press" style={{ padding: "9px 18px", background: "#9C27B0", color: "#FFF", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>보도자료 자동등록</Link>
        <Link href="/cam/headlines" style={{ padding: "9px 18px", background: "#2196F3", color: "#FFF", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>헤드라인 관리</Link>
        <Link href="/cam/comments" style={{ padding: "9px 18px", background: "#FFF", color: "#333", borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: "none", border: "1px solid #DDD" }}>
          댓글 관리 {commentCount.pending > 0 && `(${commentCount.pending})`}
        </Link>
        <Link href="/cam/settings" style={{ padding: "9px 18px", background: "#FFF", color: "#333", borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: "none", border: "1px solid #DDD" }}>사이트 설정</Link>
        <Link href="/cam/analytics" style={{ padding: "9px 18px", background: "#FFF", color: "#333", borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: "none", border: "1px solid #DDD" }}>방문자 통계</Link>
        <button
          onClick={async () => {
            setPublishingScheduled(true);
            setPublishResult(null);
            try {
              const result = await runScheduledPublish();
              setPublishResult(`예약 발행 완료: ${result.published}건 게시됨`);
              if (result.published > 0) {
                const { articles: arts } = await getArticles();
                setArticles(arts);
              }
            } catch {
              setPublishResult("예약 발행 중 오류가 발생했습니다.");
            } finally {
              setPublishingScheduled(false);
              setTimeout(() => setPublishResult(null), 4000);
            }
          }}
          disabled={publishingScheduled}
          style={{ padding: "9px 18px", background: publishingScheduled ? "#CCC" : "#4CAF50", color: "#FFF", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: publishingScheduled ? "default" : "pointer" }}
        >
          {publishingScheduled ? "실행 중..." : "예약 발행 실행"}
        </button>
      </div>
      {/* 유지보수 도구 (접기/펼치기) */}
      <div style={{ marginTop: 0, marginBottom: 10 }}>
        <button onClick={() => setShowMaintenance(!showMaintenance)} style={{
          padding: "6px 12px", background: "transparent", border: "1px solid #DDD",
          borderRadius: 6, fontSize: 13, color: "#999", cursor: "pointer",
        }}>
          유지보수 도구 {showMaintenance ? "\u25B2" : "\u25BC"}
        </button>
        {showMaintenance && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <button
              onClick={async () => {
                if (!confirm("기존 기사 전체에 숫자 일련번호를 할당합니다. 계속하시겠습니까?")) return;
                setMigratingNo(true);
                setMigrateNoResult(null);
                try {
                  const res = await fetch("/api/admin/migrate-no", { method: "POST", credentials: "include" });
                  const data = await res.json().catch(() => ({}));
                  setMigrateNoResult({ msg: data.message || data.error || "완료", ok: res.ok });
                  if (res.ok) {
                    const { articles: arts } = await getArticles();
                    setArticles(arts);
                  }
                } catch {
                  setMigrateNoResult({ msg: "오류가 발생했습니다.", ok: false });
                } finally {
                  setMigratingNo(false);
                  setTimeout(() => setMigrateNoResult(null), 6000);
                }
              }}
              disabled={migratingNo}
              style={{ padding: "9px 18px", background: migratingNo ? "#CCC" : "#607D8B", color: "#FFF", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: migratingNo ? "default" : "pointer" }}
            >
              {migratingNo ? "번호 할당 중..." : "기사 일련번호 일괄 할당"}
            </button>
            <button
              onClick={async () => {
                if (!confirm("오늘 업로드된 기사의 본문 첫 이미지(썸네일 중복)를 제거합니다. 계속하시겠습니까?")) return;
                setFixingThumbs(true);
                setFixThumbResult(null);
                try {
                  const res = await fetch("/api/admin/fix-thumbnail-dup", { method: "POST", credentials: "include" });
                  const data = await res.json().catch(() => ({}));
                  setFixThumbResult({ msg: data.message || data.error || "완료", ok: res.ok });
                } catch {
                  setFixThumbResult({ msg: "오류가 발생했습니다.", ok: false });
                } finally {
                  setFixingThumbs(false);
                  setTimeout(() => setFixThumbResult(null), 6000);
                }
              }}
              disabled={fixingThumbs}
              style={{ padding: "9px 18px", background: fixingThumbs ? "#CCC" : "#795548", color: "#FFF", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: fixingThumbs ? "default" : "pointer" }}
            >
              {fixingThumbs ? "수정 중..." : "썸네일 중복 이미지 제거"}
            </button>
            <button
              onClick={async () => {
                if (!confirm("기사 본문/썸네일의 외부 이미지를 Supabase에 재업로드합니다.\n전체 기사를 대상으로 하며 시간이 걸릴 수 있습니다. 계속하시겠습니까?")) return;
                setFixingImages(true);
                setFixImageResult(null);
                try {
                  const res = await fetch("/api/admin/fix-external-images", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
                  const data = await res.json().catch(() => ({}));
                  if (res.ok && data.success) {
                    setFixImageResult({ msg: `완료: ${data.articlesFixed}개 기사, ${data.imagesMigrated}개 이미지 이관`, ok: true });
                  } else {
                    setFixImageResult({ msg: data.error || "오류가 발생했습니다.", ok: false });
                  }
                } catch {
                  setFixImageResult({ msg: "오류가 발생했습니다.", ok: false });
                } finally {
                  setFixingImages(false);
                  setTimeout(() => setFixImageResult(null), 8000);
                }
              }}
              disabled={fixingImages}
              style={{ padding: "9px 18px", background: fixingImages ? "#CCC" : "#0288D1", color: "#FFF", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: fixingImages ? "default" : "pointer" }}
            >
              {fixingImages ? "이미지 이관 중..." : "외부 이미지 Supabase 재업로드"}
            </button>
          </div>
        )}
      </div>
      {publishResult && (
        <div style={{ marginBottom: 16, padding: "10px 16px", background: "#E8F5E9", border: "1px solid #C8E6C9", borderRadius: 8, fontSize: 13, color: "#2E7D32" }}>
          {publishResult}
        </div>
      )}
      {migrateNoResult && (
        <div style={{ marginBottom: 16, padding: "10px 16px", background: migrateNoResult.ok ? "#E8F5E9" : "#FFF0F0", border: `1px solid ${migrateNoResult.ok ? "#C8E6C9" : "#FFCCCC"}`, borderRadius: 8, fontSize: 13, color: migrateNoResult.ok ? "#2E7D32" : "#C62828" }}>
          {migrateNoResult.msg}
        </div>
      )}
      {fixThumbResult && (
        <div style={{ marginBottom: 16, padding: "10px 16px", background: fixThumbResult.ok ? "#E8F5E9" : "#FFF0F0", border: `1px solid ${fixThumbResult.ok ? "#C8E6C9" : "#FFCCCC"}`, borderRadius: 8, fontSize: 13, color: fixThumbResult.ok ? "#2E7D32" : "#C62828" }}>
          {fixThumbResult.msg}
        </div>
      )}
      {fixImageResult && (
        <div style={{ marginBottom: 16, padding: "10px 16px", background: fixImageResult.ok ? "#E3F2FD" : "#FFF0F0", border: `1px solid ${fixImageResult.ok ? "#90CAF9" : "#FFCCCC"}`, borderRadius: 8, fontSize: 13, color: fixImageResult.ok ? "#0277BD" : "#C62828" }}>
          {fixImageResult.msg}
        </div>
      )}

      {/* 알림 패널 */}
      <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#111", margin: 0 }}>
            알림
            {notifications.filter(n => !n.read).length > 0 && (
              <span style={{
                background: "#E8192C", color: "#FFF", borderRadius: "50%",
                fontSize: 12, fontWeight: 700, minWidth: 20, height: 20,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                marginLeft: 8, padding: "0 6px",
              }}>
                {notifications.filter(n => !n.read).length}
              </span>
            )}
          </h3>
          {notifications.some(n => !n.read) && (
            <button
              onClick={handleMarkAllRead}
              disabled={markingRead}
              style={{ fontSize: 12, color: "#2196F3", cursor: "pointer", border: "none", background: "none" }}
            >
              모두 읽음 처리
            </button>
          )}
        </div>
        {notifications.length === 0 ? (
          <p style={{ fontSize: 14, color: "#999", textAlign: "center", padding: "24px 0" }}>
            새로운 알림이 없습니다.
          </p>
        ) : (
          <>
            {notifications.slice(0, 10).map(n => (
              <div
                key={n.id}
                style={{
                  padding: "12px 0",
                  borderBottom: "1px solid #F0F0F0",
                  background: n.read ? "transparent" : "#FAFBFF",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span>{n.type === "cron_failure" ? "\u26A0\uFE0F" : n.type === "ai_failure" ? "\uD83E\uDD16" : "\uD83D\uDD12"}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{n.title}</span>
                </div>
                {n.message && (
                  <p style={{ fontSize: 14, color: "#555", margin: "4px 0 0 28px" }}>{n.message}</p>
                )}
                <p style={{ fontSize: 12, color: "#999", margin: "4px 0 0 28px" }}>
                  {new Date(n.created_at).toLocaleString("ko-KR")}
                </p>
              </div>
            ))}
            {notifications.length > 10 && (
              <p style={{ fontSize: 12, color: "#2196F3", textAlign: "center", padding: "8px 0", cursor: "pointer" }}>
                이전 알림 더 보기
              </p>
            )}
          </>
        )}
      </div>

      {/* 자동화 실행 이력 */}
      {(() => {
        const activeHistory = historyTab === "press" ? pressHistory : newsHistory;
        const chartData = toChartData(activeHistory);
        const recentRuns = activeHistory.slice(-10);
        const totalSuccess = recentRuns.reduce((s, r) => s + (r.articlesPublished || 0), 0);
        const totalFailure = recentRuns.reduce((s, r) => s + (r.articlesFailed || 0), 0);
        return (
          <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 8, padding: 16, marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#111", marginBottom: 16 }}>자동화 실행 이력</h3>
            {/* Tab bar */}
            <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #EEE", marginBottom: 16 }}>
              <button
                onClick={() => setHistoryTab("press")}
                style={{
                  padding: "8px 16px",
                  cursor: "pointer",
                  border: "none",
                  background: "none",
                  fontSize: 14,
                  fontWeight: historyTab === "press" ? 700 : 400,
                  color: historyTab === "press" ? "#E8192C" : "#999",
                  borderBottom: historyTab === "press" ? "2px solid #E8192C" : "2px solid transparent",
                }}
              >
                보도자료 자동등록
              </button>
              <button
                onClick={() => setHistoryTab("news")}
                style={{
                  padding: "8px 16px",
                  cursor: "pointer",
                  border: "none",
                  background: "none",
                  fontSize: 14,
                  fontWeight: historyTab === "news" ? 700 : 400,
                  color: historyTab === "news" ? "#E8192C" : "#999",
                  borderBottom: historyTab === "news" ? "2px solid #E8192C" : "2px solid transparent",
                }}
              >
                자동 뉴스 발행
              </button>
            </div>
            {/* Chart or empty state */}
            {chartData.length === 0 ? (
              <div style={{ fontSize: 14, color: "#999", textAlign: "center", padding: "48px 0" }}>
                <p style={{ margin: 0, fontWeight: 700 }}>실행 이력이 없습니다</p>
                <p style={{ margin: "8px 0 0", fontSize: 13 }}>자동 수집이 실행되면 여기에 표시됩니다.</p>
              </div>
            ) : (
              <>
                <DashboardHistoryChart data={chartData} />
                <p style={{ fontSize: 12, color: "#666", marginTop: 12, textAlign: "center" }}>
                  최근 {recentRuns.length}회: 성공 {totalSuccess}건 / 실패 {totalFailure}건
                </p>
              </>
            )}
          </div>
        );
      })()}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20, marginBottom: 20 }}>
        {/* Recent Articles */}
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #EEE", fontWeight: 600, fontSize: 15, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>최근 기사</span>
            <Link href="/cam/articles" style={{ fontSize: 12, color: "#E8192C", textDecoration: "none" }}>전체보기</Link>
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

      {/* 예약 기사 섹션 */}
      {scheduledArticles.length > 0 && (
        <div style={{ background: "#FFF", border: "1px solid #FFE082", borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #FFE082", fontWeight: 600, fontSize: 15, background: "#FFFDE7", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#F57F17" }}>예약 발행 대기 중 ({articles.filter((a) => a.status === "예약").length}건)</span>
            <Link href="/cam/articles?status=예약" style={{ fontSize: 12, color: "#F57F17", textDecoration: "none" }}>전체보기</Link>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#FFFDE7", borderBottom: "1px solid #FFE082" }}>
                <th style={{ padding: "8px 20px", textAlign: "left", fontWeight: 500, color: "#888" }}>제목</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 500, color: "#888" }}>카테고리</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 500, color: "#888" }}>예약 일시</th>
              </tr>
            </thead>
            <tbody>
              {scheduledArticles.map((article) => (
                <tr key={article.id} style={{ borderBottom: "1px solid #FFF9C4" }}>
                  <td style={{ padding: "10px 20px", color: "#111", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <Link href={`/cam/articles/${article.id}/edit`} style={{ color: "#111", textDecoration: "none" }}>{article.title}</Link>
                  </td>
                  <td style={{ padding: "10px 12px", color: "#666" }}>{article.category}</td>
                  <td style={{ padding: "10px 12px", color: "#F57F17", fontWeight: 600 }}>
                    {article.scheduledPublishAt ? new Date(article.scheduledPublishAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
            <Link href="/cam/distribute" style={{ fontSize: 12, color: "#E8192C", textDecoration: "none" }}>전체보기</Link>
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
