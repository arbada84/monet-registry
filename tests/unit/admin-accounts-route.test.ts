import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getTokenPayload: vi.fn(),
  serverGetSetting: vi.fn(),
  serverSaveSetting: vi.fn(),
  hashPassword: vi.fn(),
}));

vi.mock("@/lib/cookie-auth", () => ({
  getTokenPayload: mocks.getTokenPayload,
}));

vi.mock("@/lib/db-server", () => ({
  serverGetSetting: mocks.serverGetSetting,
  serverSaveSetting: mocks.serverSaveSetting,
}));

vi.mock("@/lib/password-hash", () => ({
  hashPassword: mocks.hashPassword,
}));

vi.mock("@/lib/supabase-server-db", () => {
  throw new Error("admin accounts route must not import Supabase directly");
});

import { GET, PUT } from "@/app/api/admin/accounts/route";

function request(method: "GET" | "PUT", body?: unknown) {
  return new NextRequest("https://culturepeople.co.kr/api/admin/accounts", {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function asSuperadmin() {
  mocks.getTokenPayload.mockResolvedValue({ valid: true, name: "Root", role: "superadmin" });
}

describe("/api/admin/accounts", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns account metadata without password secrets", async () => {
    asSuperadmin();
    mocks.serverGetSetting.mockResolvedValue([
      {
        id: "root",
        username: "root",
        password: "legacy",
        passwordHash: "$2b$secret",
        name: "Root",
        role: "superadmin",
        active: true,
      },
    ]);

    const response = await GET(request("GET"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.accounts).toHaveLength(1);
    expect(json.accounts[0]).toMatchObject({ id: "root", username: "root", role: "superadmin" });
    expect(json.accounts[0]).not.toHaveProperty("password");
    expect(json.accounts[0]).not.toHaveProperty("passwordHash");
  });

  it("preserves existing hashes and hashes new password updates on save", async () => {
    asSuperadmin();
    mocks.serverGetSetting.mockResolvedValue([
      {
        id: "root",
        username: "root",
        passwordHash: "$2b$root",
        name: "Root",
        role: "superadmin",
        active: true,
      },
    ]);
    mocks.hashPassword.mockImplementation(async (password: string) => `hashed:${password}`);
    mocks.serverSaveSetting.mockResolvedValue(undefined);

    const response = await PUT(request("PUT", {
      accounts: [
        { id: "root", username: "root", name: "Root Admin", role: "superadmin", active: true },
        { id: "reporter", username: "reporter", name: "Reporter", role: "reporter", active: true },
      ],
      passwordUpdates: { reporter: "Reporter123" },
    }));
    const json = await response.json();
    const saved = mocks.serverSaveSetting.mock.calls[0][1];

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mocks.serverSaveSetting).toHaveBeenCalledWith("cp-admin-accounts", expect.any(Array));
    expect(saved).toEqual([
      expect.objectContaining({ id: "root", passwordHash: "$2b$root" }),
      expect.objectContaining({ id: "reporter", passwordHash: "hashed:Reporter123" }),
    ]);
    expect(saved[0]).not.toHaveProperty("password");
    expect(saved[1]).not.toHaveProperty("password");
  });

  it("blocks non-superadmins from writing account settings", async () => {
    mocks.getTokenPayload.mockResolvedValue({ valid: true, name: "Editor", role: "admin" });

    const response = await PUT(request("PUT", { accounts: [] }));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.success).toBe(false);
    expect(mocks.serverSaveSetting).not.toHaveBeenCalled();
  });
});
