import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getDatabaseProvider: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/database-provider", () => ({
  getDatabaseProvider: mocks.getDatabaseProvider,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { GET, POST } from "@/app/api/cron/backup/route";

function authedRequest(method: "GET" | "POST", body?: unknown) {
  return new NextRequest("https://culturepeople.co.kr/api/cron/backup", {
    method,
    headers: {
      authorization: "Bearer test-cron-secret",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("/api/cron/backup", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("skips Supabase backup RPC safely while D1 is active", async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    mocks.getDatabaseProvider.mockReturnValue("d1");
    mocks.createClient.mockImplementation(() => {
      throw new Error("Supabase client should not be created for D1 backups");
    });

    const response = await GET(authedRequest("GET"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ ok: true, provider: "d1", skipped: true, action: "hourly" });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns a clear not-implemented response for manual D1 backup actions", async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    mocks.getDatabaseProvider.mockReturnValue("d1");

    const response = await POST(authedRequest("POST", { action: "backup" }));
    const json = await response.json();

    expect(response.status).toBe(501);
    expect(json).toMatchObject({ ok: false, provider: "d1", skipped: true, action: "backup" });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
