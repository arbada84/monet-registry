import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("cloudflare usage report", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("stays silent in the daily report when Cloudflare usage is not configured", async () => {
    const { buildCloudflareUsageReportSection } = await import("@/lib/cloudflare-usage-report");

    await expect(buildCloudflareUsageReportSection()).resolves.toBe("");
  });

  it("builds a Workers, D1, and R2 usage section from GraphQL analytics", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token-value");
    vi.stubEnv("CLOUDFLARE_USAGE_REPORT_ENABLED", "true");
    vi.stubEnv("CLOUDFLARE_BILLING_CYCLE_DAY", "28");
    vi.stubEnv("CLOUDFLARE_WORKER_SCRIPT_NAME", "culturepeople");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "d1-id");
    vi.stubEnv("CLOUDFLARE_R2_PROD_BUCKET", "culturepeople-media-prod");

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body || "{}"));
      const query = String(payload.query || "");
      if (query.includes("workersInvocationsAdaptive")) {
        return okJson({
          data: {
            viewer: {
              accounts: [{
                workersInvocationsAdaptive: [{
                  sum: { requests: 1234, errors: 2, subrequests: 88 },
                  quantiles: { cpuTimeP50: 2, cpuTimeP99: 15 },
                }],
              }],
            },
          },
        });
      }
      if (query.includes("d1AnalyticsAdaptiveGroups")) {
        return okJson({
          data: {
            viewer: {
              accounts: [{
                d1AnalyticsAdaptiveGroups: [{
                  sum: { readQueries: 10, writeQueries: 4, rowsRead: 1500, rowsWritten: 120 },
                }],
                d1StorageAdaptiveGroups: [{
                  max: { databaseSizeBytes: 1_048_576 },
                }],
              }],
            },
          },
        });
      }
      return okJson({
        data: {
          viewer: {
            accounts: [{
              r2OperationsAdaptiveGroups: [
                { sum: { requests: 500 }, dimensions: { actionType: "PutObject" } },
                { sum: { requests: 1000 }, dimensions: { actionType: "GetObject" } },
                { sum: { requests: 2 }, dimensions: { actionType: "DeleteObject" } },
                { sum: { requests: 3 }, dimensions: { actionType: "CustomUnknown" } },
              ],
              r2StorageAdaptiveGroups: [{
                max: { objectCount: 12, payloadSize: 2_097_152, metadataSize: 1024 },
              }],
            }],
          },
        },
      });
    }) as unknown as typeof fetch;

    const { buildCloudflareUsageReportSection } = await import("@/lib/cloudflare-usage-report");
    const report = await buildCloudflareUsageReportSection(
      new Date("2026-04-28T03:00:00.000Z"),
      { fetchImpl: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(report).toContain("<b>Cloudflare Usage Guard</b>");
    expect(report).toContain("Period: 2026-04-28 - 2026-04-28 KST (cycle day 28)");
    expect(report).toContain("Requests: 1,234 / 10,000,000");
    expect(report).toContain("Rows read: 1,500 / 25,000,000,000");
    expect(report).toContain("Rows written: 120 / 50,000,000");
    expect(report).toContain("Storage: 2.0 MB / 10.0 GB");
    expect(report).toContain("Class A ops: 500 / 1,000,000");
    expect(report).toContain("Class B ops: 1,000 / 10,000,000");
  });

  it("returns a safe forced report when credentials are missing", async () => {
    const { buildCloudflareUsageReportSection } = await import("@/lib/cloudflare-usage-report");

    const report = await buildCloudflareUsageReportSection(new Date("2026-04-28T03:00:00.000Z"), { force: true });

    expect(report).toContain("Risk: WARNING");
    expect(report).toContain("CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN is missing");
  });

  it("marks the report as warning when Cloudflare analytics cannot be read", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "bad-token");
    vi.stubEnv("CLOUDFLARE_USAGE_REPORT_ENABLED", "true");
    const fetchMock = vi.fn(async () => okJson({
      errors: [{ message: "Invalid API Token" }],
    })) as unknown as typeof fetch;

    const { getCloudflareUsageReport, formatCloudflareUsageReportSection } = await import("@/lib/cloudflare-usage-report");
    const report = await getCloudflareUsageReport(new Date("2026-04-28T03:00:00.000Z"), { fetchImpl: fetchMock });
    const section = formatCloudflareUsageReportSection(report);

    expect(report.riskLevel).toBe("warning");
    expect(report.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("Workers analytics unavailable"),
      expect.stringContaining("D1 analytics unavailable"),
      expect.stringContaining("R2 analytics unavailable"),
    ]));
    expect(section).toContain("Risk: WARNING");
  });

  it("builds idempotent D1 SQL for usage snapshots without leaking formatting issues", async () => {
    const { buildCloudflareUsageSnapshotSql } = await import("@/lib/cloudflare-usage-report");
    const sql = buildCloudflareUsageSnapshotSql({
      enabled: true,
      configured: true,
      ok: true,
      generatedAt: "2026-04-28T03:00:00.000Z",
      period: {
        start: "2026-04-27T15:00:00.000Z",
        end: "2026-04-28T03:00:00.000Z",
        label: "2026-04-28 - 2026-04-28 KST",
        billingCycleDay: 28,
      },
      thresholds: { warningRatio: 0.8, criticalRatio: 0.95 },
      workers: { requests: 1234, errors: 0, subrequests: 5, cpuTimeP50Ms: 1, cpuTimeP99Ms: 9 },
      d1: { readQueries: 10, writeQueries: 2, rowsRead: 1500, rowsWritten: 20, storageBytes: 4096 },
      r2: { classAOperations: 100, classBOperations: 200, freeOperations: 1, unknownOperations: 0, storageBytes: 2048, objectCount: 7 },
      riskLevel: "ok",
      warnings: ["single quote ' is escaped"],
      errors: [],
    });

    expect(sql).toContain("INSERT INTO cloudflare_usage_snapshots");
    expect(sql).toContain("'2026-04-28'");
    expect(sql).toContain("1234");
    expect(sql).toContain("ON CONFLICT(report_date) DO UPDATE SET");
    expect(sql).toContain("single quote '' is escaped");
  });
});
