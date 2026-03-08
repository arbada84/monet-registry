"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { AutoNewsSettings, AutoNewsRssSource, AutoNewsRun } from "@/types/article";

const DEFAULT_SOURCES: AutoNewsRssSource[] = [
  { id: "yonhap",   name: "연합뉴스",  url: "https://www.yna.co.kr/RSS/all.xml",              enabled: true  },
  { id: "kbs",      name: "KBS 뉴스",  url: "https://news.kbs.co.kr/rss/rss_news.xml",        enabled: true  },
  { id: "ytn",      name: "YTN",       url: "https://www.ytn.co.kr/_rss_main.php",             enabled: false },
  { id: "mbc",      name: "MBC 뉴스",  url: "https://imnews.imbc.com/rss/news/news_00.xml",   enabled: false },
  { id: "gnews_ko", name: "Google 뉴스 (한국)", url: "https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko", enabled: false },
];

const DEFAULT_SETTINGS: AutoNewsSettings = {
  enabled: false,
  sources: DEFAULT_SOURCES,
  keywords: [],
  category: "뉴스",
  count: 5,
  publishStatus: "임시저장",
  aiProvider: "gemini",
  aiModel: "gemini-2.0-flash",
  author: "",
  cronEnabled: false,
  dedupeWindowHours: 48,
};

export default function AutoNewsPage() {
  const [tab, setTab] = useState<"settings" | "run" | "history">("settings");
  const [settings, setSettings] = useState<AutoNewsSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  // 실행 탭
  const [running, setRunning] = useState(false);
  const [runCount, setRunCount] = useState(5);
  const [runStatus, setRunStatus] = useState<"게시" | "임시저장">("임시저장");
  const [runKeywords, setRunKeywords] = useState("");
  const [runCategory, setRunCategory] = useState("");
  const [preview, setPreview] = useState(false);
  const [lastRun, setLastRun] = useState<AutoNewsRun | null>(null);

  // 이력 탭
  const [history, setHistory] = useState<AutoNewsRun[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  // 새 소스 추가
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceUrl, setNewSourceUrl] = useState("");

  // 설정 로드
  useEffect(() => {
    fetch("/api/db/auto-news-settings")
      .then((r) => r.json())
      .then((d) => { if (d.success) setSettings(d.settings); })
      .catch(() => {});
  }, []);

  const loadHistory = useCallback(() => {
    setHistLoading(true);
    fetch("/api/db/auto-news-settings?history=1")
      .then((r) => r.json())
      .then((d) => { if (d.success) setHistory(d.history ?? []); })
      .catch(() => {})
      .finally(() => setHistLoading(false));
  }, []);

  useEffect(() => {
    if (tab === "history") loadHistory();
    if (tab === "run") {
      setRunCount(settings.count);
      setRunStatus(settings.publishStatus);
      setRunCategory(settings.category);
    }
  }, [tab, settings, loadHistory]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/db/auto-news-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      setSaveMsg({ ok: res.ok && data.success, msg: res.ok ? "설정이 저장되었습니다." : (data.error || "저장 실패") });
    } catch {
      setSaveMsg({ ok: false, msg: "저장 중 오류가 발생했습니다." });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 4000);
    }
  };

  const handleRun = async () => {
    setRunning(true);
    setLastRun(null);
    try {
      const res = await fetch("/api/cron/auto-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "manual",
          count: runCount,
          publishStatus: runStatus,
          category: runCategory || undefined,
          keywords: runKeywords ? runKeywords.split(",").map((k) => k.trim()).filter(Boolean) : undefined,
          preview,
        }),
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) setLastRun(data.run);
      else alert(data.error || "실행 실패");
    } catch (e) {
      alert(String(e));
    } finally {
      setRunning(false);
    }
  };

  const toggleSource = (id: string) => {
    setSettings((s) => ({
      ...s,
      sources: s.sources.map((src) => src.id === id ? { ...src, enabled: !src.enabled } : src),
    }));
  };

  const removeSource = (id: string) => {
    setSettings((s) => ({ ...s, sources: s.sources.filter((src) => src.id !== id) }));
  };

  const addSource = () => {
    if (!newSourceName.trim() || !newSourceUrl.trim()) return;
    try { new URL(newSourceUrl); } catch { alert("올바른 URL을 입력하세요."); return; }
    setSettings((s) => ({
      ...s,
      sources: [...s.sources, {
        id: `custom_${Date.now()}`, name: newSourceName.trim(),
        url: newSourceUrl.trim(), enabled: true,
      }],
    }));
    setNewSourceName(""); setNewSourceUrl("");
  };

  const inputStyle = { width: "100%", padding: "8px 12px", border: "1px solid #DDD", borderRadius: 6, fontSize: 13, boxSizing: "border-box" as const };
  const labelStyle = { fontSize: 12, color: "#666", marginBottom: 4, display: "block" as const };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Link href="/cam/dashboard" style={{ color: "#999", fontSize: 13, textDecoration: "none" }}>← 대시보드</Link>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111", margin: 0 }}>자동 뉴스 수집·발행</h1>
        <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600,
          background: settings.enabled ? "#E8F5E9" : "#F5F5F5",
          color: settings.enabled ? "#2E7D32" : "#999" }}>
          {settings.enabled ? "활성화" : "비활성화"}
        </span>
      </div>

      {/* 탭 */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #EEE", marginBottom: 24 }}>
        {(["settings", "run", "history"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "10px 20px", fontSize: 13, fontWeight: tab === t ? 700 : 400,
            color: tab === t ? "#E8192C" : "#666", background: "none", border: "none",
            borderBottom: tab === t ? "2px solid #E8192C" : "2px solid transparent",
            cursor: "pointer", marginBottom: -2,
          }}>
            {{ settings: "⚙️ 설정", run: "▶ 수동 실행", history: "📋 이력" }[t]}
          </button>
        ))}
      </div>

      {/* ── 설정 탭 ── */}
      {tab === "settings" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* 활성화 / 기본 설정 */}
          <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: "18px 20px" }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>기본 설정</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", gridColumn: "1 / -1" }}>
                <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>자동 수집 활성화 (Vercel Cron 연동)</span>
              </label>
              <div>
                <label style={labelStyle}>기본 카테고리</label>
                <input value={settings.category} onChange={(e) => setSettings((s) => ({ ...s, category: e.target.value }))} style={inputStyle} placeholder="뉴스" />
              </div>
              <div>
                <label style={labelStyle}>기본 기자명</label>
                <input value={settings.author} onChange={(e) => setSettings((s) => ({ ...s, author: e.target.value }))} style={inputStyle} placeholder="편집팀" />
              </div>
              <div>
                <label style={labelStyle}>회당 기사 수 (1-20)</label>
                <input type="number" min={1} max={20} value={settings.count} onChange={(e) => setSettings((s) => ({ ...s, count: Number(e.target.value) }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>발행 상태</label>
                <select value={settings.publishStatus} onChange={(e) => setSettings((s) => ({ ...s, publishStatus: e.target.value as "게시" | "임시저장" }))} style={inputStyle}>
                  <option value="임시저장">임시저장 (검토 후 게시 권장)</option>
                  <option value="게시">바로 게시 (완전 자동화)</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>중복 방지 시간 (시간)</label>
                <input type="number" min={1} max={168} value={settings.dedupeWindowHours} onChange={(e) => setSettings((s) => ({ ...s, dedupeWindowHours: Number(e.target.value) }))} style={inputStyle} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>필터 키워드 (쉼표 구분, 비워두면 전체 수집)</label>
                <input value={settings.keywords.join(", ")} onChange={(e) => setSettings((s) => ({
                  ...s, keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean),
                }))} style={inputStyle} placeholder="경제, IT, 사회, 문화" />
              </div>
            </div>
          </div>

          {/* AI 설정 */}
          <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: "18px 20px" }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>AI 편집 설정</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>AI 제공사</label>
                <select value={settings.aiProvider} onChange={(e) => setSettings((s) => ({ ...s, aiProvider: e.target.value as "gemini" | "openai" }))} style={inputStyle}>
                  <option value="gemini">Google Gemini (무료 추천)</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>AI 모델</label>
                <input value={settings.aiModel} onChange={(e) => setSettings((s) => ({ ...s, aiModel: e.target.value }))} style={inputStyle}
                  placeholder={settings.aiProvider === "gemini" ? "gemini-2.0-flash" : "gpt-4o-mini"} />
              </div>
            </div>
            <div style={{ marginTop: 10, padding: "10px 12px", background: "#E3F2FD", borderRadius: 6, fontSize: 12, color: "#0277BD" }}>
              API 키는 <Link href="/cam/ai-settings" style={{ color: "#0277BD" }}>AI 설정 페이지</Link>에서 관리합니다.
              Gemini 2.0 Flash는 하루 1,500건 무료 사용 가능합니다.
            </div>
          </div>

          {/* RSS 소스 */}
          <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: "18px 20px" }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>RSS 소스 관리</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {settings.sources.map((src) => (
                <div key={src.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "1px solid #EEE", borderRadius: 8 }}>
                  <input type="checkbox" checked={src.enabled} onChange={() => toggleSource(src.id)} />
                  <span style={{ fontWeight: 600, fontSize: 13, minWidth: 100 }}>{src.name}</span>
                  <span style={{ fontSize: 12, color: "#999", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{src.url}</span>
                  <button onClick={() => removeSource(src.id)} style={{ background: "none", border: "none", color: "#CCC", cursor: "pointer", fontSize: 16, padding: "0 4px" }}>✕</button>
                </div>
              ))}
            </div>
            {/* 소스 추가 */}
            <div style={{ display: "flex", gap: 8 }}>
              <input value={newSourceName} onChange={(e) => setNewSourceName(e.target.value)} placeholder="소스 이름" style={{ ...inputStyle, flex: "0 0 120px" }} />
              <input value={newSourceUrl} onChange={(e) => setNewSourceUrl(e.target.value)} placeholder="RSS URL (https://...)" style={{ ...inputStyle, flex: 1 }} />
              <button onClick={addSource} style={{ padding: "8px 14px", background: "#4CAF50", color: "#FFF", border: "none", borderRadius: 6, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>+ 추가</button>
            </div>
          </div>

          {/* Cron 안내 */}
          <div style={{ background: "#FFF8E1", border: "1px solid #FFE082", borderRadius: 10, padding: "14px 16px", fontSize: 12, color: "#5D4037", lineHeight: 1.8 }}>
            <strong>Vercel Cron 스케줄 (매일 KST 06:00 자동 실행):</strong><br />
            <code style={{ background: "#FFF3CD", padding: "2px 6px", borderRadius: 4 }}>vercel.json</code>에
            아래가 설정되어 있습니다 (활성화 시 자동 실행):
            <pre style={{ margin: "6px 0 0", background: "#FFF3CD", padding: "8px", borderRadius: 4, fontSize: 11 }}>
{`"crons": [{ "path": "/api/cron/auto-news", "schedule": "0 21 * * *" }]`}
            </pre>
            터미널에서 즉시 실행: <code style={{ background: "#FFF3CD", padding: "2px 6px", borderRadius: 4 }}>node scripts/auto-news.mjs</code>
          </div>

          {saveMsg && (
            <div style={{ padding: "10px 16px", background: saveMsg.ok ? "#E8F5E9" : "#FFF0F0", border: `1px solid ${saveMsg.ok ? "#C8E6C9" : "#FFCCCC"}`, borderRadius: 8, fontSize: 13, color: saveMsg.ok ? "#2E7D32" : "#C62828" }}>
              {saveMsg.msg}
            </div>
          )}
          <button onClick={handleSave} disabled={saving} style={{ padding: "12px 32px", background: saving ? "#CCC" : "#E8192C", color: "#FFF", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", alignSelf: "flex-start" }}>
            {saving ? "저장 중..." : "설정 저장"}
          </button>
        </div>
      )}

      {/* ── 수동 실행 탭 ── */}
      {tab === "run" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: "18px 20px" }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>실행 설정 (1회)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>기사 수</label>
                <input type="number" min={1} max={20} value={runCount} onChange={(e) => setRunCount(Number(e.target.value))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>발행 상태</label>
                <select value={runStatus} onChange={(e) => setRunStatus(e.target.value as "게시" | "임시저장")} style={inputStyle}>
                  <option value="임시저장">임시저장</option>
                  <option value="게시">바로 게시</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>카테고리 (비우면 설정값 사용)</label>
                <input value={runCategory} onChange={(e) => setRunCategory(e.target.value)} placeholder={settings.category} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>키워드 필터 (비우면 설정값 사용)</label>
                <input value={runKeywords} onChange={(e) => setRunKeywords(e.target.value)} placeholder="경제, IT, 사회" style={inputStyle} />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", gridColumn: "1 / -1" }}>
                <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
                <span style={{ fontSize: 13 }}>미리보기 모드 (기사 저장 없이 수집 목록만 확인)</span>
              </label>
            </div>
          </div>

          <button onClick={handleRun} disabled={running} style={{ padding: "14px 40px", background: running ? "#CCC" : "#4CAF50", color: "#FFF", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: running ? "not-allowed" : "pointer", alignSelf: "flex-start" }}>
            {running ? "실행 중... (최대 2분 소요)" : `▶ ${preview ? "미리보기" : "수집·발행"} 실행`}
          </button>

          {running && (
            <div style={{ padding: "14px 16px", background: "#E3F2FD", border: "1px solid #90CAF9", borderRadius: 8, fontSize: 13 }}>
              <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⏳</span> RSS 수집 → 원문 가져오기 → AI 편집 → 발행 중...
            </div>
          )}

          {lastRun && (
            <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: "16px 20px" }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>
                실행 결과 — {lastRun.articlesPublished}개 {preview ? "수집됨" : "발행됨"}, {lastRun.articlesFailed}개 실패
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
                    <th style={{ padding: "8px 12px", textAlign: "left" }}>제목</th>
                    <th style={{ padding: "8px 12px", textAlign: "left" }}>상태</th>
                    <th style={{ padding: "8px 12px", textAlign: "left" }}>URL</th>
                  </tr>
                </thead>
                <tbody>
                  {lastRun.articles.map((a, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #F5F5F5" }}>
                      <td style={{ padding: "8px 12px", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</td>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600,
                          background: a.status === "ok" ? "#E8F5E9" : a.status === "dup" ? "#FFF3E0" : "#FFF0F0",
                          color: a.status === "ok" ? "#2E7D32" : a.status === "dup" ? "#E65100" : "#C62828" }}>
                          {{ ok: "완료", fail: "실패", dup: "중복", skip: "스킵" }[a.status]}
                        </span>
                        {a.error && <span style={{ marginLeft: 6, color: "#C62828", fontSize: 11 }}>{a.error}</span>}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        {a.sourceUrl && <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#2196F3", fontSize: 11 }}>원문</a>}
                        {a.articleId && <Link href={`/cam/articles/${a.articleId}/edit`} style={{ marginLeft: 8, color: "#E8192C", fontSize: 11 }}>편집</Link>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── 이력 탭 ── */}
      {tab === "history" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: "#666" }}>최근 50회 실행 이력</span>
            <button onClick={loadHistory} disabled={histLoading} style={{ padding: "6px 14px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
              {histLoading ? "로딩..." : "새로고침"}
            </button>
          </div>
          {history.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "#999", fontSize: 14, background: "#FAFAFA", borderRadius: 10 }}>
              실행 이력이 없습니다. 수동 실행 탭에서 먼저 실행해 보세요.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {history.map((run) => (
                <div key={run.id} style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: "14px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: "#E3F2FD", color: "#0277BD" }}>
                        {{ cron: "크론", manual: "수동", cli: "CLI" }[run.source] ?? run.source}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        발행 {run.articlesPublished}건 / 실패 {run.articlesFailed}건
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: "#999" }}>{new Date(run.startedAt).toLocaleString("ko-KR")}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {run.articles.slice(0, 8).map((a, i) => (
                      <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10,
                        background: a.status === "ok" ? "#E8F5E9" : a.status === "dup" ? "#FFF3E0" : "#F5F5F5",
                        color: a.status === "ok" ? "#2E7D32" : a.status === "dup" ? "#E65100" : "#999",
                        maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.title}
                      </span>
                    ))}
                    {run.articles.length > 8 && <span style={{ fontSize: 11, color: "#999" }}>+{run.articles.length - 8}건</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
