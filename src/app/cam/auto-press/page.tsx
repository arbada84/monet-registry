"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { AutoPressSettings, AutoPressSource, AutoPressRun } from "@/types/article";

const DEFAULT_SOURCES: AutoPressSource[] = [
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
  ok:       { label: "성공",     bg: "#E8F5E9", color: "#2E7D32" },
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
  const [dateRangeDays, setDateRangeDays] = useState(0); // 0=자동(요일 기반)
  const [noAiEdit, setNoAiEdit] = useState(false);
  const [lastRun, setLastRun] = useState<AutoPressRun | null>(null);
  const [allRuns, setAllRuns] = useState<AutoPressRun[]>([]); // 누적 실행 결과
  const [excludeUrls, setExcludeUrls] = useState<string[]>([]); // 이전 시도 URL 누적
  const [progress, setProgress] = useState<{
    total: number; done: number; batch: number; totalBatches: number;
    ok: number; fail: number; skip: number;
    recentArticles: { title: string; status: string; error?: string }[];
    batchLog: string[];
    timedOut: boolean;
  } | null>(null);

  // 이력 탭
  const [history, setHistory] = useState<AutoPressRun[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  // 새 소스 추가
  const [newSourceName, setNewSourceName] = useState("");
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

  const handleRun = async (isAdditional = false) => {
    setRunning(true);
    if (!isAdditional) { setLastRun(null); setAllRuns([]); setExcludeUrls([]); }

    const BATCH_SIZE = 5;
    const needsBatch = runCount > BATCH_SIZE;
    const totalCount = runCount;
    const batchSize = (!preview && !noAiEdit) ? BATCH_SIZE : 10; // AI편집 5건, 미리보기/원문 10건
    const totalBatches = needsBatch ? Math.ceil(totalCount / batchSize) : 1;
    let currentExcludes = isAdditional ? [...excludeUrls] : [];
    const allResults: AutoPressRun[] = [];
    let remaining = totalCount;
    let batchNum = 0;
    let cumOk = 0, cumFail = 0, cumSkip = 0;
    const recentArts: { title: string; status: string; error?: string }[] = [];
    const batchLogs: string[] = [];

    // 초기 진행 상태
    setProgress({ total: totalCount, done: 0, batch: 0, totalBatches, ok: 0, fail: 0, skip: 0, recentArticles: [], batchLog: [], timedOut: false });

    try {
      while (remaining > 0) {
        batchNum++;
        const batchCount = needsBatch ? Math.min(batchSize, remaining) : remaining;

        // 배치 시작 알림
        setProgress((p) => p ? { ...p, batch: batchNum, batchLog: [...batchLogs, `배치 ${batchNum}/${totalBatches} 처리 중...`] } : p);

        const res = await fetch("/api/cron/auto-press", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "manual",
            count: batchCount,
            publishStatus: runStatus,
            category: runCategory || undefined,
            keywords: runKeywords ? runKeywords.split(",").map((k) => k.trim()).filter(Boolean) : undefined,
            preview,
            dateRangeDays: dateRangeDays > 0 ? dateRangeDays : undefined,
            noAiEdit: noAiEdit || undefined,
            excludeUrls: currentExcludes.length > 0 ? currentExcludes : undefined,
          }),
          credentials: "include",
        });

        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          const doneCount = totalCount - remaining;
          batchLogs.push(`배치 ${batchNum} 시간 초과 (Vercel 60초 제한)`);
          setProgress((p) => p ? { ...p, timedOut: true, batchLog: [...batchLogs] } : p);
          alert(`⏱️ 서버 시간 초과 (Vercel 60초 제한)\n\n${doneCount > 0 ? `${doneCount}건 처리 완료, ` : ""}나머지 ${remaining}건 미처리.\n기사 관리에서 등록된 기사를 확인하세요.`);
          break;
        }

        if (!data.success) {
          batchLogs.push(`배치 ${batchNum} 실패: ${data.error || "알 수 없는 오류"}`);
          setProgress((p) => p ? { ...p, batchLog: [...batchLogs] } : p);
          alert(data.error || "실행 실패");
          break;
        }

        const run = data.run as AutoPressRun;
        allResults.push(run);
        setLastRun(run);
        setAllRuns((prev) => [...prev, run]);

        // 배치 결과 집계
        const bOk = run.articlesPublished;
        const bFail = run.articlesFailed;
        const bSkip = run.articlesSkipped;
        cumOk += bOk; cumFail += bFail; cumSkip += bSkip;

        // 최근 기사 누적 (최대 10건 유지)
        for (const a of run.articles) {
          recentArts.push({ title: a.title, status: a.status, error: a.error });
        }
        const recentSlice = recentArts.slice(-10);

        const newExcludes = run.articles.flatMap((a: { sourceUrl?: string; title?: string }) =>
          [a.sourceUrl, a.title].filter(Boolean) as string[]
        );
        currentExcludes = [...currentExcludes, ...newExcludes];
        setExcludeUrls(currentExcludes);

        remaining -= batchCount;
        const doneSoFar = totalCount - remaining;

        // 대상 기사가 없으면 (0건 반환) 조기 종료
        const batchTotal = bOk + bFail + bSkip;
        if (batchTotal === 0) {
          batchLogs.push(`배치 ${batchNum} — 대상 기사 없음, 수집 종료`);
          // 진행 현황판의 total을 실제 처리된 건수로 보정
          setProgress({
            total: doneSoFar, done: doneSoFar, batch: batchNum, totalBatches: batchNum,
            ok: cumOk, fail: cumFail, skip: cumSkip,
            recentArticles: recentSlice, batchLog: [...batchLogs], timedOut: false,
          });
          break;
        }

        // 요청보다 적게 반환 → 남은 대상이 없으므로 다음 배치 불필요
        const earlyStop = batchTotal < batchCount;

        batchLogs.push(`배치 ${batchNum} 완료 (${bOk}등록/${bFail}실패/${bSkip}스킵)${earlyStop ? " — 대상 소진, 수집 종료" : remaining > 0 ? ` → 배치 ${batchNum + 1} 시작...` : ""}`);

        const adjustedTotal = earlyStop ? doneSoFar : totalCount;
        setProgress({
          total: adjustedTotal, done: doneSoFar, batch: batchNum, totalBatches: earlyStop ? batchNum : totalBatches,
          ok: cumOk, fail: cumFail, skip: cumSkip,
          recentArticles: recentSlice, batchLog: [...batchLogs], timedOut: false,
        });

        if (earlyStop) break;

        if (remaining > 0 && needsBatch) {
          await new Promise((r) => setTimeout(r, 1000));
        }
        if (!needsBatch) break;
      }
    } catch (e) {
      alert(`실행 중 오류가 발생했습니다: ${e instanceof Error ? e.message : String(e)}`);
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
    if (!newSourceName.trim() || !newSourceRssUrl.trim()) return;
    setSettings((s) => ({
      ...s,
      sources: [...s.sources, {
        id: `custom_${Date.now()}`, name: newSourceName.trim(),
        boTable: "rss",
        sca: "",
        enabled: true,
        fetchType: "rss" as const,
        rssUrl: newSourceRssUrl.trim(),
      }],
    }));
    setNewSourceName("");
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
                <label style={labelStyle}>회당 기사 수 (1-100)</label>
                <input type="number" min={1} max={100} value={settings.count} onChange={(e) => setSettings((s) => ({ ...s, count: Math.min(100, Math.max(1, Number(e.target.value))) }))} style={inputStyle} />
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
                <select value={settings.aiModel} onChange={(e) => setSettings((s) => ({ ...s, aiModel: e.target.value }))} style={inputStyle}>
                  {settings.aiProvider === "gemini" ? (
                    <>
                      <option value="gemini-2.0-flash">Gemini 2.0 Flash (추천)</option>
                      <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash Lite</option>
                      <option value="gemini-2.5-flash-preview-05-20">Gemini 2.5 Flash Preview</option>
                      <option value="gemini-2.5-pro-preview-05-06">Gemini 2.5 Pro Preview</option>
                      <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                      <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                    </>
                  ) : (
                    <>
                      <option value="gpt-4o-mini">GPT-4o Mini (추천)</option>
                      <option value="gpt-4o">GPT-4o</option>
                      <option value="gpt-4.1-mini">GPT-4.1 Mini</option>
                      <option value="gpt-4.1">GPT-4.1</option>
                      <option value="gpt-4.1-nano">GPT-4.1 Nano</option>
                    </>
                  )}
                </select>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", gridColumn: "1 / -1" }}>
                <input type="checkbox" checked={settings.aiAutoGenerate ?? false} onChange={(e) => setSettings((s) => ({ ...s, aiAutoGenerate: e.target.checked }))} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>AI 전체 자동생성 자동 적용</span>
                <span style={{ fontSize: 11, color: "#999" }}>(등록 후 AI로 제목·요약·본문·카테고리 재편집)</span>
              </label>
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
                    background: "#E8F5E9", color: "#2E7D32" }}>
                    RSS
                  </span>
                  {src.rssUrl && (
                    <span style={{ fontSize: 10, color: "#999", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={src.rssUrl}>
                      {src.rssUrl}
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
                <div style={{ flex: "0 0 130px" }}>
                  <label style={labelStyle}>소스 이름</label>
                  <input value={newSourceName} onChange={(e) => setNewSourceName(e.target.value)} placeholder="소스 이름" style={inputStyle} />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={labelStyle}>RSS 피드 URL</label>
                  <input value={newSourceRssUrl} onChange={(e) => setNewSourceRssUrl(e.target.value)} placeholder="https://example.com/rss.xml" style={inputStyle} />
                </div>
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
                <label style={labelStyle}>기사 수 (AI편집 시 5건씩 배치, 원문등록 시 10건씩 배치)</label>
                <input type="number" min={1} max={100} value={runCount} onChange={(e) => setRunCount(Math.min(100, Math.max(1, Number(e.target.value))))} style={inputStyle} />
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
              <div>
                <label style={labelStyle}>수집 날짜 범위 (일)</label>
                <select value={dateRangeDays} onChange={(e) => setDateRangeDays(Number(e.target.value))} style={inputStyle}>
                  <option value={0}>자동 (요일 기반)</option>
                  <option value={1}>오늘만</option>
                  <option value={2}>최근 2일</option>
                  <option value={3}>최근 3일</option>
                  <option value={5}>최근 5일</option>
                  <option value={7}>최근 7일</option>
                  <option value={14}>최근 14일</option>
                  <option value={30}>최근 30일</option>
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, gridColumn: "1 / -1" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={noAiEdit} onChange={(e) => setNoAiEdit(e.target.checked)} />
                  <span style={{ fontSize: 13 }}>AI 편집 건너뛰기 (원문 그대로 등록)</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
                  <span style={{ fontSize: 13 }}>미리보기 모드 (기사 저장 없이 수집 목록만 확인)</span>
                </label>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => handleRun(false)} disabled={running} style={{ padding: "14px 40px", background: running ? "#CCC" : "#4CAF50", color: "#FFF", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: running ? "not-allowed" : "pointer" }}>
              {running ? "실행 중... (최대 3분 소요)" : `${preview ? "미리보기" : "수집 + 편집 + 등록"} 실행`}
            </button>
            {allRuns.length > 0 && !running && (
              <button onClick={() => handleRun(true)} style={{ padding: "14px 30px", background: "#2196F3", color: "#FFF", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                + {runCount}개 추가 수집 (중복 제외)
              </button>
            )}
          </div>

          {/* 실시간 진행 현황판 */}
          {running && progress && (
            <div style={{ background: "#FFF", border: "1px solid #E0E0E0", borderRadius: 10, padding: "18px 20px" }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>📊</span> 실행 현황
                {progress.timedOut && (
                  <span style={{ padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: "#FFF0F0", color: "#C62828" }}>시간 초과</span>
                )}
              </div>
              {/* 프로그레스 바 */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1, height: 18, background: "#F0F0F0", borderRadius: 9, overflow: "hidden", position: "relative" }}>
                  <div style={{
                    height: "100%", borderRadius: 9, transition: "width 0.4s ease",
                    width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
                    background: progress.timedOut ? "#EF5350" : "linear-gradient(90deg, #4CAF50, #66BB6A)",
                  }} />
                  <span style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#333" }}>
                    {progress.done}/{progress.total}건 (배치 {progress.batch}/{progress.totalBatches})
                  </span>
                </div>
              </div>
              {/* 상태 배지 */}
              <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <span style={{ padding: "4px 12px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: "#E8F5E9", color: "#2E7D32" }}>✅ 등록 {progress.ok}</span>
                <span style={{ padding: "4px 12px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: "#FFF0F0", color: "#C62828" }}>❌ 실패 {progress.fail}</span>
                <span style={{ padding: "4px 12px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: "#FFF3E0", color: "#E65100" }}>⏭️ 스킵 {progress.skip}</span>
                <span style={{ padding: "4px 12px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: "#F5F5F5", color: "#999" }}>⏳ 대기 {progress.total - progress.done}</span>
              </div>
              {/* 최근 처리 기사 */}
              {progress.recentArticles.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 6 }}>최근 처리:</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {progress.recentArticles.slice().reverse().map((a, i) => (
                      <div key={i} style={{ fontSize: 12, color: "#333", display: "flex", gap: 6, alignItems: "center" }}>
                        <span>{a.status === "ok" ? "✅" : a.status === "fail" ? "❌" : "⏭️"}</span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 500 }}>{a.title}</span>
                        {a.error && <span style={{ color: "#C62828", fontSize: 11 }}>({a.error})</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* 배치 로그 */}
              {progress.batchLog.length > 0 && (
                <div style={{ borderTop: "1px solid #F0F0F0", paddingTop: 10 }}>
                  {progress.batchLog.map((log, i) => (
                    <div key={i} style={{ fontSize: 11, color: "#999", lineHeight: 1.6 }}>{log}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 누적 결과 요약 */}
          {!running && allRuns.length > 1 && (
            <div style={{ padding: "12px 16px", background: "#E8F5E9", border: "1px solid #C8E6C9", borderRadius: 8, fontSize: 13, color: "#2E7D32" }}>
              <strong>누적 {allRuns.length}회 실행:</strong>{" "}
              총 {allRuns.reduce((s, r) => s + r.articlesPublished, 0)}개 등록, {allRuns.reduce((s, r) => s + r.articlesFailed, 0)}개 실패, {allRuns.reduce((s, r) => s + r.articlesSkipped, 0)}개 스킵
            </div>
          )}

          {lastRun && (
            <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: "16px 20px" }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>
                {allRuns.length > 1 ? `${allRuns.length}차 실행 결과` : "실행 결과"} — {lastRun.articlesPublished}개 {preview ? "수집됨" : "등록됨"}, {lastRun.articlesFailed}개 실패, {lastRun.articlesSkipped}개 스킵
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

          {/* 이전 실행 결과 (접기) */}
          {allRuns.length > 1 && (
            <details style={{ background: "#FAFAFA", border: "1px solid #EEE", borderRadius: 10, padding: "12px 16px" }}>
              <summary style={{ cursor: "pointer", fontSize: 13, color: "#666", fontWeight: 600 }}>이전 실행 결과 ({allRuns.length - 1}회)</summary>
              {allRuns.slice(0, -1).reverse().map((run, ri) => (
                <div key={ri} style={{ marginTop: 10, padding: "10px 12px", border: "1px solid #EEE", borderRadius: 8, background: "#FFF" }}>
                  <div style={{ fontSize: 12, color: "#999", marginBottom: 6 }}>{allRuns.length - 1 - ri}차: {run.articlesPublished}개 등록</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {run.articles.filter(a => a.status === "ok").map((a, i) => (
                      <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "#E8F5E9", color: "#2E7D32", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.title}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </details>
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

          {/* 전체 통계 요약 */}
          {history.length > 0 && (
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ padding: "10px 16px", background: "#E8F5E9", borderRadius: 8, fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: "#2E7D32" }}>총 등록: {history.reduce((s, r) => s + r.articlesPublished, 0)}건</span>
              </div>
              <div style={{ padding: "10px 16px", background: "#FFF0F0", borderRadius: 8, fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: "#C62828" }}>총 실패: {history.reduce((s, r) => s + r.articlesFailed, 0)}건</span>
              </div>
              <div style={{ padding: "10px 16px", background: "#FFF3E0", borderRadius: 8, fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: "#E65100" }}>총 스킵: {history.reduce((s, r) => s + r.articlesSkipped, 0)}건</span>
              </div>
              <div style={{ padding: "10px 16px", background: "#F5F5F5", borderRadius: 8, fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: "#666" }}>실행 횟수: {history.length}회</span>
              </div>
            </div>
          )}

          {history.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "#999", fontSize: 14, background: "#FAFAFA", borderRadius: 10 }}>
              실행 이력이 없습니다. 수동 실행 탭에서 먼저 실행해 보세요.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {history.map((run) => {
                const duration = run.completedAt && run.startedAt
                  ? Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
                  : null;
                return (
                  <details key={run.id} style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10 }}>
                    <summary style={{ padding: "14px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, listStyle: "none" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: run.source === "cron" ? "#E3F2FD" : run.source === "cli" ? "#F3E5F5" : "#FFF3E0", color: run.source === "cron" ? "#0277BD" : run.source === "cli" ? "#7B1FA2" : "#E65100" }}>
                          {{ cron: "크론", manual: "수동", cli: "CLI" }[run.source] ?? run.source}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>
                          등록 {run.articlesPublished}건 / 실패 {run.articlesFailed}건 / 스킵 {run.articlesSkipped}건
                        </span>
                        {duration !== null && (
                          <span style={{ fontSize: 11, color: "#999" }}>({duration}초)</span>
                        )}
                      </div>
                      <span style={{ fontSize: 12, color: "#999" }}>{new Date(run.startedAt).toLocaleString("ko-KR")}</span>
                    </summary>
                    <div style={{ padding: "0 18px 14px", borderTop: "1px solid #F5F5F5" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 10 }}>
                        <thead>
                          <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
                            <th style={{ padding: "6px 10px", textAlign: "center", width: 30 }}>#</th>
                            <th style={{ padding: "6px 10px", textAlign: "center", width: 80 }}>상태</th>
                            <th style={{ padding: "6px 10px", textAlign: "left" }}>제목</th>
                            <th style={{ padding: "6px 10px", textAlign: "left", width: 160 }}>사유</th>
                            <th style={{ padding: "6px 10px", textAlign: "center", width: 60 }}>링크</th>
                          </tr>
                        </thead>
                        <tbody>
                          {run.articles.map((a, i) => {
                            const st = STATUS_LABEL[a.status] ?? { label: a.status, bg: "#F5F5F5", color: "#999" };
                            return (
                              <tr key={i} style={{ borderBottom: "1px solid #F5F5F5" }}>
                                <td style={{ padding: "6px 10px", textAlign: "center", color: "#999" }}>{i + 1}</td>
                                <td style={{ padding: "6px 10px", textAlign: "center" }}>
                                  <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>
                                    {st.label}
                                  </span>
                                </td>
                                <td style={{ padding: "6px 10px", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {a.title || "(제목 없음)"}
                                </td>
                                <td style={{ padding: "6px 10px", fontSize: 11, color: "#999" }}>
                                  {a.error || "-"}
                                </td>
                                <td style={{ padding: "6px 10px", textAlign: "center" }}>
                                  {a.sourceUrl ? (
                                    <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#2196F3", fontSize: 11, textDecoration: "none" }}>원문</a>
                                  ) : "-"}
                                  {a.articleId && (
                                    <a href={`/cam/articles/${a.articleId}/edit`} style={{ marginLeft: 6, color: "#E8192C", fontSize: 11, textDecoration: "none" }}>편집</a>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
