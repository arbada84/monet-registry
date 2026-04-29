import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  serverGetSetting: vi.fn(),
  serverSaveSetting: vi.fn(),
  generateAuthToken: vi.fn(),
  invalidateToken: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/db-server", () => ({
  serverGetSetting: mocks.serverGetSetting,
  serverSaveSetting: mocks.serverSaveSetting,
}));

vi.mock("@/lib/cookie-auth", () => ({
  generateAuthToken: mocks.generateAuthToken,
  invalidateToken: mocks.invalidateToken,
}));

vi.mock("@/lib/password-hash", () => ({
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword,
}));

vi.mock("@/lib/redis", () => ({ redis: null }));

vi.mock("@/lib/supabase-server-db", () => {
  throw new Error("login route must not import Supabase directly");
});

import { POST } from "@/app/api/auth/login/route";

function loginRequest(username: string, password: string) {
  return new NextRequest("https://culturepeople.co.kr/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

describe("POST /api/auth/login", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("reads admin accounts through the provider-aware settings store", async () => {
    const accounts = [
      {
        id: "admin-1",
        username: "admin",
        passwordHash: "$2b$hash",
        name: "Admin",
        role: "superadmin",
      },
    ];

    mocks.serverGetSetting.mockImplementation(async (key: string, fallback: unknown) => (
      key === "cp-admin-accounts" ? accounts : fallback
    ));
    mocks.serverSaveSetting.mockResolvedValue(undefined);
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.generateAuthToken.mockResolvedValue("signed-token");

    const response = await POST(loginRequest("admin", "secret"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ success: true, name: "Admin", role: "superadmin" });
    expect(mocks.serverGetSetting).toHaveBeenCalledWith("cp-admin-accounts", []);
    expect(mocks.verifyPassword).toHaveBeenCalledWith("secret", "$2b$hash");
    expect(mocks.serverSaveSetting).toHaveBeenCalledWith(
      "cp-admin-accounts",
      expect.arrayContaining([
        expect.objectContaining({ id: "admin-1", lastLogin: expect.any(String) }),
      ]),
    );
  });

  it("falls back to environment admin credentials when no DB account exists", async () => {
    vi.stubEnv("ADMIN_USERNAME", "env-admin");
    vi.stubEnv("ADMIN_PASSWORD", "env-secret");

    mocks.serverGetSetting.mockImplementation(async (key: string, fallback: unknown) => (
      key === "cp-admin-accounts" ? [] : fallback
    ));
    mocks.serverSaveSetting.mockResolvedValue(undefined);
    mocks.generateAuthToken.mockResolvedValue("signed-token");

    const response = await POST(loginRequest("env-admin", "env-secret"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ success: true, role: "superadmin" });
    expect(mocks.serverGetSetting).toHaveBeenCalledWith("cp-admin-accounts", []);
    expect(mocks.generateAuthToken).toHaveBeenCalledWith(expect.any(String), "superadmin");
  });
});
