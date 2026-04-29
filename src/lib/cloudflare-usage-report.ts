import "server-only";

type UsageLevel = "ok" | "warning" | "critical";

interface UsageMetric {
  label: string;
  used: number;
  limit: number;
  unit?: string;
}

interface CloudflareGraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

interface WorkersGroup {
  sum?: {
    requests?: number;
    errors?: number;
    subrequests?: number;
  };
  quantiles?: {
    cpuTimeP50?: number;
    cpuTimeP99?: number;
  };
}

interface D1AnalyticsGroup {
  sum?: {
    readQueries?: number;
    writeQueries?: number;
    rowsRead?: number;
    rowsWritten?: number;
  };
}

interface D1StorageGroup {
  max?: {
    databaseSizeBytes?: number;
  };
}

interface R2OperationGroup {
  sum?: {
    requests?: number;
  };
  dimensions?: {
    actionType?: string;
  };
}

interface R2StorageGroup {
  max?: {
    objectCount?: number;
    uploadCount?: number;
    payloadSize?: number;
    metadataSize?: number;
  };
}

interface WorkersAnalyticsData {
  viewer?: {
    accounts?: Array<{
      workersInvocationsAdaptive?: WorkersGroup[];
    }>;
  };
}

interface D1AnalyticsData {
  viewer?: {
    accounts?: Array<{
      d1AnalyticsAdaptiveGroups?: D1AnalyticsGroup[];
      d1StorageAdaptiveGroups?: D1StorageGroup[];
    }>;
  };
}

interface R2AnalyticsData {
  viewer?: {
    accounts?: Array<{
      r2OperationsAdaptiveGroups?: R2OperationGroup[];
      r2StorageAdaptiveGroups?: R2StorageGroup[];
    }>;
  };
}

export interface CloudflareUsageReport {
  enabled: boolean;
  configured: boolean;
  ok: boolean;
  generatedAt: string;
  period: {
    start: string;
    end: string;
    label: string;
    billingCycleDay: number;
  };
  thresholds: {
    warningRatio: number;
    criticalRatio: number;
  };
  workers: {
    requests: number;
    errors: number;
    subrequests: number;
    cpuTimeP50Ms: number | null;
    cpuTimeP99Ms: number | null;
  };
  d1: {
    readQueries: number;
    writeQueries: number;
    rowsRead: number;
    rowsWritten: number;
    storageBytes: number;
  };
  r2: {
    classAOperations: number;
    classBOperations: number;
    freeOperations: number;
    unknownOperations: number;
    storageBytes: number;
    objectCount: number;
  };
  riskLevel: UsageLevel;
  warnings: string[];
  errors: string[];
}

export interface CloudflareUsageSnapshot {
  report_date: string;
  worker_requests: number;
  worker_cpu_ms: number;
  d1_rows_read: number;
  d1_rows_written: number;
  d1_storage_bytes: number;
  r2_storage_bytes: number;
  r2_class_a_ops: number;
  r2_class_b_ops: number;
  estimated_monthly_usd: number;
  raw_json: string;
}

const GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";
const DEFAULT_WORKERS_REQUEST_LIMIT = 10_000_000;
const DEFAULT_WORKERS_CPU_MS_LIMIT = 30_000_000;
const DEFAULT_D1_ROWS_READ_LIMIT = 25_000_000_000;
const DEFAULT_D1_ROWS_WRITTEN_LIMIT = 50_000_000;
const DEFAULT_D1_STORAGE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;
const DEFAULT_R2_STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;
const DEFAULT_R2_CLASS_A_LIMIT = 1_000_000;
const DEFAULT_R2_CLASS_B_LIMIT = 10_000_000;

const R2_CLASS_A_ACTIONS = new Set([
  "ListBuckets",
  "PutBucket",
  "ListObjects",
  "PutObject",
  "CopyObject",
  "CompleteMultipartUpload",
  "CreateMultipartUpload",
  "LifecycleStorageTierTransition",
  "ListMultipartUploads",
  "UploadPart",
  "UploadPartCopy",
  "ListParts",
  "PutBucketEncryption",
  "PutBucketCors",
  "PutBucketLifecycleConfiguration",
]);

const R2_CLASS_B_ACTIONS = new Set([
  "HeadBucket",
  "HeadObject",
  "GetObject",
  "UsageSummary",
  "GetBucketEncryption",
  "GetBucketLocation",
  "GetBucketCors",
  "GetBucketLifecycleConfiguration",
]);

const R2_FREE_ACTIONS = new Set(["DeleteObject", "DeleteBucket", "AbortMultipartUpload"]);

function envFlag(name: string): boolean {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function sumNumber<T>(items: T[], picker: (item: T) => number | undefined): number {
  return items.reduce((total, item) => {
    const value = Number(picker(item) || 0);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
}

function maxNumber<T>(items: T[], picker: (item: T) => number | undefined): number {
  return items.reduce((max, item) => {
    const value = Number(picker(item) || 0);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.round(value));
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function percentage(used: number, limit: number): string {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return "n/a";
  return `${((used / limit) * 100).toFixed(2)}%`;
}

function metricLevel(metric: UsageMetric, warningRatio: number, criticalRatio: number): UsageLevel {
  if (metric.limit <= 0) return "ok";
  const ratio = metric.used / metric.limit;
  if (ratio >= criticalRatio) return "critical";
  if (ratio >= warningRatio) return "warning";
  return "ok";
}

function worstLevel(levels: UsageLevel[]): UsageLevel {
  if (levels.includes("critical")) return "critical";
  if (levels.includes("warning")) return "warning";
  return "ok";
}

function kstParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function kstMidnightUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, -9, 0, 0, 0));
}

function ymd(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function sqlString(value: unknown): string {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function sqlNumber(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.max(0, Math.round(number))) : "0";
}

function cycleStart(now: Date, billingCycleDay: number): Date {
  const current = kstParts(now);
  const startThisMonth = kstMidnightUtc(current.year, current.month, billingCycleDay);
  if (now >= startThisMonth) return startThisMonth;
  return kstMidnightUtc(current.year, current.month - 1, billingCycleDay);
}

function buildPeriod(now: Date) {
  const billingCycleDay = clamp(Math.trunc(envNumber("CLOUDFLARE_BILLING_CYCLE_DAY", 1)), 1, 28);
  const start = cycleStart(now, billingCycleDay);
  return {
    start: start.toISOString(),
    end: now.toISOString(),
    label: `${ymd(start)} - ${ymd(now)} KST`,
    billingCycleDay,
  };
}

async function cloudflareGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
  fetchImpl: typeof fetch,
): Promise<T> {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim() || "";
  const response = await fetchImpl(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) as CloudflareGraphqlResponse<T> : {};
  const graphErrors = json.errors?.map((error) => error.message || "GraphQL error").filter(Boolean) || [];
  if (!response.ok || graphErrors.length > 0 || !json.data) {
    throw new Error(graphErrors.join("; ") || `Cloudflare GraphQL failed with HTTP ${response.status}`);
  }
  return json.data;
}

async function queryWorkers(period: CloudflareUsageReport["period"], fetchImpl: typeof fetch) {
  const accountTag = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || "";
  const scriptName = process.env.CLOUDFLARE_WORKER_SCRIPT_NAME?.trim()
    || process.env.CLOUDFLARE_WORKER_SCRIPT?.trim()
    || "";
  const filterScript = scriptName ? "scriptName: $scriptName," : "";
  const scriptVariable = scriptName ? ", $scriptName: string" : "";
  const query = `
    query CulturePeopleWorkersUsage($accountTag: string!, $datetimeStart: string, $datetimeEnd: string${scriptVariable}) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          workersInvocationsAdaptive(
            limit: 10000
            filter: { ${filterScript} datetime_geq: $datetimeStart, datetime_leq: $datetimeEnd }
          ) {
            sum {
              subrequests
              requests
              errors
            }
            quantiles {
              cpuTimeP50
              cpuTimeP99
            }
          }
        }
      }
    }
  `;
  const data = await cloudflareGraphql<WorkersAnalyticsData>(query, {
    accountTag,
    datetimeStart: period.start,
    datetimeEnd: period.end,
    ...(scriptName ? { scriptName } : {}),
  }, fetchImpl);
  const groups = data.viewer?.accounts?.[0]?.workersInvocationsAdaptive || [];
  return {
    requests: sumNumber(groups, (group) => group.sum?.requests),
    errors: sumNumber(groups, (group) => group.sum?.errors),
    subrequests: sumNumber(groups, (group) => group.sum?.subrequests),
    cpuTimeP50Ms: groups.length > 0 ? maxNumber(groups, (group) => group.quantiles?.cpuTimeP50) : null,
    cpuTimeP99Ms: groups.length > 0 ? maxNumber(groups, (group) => group.quantiles?.cpuTimeP99) : null,
  };
}

async function queryD1(period: CloudflareUsageReport["period"], fetchImpl: typeof fetch) {
  const accountTag = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || "";
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID?.trim()
    || process.env.D1_DATABASE_ID?.trim()
    || "";
  const databaseFilter = databaseId ? ", databaseId: $databaseId" : "";
  const databaseVariable = databaseId ? ", $databaseId: string" : "";
  const query = `
    query CulturePeopleD1Usage($accountTag: string!, $start: Date, $end: Date${databaseVariable}) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          d1AnalyticsAdaptiveGroups(
            limit: 10000
            filter: { date_geq: $start, date_leq: $end${databaseFilter} }
          ) {
            sum {
              readQueries
              writeQueries
              rowsRead
              rowsWritten
            }
          }
          d1StorageAdaptiveGroups(
            limit: 10000
            filter: { date_geq: $start, date_leq: $end${databaseFilter} }
          ) {
            max {
              databaseSizeBytes
            }
          }
        }
      }
    }
  `;
  const data = await cloudflareGraphql<D1AnalyticsData>(query, {
    accountTag,
    start: period.start.slice(0, 10),
    end: period.end.slice(0, 10),
    ...(databaseId ? { databaseId } : {}),
  }, fetchImpl);
  const account = data.viewer?.accounts?.[0];
  const analytics = account?.d1AnalyticsAdaptiveGroups || [];
  const storage = account?.d1StorageAdaptiveGroups || [];
  return {
    readQueries: sumNumber(analytics, (group) => group.sum?.readQueries),
    writeQueries: sumNumber(analytics, (group) => group.sum?.writeQueries),
    rowsRead: sumNumber(analytics, (group) => group.sum?.rowsRead),
    rowsWritten: sumNumber(analytics, (group) => group.sum?.rowsWritten),
    storageBytes: maxNumber(storage, (group) => group.max?.databaseSizeBytes),
  };
}

async function queryR2(period: CloudflareUsageReport["period"], fetchImpl: typeof fetch) {
  const accountTag = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || "";
  const bucketName = process.env.CLOUDFLARE_R2_PROD_BUCKET?.trim()
    || process.env.R2_BUCKET?.trim()
    || "";
  const bucketFilter = bucketName ? ", bucketName: $bucketName" : "";
  const bucketVariable = bucketName ? ", $bucketName: string" : "";
  const query = `
    query CulturePeopleR2Usage($accountTag: string!, $startDate: Time, $endDate: Time${bucketVariable}) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          r2OperationsAdaptiveGroups(
            limit: 10000
            filter: { datetime_geq: $startDate, datetime_leq: $endDate${bucketFilter} }
          ) {
            sum {
              requests
            }
            dimensions {
              actionType
            }
          }
          r2StorageAdaptiveGroups(
            limit: 10000
            filter: { datetime_geq: $startDate, datetime_leq: $endDate${bucketFilter} }
            orderBy: [datetime_DESC]
          ) {
            max {
              objectCount
              uploadCount
              payloadSize
              metadataSize
            }
          }
        }
      }
    }
  `;
  const data = await cloudflareGraphql<R2AnalyticsData>(query, {
    accountTag,
    startDate: period.start,
    endDate: period.end,
    ...(bucketName ? { bucketName } : {}),
  }, fetchImpl);
  const account = data.viewer?.accounts?.[0];
  const operations = account?.r2OperationsAdaptiveGroups || [];
  const storage = account?.r2StorageAdaptiveGroups || [];
  const result = {
    classAOperations: 0,
    classBOperations: 0,
    freeOperations: 0,
    unknownOperations: 0,
    storageBytes: 0,
    objectCount: 0,
  };
  for (const group of operations) {
    const action = group.dimensions?.actionType || "";
    const requests = Number(group.sum?.requests || 0);
    if (R2_CLASS_A_ACTIONS.has(action)) result.classAOperations += requests;
    else if (R2_CLASS_B_ACTIONS.has(action)) result.classBOperations += requests;
    else if (R2_FREE_ACTIONS.has(action)) result.freeOperations += requests;
    else result.unknownOperations += requests;
  }
  result.storageBytes = maxNumber(storage, (group) => Number(group.max?.payloadSize || 0) + Number(group.max?.metadataSize || 0));
  result.objectCount = maxNumber(storage, (group) => group.max?.objectCount);
  return result;
}

function limits() {
  return {
    workersRequests: envNumber("CLOUDFLARE_WORKERS_INCLUDED_REQUESTS", DEFAULT_WORKERS_REQUEST_LIMIT),
    workersCpuMs: envNumber("CLOUDFLARE_WORKERS_INCLUDED_CPU_MS", DEFAULT_WORKERS_CPU_MS_LIMIT),
    d1RowsRead: envNumber("CLOUDFLARE_D1_INCLUDED_ROWS_READ", DEFAULT_D1_ROWS_READ_LIMIT),
    d1RowsWritten: envNumber("CLOUDFLARE_D1_INCLUDED_ROWS_WRITTEN", DEFAULT_D1_ROWS_WRITTEN_LIMIT),
    d1StorageBytes: envNumber("CLOUDFLARE_D1_INCLUDED_STORAGE_BYTES", DEFAULT_D1_STORAGE_LIMIT_BYTES),
    r2StorageBytes: envNumber("CLOUDFLARE_R2_INCLUDED_STORAGE_BYTES", DEFAULT_R2_STORAGE_LIMIT_BYTES),
    r2ClassA: envNumber("CLOUDFLARE_R2_INCLUDED_CLASS_A", DEFAULT_R2_CLASS_A_LIMIT),
    r2ClassB: envNumber("CLOUDFLARE_R2_INCLUDED_CLASS_B", DEFAULT_R2_CLASS_B_LIMIT),
  };
}

export async function getCloudflareUsageReport(
  now = new Date(),
  options: { force?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<CloudflareUsageReport> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || "";
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim() || "";
  const enabled = options.force || envFlag("CLOUDFLARE_USAGE_REPORT_ENABLED");
  const period = buildPeriod(now);
  const warningRatio = clamp(envNumber("CLOUDFLARE_USAGE_WARNING_RATIO", 0.8), 0.01, 0.99);
  const criticalRatio = clamp(envNumber("CLOUDFLARE_USAGE_CRITICAL_RATIO", 0.95), warningRatio, 1);
  const report: CloudflareUsageReport = {
    enabled,
    configured: Boolean(accountId && token),
    ok: true,
    generatedAt: now.toISOString(),
    period,
    thresholds: { warningRatio, criticalRatio },
    workers: { requests: 0, errors: 0, subrequests: 0, cpuTimeP50Ms: null, cpuTimeP99Ms: null },
    d1: { readQueries: 0, writeQueries: 0, rowsRead: 0, rowsWritten: 0, storageBytes: 0 },
    r2: { classAOperations: 0, classBOperations: 0, freeOperations: 0, unknownOperations: 0, storageBytes: 0, objectCount: 0 },
    riskLevel: "ok",
    warnings: [],
    errors: [],
  };

  if (!enabled) return report;
  if (!report.configured) {
    report.ok = false;
    report.warnings.push("Cloudflare usage report is enabled, but CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN is missing.");
    report.riskLevel = "warning";
    return report;
  }

  const fetchImpl = options.fetchImpl || fetch;
  await Promise.all([
    queryWorkers(period, fetchImpl).then((value) => { report.workers = value; }).catch((error: Error) => {
      report.warnings.push(`Workers analytics unavailable: ${error.message}`);
    }),
    queryD1(period, fetchImpl).then((value) => { report.d1 = value; }).catch((error: Error) => {
      report.warnings.push(`D1 analytics unavailable: ${error.message}`);
    }),
    queryR2(period, fetchImpl).then((value) => { report.r2 = value; }).catch((error: Error) => {
      report.warnings.push(`R2 analytics unavailable: ${error.message}`);
    }),
  ]);

  const quota = limits();
  const metrics: UsageMetric[] = [
    { label: "Workers requests", used: report.workers.requests, limit: quota.workersRequests },
    { label: "D1 rows read", used: report.d1.rowsRead, limit: quota.d1RowsRead },
    { label: "D1 rows written", used: report.d1.rowsWritten, limit: quota.d1RowsWritten },
    { label: "D1 storage", used: report.d1.storageBytes, limit: quota.d1StorageBytes },
    { label: "R2 storage", used: report.r2.storageBytes, limit: quota.r2StorageBytes },
    { label: "R2 Class A", used: report.r2.classAOperations, limit: quota.r2ClassA },
    { label: "R2 Class B", used: report.r2.classBOperations, limit: quota.r2ClassB },
  ];
  const analyticsWarningLevel = report.warnings.some((warning) => warning.includes("analytics unavailable"))
    ? "warning"
    : "ok";
  report.riskLevel = worstLevel([
    ...metrics.map((metric) => metricLevel(metric, warningRatio, criticalRatio)),
    analyticsWarningLevel,
  ]);
  report.ok = report.riskLevel !== "critical" && report.errors.length === 0;

  for (const metric of metrics) {
    const level = metricLevel(metric, warningRatio, criticalRatio);
    if (level !== "ok") {
      report.warnings.push(`${metric.label} is ${percentage(metric.used, metric.limit)} of the included monthly allowance.`);
    }
  }

  if (report.workers.cpuTimeP99Ms !== null) {
    report.warnings.push("Workers CPU usage is shown as p99 per invocation; Cloudflare billing CPU-ms total should still be checked in the dashboard until total CPU analytics are added.");
  }

  return report;
}

function metricLine(label: string, used: number, limit: number, formatter = formatNumber): string {
  return `${label}: ${formatter(used)} / ${formatter(limit)} (${percentage(used, limit)})`;
}

export async function buildCloudflareUsageReportSection(
  now = new Date(),
  options: { force?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<string> {
  const report = await getCloudflareUsageReport(now, options);
  if (!report.enabled && !options.force) return "";
  return formatCloudflareUsageReportSection(report);
}

export function formatCloudflareUsageReportSection(report: CloudflareUsageReport): string {
  const quota = limits();
  const lines = [
    "<b>Cloudflare Usage Guard</b>",
    `Period: ${escapeHtml(report.period.label)} (cycle day ${report.period.billingCycleDay})`,
    `Risk: ${escapeHtml(report.riskLevel.toUpperCase())}`,
    "",
    "<b>Workers</b>",
    metricLine("Requests", report.workers.requests, quota.workersRequests),
    `Errors: ${formatNumber(report.workers.errors)} / Subrequests: ${formatNumber(report.workers.subrequests)}`,
    `CPU included allowance: ${formatNumber(quota.workersCpuMs)} ms / month`,
    report.workers.cpuTimeP99Ms === null ? "" : `CPU p99: ${formatNumber(report.workers.cpuTimeP99Ms)} ms per invocation`,
    "",
    "<b>D1</b>",
    metricLine("Rows read", report.d1.rowsRead, quota.d1RowsRead),
    metricLine("Rows written", report.d1.rowsWritten, quota.d1RowsWritten),
    metricLine("Storage", report.d1.storageBytes, quota.d1StorageBytes, formatBytes),
    `Queries: read ${formatNumber(report.d1.readQueries)} / write ${formatNumber(report.d1.writeQueries)}`,
    "",
    "<b>R2</b>",
    metricLine("Storage", report.r2.storageBytes, quota.r2StorageBytes, formatBytes),
    metricLine("Class A ops", report.r2.classAOperations, quota.r2ClassA),
    metricLine("Class B ops", report.r2.classBOperations, quota.r2ClassB),
    `Objects: ${formatNumber(report.r2.objectCount)} / free ops: ${formatNumber(report.r2.freeOperations)} / unknown ops: ${formatNumber(report.r2.unknownOperations)}`,
  ].filter(Boolean);

  const notes = [...report.errors, ...report.warnings].slice(0, 6);
  if (notes.length > 0) {
    lines.push("", "<b>Notes</b>", ...notes.map((note) => `- ${escapeHtml(note)}`));
  }

  return lines.join("\n");
}

export function buildCloudflareUsageSnapshot(report: CloudflareUsageReport): CloudflareUsageSnapshot {
  const reportDate = ymd(new Date(report.period.end || report.generatedAt));
  return {
    report_date: reportDate,
    worker_requests: Math.round(report.workers.requests || 0),
    // Cloudflare total CPU-ms is not included in this first guard yet; p99 is preserved in raw_json.
    worker_cpu_ms: 0,
    d1_rows_read: Math.round(report.d1.rowsRead || 0),
    d1_rows_written: Math.round(report.d1.rowsWritten || 0),
    d1_storage_bytes: Math.round(report.d1.storageBytes || 0),
    r2_storage_bytes: Math.round(report.r2.storageBytes || 0),
    r2_class_a_ops: Math.round(report.r2.classAOperations || 0),
    r2_class_b_ops: Math.round(report.r2.classBOperations || 0),
    estimated_monthly_usd: 0,
    raw_json: JSON.stringify(report),
  };
}

export function buildCloudflareUsageSnapshotSql(report: CloudflareUsageReport): string {
  const snapshot = buildCloudflareUsageSnapshot(report);
  const columns = [
    "report_date",
    "worker_requests",
    "worker_cpu_ms",
    "d1_rows_read",
    "d1_rows_written",
    "d1_storage_bytes",
    "r2_storage_bytes",
    "r2_class_a_ops",
    "r2_class_b_ops",
    "estimated_monthly_usd",
    "raw_json",
  ];
  const values = [
    sqlString(snapshot.report_date),
    sqlNumber(snapshot.worker_requests),
    sqlNumber(snapshot.worker_cpu_ms),
    sqlNumber(snapshot.d1_rows_read),
    sqlNumber(snapshot.d1_rows_written),
    sqlNumber(snapshot.d1_storage_bytes),
    sqlNumber(snapshot.r2_storage_bytes),
    sqlNumber(snapshot.r2_class_a_ops),
    sqlNumber(snapshot.r2_class_b_ops),
    String(snapshot.estimated_monthly_usd),
    sqlString(snapshot.raw_json),
  ];
  const updateColumns = columns.filter((column) => column !== "report_date");
  return [
    `INSERT INTO cloudflare_usage_snapshots (${columns.join(", ")})`,
    `VALUES (${values.join(", ")})`,
    "ON CONFLICT(report_date) DO UPDATE SET",
    updateColumns.map((column) => `  ${column}=excluded.${column}`).join(",\n") + ";",
  ].join("\n");
}
