import "server-only";

type RecoveryPhase =
  | "missing_env"
  | "project_unreachable_or_paused"
  | "service_key_invalid"
  | "quota_restricted"
  | "rest_not_ready"
  | "db_export_ready_storage_not_ready"
  | "ready_for_safe_migration"
  | "unknown";

type ProbeName =
  | "service_rest_articles"
  | "anon_rest_articles"
  | "service_storage_bucket"
  | "service_storage_list";

export interface SupabaseRecoveryProbe {
  name: ProbeName;
  ok: boolean;
  configured: boolean;
  status: number | null;
  restricted: boolean;
  authFailed: boolean;
  networkUnavailable: boolean;
  detail: string;
}

export interface SupabaseRecoveryClassification {
  ok: boolean;
  readyForDbExport: boolean;
  readyForStorageCopy: boolean;
  restricted: boolean;
  storageRestricted: boolean;
  phase: RecoveryPhase;
  nextActions: string[];
}

export interface SupabaseRecoveryStatus {
  ok: boolean;
  generatedAt: string;
  projectHost: string | null;
  bucket: string;
  config: {
    hasUrl: boolean;
    hasAnonKey: boolean;
    hasServiceKey: boolean;
  };
  probes: SupabaseRecoveryProbe[];
  classification: SupabaseRecoveryClassification;
}

interface RecoveryOptions {
  requireStorage?: boolean;
  fetchImpl?: typeof fetch;
  now?: Date;
  timeoutMs?: number;
  supabaseUrl?: string;
  serviceKey?: string;
  anonKey?: string;
  bucket?: string;
}

interface ProbeOptions {
  name: ProbeName;
  method: "GET" | "POST";
  url: string;
  key: string;
  body?: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}

const DEFAULT_BUCKET = "images";
const DEFAULT_TIMEOUT_MS = 8_000;

function cleanSupabaseUrl(value: unknown): string {
  return String(value || "").trim().replace(/\/+$/, "");
}

function projectHost(supabaseUrl: string): string | null {
  try {
    return new URL(supabaseUrl).host;
  } catch {
    return null;
  }
}

function textPreview(text: unknown): string {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function isRestrictedStatus(status: number, text: string): boolean {
  return status === 402 || /restricted|quota|exceed_storage_size_quota|payment required/i.test(text);
}

function isNetworkUnavailable(error: unknown): boolean {
  const cause = error instanceof Error && "cause" in error ? String((error as Error & { cause?: { code?: string } }).cause?.code || "") : "";
  const text = error instanceof Error ? `${error.message} ${cause}` : String(error);
  return /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|could not be resolved|resolve|dns/i.test(text);
}

function authHeaders(key: string): HeadersInit {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };
}

async function fetchWithTimeout(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function probe(options: ProbeOptions): Promise<SupabaseRecoveryProbe> {
  const { name, method, url, key, body, fetchImpl, timeoutMs } = options;
  if (!url || !key) {
    return {
      name,
      ok: false,
      configured: Boolean(url && key),
      status: null,
      restricted: false,
      authFailed: false,
      networkUnavailable: false,
      detail: "URL 또는 키가 설정되지 않았습니다.",
    };
  }

  try {
    const headers = authHeaders(key);
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetchWithTimeout(fetchImpl, url, { method, headers, body }, timeoutMs);
    const text = await response.text();
    return {
      name,
      ok: response.ok,
      configured: true,
      status: response.status,
      restricted: isRestrictedStatus(response.status, text),
      authFailed: response.status === 401 || response.status === 403,
      networkUnavailable: false,
      detail: response.ok ? "" : textPreview(text || response.statusText),
    };
  } catch (error) {
    return {
      name,
      ok: false,
      configured: true,
      status: null,
      restricted: false,
      authFailed: false,
      networkUnavailable: isNetworkUnavailable(error),
      detail: textPreview(error instanceof Error ? error.message : String(error)),
    };
  }
}

export function classifySupabaseRecovery(report: Pick<SupabaseRecoveryStatus, "config" | "probes">): SupabaseRecoveryClassification {
  const probes = report.probes;
  const configured = report.config.hasUrl && report.config.hasServiceKey;
  const anyRestricted = probes.some((item) => item.restricted);
  const anyNetworkUnavailable = probes.some((item) => item.networkUnavailable);
  const serviceRest = probes.find((item) => item.name === "service_rest_articles");
  const serviceAuthFailed = serviceRest?.authFailed === true;
  const restExportReady = serviceRest?.ok === true;
  const storageProbes = probes.filter((item) => item.name.startsWith("service_storage_"));
  const storageReady = storageProbes.length > 0 && storageProbes.every((item) => item.ok);
  const storageRestricted = storageProbes.some((item) => item.restricted);

  const nextActions: string[] = [];
  let phase: RecoveryPhase = "unknown";

  if (!configured) {
    phase = "missing_env";
    nextActions.push("NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_KEY를 먼저 설정해야 합니다.");
  } else if (anyNetworkUnavailable) {
    phase = "project_unreachable_or_paused";
    nextActions.push("Supabase 대시보드에서 프로젝트가 Resume 상태인지, 환경변수의 프로젝트 URL이 맞는지 확인합니다.");
  } else if (serviceAuthFailed && !anyRestricted) {
    phase = "service_key_invalid";
    nextActions.push("현재 service_role 키가 거부되었습니다. Supabase service_role 키를 다시 복사해 배포 환경변수에 반영합니다.");
  } else if (anyRestricted) {
    phase = "quota_restricted";
    nextActions.push("Storage quota 제한이 아직 active입니다. 제한 해제 대기, Storage 정리, Support 요청, 임시 업그레이드 중 하나가 필요합니다.");
  } else if (!restExportReady) {
    phase = "rest_not_ready";
    nextActions.push("REST 조회가 제한/인증 오류 없이 실패했습니다. 프로브 세부 메시지를 확인한 뒤 export를 진행합니다.");
  } else if (!storageReady) {
    phase = "db_export_ready_storage_not_ready";
    nextActions.push("DB export는 가능하지만 Storage 복사는 아직 대기입니다. DB부터 안전하게 export하고 이미지는 별도 복구합니다.");
  } else {
    phase = "ready_for_safe_migration";
    nextActions.push("pnpm supabase:export-for-d1 실행 후 D1 스냅샷 갱신, rehearsal, R2 검증 순서로 진행합니다.");
  }

  return {
    ok: restExportReady,
    readyForDbExport: restExportReady,
    readyForStorageCopy: storageReady,
    restricted: anyRestricted,
    storageRestricted,
    phase,
    nextActions,
  };
}

export async function getSupabaseRecoveryStatus(options: RecoveryOptions = {}): Promise<SupabaseRecoveryStatus> {
  const supabaseUrl = cleanSupabaseUrl(options.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL);
  const serviceKey = String(options.serviceKey ?? process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const anonKey = String(options.anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const bucket = String(options.bucket ?? process.env.SUPABASE_STORAGE_BUCKET ?? DEFAULT_BUCKET).trim() || DEFAULT_BUCKET;
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Math.max(1_000, options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const restUrl = supabaseUrl ? `${supabaseUrl}/rest/v1/articles?select=id&limit=1` : "";
  const bucketUrl = supabaseUrl ? `${supabaseUrl}/storage/v1/bucket/${encodeURIComponent(bucket)}` : "";
  const listUrl = supabaseUrl ? `${supabaseUrl}/storage/v1/object/list/${encodeURIComponent(bucket)}` : "";

  const probes: SupabaseRecoveryProbe[] = [];
  probes.push(await probe({
    name: "service_rest_articles",
    method: "GET",
    url: restUrl,
    key: serviceKey,
    fetchImpl,
    timeoutMs,
  }));

  if (anonKey) {
    probes.push(await probe({
      name: "anon_rest_articles",
      method: "GET",
      url: restUrl,
      key: anonKey,
      fetchImpl,
      timeoutMs,
    }));
  }

  probes.push(await probe({
    name: "service_storage_bucket",
    method: "GET",
    url: bucketUrl,
    key: serviceKey,
    fetchImpl,
    timeoutMs,
  }));

  probes.push(await probe({
    name: "service_storage_list",
    method: "POST",
    url: listUrl,
    key: serviceKey,
    body: JSON.stringify({ limit: 1, offset: 0 }),
    fetchImpl,
    timeoutMs,
  }));

  const base = {
    generatedAt: (options.now || new Date()).toISOString(),
    projectHost: projectHost(supabaseUrl),
    bucket,
    config: {
      hasUrl: Boolean(supabaseUrl),
      hasAnonKey: Boolean(anonKey),
      hasServiceKey: Boolean(serviceKey),
    },
    probes,
  };
  const classification = classifySupabaseRecovery(base);
  const ok = options.requireStorage
    ? classification.readyForDbExport && classification.readyForStorageCopy
    : classification.readyForDbExport;

  return { ...base, ok, classification };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function yesNo(value: boolean): string {
  return value ? "가능" : "대기";
}

function phaseLabel(phase: RecoveryPhase): string {
  const labels: Record<RecoveryPhase, string> = {
    missing_env: "환경변수 누락",
    project_unreachable_or_paused: "프로젝트 중지 또는 접근 불가",
    service_key_invalid: "service_role 키 오류",
    quota_restricted: "Supabase quota 제한 중",
    rest_not_ready: "REST export 대기",
    db_export_ready_storage_not_ready: "DB export 가능, Storage 대기",
    ready_for_safe_migration: "마이그레이션 착수 가능",
    unknown: "확인 필요",
  };
  return labels[phase] || phase;
}

function probeLabel(name: ProbeName): string {
  const labels: Record<ProbeName, string> = {
    service_rest_articles: "DB service 조회",
    anon_rest_articles: "DB anon 조회",
    service_storage_bucket: "Storage bucket 조회",
    service_storage_list: "Storage object 목록",
  };
  return labels[name] || name;
}

function probeStatus(probeItem: SupabaseRecoveryProbe): string {
  if (probeItem.ok) return "정상";
  if (!probeItem.configured) return "설정 누락";
  if (probeItem.restricted) return `제한(${probeItem.status ?? "n/a"})`;
  if (probeItem.authFailed) return `인증 실패(${probeItem.status ?? "n/a"})`;
  if (probeItem.networkUnavailable) return "접근 불가";
  return probeItem.status ? `실패(${probeItem.status})` : "실패";
}

export function formatSupabaseRecoveryReportSection(report: SupabaseRecoveryStatus): string {
  const classification = report.classification;
  const notes = classification.nextActions.slice(0, 3);
  const probeLines = report.probes.map((item) => {
    const detail = item.detail ? ` - ${item.detail}` : "";
    return `- ${probeLabel(item.name)}: ${probeStatus(item)}${escapeHtml(detail)}`;
  });

  return [
    "<b>Supabase 복구 감시</b>",
    `상태: ${escapeHtml(phaseLabel(classification.phase))}`,
    `프로젝트: ${escapeHtml(report.projectHost || "미설정")} / 버킷: ${escapeHtml(report.bucket)}`,
    `DB export: ${yesNo(classification.readyForDbExport)} / 이미지 복사: ${yesNo(classification.readyForStorageCopy)}`,
    `Quota 제한: ${classification.restricted ? "감지됨" : "없음"}`,
    "",
    "<b>프로브</b>",
    ...probeLines,
    notes.length > 0 ? "" : "",
    notes.length > 0 ? "<b>다음 조치</b>" : "",
    ...notes.map((note) => `- ${escapeHtml(note)}`),
  ].filter(Boolean).join("\n");
}

export async function buildSupabaseRecoveryReportSection(options: RecoveryOptions = {}): Promise<string> {
  const report = await getSupabaseRecoveryStatus(options);
  return formatSupabaseRecoveryReportSection(report);
}
