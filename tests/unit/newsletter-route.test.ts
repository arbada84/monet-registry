import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  serverGetSetting: vi.fn(),
  serverSaveSetting: vi.fn(),
  isAuthenticated: vi.fn(),
  verifyAuthToken: vi.fn(),
}));

vi.mock("@/lib/db-server", () => ({
  serverGetSetting: mocks.serverGetSetting,
  serverSaveSetting: mocks.serverSaveSetting,
}));

vi.mock("@/lib/cookie-auth", () => ({
  isAuthenticated: mocks.isAuthenticated,
  verifyAuthToken: mocks.verifyAuthToken,
}));

vi.mock("@/lib/redis", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/supabase-server-db", () => {
  throw new Error("newsletter route must not import Supabase directly");
});

import { GET } from "@/app/api/db/newsletter/route";

describe("GET /api/db/newsletter", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reads subscribers through the provider-aware settings store", async () => {
    mocks.isAuthenticated.mockResolvedValue(true);
    mocks.serverGetSetting.mockResolvedValue([
      {
        id: "sub-1",
        email: "reader@example.com",
        name: "Reader",
        subscribedAt: "2026-04-29",
        status: "active",
      },
    ]);
    mocks.serverSaveSetting.mockResolvedValue(undefined);

    const response = await GET(new NextRequest("https://culturepeople.co.kr/api/db/newsletter"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.subscribers).toHaveLength(1);
    expect(json.subscribers[0].token).toEqual(expect.any(String));
    expect(mocks.serverGetSetting).toHaveBeenCalledWith("cp-newsletter-subscribers", []);
    expect(mocks.serverSaveSetting).toHaveBeenCalledWith(
      "cp-newsletter-subscribers",
      expect.arrayContaining([expect.objectContaining({ id: "sub-1", token: expect.any(String) })]),
    );
  });
});
