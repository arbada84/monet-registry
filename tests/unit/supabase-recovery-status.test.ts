import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function env(overrides: Record<string, string | undefined>) {
  const previous = { ...process.env };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    process.env = previous;
  };
}

describe("supabase recovery status", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not call fetch when required Supabase env values are missing", async () => {
    const restoreEnv = env({
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_KEY: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
    });
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const { getSupabaseRecoveryStatus } = await import("@/lib/supabase-recovery-status");

    try {
      const report = await getSupabaseRecoveryStatus({ fetchImpl });

      expect(report.classification.phase).toBe("missing_env");
      expect(report.config.hasUrl).toBe(false);
      expect(report.config.hasServiceKey).toBe(false);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      restoreEnv();
    }
  });

  it("classifies Supabase 402 responses as quota restricted", async () => {
    const restoreEnv = env({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_KEY: "service-key",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });
    const fetchImpl = vi.fn(async () => jsonResponse({
      message: "Service for this project is restricted due to exceed_storage_size_quota",
    }, 402)) as unknown as typeof fetch;
    const { getSupabaseRecoveryStatus } = await import("@/lib/supabase-recovery-status");

    try {
      const report = await getSupabaseRecoveryStatus({ fetchImpl });

      expect(report.ok).toBe(false);
      expect(report.classification).toMatchObject({
        phase: "quota_restricted",
        restricted: true,
        storageRestricted: true,
        readyForDbExport: false,
        readyForStorageCopy: false,
      });
      expect(report.probes).toHaveLength(4);
    } finally {
      restoreEnv();
    }
  });

  it("classifies a rejected service role key separately from quota restriction", async () => {
    const restoreEnv = env({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_KEY: "bad-service-key",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
    });
    const fetchImpl = vi.fn(async () => jsonResponse({ message: "JWT invalid" }, 401)) as unknown as typeof fetch;
    const { getSupabaseRecoveryStatus } = await import("@/lib/supabase-recovery-status");

    try {
      const report = await getSupabaseRecoveryStatus({ fetchImpl });

      expect(report.classification).toMatchObject({
        phase: "service_key_invalid",
        restricted: false,
        readyForDbExport: false,
      });
      expect(report.probes).toHaveLength(3);
    } finally {
      restoreEnv();
    }
  });

  it("reports ready when DB and Storage probes are readable", async () => {
    const restoreEnv = env({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_KEY: "service-key",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });
    const fetchImpl = vi.fn(async () => jsonResponse([])) as unknown as typeof fetch;
    const { getSupabaseRecoveryStatus, formatSupabaseRecoveryReportSection } = await import("@/lib/supabase-recovery-status");

    try {
      const report = await getSupabaseRecoveryStatus({ fetchImpl, requireStorage: true });

      expect(report.ok).toBe(true);
      expect(report.classification).toMatchObject({
        phase: "ready_for_safe_migration",
        readyForDbExport: true,
        readyForStorageCopy: true,
      });
      const storageListCall = vi.mocked(fetchImpl).mock.calls.find(([url]) => String(url).includes("/storage/v1/object/list/"));
      expect(storageListCall?.[1]?.body).toBe(JSON.stringify({ prefix: "", limit: 1, offset: 0 }));
      expect(formatSupabaseRecoveryReportSection(report)).toContain("마이그레이션 착수 가능");
    } finally {
      restoreEnv();
    }
  });
});
