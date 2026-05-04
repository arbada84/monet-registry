"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type {
  AutoPressObservedRun,
  AutoPressObservedSummary,
  AutoPressRetryQueueEntry,
  AutoPressSettings,
  AutoPressSource,
  AutoPressRun,
} from "@/types/article";
import { normalizeAutoPressCount } from "@/lib/auto-press-count";
import { getDefaultModelForProvider, getTextModelOptions } from "@/lib/ai-model-options";

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
  aiModel: getDefaultModelForProvider("gemini", "automation"),
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

const RUN_STATUS_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  queued:    { label: "대기",     bg: "#F5F5F5", color: "#666" },
  running:   { label: "실행 중",  bg: "#E3F2FD", color: "#0277BD" },
  completed: { label: "완료",     bg: "#E8F5E9", color: "#2E7D32" },
  failed:    { label: "실패",     bg: "#FFF0F0", color: "#C62828" },
  timeout:   { label: "시간 초과", bg: "#FFF3E0", color: "#E65100" },
  cancelled: { label: "취소",     bg: "#F5F5F5", color: "#666" },
};

const QUEUE_STATUS_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  pending:   { label: "대기",     bg: "#FFF3E0", color: "#E65100" },
  running:   { label: "처리 중",  bg: "#E3F2FD", color: "#0277BD" },
  completed: { label: "완료",     bg: "#E8F5E9", color: "#2E7D32" },
  failed:    { label: "실패",     bg: "#FFF0F0", color: "#C62828" },
  gave_up:   { label: "수동 검토", bg: "#F3E5F5", color: "#7B1FA2" },
  cancelled: { label: "취소",     bg: "#F5F5F5", color: "#666" },
};

const REASON_LABEL: Record<string, string> = {
  NO_AI_SETTINGS: "AI 설정 없음",
  NO_AI_KEY: "AI API 키 없음",
  AI_TIMEOUT: "AI 시간 초과",
  AI_RESPONSE_INVALID: "AI 응답 오류",
  AI_RETRY_PENDING: "AI 재시도 대기",
  RSS_FETCH_FAILED: "RSS 수집 실패",
  DETAIL_FETCH_FAILED: "본문 수집 실패",
  BODY_TOO_SHORT: "본문 부족",
  NO_IMAGE: "이미지 없음",
  IMAGE_UPLOAD_FAILED: "이미지 업로드 실패",
  DUPLICATE_SOURCE: "중복 기사",
  OLD_DATE: "날짜 제한",
  BLOCKED_KEYWORD: "금칙어 포함",
  DB_CREATE_FAILED: "DB 저장 실패",
  TIME_BUDGET_EXCEEDED: "실행 시간 초과",
  MANUAL_CANCELLED: "수동 취소",
  UNKNOWN: "알 수 없는 오류",
};

function formatKoreanDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR");
}

function formatDuration(ms?: number) {
  if (ms === undefined || ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${Math.round(ms / 1000)}초`;
}

function getRunVisibleSuccessCount(run: AutoPressRun, isPreview: boolean): number {
  if (isPreview || run.preview) {
    return run.articlesPreviewed ?? run.articles.filter((article) => article.status === "preview").length;
  }
  return run.articlesPublished;
}

type AutoPressRunArticle = AutoPressRun["articles"][number];

function isTimeoutMarker(article: Pick<AutoPressRunArticle, "title" | "sourceUrl" | "error">): boolean {
  const text = `${article.title || ""} ${article.error || ""}`;
  return !article.sourceUrl && /시간 초과|50초 안전 마진/.test(text);
}

function visibleRunArticles(run: AutoPressRun): AutoPressRunArticle[] {
  return run.articles.filter((article) => !isTimeoutMarker(article));
}

function isAutoPressRunTimedOut(run: AutoPressRun): boolean {
  return Boolean(run.timedOut || run.continuation?.shouldContinue || run.articles.some(isTimeoutMarker));
}

function getContinuationDelayMs(run: AutoPressRun): number {
  const delay = Number(run.continuation?.nextDelayMs || 2000);
  return Math.max(1000, Math.min(delay, 5000));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAutoPressRunLastSignalAt(run?: AutoPressObservedRun | null): string | undefined {
  return run?.lastEventAt || run?.startedAt;
}

function getMinutesSince(value?: string): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 60000));
}

function isObservedRunStale(run: AutoPressObservedRun): boolean {
  return run.status === "running" && (getMinutesSince(getAutoPressRunLastSignalAt(run)) ?? 0) >= 2;
}

function formatLastSignal(value?: string): string {
  const minutes = getMinutesSince(value);
  if (minutes === null) return "신호 없음";
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  return `${Math.floor(minutes / 60)}시간 전`;
}

export default function AutoPressPage() {
  const [tab, setTab] = useState<"settings" | "run" | "runs" | "queue" | "history">("settings");
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
  const [forceDate, setForceDate] = useState(false); // 날짜 제한 무시
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
  const [observedRuns, setObservedRuns] = useState<AutoPressObservedRun[]>([]);
  const [observedSummary, setObservedSummary] = useState<AutoPressObservedSummary | null>(null);
  const [observabilityLoading, setObservabilityLoading] = useState(false);
  const [observabilityError, setObservabilityError] = useState("");
  const [retryQueue, setRetryQueue] = useState<AutoPressRetryQueueEntry[]>([]);
  const [retryQueueLoading, setRetryQueueLoading] = useState(false);
  const [retryQueueError, setRetryQueueError] = useState("");
  const [retryQueueMsg, setRetryQueueMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [processingQueue, setProcessingQueue] = useState(false);
  const [queueActionId, setQueueActionId] = useState<string | null>(null);

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

  const loadObservedRuns = useCallback(() => {
    setObservabilityLoading(true);
    setObservabilityError("");
    fetch("/api/auto-press/runs?limit=30")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setObservedRuns(d.runs ?? []);
          setObservedSummary(d.summary ?? null);
        } else {
          setObservabilityError(d.error || "실행 현황을 불러오지 못했습니다.");
        }
      })
      .catch((error) => setObservabilityError(error instanceof Error ? error.message : "실행 현황을 불러오지 못했습니다."))
      .finally(() => setObservabilityLoading(false));
  }, []);

  const loadRetryQueue = useCallback(() => {
    setRetryQueueLoading(true);
    setRetryQueueError("");
    fetch("/api/auto-press/retry-queue?limit=50")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setRetryQueue(d.queue ?? []);
        } else {
          setRetryQueueError(d.error || "AI 대기열을 불러오지 못했습니다.");
        }
      })
      .catch((error) => setRetryQueueError(error instanceof Error ? error.message : "AI 대기열을 불러오지 못했습니다."))
      .finally(() => setRetryQueueLoading(false));
  }, []);

  const handleProcessRetryQueue = async () => {
    setProcessingQueue(true);
    setRetryQueueMsg(null);
    try {
      const res = await fetch("/api/auto-press/retry-queue/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 3 }),
      });
      const data = await res.json();
      setRetryQueueMsg({
        ok: res.ok && data.success,
        msg: data.message || (res.ok ? "AI 대기열 처리가 완료되었습니다." : "AI 대기열 처리에 실패했습니다."),
      });
      loadRetryQueue();
      loadObservedRuns();
    } catch (error) {
      setRetryQueueMsg({ ok: false, msg: error instanceof Error ? error.message : "AI 대기열 처리 중 오류가 발생했습니다." });
    } finally {
      setProcessingQueue(false);
    }
  };

  const handleRetryQueueAction = async (id: string, action: "retry" | "cancel") => {
    setQueueActionId(id);
    setRetryQueueMsg(null);
    try {
      const res = await fetch(`/api/auto-press/retry-queue/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setRetryQueueMsg({
        ok: res.ok && data.success,
        msg: data.message || (action === "retry" ? "즉시 재시도 처리가 완료되었습니다." : "AI 대기열 항목을 취소했습니다."),
      });
      loadRetryQueue();
      loadObservedRuns();
    } catch (error) {
      setRetryQueueMsg({ ok: false, msg: error instanceof Error ? error.message : "AI 대기열 항목 처리 중 오류가 발생했습니다." });
    } finally {
      setQueueActionId(null);
    }
  };

  useEffect(() => {
    if (tab === "history") loadHistory();
    if (tab === "runs") loadObservedRuns();
    if (tab === "queue") loadRetryQueue();
    if (tab === "run") {
      setRunCount(settings.count);
      setRunStatus(settings.publishStatus);
      setRunCategory(settings.category);
    }
  }, [tab, settings, loadHistory, loadObservedRuns, loadRetryQueue]);

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

    const AI_BATCH_SIZE = 3;
    const FAST_BATCH_SIZE = 10;
    const totalCount = runCount;
    const batchSize = (!preview && !noAiEdit) ? AI_BATCH_SIZE : FAST_BATCH_SIZE;
    const totalBatches = Math.max(1, Math.ceil(totalCount / batchSize));
    const maxBatches = Math.max(totalBatches + 30, 40);
    let currentExcludes = isAdditional ? [...excludeUrls] : [];
    const allResults: AutoPressRun[] = [];
    let remaining = totalCount;
    let batchNum = 0;
    let cumOk = 0, cumFail = 0, cumSkip = 0;
    let consecutiveParseFailures = 0;
    let consecutiveNoProgress = 0;
    const recentArts: { title: string; status: string; error?: string }[] = [];
    const batchLogs: string[] = [];

    // 초기 진행 상태
    setProgress({ total: totalCount, done: 0, batch: 0, totalBatches, ok: 0, fail: 0, skip: 0, recentArticles: [], batchLog: [], timedOut: false });

    try {
      while (remaining > 0) {
        if (batchNum >= maxBatches) {
          batchLogs.push(`자동 이어 실행 안전 한도(${maxBatches}회)에 도달했습니다. 이미 등록된 기사와 스킵 사유를 확인한 뒤 다시 실행하세요.`);
          setProgress((p) => p ? { ...p, batchLog: [...batchLogs], totalBatches: Math.max(totalBatches, batchNum), timedOut: true } : p);
          break;
        }

        batchNum++;
        const batchCount = Math.min(batchSize, remaining);
        const visibleTotalBatches = Math.max(totalBatches, batchNum);

        // 배치 시작 알림
        setProgress((p) => p ? { ...p, batch: batchNum, totalBatches: visibleTotalBatches, batchLog: [...batchLogs, `배치 ${batchNum}/${visibleTotalBatches} 처리 중...`] } : p);

        const res = await fetch("/api/auto-press/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "manual",
            count: batchCount,
            publishStatus: runStatus,
            category: runCategory || undefined,
            keywords: runKeywords ? runKeywords.split(",").map((k) => k.trim()).filter(Boolean) : undefined,
            preview,
            force: forceDate || undefined,
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
          consecutiveParseFailures = 0;
        } catch {
          const doneCount = totalCount - remaining;
          consecutiveParseFailures++;
          batchLogs.push(`배치 ${batchNum} 응답이 끊겼습니다. 2초 후 자동 이어 실행합니다. (${consecutiveParseFailures}/3)`);
          setProgress((p) => p ? {
            ...p,
            done: doneCount,
            batch: batchNum,
            totalBatches: visibleTotalBatches,
            timedOut: true,
            batchLog: [...batchLogs],
          } : p);
          if (consecutiveParseFailures >= 3) {
            alert("서버 응답이 3회 연속 끊겨 자동 이어 실행을 멈췄습니다. 이미 저장된 기사는 중복 방지로 보호되므로 잠시 뒤 다시 실행하세요.");
            break;
          }
          await sleep(2000);
          continue;
        }

        if (!data.success) {
          batchLogs.push(`배치 ${batchNum} 실패: ${data.error || "알 수 없는 오류"}`);
          setProgress((p) => p ? { ...p, batchLog: [...batchLogs] } : p);
          alert(data.error || "실행 실패");
          break;
        }

        const run = data.run as AutoPressRun;
        const runTimedOut = isAutoPressRunTimedOut(run);
        const visibleArticles = visibleRunArticles(run);
        allResults.push(run);
        setLastRun(run);
        setAllRuns((prev) => [...prev, run]);
        loadObservedRuns();
        loadRetryQueue();

        const bOk = getRunVisibleSuccessCount(run, preview);
        const bFail = run.articlesFailed;
        const bSkip = run.articlesSkipped;
        const batchTotal = bOk + bFail + bSkip;
        cumOk += bOk; cumFail += bFail; cumSkip += bSkip;

        for (const a of visibleArticles) {
          recentArts.push({ title: a.title, status: a.status, error: a.error });
        }
        const recentSlice = recentArts.slice(-10);

        const newExcludes = visibleArticles.flatMap((a: { sourceUrl?: string; title?: string }) =>
          [a.sourceUrl, a.title].filter(Boolean) as string[]
        );
        currentExcludes = [...currentExcludes, ...newExcludes];
        setExcludeUrls(currentExcludes);

        const completedUnits = noAiEdit && !preview
          ? Math.min(batchCount, batchTotal)
          : Math.min(batchCount, bOk);
        remaining = Math.max(0, remaining - completedUnits);
        const doneSoFar = totalCount - remaining;

        if (batchTotal === 0) {
          consecutiveNoProgress++;
          if (!runTimedOut || consecutiveNoProgress >= 2) {
            batchLogs.push(runTimedOut
              ? `배치 ${batchNum}에서 처리 결과 없이 시간 초과가 반복되어 자동 실행을 멈췄습니다.`
              : `배치 ${batchNum} 대상 기사 없음, 수집 종료`);
            setProgress({
              total: doneSoFar, done: doneSoFar, batch: batchNum, totalBatches: batchNum,
              ok: cumOk, fail: cumFail, skip: cumSkip,
              recentArticles: recentSlice, batchLog: [...batchLogs], timedOut: runTimedOut,
            });
            break;
          }
        } else {
          consecutiveNoProgress = completedUnits > 0 ? 0 : consecutiveNoProgress + 1;
        }

        if (runTimedOut) {
          const delay = getContinuationDelayMs(run);
          batchLogs.push(`배치 ${batchNum} 안전 종료 (${bOk}${preview ? "미리보기" : "등록"}/${bFail}실패/${bSkip}스킵) - ${Math.round(delay / 1000)}초 후 자동 이어 실행`);
          setProgress({
            total: totalCount, done: doneSoFar, batch: batchNum, totalBatches: visibleTotalBatches,
            ok: cumOk, fail: cumFail, skip: cumSkip,
            recentArticles: recentSlice, batchLog: [...batchLogs], timedOut: true,
          });
          if (remaining <= 0) break;
          await sleep(delay);
          continue;
        }

        batchLogs.push(`배치 ${batchNum} 완료 (${bOk}${preview ? "미리보기" : "등록"}/${bFail}실패/${bSkip}스킵)${remaining > 0 ? ` - 배치 ${batchNum + 1} 자동 이어 실행...` : ""}`);

        setProgress({
          total: totalCount, done: doneSoFar, batch: batchNum, totalBatches: visibleTotalBatches,
          ok: cumOk, fail: cumFail, skip: cumSkip,
          recentArticles: recentSlice, batchLog: [...batchLogs], timedOut: false,
        });

        if (remaining <= 0) break;
        await sleep(1000);
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
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
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
        {(["settings", "run", "runs", "queue", "history"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "10px 20px", fontSize: 13, fontWeight: tab === t ? 700 : 400,
            color: tab === t ? "#E8192C" : "#666", background: "none", border: "none",
            borderBottom: tab === t ? "2px solid #E8192C" : "2px solid transparent",
            cursor: "pointer", marginBottom: -2,
          }}>
            {{ settings: "설정", run: "수동 실행", runs: "실행 현황", queue: "AI 대기열", history: "이력" }[t]}
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
                <label style={labelStyle}>회당 기사 수 (1 이상)</label>
                <input type="number" min={1} value={settings.count} onChange={(e) => setSettings((s) => ({ ...s, count: normalizeAutoPressCount(e.target.value, s.count) }))} style={inputStyle} />
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
                <select
                  value={settings.aiProvider}
                  onChange={(e) => {
                    const aiProvider = e.target.value as "gemini" | "openai";
                    setSettings((s) => ({ ...s, aiProvider, aiModel: getDefaultModelForProvider(aiProvider, "automation") }));
                  }}
                  style={inputStyle}
                >
                  <option value="gemini">Google Gemini (무료 추천)</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>AI 모델</label>
                <select value={settings.aiModel} onChange={(e) => setSettings((s) => ({ ...s, aiModel: e.target.value }))} style={inputStyle}>
                  {getTextModelOptions(settings.aiProvider).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
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
              Gemini 기본값은 2.5 Flash입니다. 2.0 Flash는 지원 종료 예정 모델이라 기존 호환용으로만 남겨두었습니다.
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
                <label style={labelStyle}>기사 수 (상한 없음 · AI편집 시 3건씩 자동 순차 실행, 미리보기/검증 시 10건씩 실행)</label>
                <input type="number" min={1} value={runCount} onChange={(e) => setRunCount(normalizeAutoPressCount(e.target.value, runCount))} style={inputStyle} />
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
                  <input type="checkbox" checked={forceDate} onChange={(e) => setForceDate(e.target.checked)} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#E8192C" }}>날짜 제한 무시 (과거 보도자료 강제 수집)</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={noAiEdit} onChange={(e) => setNoAiEdit(e.target.checked)} />
                  <span style={{ fontSize: 13 }}>AI 편집 건너뛰기 (원문 저장 금지: 등록 없이 스킵 검증)</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
                  <span style={{ fontSize: 13 }}>미리보기 모드 (기사 저장 없이 수집 목록만 확인)</span>
                </label>
                {preview && (
                  <div style={{ marginTop: 4, padding: "10px 12px", background: "#FFF8E1", border: "1px solid #FFE082", borderRadius: 8, fontSize: 12, color: "#5D4037", lineHeight: 1.6 }}>
                    미리보기 모드에서는 기사 저장/등록을 하지 않습니다. 결과는 &quot;미리보기 N건&quot;으로만 표시되며, 실제 등록하려면 이 체크를 해제한 뒤 실행하세요.
                  </div>
                )}
                {noAiEdit && !preview && (
                  <div style={{ marginTop: 4, padding: "10px 12px", background: "#FFF0F0", border: "1px solid #FFCDD2", borderRadius: 8, fontSize: 12, color: "#B71C1C", lineHeight: 1.6 }}>
                    원문 그대로 등록은 저작권 정책상 차단되어 있습니다. 이 옵션은 저장 없이 스킵 사유를 확인하는 검증 용도로만 사용하세요.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => handleRun(false)} disabled={running} style={{ padding: "14px 40px", background: running ? "#CCC" : "#4CAF50", color: "#FFF", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: running ? "not-allowed" : "pointer" }}>
              {running ? "순차 실행 중... 창을 닫지 마세요" : `${preview ? "미리보기" : "수집 + 편집 + 등록"} 실행`}
            </button>
            {allRuns.length > 0 && !running && (
              <button onClick={() => handleRun(true)} style={{ padding: "14px 30px", background: "#2196F3", color: "#FFF", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                + {runCount}개 추가 {preview ? "미리보기" : "수집"} (중복 제외)
              </button>
            )}
          </div>

          {/* 실시간 진행 현황판 */}
          {running && progress && (
            <div style={{ background: "#FFF", border: "1px solid #E0E0E0", borderRadius: 10, padding: "18px 20px" }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>📊</span> 실행 현황
                {progress.timedOut && (
                  <span style={{ padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: "#FFF3E0", color: "#E65100" }}>안전 종료 후 자동 이어 실행</span>
                )}
              </div>
              {/* 프로그레스 바 */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1, height: 18, background: "#F0F0F0", borderRadius: 9, overflow: "hidden", position: "relative" }}>
                  <div style={{
                    height: "100%", borderRadius: 9, transition: "width 0.4s ease",
                    width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
                    background: progress.timedOut ? "#FFA726" : "linear-gradient(90deg, #4CAF50, #66BB6A)",
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
                <span style={{ padding: "4px 12px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: "#F5F5F5", color: "#999" }}>⏳ 대기 {Math.max(0, progress.total - progress.done)}</span>
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
                {allRuns.length > 1 ? `${allRuns.length}차 실행 결과` : "실행 결과"} — {getRunVisibleSuccessCount(lastRun, preview)}개 {preview ? "미리보기" : "등록됨"}, {lastRun.articlesFailed}개 실패, {lastRun.articlesSkipped}개 스킵
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

      {/* ── 실행 현황 탭 ── */}
      {tab === "runs" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>실행 현황</div>
              <div style={{ fontSize: 12, color: "#777", marginTop: 4 }}>수동 실행과 크론 실행이 D1에 저장됩니다. 실패 사유와 기사별 처리 결과를 여기서 확인할 수 있습니다.</div>
            </div>
            <button onClick={loadObservedRuns} disabled={observabilityLoading} style={{ padding: "8px 14px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
              {observabilityLoading ? "불러오는 중..." : "새로고침"}
            </button>
          </div>

          {observabilityError && (
            <div style={{ padding: "12px 16px", background: "#FFF0F0", border: "1px solid #FFCCCC", borderRadius: 8, fontSize: 13, color: "#C62828" }}>
              {observabilityError}
              <div style={{ marginTop: 6, color: "#777", fontSize: 12 }}>D1 마이그레이션이 아직 적용되지 않았거나 Cloudflare D1 API 연결이 끊긴 경우 발생할 수 있습니다.</div>
            </div>
          )}

          {observedSummary && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              <div style={{ padding: "12px 14px", borderRadius: 10, background: "#E3F2FD", border: "1px solid #BBDEFB" }}>
                <div style={{ fontSize: 11, color: "#0277BD", fontWeight: 700 }}>실행 중</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{observedSummary.runningCount}</div>
              </div>
              <div style={{ padding: "12px 14px", borderRadius: 10, background: observedSummary.staleRunningCount > 0 ? "#FFF3E0" : "#F5F5F5", border: `1px solid ${observedSummary.staleRunningCount > 0 ? "#FFCC80" : "#EEE"}` }}>
                <div style={{ fontSize: 11, color: observedSummary.staleRunningCount > 0 ? "#E65100" : "#777", fontWeight: 700 }}>멈춤 의심</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{observedSummary.staleRunningCount}</div>
              </div>
              <div style={{ padding: "12px 14px", borderRadius: 10, background: "#FFF8E1", border: "1px solid #FFE082" }}>
                <div style={{ fontSize: 11, color: "#5D4037", fontWeight: 700 }}>AI 재시도 대기</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{observedSummary.pendingRetryCount}</div>
              </div>
              <div style={{ padding: "12px 14px", borderRadius: 10, background: "#FAFAFA", border: "1px solid #EEE" }}>
                <div style={{ fontSize: 11, color: "#777", fontWeight: 700 }}>최근 실행 신호</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8 }}>{formatLastSignal(getAutoPressRunLastSignalAt(observedSummary.latestRun))}</div>
              </div>
            </div>
          )}

          {observedSummary && observedSummary.staleRunningCount > 0 && (
            <div style={{ padding: "12px 16px", background: "#FFF3E0", border: "1px solid #FFCC80", borderRadius: 8, fontSize: 13, color: "#E65100", lineHeight: 1.6 }}>
              2분 이상 실행 신호가 갱신되지 않은 보도자료 실행이 있습니다. 실행 현황에서 &quot;멈춤 의심&quot; 배지가 붙은 항목을 열어 마지막 처리 기사와 오류 사유를 확인하세요.
            </div>
          )}

          {observedRuns.length === 0 && !observabilityLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "#999", fontSize: 14, background: "#FAFAFA", borderRadius: 10 }}>
              아직 저장된 실행 현황이 없습니다. 수동 실행을 한 번 진행하면 이 화면에 기록됩니다.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {observedRuns.map((run) => {
                const st = RUN_STATUS_LABEL[run.status] ?? { label: run.status, bg: "#F5F5F5", color: "#666" };
                const stale = isObservedRunStale(run);
                return (
                  <details key={run.id} style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10 }}>
                    <summary style={{ padding: "14px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", listStyle: "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ padding: "2px 9px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color }}>{st.label}</span>
                        {stale && <span style={{ padding: "2px 9px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: "#FFF3E0", color: "#E65100" }}>멈춤 의심</span>}
                        <span style={{ fontSize: 13, fontWeight: 700 }}>등록 {run.publishedCount} / 실패 {run.failedCount} / 스킵 {run.skippedCount} / 대기 {run.queuedCount}</span>
                        <span style={{ fontSize: 11, color: "#999" }}>{run.source === "cron" ? "크론" : run.source === "cli" ? "CLI" : "수동"} · {formatDuration(run.durationMs)}</span>
                      </div>
                      <span style={{ fontSize: 12, color: "#999" }}>{formatKoreanDateTime(run.startedAt)}</span>
                    </summary>
                    <div style={{ padding: "0 18px 16px", borderTop: "1px solid #F5F5F5" }}>
                      {run.errorMessage && (
                        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "#FFF0F0", color: "#C62828", fontSize: 12 }}>
                          {REASON_LABEL[run.errorCode || ""] || run.errorCode || "실행 오류"}: {run.errorMessage}
                        </div>
                      )}
                      {stale && (
                        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "#FFF3E0", color: "#E65100", fontSize: 12, lineHeight: 1.6 }}>
                          마지막 실행 신호가 {formatLastSignal(getAutoPressRunLastSignalAt(run))}에 멈춰 있습니다. 브라우저 실행 중이면 잠시 더 기다리고, 변화가 없으면 중복 방지가 적용되므로 같은 조건으로 다시 실행해도 됩니다.
                        </div>
                      )}
                      {run.warnings && run.warnings.length > 0 && (
                        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "#FFF8E1", color: "#5D4037", fontSize: 12 }}>
                          {run.warnings.join(" / ")}
                        </div>
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(120px, 1fr))", gap: 8, marginTop: 12 }}>
                        <div style={{ padding: "10px 12px", background: "#FAFAFA", borderRadius: 8, fontSize: 12 }}>요청 {run.requestedCount}건</div>
                        <div style={{ padding: "10px 12px", background: "#FAFAFA", borderRadius: 8, fontSize: 12 }}>처리 {run.processedCount}건</div>
                        <div style={{ padding: "10px 12px", background: "#FAFAFA", borderRadius: 8, fontSize: 12 }}>시작 {formatKoreanDateTime(run.startedAt)}</div>
                        <div style={{ padding: "10px 12px", background: "#FAFAFA", borderRadius: 8, fontSize: 12 }}>종료 {formatKoreanDateTime(run.completedAt)}</div>
                      </div>
                      {run.items && run.items.length > 0 ? (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 14 }}>
                          <thead>
                            <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
                              <th style={{ padding: "7px 10px", textAlign: "center", width: 34 }}>#</th>
                              <th style={{ padding: "7px 10px", textAlign: "left", width: 92 }}>상태</th>
                              <th style={{ padding: "7px 10px", textAlign: "left" }}>제목</th>
                              <th style={{ padding: "7px 10px", textAlign: "left", width: 150 }}>사유</th>
                              <th style={{ padding: "7px 10px", textAlign: "left", width: 110 }}>작업</th>
                            </tr>
                          </thead>
                          <tbody>
                            {run.items.map((item, index) => {
                              const itemStatus = STATUS_LABEL[item.status] ?? RUN_STATUS_LABEL[item.status] ?? { label: item.status, bg: "#F5F5F5", color: "#666" };
                              const reason = item.reasonCode ? (REASON_LABEL[item.reasonCode] || item.reasonCode) : "-";
                              return (
                                <tr key={item.id} style={{ borderBottom: "1px solid #F5F5F5" }}>
                                  <td style={{ padding: "7px 10px", textAlign: "center", color: "#999" }}>{index + 1}</td>
                                  <td style={{ padding: "7px 10px" }}><span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: itemStatus.bg, color: itemStatus.color }}>{itemStatus.label}</span></td>
                                  <td style={{ padding: "7px 10px", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.title}>{item.title || "(제목 없음)"}</td>
                                  <td style={{ padding: "7px 10px", color: item.reasonCode ? "#C62828" : "#999" }}>{reason}{item.reasonMessage ? ` · ${item.reasonMessage}` : ""}</td>
                                  <td style={{ padding: "7px 10px" }}>
                                    {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#2196F3", fontSize: 11, textDecoration: "none" }}>원문</a>}
                                    {item.articleId && <Link href={`/cam/articles/${item.articleId}/edit`} style={{ marginLeft: 8, color: "#E8192C", fontSize: 11, textDecoration: "none" }}>편집</Link>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 8, background: "#FAFAFA", color: "#999", fontSize: 12 }}>
                          아직 기사별 상세가 저장되지 않았습니다. 실행 중 강제 종료되었거나 마이그레이션 적용 전 기록일 수 있습니다.
                        </div>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── AI 대기열 탭 ── */}
      {tab === "queue" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>AI 대기열</div>
              <div style={{ fontSize: 12, color: "#777", marginTop: 4 }}>AI 편집 실패, 시간 초과, 재시도 가능한 항목을 별도로 추적합니다.</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={handleProcessRetryQueue} disabled={processingQueue} style={{ padding: "8px 14px", background: processingQueue ? "#CCC" : "#E8192C", color: "#FFF", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: processingQueue ? "not-allowed" : "pointer" }}>
                {processingQueue ? "처리 중..." : "대기열 3건 처리"}
              </button>
              <button onClick={loadRetryQueue} disabled={retryQueueLoading} style={{ padding: "8px 14px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
                {retryQueueLoading ? "불러오는 중..." : "새로고침"}
              </button>
            </div>
          </div>

          {retryQueueMsg && (
            <div style={{ padding: "12px 16px", background: retryQueueMsg.ok ? "#E8F5E9" : "#FFF0F0", border: `1px solid ${retryQueueMsg.ok ? "#C8E6C9" : "#FFCCCC"}`, borderRadius: 8, fontSize: 13, color: retryQueueMsg.ok ? "#2E7D32" : "#C62828" }}>
              {retryQueueMsg.msg}
            </div>
          )}

          {retryQueueError && (
            <div style={{ padding: "12px 16px", background: "#FFF0F0", border: "1px solid #FFCCCC", borderRadius: 8, fontSize: 13, color: "#C62828" }}>
              {retryQueueError}
            </div>
          )}

          {retryQueue.length === 0 && !retryQueueLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "#999", fontSize: 14, background: "#FAFAFA", borderRadius: 10 }}>
              현재 AI 재시도 대기 항목이 없습니다.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
              <thead>
                <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
                  <th style={{ padding: "9px 12px", textAlign: "left", width: 90 }}>상태</th>
                  <th style={{ padding: "9px 12px", textAlign: "left" }}>제목</th>
                  <th style={{ padding: "9px 12px", textAlign: "left", width: 160 }}>사유</th>
                  <th style={{ padding: "9px 12px", textAlign: "left", width: 90 }}>시도</th>
                  <th style={{ padding: "9px 12px", textAlign: "left", width: 170 }}>다음 시도</th>
                  <th style={{ padding: "9px 12px", textAlign: "left", width: 170 }}>작업</th>
                </tr>
              </thead>
              <tbody>
                {retryQueue.map((entry) => {
                  const st = QUEUE_STATUS_LABEL[entry.status] ?? { label: entry.status, bg: "#F5F5F5", color: "#666" };
                  return (
                    <tr key={entry.id} style={{ borderBottom: "1px solid #F5F5F5" }}>
                      <td style={{ padding: "9px 12px" }}><span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color }}>{st.label}</span></td>
                      <td style={{ padding: "9px 12px", maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={entry.title}>{entry.title || "(제목 없음)"}</td>
                      <td style={{ padding: "9px 12px", color: "#C62828" }}>{REASON_LABEL[entry.reasonCode] || entry.reasonCode}{entry.reasonMessage ? ` · ${entry.reasonMessage}` : ""}</td>
                      <td style={{ padding: "9px 12px", color: "#666" }}>{entry.attempts}/{entry.maxAttempts}</td>
                      <td style={{ padding: "9px 12px", color: "#666" }}>{formatKoreanDateTime(entry.nextAttemptAt)}</td>
                      <td style={{ padding: "9px 12px" }}>
                        {entry.sourceUrl && <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#2196F3", fontSize: 11, textDecoration: "none" }}>원문</a>}
                        {entry.articleId && <Link href={`/cam/articles/${entry.articleId}/edit`} style={{ marginLeft: 8, color: "#E8192C", fontSize: 11, textDecoration: "none" }}>편집</Link>}
                        {["pending", "failed", "gave_up", "cancelled"].includes(entry.status) && (
                          <button onClick={() => handleRetryQueueAction(entry.id, "retry")} disabled={queueActionId === entry.id} style={{ marginLeft: 8, padding: "3px 7px", background: "#2196F3", color: "#FFF", border: "none", borderRadius: 5, fontSize: 11, cursor: queueActionId === entry.id ? "not-allowed" : "pointer" }}>
                            재시도
                          </button>
                        )}
                        {["pending", "failed"].includes(entry.status) && (
                          <button onClick={() => handleRetryQueueAction(entry.id, "cancel")} disabled={queueActionId === entry.id} style={{ marginLeft: 6, padding: "3px 7px", background: "#FFF", color: "#999", border: "1px solid #DDD", borderRadius: 5, fontSize: 11, cursor: queueActionId === entry.id ? "not-allowed" : "pointer" }}>
                            취소
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
