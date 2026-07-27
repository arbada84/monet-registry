"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, Download, FileSearch, History, Loader2, Plus, RefreshCw, RotateCcw, Save, Search, Send, ShieldCheck, TestTube2, Trash2 } from "lucide-react";

type Role = "admin" | "superadmin" | "reporter" | "";
type Subject = {
  id: string; label: string; status: "active" | "inactive"; reason: string; notes: string;
  terms: string[]; termGroups: string[][]; domains: string[];
};
type Version = {
  version: number; state: string; baseVersion: number | null; generation: number; checksum: string | null;
  subjectCount: number; ruleCount: number; createdBy: string; createdAt: string; publishedAt?: string | null;
};
type PolicyData = {
  source: "d1" | "static-fallback"; warning?: string;
  state: { publishedVersion: number; previousVersion: number | null; generation: number } | null;
  versions: Version[];
  observations: Array<{ consumer: string; policyVersion: number; checksum: string; source: string; appliedAt: string }>;
  bundle: { version: Version; subjects: Subject[]; validation?: { valid: boolean; errors: string[]; warnings: string[] } | null };
};
type PolicyAuditData = {
  reportId: string;
  checksum: string;
  counts: Record<string, number>;
  results: Array<{
    store: "articles" | "queue" | "retry";
    recordId: string;
    title: string;
    classification: string;
    subjectId: string;
  }>;
};
type Tab = "policy" | "match" | "audit" | "versions";

const control = "w-full border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-800 focus:ring-2 focus:ring-neutral-200 disabled:bg-neutral-100";
const button = "inline-flex h-9 items-center justify-center gap-2 border px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-neutral-400 disabled:cursor-not-allowed disabled:opacity-45";
const uniqueLines = (value: string) => [...new Set(value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))];
const groups = (value: string) => value.split(/\r?\n/).map((line) => line.split("+").map((item) => item.trim()).filter(Boolean)).filter((item) => item.length);
const keyHeaders = () => ({ "Content-Type": "application/json", "Idempotency-Key": `policy-ui:${crypto.randomUUID()}` });
const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "-";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.success === false) throw new Error(json.error || `HTTP ${response.status}`);
  return json as T;
}

export function BlockedSubjectPolicyManager() {
  const [data, setData] = useState<PolicyData | null>(null);
  const [role, setRole] = useState<Role>("");
  const [tab, setTab] = useState<Tab>("policy");
  const [selected, setSelected] = useState<Subject | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [matchInput, setMatchInput] = useState({ title: "", sourceUrl: "", bodyText: "" });
  const [matchResult, setMatchResult] = useState<unknown>(null);
  const [auditResult, setAuditResult] = useState<PolicyAuditData | null>(null);
  const [selectedQueueKeys, setSelectedQueueKeys] = useState<string[]>([]);
  const [publishSummary, setPublishSummary] = useState("");
  const auditReportId = auditResult?.reportId || "";
  const queueCandidates = (auditResult?.results || []).filter((item) => item.store === "queue" || item.store === "retry");

  const load = useCallback(async (version?: number) => {
    setBusy("load"); setError("");
    try {
      const [policy, me] = await Promise.all([
        requestJson<PolicyData>(`/api/auto-press/blocked-subjects${version ? `?version=${version}` : ""}`),
        requestJson<{ role: Role }>("/api/auth/me"),
      ]);
      setData(policy); setRole(me.role || "");
      setSelected((current) => structuredClone(policy.bundle.subjects.find((item) => item.id === current?.id) || policy.bundle.subjects[0] || null));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(""); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const subjects = useMemo(() => (data?.bundle.subjects || []).filter((subject) => {
    const text = `${subject.label} ${subject.id} ${subject.terms.join(" ")} ${subject.domains.join(" ")}`.toLowerCase();
    return (filter === "all" || subject.status === filter) && (!query.trim() || text.includes(query.trim().toLowerCase()));
  }), [data, filter, query]);

  async function mutate(label: string, url: string, body: unknown, method = "POST") {
    setBusy(label); setError(""); setMessage("");
    try {
      const result = await requestJson<{ bundle?: PolicyData["bundle"] }>(url, { method, headers: keyHeaders(), body: JSON.stringify(body) });
      if (result.bundle && data) {
        setData({ ...data, bundle: result.bundle });
        setSelected(structuredClone(result.bundle.subjects.find((item) => item.id === selected?.id) || result.bundle.subjects[0] || null));
      } else await load();
      setMessage(`${label} 완료`);
      return result;
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); throw cause; }
    finally { setBusy(""); }
  }

  const isDraft = ["draft", "validated"].includes(data?.bundle.version.state || "");
  const canPublish = role === "superadmin";

  if (!data && busy === "load") return <div className="flex min-h-[420px] items-center justify-center text-sm"><Loader2 className="mr-2 size-4 animate-spin" />정책을 불러오는 중입니다.</div>;

  return (
    <main className="mx-auto w-full max-w-[1480px] px-4 py-5 md:px-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200 pb-4">
        <div>
          <Link href="/cam/auto-press" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-neutral-600"><ArrowLeft className="size-3.5" />보도자료 자동등록</Link>
          <h1 className="text-xl font-bold text-neutral-950">편집정책 관리</h1>
          <p className="mt-1 text-sm text-neutral-600">auto-press 미게재 대상의 초안, 검증, 운영 버전을 관리합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`border px-2 py-1 text-xs font-semibold ${data?.source === "d1" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-900"}`}>{data?.source === "d1" ? "D1 연결" : "정적 fallback"}</span>
          <button className={`${button} border-neutral-300 bg-white`} onClick={() => void load()} disabled={Boolean(busy)}><RefreshCw className={`size-4 ${busy === "load" ? "animate-spin" : ""}`} />새로고침</button>
        </div>
      </header>

      {(error || message || data?.warning) && <div aria-live="polite" className={`mb-4 flex items-start gap-2 border px-3 py-2 text-sm ${error || data?.warning ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>{error || data?.warning ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <Check className="mt-0.5 size-4 shrink-0" />}<span>{error || message || data?.warning}</span></div>}

      <section className="mb-4 grid grid-cols-2 border border-neutral-200 bg-white md:grid-cols-4">
        {[["운영 버전", data?.state?.publishedVersion ? `v${data.state.publishedVersion}` : "fallback"], ["열린 버전", data?.bundle.version ? `v${data.bundle.version.version} · ${data.bundle.version.state}` : "-"], ["대상/규칙", `${data?.bundle.subjects.length || 0} / ${data?.bundle.version.ruleCount || 0}`], ["적용 관측", `${data?.observations.length || 0}개 소비자`]].map(([label, value]) => <div key={label} className="border-b border-r border-neutral-200 px-3 py-3 md:border-b-0"><div className="text-xs font-semibold text-neutral-500">{label}</div><div className="mt-1 text-sm font-bold">{value}</div></div>)}
      </section>

      <nav className="mb-4 flex overflow-x-auto border-b border-neutral-300" aria-label="편집정책 보기">
        {([["policy", ShieldCheck, "정책"], ["match", TestTube2, "테스트 매칭"], ["audit", FileSearch, "기존 자료 감사"], ["versions", History, "버전·동기화"]] as const).map(([value, Icon, label]) => <button key={value} onClick={() => setTab(value)} className={`inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-semibold ${tab === value ? "border-neutral-950 text-neutral-950" : "border-transparent text-neutral-500"}`}><Icon className="size-4" />{label}</button>)}
      </nav>

      {tab === "policy" && <>
        {!isDraft && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-blue-200 bg-blue-50 px-3 py-3"><span className="text-sm text-blue-950">운영 버전은 읽기 전용입니다.</span><button className={`${button} border-blue-700 bg-blue-700 text-white`} disabled={Boolean(busy) || data?.source !== "d1"} onClick={() => void mutate("초안 생성", "/api/auto-press/blocked-subjects", { action: "create-draft", baseVersion: data?.state?.publishedVersion }).catch(() => undefined)}><Plus className="size-4" />초안 만들기</button></div>}
        <div className="grid min-h-[620px] min-w-0 border border-neutral-200 bg-white xl:grid-cols-[minmax(260px,0.75fr)_minmax(0,1.4fr)]">
          <section className="min-w-0 border-b border-neutral-200 xl:border-b-0 xl:border-r">
            <div className="flex gap-2 border-b p-3"><label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-2.5 size-4 text-neutral-400" /><input className={`${control} pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="대상·규칙 검색" /></label><select className="border px-2 text-sm" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">전체</option><option value="active">활성</option><option value="inactive">비활성</option></select>{isDraft && <button className={`${button} w-9 border-neutral-300 px-0`} title="새 대상" onClick={() => setSelected({ id: `new-subject-${Date.now()}`, label: "새 미게재 대상", status: "inactive", reason: "", notes: "", terms: [], termGroups: [], domains: [] })}><Plus className="size-4" /></button>}</div>
            <div className="max-h-[650px] overflow-y-auto">{subjects.map((subject) => <button key={subject.id} onClick={() => setSelected(structuredClone(subject))} className={`flex w-full items-center gap-3 border-b border-neutral-100 px-3 py-3 text-left hover:bg-neutral-50 ${selected?.id === subject.id ? "bg-neutral-100" : ""}`}><span className={`size-2 ${subject.status === "active" ? "bg-emerald-600" : "bg-neutral-300"}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{subject.label}</span><span className="block truncate text-xs text-neutral-500">{subject.id} · 규칙 {subject.terms.length + subject.termGroups.length + subject.domains.length}</span></span></button>)}</div>
          </section>
          <section className="min-w-0 p-4 md:p-5">
            {selected ? <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-3"><div><h2 className="font-bold">{selected.label}</h2><p className="text-xs text-neutral-500">{selected.id}</p></div>{isDraft && <div className="flex gap-2"><button className={`${button} border-red-300 px-2 text-red-700`} title="삭제" onClick={() => { if (!data || !window.confirm("초안 항목을 삭제할까요?")) return; void mutate("항목 삭제", `/api/auto-press/blocked-subjects/${selected.id}`, { version: data.bundle.version.version, generation: data.bundle.version.generation }, "DELETE").catch(() => undefined); }}><Trash2 className="size-4" /></button><button className={`${button} border-neutral-900 bg-neutral-900 text-white`} onClick={() => { if (!data) return; void mutate("정책 저장", `/api/auto-press/blocked-subjects/${selected.id}`, { version: data.bundle.version.version, generation: data.bundle.version.generation, subject: selected }, "PATCH").catch(() => undefined); }}><Save className="size-4" />저장</button></div>}</div>
              <fieldset disabled={!isDraft || Boolean(busy)} className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-[1fr_160px]"><label className="text-sm font-semibold">표시명<input className={`${control} mt-1`} value={selected.label} onChange={(event) => setSelected({ ...selected, label: event.target.value })} /></label><label className="text-sm font-semibold">상태<select className={`${control} mt-1`} value={selected.status} onChange={(event) => setSelected({ ...selected, status: event.target.value as Subject["status"] })}><option value="active">활성</option><option value="inactive">비활성</option></select></label></div>
                <label className="text-sm font-semibold">정확 일치어<textarea className={`${control} mt-1 min-h-28 font-mono text-xs`} value={selected.terms.join("\n")} onChange={(event) => setSelected({ ...selected, terms: uniqueLines(event.target.value) })} /></label>
                <label className="text-sm font-semibold">AND 그룹 <span className="font-normal text-neutral-500">단어 A + 단어 B</span><textarea className={`${control} mt-1 min-h-24 font-mono text-xs`} value={selected.termGroups.map((item) => item.join(" + ")).join("\n")} onChange={(event) => setSelected({ ...selected, termGroups: groups(event.target.value) })} /></label>
                <label className="text-sm font-semibold">공식 도메인<textarea className={`${control} mt-1 min-h-24 font-mono text-xs`} value={selected.domains.join("\n")} onChange={(event) => setSelected({ ...selected, domains: uniqueLines(event.target.value) })} /></label>
                <label className="text-sm font-semibold">내부 정책 사유<textarea className={`${control} mt-1 min-h-20`} value={selected.reason} onChange={(event) => setSelected({ ...selected, reason: event.target.value })} /></label>
                <label className="text-sm font-semibold">관리자 메모<textarea className={`${control} mt-1 min-h-20`} value={selected.notes} onChange={(event) => setSelected({ ...selected, notes: event.target.value })} /></label>
              </fieldset>
            </> : <div className="flex h-full items-center justify-center text-sm text-neutral-500">정책 대상을 선택하세요.</div>}
          </section>
        </div>
      </>}

      {tab === "match" && <section className="grid border bg-white lg:grid-cols-2"><div className="border-b p-4 lg:border-b-0 lg:border-r"><h2 className="font-bold">테스트 입력</h2><div className="mt-4 grid gap-4"><input className={control} placeholder="제목" value={matchInput.title} onChange={(event) => setMatchInput({ ...matchInput, title: event.target.value })} /><input className={control} placeholder="출처 URL" value={matchInput.sourceUrl} onChange={(event) => setMatchInput({ ...matchInput, sourceUrl: event.target.value })} /><textarea className={`${control} min-h-48`} placeholder="본문" value={matchInput.bodyText} onChange={(event) => setMatchInput({ ...matchInput, bodyText: event.target.value })} /><button className={`${button} border-neutral-900 bg-neutral-900 text-white`} onClick={() => { if (!data) return; setBusy("match"); requestJson<{ match: unknown }>("/api/auto-press/blocked-subjects/match", { method: "POST", headers: keyHeaders(), body: JSON.stringify({ version: data.bundle.version.version, input: matchInput }) }).then((result) => setMatchResult(result.match)).catch((cause) => setError(cause.message)).finally(() => setBusy("")); }}><TestTube2 className="size-4" />매칭 검사</button></div></div><div className="p-4"><h2 className="font-bold">판정 결과</h2><pre aria-live="polite" className="mt-4 min-h-56 overflow-auto border bg-neutral-50 p-3 text-xs">{matchResult ? JSON.stringify(matchResult, null, 2) : "검사 전"}</pre></div></section>}

      {tab === "audit" && <section className="border bg-white p-4"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-bold">최근 6개월 읽기 전용 감사</h2><p className="mt-1 text-sm text-neutral-600">최대 500개 결과를 분류하며 기사 삭제는 수행하지 않습니다.</p></div><div className="flex flex-wrap gap-2">{auditReportId && <><a className={`${button} border-neutral-300 bg-white`} href={`/api/auto-press/blocked-subjects/dry-run/${auditReportId}/export?format=csv`}><Download className="size-4" />CSV</a><a className={`${button} border-neutral-300 bg-white`} href={`/api/auto-press/blocked-subjects/dry-run/${auditReportId}/export?format=json`}><Download className="size-4" />JSON</a></>}<button className={`${button} border-neutral-900 bg-neutral-900 text-white`} disabled={Boolean(busy) || data?.source !== "d1"} onClick={() => { if (!data) return; setBusy("audit"); setSelectedQueueKeys([]); requestJson<PolicyAuditData>("/api/auto-press/blocked-subjects/dry-run", { method: "POST", headers: keyHeaders(), body: JSON.stringify({ version: data.bundle.version.version, days: 183 }) }).then(setAuditResult).catch((cause) => setError(cause.message)).finally(() => setBusy("")); }}><FileSearch className="size-4" />dry-run 실행</button></div></div><div className="mt-4 border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"><AlertTriangle className="mr-2 inline size-4" />단순 언급·비판·피해 지원 기사는 검토 대상으로 분리됩니다.</div>{queueCandidates.length > 0 && <div className="mt-4 border"><div className="flex flex-wrap items-center justify-between gap-2 border-b bg-neutral-50 px-3 py-2"><b className="text-sm">queue/retry 후보 {queueCandidates.length}건</b><button className={`${button} border-red-300 bg-white text-red-700`} disabled={!selectedQueueKeys.length || Boolean(busy)} onClick={() => { if (!auditResult) return; const confirmation = window.prompt(`선택 ${selectedQueueKeys.length}건을 취소하려면 QUEUE CANCEL ${selectedQueueKeys.length}을 입력하세요.`); if (!confirmation) return; void mutate("큐 취소", "/api/auto-press/blocked-subjects/actions/queue-cancel", { reportId: auditResult.reportId, reportChecksum: auditResult.checksum, recordKeys: selectedQueueKeys, confirmation }).then(() => setSelectedQueueKeys([])).catch(() => undefined); }}><Trash2 className="size-4" />선택 큐 취소</button></div><div className="max-h-64 overflow-auto">{queueCandidates.map((item) => { const key = `${item.store}:${item.recordId}`; return <label key={key} className="flex cursor-pointer items-start gap-3 border-b px-3 py-2 text-sm"><input type="checkbox" className="mt-1" checked={selectedQueueKeys.includes(key)} onChange={(event) => setSelectedQueueKeys((current) => event.target.checked ? [...current, key] : current.filter((value) => value !== key))} /><span className="min-w-0"><b className="block truncate">{item.title}</b><span className="text-xs text-neutral-500">{item.store} · {item.subjectId}</span></span></label>; })}</div></div>}<pre className="mt-4 max-h-[520px] overflow-auto border bg-neutral-50 p-3 text-xs">{auditResult ? JSON.stringify({ reportId: auditResult.reportId, checksum: auditResult.checksum, counts: auditResult.counts }, null, 2) : "실행 결과가 없습니다."}</pre></section>}

      {tab === "versions" && <section className="grid gap-4 lg:grid-cols-2"><div className="border bg-white"><div className="border-b px-4 py-3 font-bold">정책 버전</div>{(data?.versions || []).map((version) => <div key={version.version} className="flex items-center gap-3 border-b px-4 py-3"><button className="min-w-0 flex-1 text-left" onClick={() => void load(version.version)}><b>v{version.version}</b><span className="ml-2 border px-1.5 py-0.5 text-xs">{version.state}</span><span className="mt-1 block text-xs text-neutral-500">{version.subjectCount}개 대상 · {version.ruleCount}개 규칙 · {formatDate(version.createdAt)}</span></button>{canPublish && data?.state?.publishedVersion !== version.version && version.checksum && <button className={`${button} border-neutral-300 px-2`} title="롤백" onClick={() => { if (!data.state || !window.confirm(`v${version.version}으로 전환할까요?`)) return; void mutate("롤백", "/api/auto-press/blocked-subjects/rollback", { targetVersion: version.version, generation: data.state.generation, reason: `관리자 화면에서 v${version.version} 복원` }).catch(() => undefined); }}><RotateCcw className="size-4" /></button>}</div>)}{isDraft && canPublish && <div className="p-4"><input className={control} value={publishSummary} onChange={(event) => setPublishSummary(event.target.value)} placeholder="변경 요약(5자 이상)" /><div className="mt-3 flex gap-2"><button className={`${button} border-neutral-300`} onClick={() => data && void mutate("검증", "/api/auto-press/blocked-subjects/validate", { version: data.bundle.version.version }).catch(() => undefined)}><ShieldCheck className="size-4" />검증</button><button className={`${button} border-emerald-700 bg-emerald-700 text-white`} disabled={publishSummary.trim().length < 5 || !data?.state} onClick={() => { if (!data?.state || !data.bundle.version.baseVersion) return; void mutate("운영 반영", "/api/auto-press/blocked-subjects/publish", { version: data.bundle.version.version, baseVersion: data.bundle.version.baseVersion, generation: data.state.generation, summary: publishSummary }).catch(() => undefined); }}><Send className="size-4" />운영 반영</button></div></div>}</div><div className="border bg-white"><div className="border-b px-4 py-3 font-bold">런타임 적용 상태</div>{data?.observations.length ? data.observations.map((item) => <div key={item.consumer} className="border-b px-4 py-3"><div className="flex justify-between gap-2"><b className="text-sm">{item.consumer}</b><span className="text-xs">v{item.policyVersion} · {item.source}</span></div><div className="mt-1 truncate font-mono text-[11px] text-neutral-500">{item.checksum}</div><div className="mt-1 text-xs text-neutral-500">{formatDate(item.appliedAt)}</div></div>) : <div className="p-4 text-sm text-neutral-500">아직 실제 적용 관측이 없습니다.</div>}</div></section>}
    </main>
  );
}
