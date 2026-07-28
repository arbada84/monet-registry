"use client";

import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  FileClock,
  FileSearch,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Actor = { name: string; role: string };
type Runtime = {
  generation: number;
  featureEnabled: boolean;
  shadowEnabled: boolean;
  draftEnabled: boolean;
  autoPublishEnabled: false;
  killSwitchVerifiedAt?: string;
};
type Candidate = {
  id: string;
  state: string;
  articleType: string;
  title: string;
  assignedTo?: string;
  highRisk: string[];
  gateErrors: string[];
  evidenceCoverage: number;
  currentVersion: number;
  generation: number;
  updatedAt: string;
};
type Detail = {
  candidate: Candidate;
  versions: Array<Record<string, unknown>>;
  claims: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
  clusters: Array<Record<string, unknown>>;
  reviews: Array<Record<string, unknown>>;
  aiRuns: Array<Record<string, unknown>>;
  corrections: Array<Record<string, unknown>>;
  audits: Array<Record<string, unknown>>;
};
type Readiness = {
  ready: boolean;
  mode: string;
  autoPublishEnabled: false;
  blockers: string[];
};

const STATE_LABELS: Record<string, string> = {
  collected: "수집됨",
  normalized: "정규화",
  evidence_ready: "근거 준비",
  drafting: "초안 중",
  review_required: "검토 필요",
  sensitive_review: "민감 검토",
  approved: "승인",
  blocked_rights: "권리 차단",
  blocked_source: "출처 차단",
  needs_evidence: "근거 부족",
  needs_counterview: "반론 필요",
  rejected: "반려",
  discarded: "폐기",
  corrected: "정정",
  retracted: "철회",
};

function mutationHeaders() {
  return {
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
  };
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR");
}

function stateTone(state: string) {
  if (state.startsWith("blocked") || state === "rejected" || state === "discarded") return "bg-red-50 text-red-700 border-red-200";
  if (state.includes("review") || state.startsWith("needs_")) return "bg-amber-50 text-amber-800 border-amber-200";
  if (state === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-zinc-50 text-zinc-700 border-zinc-200";
}

export function EditorialLab() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [actor, setActor] = useState<Actor | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reviewMemo, setReviewMemo] = useState("");
  const [packageText, setPackageText] = useState("");
  const [runtimeForm, setRuntimeForm] = useState({ featureEnabled: false, shadowEnabled: false, draftEnabled: false });

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [candidateResponse, readinessResponse] = await Promise.all([
        fetch("/api/editorial/candidates", { cache: "no-store" }),
        fetch("/api/editorial/readiness", { cache: "no-store" }),
      ]);
      const candidateData = await candidateResponse.json();
      const readinessData = await readinessResponse.json();
      if (!candidateResponse.ok) throw new Error(candidateData.error || "편집 후보를 불러오지 못했습니다.");
      setCandidates(candidateData.candidates || []);
      setRuntime(candidateData.runtime || null);
      setActor(candidateData.actor || null);
      if (readinessResponse.ok) setReadiness(readinessData.readiness || null);
      setSelectedId((current) => current || candidateData.candidates?.[0]?.id || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) {
      setDetail(null);
      return;
    }
    try {
      const response = await fetch(`/api/editorial/candidates/${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "후보 상세를 불러오지 못했습니다.");
      setDetail(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void loadDetail(selectedId);
  }, [loadDetail, selectedId]);

  useEffect(() => {
    if (!runtime) return;
    setRuntimeForm({
      featureEnabled: runtime.featureEnabled,
      shadowEnabled: runtime.shadowEnabled,
      draftEnabled: runtime.draftEnabled,
    });
  }, [runtime]);

  const filtered = useMemo(() => candidates.filter((candidate) => (
    (filter === "all" || candidate.state === filter)
    && (!query || `${candidate.title} ${candidate.id}`.toLowerCase().includes(query.toLowerCase()))
  )), [candidates, filter, query]);

  async function updateState(state: string) {
    if (!detail) return;
    setMessage("");
    setError("");
    const response = await fetch(`/api/editorial/candidates/${encodeURIComponent(detail.candidate.id)}`, {
      method: "PATCH",
      headers: mutationHeaders(),
      body: JSON.stringify({ generation: detail.candidate.generation, state }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "상태를 변경하지 못했습니다.");
      return;
    }
    setMessage("후보 상태를 기록했습니다.");
    setDetail(data);
    await loadList();
  }

  async function saveReview(decision: string) {
    if (!detail || reviewMemo.trim().length < 3) {
      setError("검토 메모를 3자 이상 입력하세요.");
      return;
    }
    const response = await fetch(`/api/editorial/candidates/${encodeURIComponent(detail.candidate.id)}/review`, {
      method: "POST",
      headers: mutationHeaders(),
      body: JSON.stringify({
        version: detail.candidate.currentVersion,
        reviewType: detail.candidate.highRisk.length ? "sensitive" : "general",
        decision,
        memo: reviewMemo,
        labels: [],
        isFixture: false,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "검토를 저장하지 못했습니다.");
      return;
    }
    setReviewMemo("");
    setMessage("사람 검토 기록을 저장했습니다.");
    setDetail(data);
  }

  async function inspectDraft() {
    if (!detail) return;
    const response = await fetch(`/api/editorial/candidates/${encodeURIComponent(detail.candidate.id)}/draft`, {
      method: "POST",
      headers: mutationHeaders(),
      body: JSON.stringify({ version: detail.candidate.currentVersion, dryRun: true }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "초안 준비 상태를 확인하지 못했습니다.");
      return;
    }
    setMessage(data.status === "ready" ? "근거 잠금 초안을 만들 준비가 됐습니다." : "권리가 확인된 근거가 없어 초안이 차단됩니다.");
  }

  async function importPackage() {
    setError("");
    try {
      const parsed = JSON.parse(packageText);
      const response = await fetch("/api/editorial/candidates", {
        method: "POST",
        headers: mutationHeaders(),
        body: JSON.stringify(parsed),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "근거 패키지를 가져오지 못했습니다.");
      setPackageText("");
      setMessage(`근거 패키지를 ${data.gate?.nextState || "shadow"} 상태로 기록했습니다.`);
      await loadList();
      if (data.candidate?.id) setSelectedId(data.candidate.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "JSON 형식이 올바르지 않습니다.");
    }
  }

  async function saveRuntime() {
    if (!runtime) return;
    setError("");
    const response = await fetch("/api/editorial/runtime", {
      method: "PATCH",
      headers: mutationHeaders(),
      body: JSON.stringify({
        generation: runtime.generation,
        ...runtimeForm,
        autoPublishEnabled: false,
        verifyKillSwitch: !runtimeForm.featureEnabled,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "운영 모드를 변경하지 못했습니다.");
      return;
    }
    setRuntime(data.runtime);
    setMessage("운영 모드를 감사 로그와 함께 저장했습니다.");
  }

  async function decideCorrection(correctionId: string, status: "approved" | "rejected") {
    if (!detail) return;
    const response = await fetch(
      `/api/editorial/candidates/${encodeURIComponent(detail.candidate.id)}/corrections/${encodeURIComponent(correctionId)}`,
      {
        method: "PATCH",
        headers: mutationHeaders(),
        body: JSON.stringify({ status }),
      },
    );
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "정정 결정을 저장하지 못했습니다.");
      return;
    }
    setDetail(data);
    setMessage(status === "approved" ? "정정 공지를 승인했습니다." : "정정 초안을 반려했습니다.");
  }

  const canReview = actor && ["editor", "sensitive_editor", "admin", "superadmin"].includes(actor.role);
  const runtimeOff = !runtime?.featureEnabled || !runtime?.shadowEnabled;

  return (
    <main data-editorial-lab="true" data-auto-publish-enabled="false" className="min-h-screen bg-[#f7f8fa] text-zinc-950">
      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
        <header className="flex flex-col gap-3 border-b border-zinc-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-zinc-500">
              <BookOpenCheck size={15} aria-hidden="true" />
              근거 기반 편집 운영
            </div>
            <h1 className="text-2xl font-bold">근거 편집실</h1>
            <p className="mt-1 text-sm text-zinc-600">출처 권리, 주장 근거, 사람 검토를 통과한 후보만 관리합니다.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadList()}
            className="inline-flex min-h-11 items-center justify-center gap-2 border border-zinc-300 bg-white px-4 text-sm font-semibold hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            <RefreshCw size={16} aria-hidden="true" />
            새로고침
          </button>
        </header>

        <section className="grid gap-px border-x border-b border-zinc-200 bg-zinc-200 sm:grid-cols-2 xl:grid-cols-4" aria-label="운영 상태">
          <StatusCell icon={<ShieldCheck size={17} />} label="운영 모드" value={runtime?.shadowEnabled ? "Shadow" : "비활성"} />
          <StatusCell icon={<Sparkles size={17} />} label="AI 초안" value={runtime?.draftEnabled ? "승인형 사용" : "사용 안 함"} />
          <StatusCell icon={<XCircle size={17} />} label="자동 게시" value="사용 안 함" />
          <StatusCell icon={<FileClock size={17} />} label="자동화 재평가" value={readiness?.ready ? "검토 가능" : `${readiness?.blockers.length ?? 0}개 차단`} />
        </section>

        {runtimeOff && (
          <div className="mt-4 flex gap-3 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="status">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            <div><strong>읽기 전용 상태입니다.</strong> 운영 feature 또는 shadow 플래그가 꺼져 있어 후보 추가·변경이 차단됩니다.</div>
          </div>
        )}
        {(message || error) && (
          <div className={`mt-4 border p-3 text-sm ${error ? "border-red-300 bg-red-50 text-red-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`} aria-live="polite">
            {error || message}
          </div>
        )}

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <details className="border border-zinc-200 bg-white">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-inset focus:ring-zinc-900">근거 패키지 가져오기</summary>
            <div className="border-t border-zinc-200 p-4">
              <label htmlFor="editorial-package" className="mb-1 block text-xs font-semibold text-zinc-600">검증된 evidence package JSON</label>
              <textarea
                id="editorial-package"
                value={packageText}
                onChange={(event) => setPackageText(event.target.value)}
                rows={5}
                spellCheck={false}
                className="w-full resize-y border border-zinc-300 p-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              <button type="button" disabled={runtimeOff || !packageText.trim()} onClick={() => void importPackage()} className="mt-2 min-h-11 border border-zinc-900 bg-zinc-900 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
                Shadow 후보로 기록
              </button>
            </div>
          </details>

          {actor?.role === "superadmin" && (
            <details className="border border-zinc-200 bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-inset focus:ring-zinc-900">운영 모드 제어</summary>
              <div className="border-t border-zinc-200 p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <RuntimeToggle label="편집실" checked={runtimeForm.featureEnabled} onChange={(checked) => setRuntimeForm((current) => ({ ...current, featureEnabled: checked }))} />
                  <RuntimeToggle label="Shadow" checked={runtimeForm.shadowEnabled} onChange={(checked) => setRuntimeForm((current) => ({ ...current, shadowEnabled: checked }))} />
                  <RuntimeToggle label="AI 초안" checked={runtimeForm.draftEnabled} onChange={(checked) => setRuntimeForm((current) => ({ ...current, draftEnabled: checked }))} />
                </div>
                <p className="mt-3 border border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-800">자동 게시: 사용 안 함 (변경 불가)</p>
                <button type="button" onClick={() => void saveRuntime()} className="mt-2 min-h-11 border border-zinc-900 px-4 text-sm font-semibold hover:bg-zinc-50">운영 모드 저장</button>
              </div>
            </details>
          )}
        </div>

        <div className="mt-4 grid gap-4 xl:min-h-[650px] xl:grid-cols-[390px_minmax(0,1fr)]">
          <section className="border border-zinc-200 bg-white" aria-label="편집 후보">
            <div className="grid gap-2 border-b border-zinc-200 p-3 sm:grid-cols-[1fr_140px] xl:grid-cols-1">
              <label className="sr-only" htmlFor="editorial-search">후보 검색</label>
              <input id="editorial-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목 또는 ID 검색" className="min-h-11 border border-zinc-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900" />
              <label className="sr-only" htmlFor="editorial-state">상태 필터</label>
              <select id="editorial-state" value={filter} onChange={(event) => setFilter(event.target.value)} className="min-h-11 border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900">
                <option value="all">모든 상태</option>
                {Object.entries(STATE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="max-h-[590px] overflow-y-auto">
              {loading && <p className="p-4 text-sm text-zinc-500">불러오는 중...</p>}
              {!loading && !filtered.length && <p className="p-4 text-sm text-zinc-500">조건에 맞는 후보가 없습니다.</p>}
              {filtered.map((candidate) => (
                <button
                  type="button"
                  key={candidate.id}
                  onClick={() => setSelectedId(candidate.id)}
                  className={`flex min-h-[92px] w-full items-start gap-3 border-b border-zinc-100 p-3 text-left hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-zinc-900 ${selectedId === candidate.id ? "bg-zinc-50" : "bg-white"}`}
                >
                  <FileSearch className="mt-0.5 shrink-0 text-zinc-500" size={18} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{candidate.title || "제목 없음"}</span>
                    <span className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`border px-2 py-0.5 text-xs ${stateTone(candidate.state)}`}>{STATE_LABELS[candidate.state] || candidate.state}</span>
                      <span className="text-xs text-zinc-500">{candidate.articleType}</span>
                      <span className="text-xs text-zinc-500">근거 {Math.round(candidate.evidenceCoverage * 100)}%</span>
                    </span>
                  </span>
                  <ChevronRight className="mt-1 shrink-0 text-zinc-400" size={16} />
                </button>
              ))}
            </div>
          </section>

          <section className="min-w-0 border border-zinc-200 bg-white" aria-label="후보 상세">
            {!detail ? (
              <div className="flex min-h-[240px] items-center justify-center p-8 text-sm text-zinc-500 sm:min-h-[360px] xl:min-h-[500px]">후보를 선택하세요.</div>
            ) : (
              <>
                <div className="border-b border-zinc-200 p-4 sm:p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap gap-2">
                        <span className={`border px-2 py-1 text-xs ${stateTone(detail.candidate.state)}`}>{STATE_LABELS[detail.candidate.state] || detail.candidate.state}</span>
                        {detail.candidate.highRisk.map((risk) => <span key={risk} className="border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{risk}</span>)}
                      </div>
                      <h2 className="break-words text-xl font-bold">{detail.candidate.title}</h2>
                      <p className="mt-1 break-all text-xs text-zinc-500">ID {detail.candidate.id} · v{detail.candidate.currentVersion} · {formatDate(detail.candidate.updatedAt)}</p>
                    </div>
                    <button type="button" onClick={() => void inspectDraft()} disabled={runtimeOff} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 border border-zinc-300 px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">
                      <Sparkles size={16} /> 초안 준비 확인
                    </button>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ActionButton disabled={runtimeOff} onClick={() => void updateState("review_required")}>검토 요청</ActionButton>
                    <ActionButton disabled={runtimeOff || !canReview} onClick={() => void updateState("approved")}>승인 기록</ActionButton>
                    <ActionButton disabled={runtimeOff} onClick={() => void updateState("needs_evidence")}>근거 보강</ActionButton>
                    <ActionButton disabled={runtimeOff} onClick={() => void updateState("discarded")} danger>폐기</ActionButton>
                  </div>
                </div>

                <div className="grid gap-0 lg:grid-cols-2">
                  <DetailPanel title={`주장 ${detail.claims.length}`} icon={<FileSearch size={16} />}>
                    {detail.claims.length ? detail.claims.map((claim) => (
                      <div key={String(claim.id)} className="border-b border-zinc-100 py-3 last:border-0">
                        <div className="flex justify-between gap-3 text-xs text-zinc-500"><span>{String(claim.importance)}</span><span>{String(claim.review_status)}</span></div>
                        <p className="mt-1 text-sm leading-6">{String(claim.claim_text)}</p>
                      </div>
                    )) : <EmptyText>등록된 주장이 없습니다.</EmptyText>}
                  </DetailPanel>
                  <DetailPanel title={`근거 ${detail.evidence.length}`} icon={<ShieldCheck size={16} />}>
                    {detail.evidence.length ? detail.evidence.map((evidence) => (
                      <div key={String(evidence.id)} className="border-b border-zinc-100 py-3 last:border-0">
                        <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
                          <span>{String(evidence.relation)}</span>
                          <span>{Number(evidence.evidence_eligible) === 1 && Number(evidence.fixture) !== 1 ? "사용 가능" : "사용 차단"}</span>
                          <span>{String(evidence.source_name || "")}</span>
                          <span>권리 {String(evidence.rights_grade || "D")} · {String(evidence.usage_basis || "unconfirmed")}</span>
                        </div>
                        {evidence.source_url ? (
                          <a className="mt-1 block break-all text-xs text-blue-700 underline" href={String(evidence.source_url)} target="_blank" rel="noreferrer">
                            {String(evidence.source_url)}
                          </a>
                        ) : null}
                        <p className="mt-1 line-clamp-4 text-sm leading-6">{String(evidence.excerpt || "")}</p>
                        {evidence.block_reason ? <p className="mt-1 text-xs text-red-700">차단: {String(evidence.block_reason)}</p> : null}
                      </div>
                    )) : <EmptyText>권리가 확인된 근거가 없습니다.</EmptyText>}
                  </DetailPanel>
                  <DetailPanel title={`원문 군집 ${detail.clusters.length}`} icon={<FileSearch size={16} />}>
                    {detail.clusters.length ? detail.clusters.map((cluster) => (
                      <div key={String(cluster.id)} className="border-b border-zinc-100 py-3 text-sm last:border-0">
                        <div className="flex justify-between gap-3">
                          <span className="font-semibold">독립 origin {String(cluster.independent_origin_count)}</span>
                          <span className="text-xs text-zinc-500">{Number(cluster.fixture) === 1 ? "fixture" : "실자료 후보"}</span>
                        </div>
                        <p className="mt-1 break-all text-xs text-zinc-500">source {Array.isArray(cluster.sourceIds) ? cluster.sourceIds.join(", ") : "-"}</p>
                      </div>
                    )) : <EmptyText>origin cluster가 아직 계산되지 않았습니다.</EmptyText>}
                  </DetailPanel>
                  <DetailPanel title={`사람 검토 ${detail.reviews.length}`} icon={<CheckCircle2 size={16} />}>
                    {canReview && (
                      <div className="mb-3 border-b border-zinc-200 pb-3">
                        <label className="mb-1 block text-xs font-semibold" htmlFor="review-memo">검토 메모</label>
                        <textarea id="review-memo" value={reviewMemo} onChange={(event) => setReviewMemo(event.target.value)} rows={3} className="w-full resize-y border border-zinc-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900" />
                        <div className="mt-2 flex gap-2">
                          <ActionButton disabled={runtimeOff} onClick={() => void saveReview("approved")}>검토 승인</ActionButton>
                          <ActionButton disabled={runtimeOff} onClick={() => void saveReview("changes_requested")}>수정 요청</ActionButton>
                        </div>
                      </div>
                    )}
                    {detail.reviews.length ? detail.reviews.map((review) => (
                      <div key={String(review.id)} className="border-b border-zinc-100 py-3 text-sm last:border-0">
                        <div className="flex justify-between gap-3 font-semibold">
                          <span>{String(review.decision)} · {Number(review.is_fixture) === 1 ? "fixture 검토" : "실제 편집자"}</span>
                          <span className="text-xs font-normal text-zinc-500">{String(review.reviewer_name)}</span>
                        </div>
                        <p className="mt-1 text-zinc-700">{String(review.memo)}</p>
                      </div>
                    )) : <EmptyText>실제 편집자 검토 기록이 없습니다.</EmptyText>}
                  </DetailPanel>
                  <DetailPanel title={`감사 이력 ${detail.audits.length}`} icon={<FileClock size={16} />}>
                    {detail.audits.length ? detail.audits.slice(0, 20).map((audit) => (
                      <div key={String(audit.id)} className="border-b border-zinc-100 py-3 text-sm last:border-0">
                        <div className="flex justify-between gap-3"><span className="font-semibold">{String(audit.event)}</span><span className="text-xs text-zinc-500">{formatDate(String(audit.created_at || ""))}</span></div>
                        <p className="mt-1 text-xs text-zinc-500">{String(audit.actor_name)} · {String(audit.actor_role)}</p>
                      </div>
                    )) : <EmptyText>감사 기록이 없습니다.</EmptyText>}
                  </DetailPanel>
                  <DetailPanel title={`버전 ${detail.versions.length}`} icon={<BookOpenCheck size={16} />}>
                    {detail.versions.length ? detail.versions.map((version) => (
                      <div key={String(version.version)} className="border-b border-zinc-100 py-3 text-sm last:border-0">
                        <div className="flex justify-between gap-3 font-semibold"><span>v{String(version.version)}</span><span className="text-xs font-normal text-zinc-500">{formatDate(String(version.created_at || ""))}</span></div>
                        <p className="mt-1 text-xs text-zinc-500">{String(version.change_summary || "최초 후보")}</p>
                        {(version.draft_text || version.editor_text) ? (
                          <div className="mt-2 grid gap-2 md:grid-cols-2">
                            <pre className="max-h-36 overflow-auto whitespace-pre-wrap border border-zinc-200 bg-zinc-50 p-2 text-xs">{String(version.draft_text || "AI 초안 없음")}</pre>
                            <pre className="max-h-36 overflow-auto whitespace-pre-wrap border border-zinc-200 bg-white p-2 text-xs">{String(version.editor_text || "편집자 수정 없음")}</pre>
                          </div>
                        ) : null}
                      </div>
                    )) : <EmptyText>버전 기록이 없습니다.</EmptyText>}
                  </DetailPanel>
                  <DetailPanel title={`AI·정정 ${detail.aiRuns.length + detail.corrections.length}`} icon={<FileClock size={16} />}>
                    {detail.aiRuns.map((run) => (
                      <div key={String(run.id)} className="border-b border-zinc-100 py-3 text-sm">
                        <div className="flex justify-between gap-3"><span className="font-semibold">AI {String(run.status)}</span><span className="text-xs text-zinc-500">{String(run.model)}</span></div>
                        <p className="mt-1 text-xs text-zinc-500">{String(run.prompt_version)} · {formatDate(String(run.created_at || ""))}</p>
                      </div>
                    ))}
                    {detail.corrections.map((correction) => (
                      <div key={String(correction.id)} className="border-b border-zinc-100 py-3 text-sm">
                        <div className="font-semibold">{String(correction.correction_type)} · {String(correction.status)}</div>
                        <p className="mt-1 text-zinc-700">{String(correction.public_summary)}</p>
                        {String(correction.status) === "draft" && canReview && (
                          <div className="mt-2 flex gap-2">
                            <ActionButton onClick={() => void decideCorrection(String(correction.id), "approved")}>공지 승인</ActionButton>
                            <ActionButton onClick={() => void decideCorrection(String(correction.id), "rejected")}>반려</ActionButton>
                          </div>
                        )}
                      </div>
                    ))}
                    {!detail.aiRuns.length && !detail.corrections.length && <EmptyText>AI 초안 또는 정정 기록이 없습니다.</EmptyText>}
                  </DetailPanel>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function StatusCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="bg-white p-3"><div className="flex items-center gap-2 text-xs font-semibold text-zinc-500">{icon}{label}</div><div className="mt-1 text-sm font-bold">{value}</div></div>;
}

function DetailPanel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="min-w-0 border-b border-zinc-200 p-4 lg:border-r"><h3 className="flex items-center gap-2 text-sm font-bold">{icon}{title}</h3><div className="mt-2 max-h-[360px] overflow-y-auto">{children}</div></section>;
}

function ActionButton({ children, disabled, danger, onClick }: { children: React.ReactNode; disabled?: boolean; danger?: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`min-h-11 border px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 ${danger ? "border-red-300 text-red-700 hover:bg-red-50" : "border-zinc-300 text-zinc-800 hover:bg-zinc-50"}`}>{children}</button>;
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-sm text-zinc-500">{children}</p>;
}

function RuntimeToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 border border-zinc-200 px-3 text-sm font-semibold">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-zinc-900" />
      {label}
    </label>
  );
}
