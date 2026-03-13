"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { AutoPressSettings, AutoPressSource, AutoPressRun } from "@/types/article";

const DEFAULT_SOURCES: AutoPressSource[] = [
  // netpro 소스
  { id: "gov_policy",   name: "정책뉴스 (netpro)",     boTable: "rss",      sca: "policy",       enabled: false, fetchType: "netpro" },
  { id: "gov_press",    name: "브리핑룸 (netpro)",     boTable: "rss",      sca: "pressrelease", enabled: false, fetchType: "netpro" },
  { id: "nw_all",       name: "뉴스와이어 전체",        boTable: "newswire", sca: "",             enabled: true,  fetchType: "netpro" },
  { id: "nw_economy",   name: "뉴스와이어 경제",        boTable: "newswire", sca: "100",          enabled: false, fetchType: "netpro" },
  { id: "nw_culture",   name: "뉴스와이어 문화",        boTable: "newswire", sca: "1200",         enabled: false, fetchType: "netpro" },
  // 정부 정책브리핑 (직접 RSS)
  { id: "kr_press",     name: "정부 보도자료",          boTable: "rss", sca: "", enabled: true,  fetchType: "rss", rssUrl: "https://www.korea.kr/rss/pressrelease.xml" },
  { id: "kr_policy",    name: "정부 정책뉴스",          boTable: "rss", sca: "", enabled: true,  fetchType: "rss", rssUrl: "https://www.korea.kr/rss/policy.xml" },
  { id: "kr_briefing",  name: "정부 부처 브리핑",       boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://www.korea.kr/rss/ebriefing.xml" },
  { id: "kr_fact",      name: "사실은 이렇습니다",      boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://www.korea.kr/rss/fact.xml" },
  // 부처별
  { id: "kr_mcst",      name: "문화체육관광부",         boTable: "rss", sca: "", enabled: true,  fetchType: "rss", rssUrl: "https://www.korea.kr/rss/dept_mcst.xml" },
  { id: "kr_moef",      name: "기획재정부",             boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://www.korea.kr/rss/dept_moef.xml" },
  { id: "kr_msit",      name: "과학기술정보통신부",      boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://www.korea.kr/rss/dept_msit.xml" },
  { id: "kr_motir",     name: "산업통상자원부",         boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://www.korea.kr/rss/dept_motir.xml" },
  { id: "kr_moel",      name: "고용노동부",             boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://www.korea.kr/rss/dept_moel.xml" },
  { id: "kr_molit",     name: "국토교통부",             boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://www.korea.kr/rss/dept_molit.xml" },
  { id: "kr_mw",        name: "보건복지부",             boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://www.korea.kr/rss/dept_mw.xml" },
  { id: "kr_moe",       name: "교육부",                boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://www.korea.kr/rss/dept_moe.xml" },
  { id: "kr_mcee",      name: "환경부",                boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://www.korea.kr/rss/dept_mcee.xml" },
  { id: "kr_mois",      name: "행정안전부",             boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://www.korea.kr/rss/dept_mois.xml" },
  { id: "kr_fsc",       name: "금융위원회",             boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://www.korea.kr/rss/dept_fsc.xml" },
  { id: "kr_ftc",       name: "공정거래위원회",          boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://www.korea.kr/rss/dept_ftc.xml" },
  { id: "kr_mafra",     name: "농림축산식품부",          boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://www.korea.kr/rss/dept_mafra.xml" },
  { id: "kr_mof",       name: "해양수산부",             boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://www.korea.kr/rss/dept_mof.xml" },
  { id: "kr_mss",       name: "중소벤처기업부",          boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://www.korea.kr/rss/dept_mss.xml" },
  // 뉴스와이어 직접 RSS (기업 보도자료)
  { id: "nwrss_all",    name: "뉴스와이어 전체 (직접)",  boTable: "rss", sca: "", enabled: true,  fetchType: "rss", rssUrl: "https://api.newswire.co.kr/rss/all" },
  { id: "nwrss_it",     name: "뉴스와이어 IT",          boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://api.newswire.co.kr/rss/industry/600" },
  { id: "nwrss_econ",   name: "뉴스와이어 경제",        boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://api.newswire.co.kr/rss/industry/100" },
  { id: "nwrss_fin",    name: "뉴스와이어 금융",        boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://api.newswire.co.kr/rss/industry/200" },
  { id: "nwrss_ind",    name: "뉴스와이어 산업",        boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://api.newswire.co.kr/rss/industry/400" },
  { id: "nwrss_cult",   name: "뉴스와이어 문화",        boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://api.newswire.co.kr/rss/industry/1200" },
  { id: "nwrss_life",   name: "뉴스와이어 생활",        boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://api.newswire.co.kr/rss/industry/900" },
  { id: "nwrss_health", name: "뉴스와이어 건강",        boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://api.newswire.co.kr/rss/industry/1000" },
  { id: "nwrss_edu",    name: "뉴스와이어 교육",        boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://api.newswire.co.kr/rss/industry/1100" },
  { id: "nwrss_env",    name: "뉴스와이어 환경",        boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://api.newswire.co.kr/rss/industry/1500" },
  { id: "nwrss_sport",  name: "뉴스와이어 스포츠",      boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://api.newswire.co.kr/rss/industry/1600" },
  { id: "nwrss_leisure",name: "뉴스와이어 레저",        boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://api.newswire.co.kr/rss/industry/1300" },
  { id: "nwrss_trans",  name: "뉴스와이어 물류/교통",   boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://api.newswire.co.kr/rss/industry/1800" },
  { id: "nwrss_social", name: "뉴스와이어 사회",        boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://api.newswire.co.kr/rss/industry/1900" },
  { id: "nwrss_agri",   name: "뉴스와이어 농수산",      boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://api.newswire.co.kr/rss/industry/1700" },
  { id: "nwrss_realty", name: "뉴스와이어 건설/부동산",  boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://api.newswire.co.kr/rss/industry/300" },
  { id: "nwrss_auto",   name: "뉴스와이어 자동차",      boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://api.newswire.co.kr/rss/industry/500" },
  { id: "nwrss_media",  name: "뉴스와이어 미디어",      boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://api.newswire.co.kr/rss/industry/700" },
  { id: "nwrss_retail", name: "뉴스와이어 유통",        boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://api.newswire.co.kr/rss/industry/800" },
  { id: "nwrss_gov",    name: "뉴스와이어 정부/정책",   boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://api.newswire.co.kr/rss/industry/1400" },
  { id: "nwrss_ir",     name: "뉴스와이어 상장기업 IR", boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://api.newswire.co.kr/rss/irnews" },
  { id: "nwrss_en",     name: "뉴스와이어 영문뉴스",    boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://api.newswire.co.kr/rss/english" },
  // 글로벌
  { id: "prn_all",      name: "PR Newswire 전체",       boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://www.prnewswire.com/kr/rss/news-releases-list.rss" },
  // 행정기관
  { id: "kr_npa",       name: "경찰청",                boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://www.korea.kr/rss/dept_npa.xml" },
  { id: "kr_nts",       name: "국세청",                boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://www.korea.kr/rss/dept_nts.xml" },
  { id: "kr_kma",       name: "기상청",                boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://www.korea.kr/rss/dept_kma.xml" },
  { id: "kr_kdca",      name: "질병관리청",             boTable: "rss", sca: "", enabled: false, fetchType: "rss", rssUrl: "https://www.korea.kr/rss/dept_kdca.xml" },
];

const NEWSWIRE_CATEGORIES: Record<string, string> = {
  "": "전체", "100": "경제", "200": "금융", "300": "건설/부동산",
  "400": "산업", "500": "자동차", "600": "기술/IT", "700": "미디어",
  "800": "유통", "900": "라이프스타일", "1000": "건강", "1100": "교육",
  "1200": "문화/연예", "1300": "레저", "1400": "정책/정부",
  "1500": "에너지/환경", "1600": "스포츠", "1700": "농수산",
  "1800": "물류/교통", "1900": "사회",
};

const RSS_CATEGORIES: Record<string, string> = {
  "": "전체", "policy": "정책뉴스", "pressrelease": "브리핑룸",
  "photo": "포토뉴스", "media": "영상뉴스", "fact": "사실은 이렇습니다",
};

const DEFAULT_SETTINGS: AutoPressSettings = {
  enabled: false,
  sources: DEFAULT_SOURCES,
  keywords: [],
  category: "보도자료",
  count: 5,
  publishStatus: "임시저장",
  aiProvider: "gemini",
  aiModel: "gemini-2.0-flash",
  author: "",
  cronEnabled: false,
  dedupeWindowHours: 48,
  requireImage: true,
};

const STATUS_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  ok:       { label: "완료",     bg: "#E8F5E9", color: "#2E7D32" },
  fail:     { label: "실패",     bg: "#FFF0F0", color: "#C62828" },
  dup:      { label: "중복",     bg: "#FFF3E0", color: "#E65100" },
  skip:     { label: "스킵",     bg: "#F5F5F5", color: "#999" },
  no_image: { label: "이미지없음", bg: "#FFF3E0", color: "#E65100" },
  old:      { label: "날짜초과",  bg: "#F3E5F5", color: "#7B1FA2" },
};

export default function AutoPressPage() {
  const [tab, setTab] = useState<"settings" | "run" | "history">("settings");
  const [settings, setSettings] = useState<AutoPressSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  // 실행 탭
  const [running, setRunning] = useState(false);
  const [runCount, setRunCount] = useState(5);
  const [runStatus, setRunStatus] = useState<"게시" | "임시저장">("임시저장");
  const [runKeywords, setRunKeywords] = useState("");
  const [runCategory, setRunCategory] = useState("");
  const [preview, setPreview] = useState(false);
  const [lastRun, setLastRun] = useState<AutoPressRun | null>(null);

  // 이력 탭
  const [history, setHistory] = useState<AutoPressRun[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  // 새 소스 추가
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceBoTable, setNewSourceBoTable] = useState<"rss" | "newswire">("newswire");
  const [newSourceSca, setNewSourceSca] = useState("");
  const [newSourceFetchType, setNewSourceFetchType] = useState<"netpro" | "rss">("rss");
  const [newSourceRssUrl, setNewSourceRssUrl] = useState("");

  // 설정 로드
  useEffect(() => {
    fetch("/api/db/auto-press-settings")
      .then((r) => r.json())
      .then((d) => { if (d.success) setSettings(d.settings); })
      .catch(() => {});
  }, []);

  const loadHistory = useCallback(() => {
    setHistLoading(true);
    fetch("/api/db/auto-press-settings?history=1")
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
      const res = await fetch("/api/db/auto-press-settings", {
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
      const res = await fetch("/api/cron/auto-press", {
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
    if (!newSourceName.trim()) return;
    if (newSourceFetchType === "rss" && !newSourceRssUrl.trim()) return;
    setSettings((s) => ({
      ...s,
      sources: [...s.sources, {
        id: `custom_${Date.now()}`, name: newSourceName.trim(),
        boTable: newSourceFetchType === "rss" ? "rss" as const : newSourceBoTable,
        sca: newSourceFetchType === "rss" ? "" : newSourceSca,
        enabled: true,
        fetchType: newSourceFetchType,
        rssUrl: newSourceFetchType === "rss" ? newSourceRssUrl.trim() : undefined,
      }],
    }));
    setNewSourceName("");
    setNewSourceSca("");
    setNewSourceRssUrl("");
  };

  const inputStyle = { width: "100%", padding: "8px 12px", border: "1px solid #DDD", borderRadius: 6, fontSize: 13, boxSizing: "border-box" as const };
  const labelStyle = { fontSize: 12, color: "#666", marginBottom: 4, display: "block" as const };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Link href="/cam/dashboard" style={{ color: "#999", fontSize: 13, textDecoration: "none" }}>← 대시보드</Link>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111", margin: 0 }}>보도자료 자동 등록</h1>
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
            {{ settings: "설정", run: "수동 실행", history: "이력" }[t]}
          </button>
        ))}
      </div>

      {/* ── 설정 탭 ── */}
      {tab === "settings" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* 기본 설정 */}
          <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: "18px 20px" }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>기본 설정</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", gridColumn: "1 / -1" }}>
                <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>자동 등록 활성화 (Vercel Cron 연동)</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", gridColumn: "1 / -1" }}>
                <input type="checkbox" checked={settings.requireImage} onChange={(e) => setSettings((s) => ({ ...s, requireImage: e.target.checked }))} />
                <span style={{ fontSize: 13 }}>본문 이미지 필수 (이미지 없는 보도자료 스킵)</span>
              </label>
              <div>
                <label style={labelStyle}>기본 카테고리</label>
                <input value={settings.category} onChange={(e) => setSettings((s) => ({ ...s, category: e.target.value }))} style={inputStyle} placeholder="보도자료" />
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
                  <option value="임시저장">임시저장 (검토 후 게시)</option>
                  <option value="게시">바로 게시</option>
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
                }))} style={inputStyle} placeholder="정책, 경제, 문화, 기술" />
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
            </div>
          </div>

          {/* 소스 관리 */}
          <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: "18px 20px" }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>수집 소스 관리</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {settings.sources.map((src) => (
                <div key={src.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "1px solid #EEE", borderRadius: 8, flexWrap: "wrap" }}>
                  <input type="checkbox" checked={src.enabled} onChange={() => toggleSource(src.id)} />
                  <span style={{ fontWeight: 600, fontSize: 13, minWidth: 100 }}>{src.name}</span>
                  <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                    background: src.fetchType === "rss" ? "#E8F5E9" : src.boTable === "newswire" ? "#E3F2FD" : "#FFF3E0",
                    color: src.fetchType === "rss" ? "#2E7D32" : src.boTable === "newswire" ? "#0277BD" : "#E65100" }}>
                    {src.fetchType === "rss" ? "직접 RSS" : src.boTable === "newswire" ? "뉴스와이어" : "netpro"}
                  </span>
                  {src.rssUrl && (
                    <span style={{ fontSize: 10, color: "#999", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={src.rssUrl}>
                      {src.rssUrl}
                    </span>
                  )}
                  {!src.rssUrl && src.sca && (
                    <span style={{ fontSize: 11, color: "#999" }}>
                      {src.boTable === "newswire" ? NEWSWIRE_CATEGORIES[src.sca] || src.sca : RSS_CATEGORIES[src.sca] || src.sca}
                    </span>
                  )}
                  <span style={{ flex: 1 }} />
                  <button onClick={() => removeSource(src.id)} style={{ background: "none", border: "none", color: "#CCC", cursor: "pointer", fontSize: 16, padding: "0 4px" }}>x</button>
                </div>
              ))}
            </div>
            {/* 소스 추가 */}
            <div style={{ border: "1px solid #E0E0E0", borderRadius: 8, padding: "12px 14px", background: "#FAFAFA" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 10 }}>소스 추가</div>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ flex: "0 0 110px" }}>
                  <label style={labelStyle}>수집 방식</label>
                  <select value={newSourceFetchType} onChange={(e) => setNewSourceFetchType(e.target.value as "netpro" | "rss")} style={inputStyle}>
                    <option value="rss">직접 RSS</option>
                    <option value="netpro">netpro</option>
                  </select>
                </div>
                <div style={{ flex: "0 0 130px" }}>
                  <label style={labelStyle}>소스 이름</label>
                  <input value={newSourceName} onChange={(e) => setNewSourceName(e.target.value)} placeholder="소스 이름" style={inputStyle} />
                </div>
                {newSourceFetchType === "rss" ? (
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label style={labelStyle}>RSS 피드 URL</label>
                    <input value={newSourceRssUrl} onChange={(e) => setNewSourceRssUrl(e.target.value)} placeholder="https://example.com/rss.xml" style={inputStyle} />
                  </div>
                ) : (
                  <>
                    <div style={{ flex: "0 0 110px" }}>
                      <label style={labelStyle}>유형</label>
                      <select value={newSourceBoTable} onChange={(e) => setNewSourceBoTable(e.target.value as "rss" | "newswire")} style={inputStyle}>
                        <option value="rss">정부 RSS</option>
                        <option value="newswire">뉴스와이어</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>카테고리 코드</label>
                      <select value={newSourceSca} onChange={(e) => setNewSourceSca(e.target.value)} style={inputStyle}>
                        {Object.entries(newSourceBoTable === "newswire" ? NEWSWIRE_CATEGORIES : RSS_CATEGORIES).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                <button onClick={addSource} style={{ padding: "8px 14px", background: "#4CAF50", color: "#FFF", border: "none", borderRadius: 6, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>+ 추가</button>
              </div>
            </div>
          </div>

          {/* 날짜 규칙 안내 */}
          <div style={{ background: "#FFF8E1", border: "1px solid #FFE082", borderRadius: 10, padding: "14px 16px", fontSize: 12, color: "#5D4037", lineHeight: 1.8 }}>
            <strong>날짜 제한 규칙:</strong> 평일(화~금)은 오늘/어제 자료만 등록, 월요일은 금요일까지, 주말(토/일)은 직전 금요일까지만 허용합니다.<br />
            <strong>이미지 필수:</strong> 본문에 이미지가 없는 보도자료는 자동으로 건너뜁니다.<br />
            <strong>CLI 실행:</strong> <code style={{ background: "#FFF3CD", padding: "2px 6px", borderRadius: 4 }}>node scripts/auto-press.mjs</code>
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
                <input value={runKeywords} onChange={(e) => setRunKeywords(e.target.value)} placeholder="정책, 경제" style={inputStyle} />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", gridColumn: "1 / -1" }}>
                <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
                <span style={{ fontSize: 13 }}>미리보기 모드 (기사 저장 없이 수집 목록만 확인)</span>
              </label>
            </div>
          </div>

          <button onClick={handleRun} disabled={running} style={{ padding: "14px 40px", background: running ? "#CCC" : "#4CAF50", color: "#FFF", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: running ? "not-allowed" : "pointer", alignSelf: "flex-start" }}>
            {running ? "실행 중... (최대 3분 소요)" : `${preview ? "미리보기" : "수집 + 편집 + 등록"} 실행`}
          </button>

          {running && (
            <div style={{ padding: "14px 16px", background: "#E3F2FD", border: "1px solid #90CAF9", borderRadius: 8, fontSize: 13 }}>
              보도자료 목록 수집 → 상세 가져오기 → AI 편집 → 이미지 업로드 → 기사 등록 중...
            </div>
          )}

          {lastRun && (
            <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: "16px 20px" }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>
                실행 결과 — {lastRun.articlesPublished}개 {preview ? "수집됨" : "등록됨"}, {lastRun.articlesFailed}개 실패, {lastRun.articlesSkipped}개 스킵
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
                    <th style={{ padding: "8px 12px", textAlign: "left" }}>제목</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", width: 90 }}>상태</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", width: 80 }}>링크</th>
                  </tr>
                </thead>
                <tbody>
                  {lastRun.articles.map((a, i) => {
                    const st = STATUS_LABEL[a.status] ?? { label: a.status, bg: "#F5F5F5", color: "#999" };
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #F5F5F5" }}>
                        <td style={{ padding: "8px 12px", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.title}
                          {a.error && <span style={{ marginLeft: 6, color: "#C62828", fontSize: 11 }}>({a.error})</span>}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>
                            {st.label}
                          </span>
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          {a.sourceUrl && <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#2196F3", fontSize: 11 }}>원문</a>}
                          {a.articleId && <Link href={`/cam/articles/${a.articleId}/edit`} style={{ marginLeft: 8, color: "#E8192C", fontSize: 11 }}>편집</Link>}
                        </td>
                      </tr>
                    );
                  })}
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
                        등록 {run.articlesPublished}건 / 실패 {run.articlesFailed}건 / 스킵 {run.articlesSkipped}건
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: "#999" }}>{new Date(run.startedAt).toLocaleString("ko-KR")}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {run.articles.slice(0, 8).map((a, i) => {
                      const st = STATUS_LABEL[a.status] ?? { label: a.status, bg: "#F5F5F5", color: "#999" };
                      return (
                        <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10,
                          background: st.bg, color: st.color,
                          maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.title}
                        </span>
                      );
                    })}
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
