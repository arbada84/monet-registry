import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), capable: vi.fn() }));
vi.mock("@/lib/db-server", () => ({ serverGetSetting: mocks.read, serverSaveSetting: mocks.save }));
vi.mock("@/lib/cookie-auth", () => ({ isAuthenticated: async () => true, verifyAuthToken: async () => ({ valid: true, name: "test", role: "superadmin" }), timingSafeEqual: (a: string, b: string) => a === b }));
vi.mock("@/lib/auto-press-worker-capability", () => ({ canEnableWorkerGlobalAiSettings: mocks.capable }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
import { POST } from "@/app/api/db/auto-press-settings/route";
import { PUT } from "@/app/api/db/settings/route";
beforeEach(() => { vi.clearAllMocks(); mocks.read.mockResolvedValue({ sources: [], keywords: [], aiProvider: "gemini", aiModel: "gemini-2.5-flash" }); mocks.capable.mockResolvedValue(false); });

describe("common AI activation gate", () => {
  it("does not write settings if the Worker is still a legacy version", async () => {
    const response = await POST(new NextRequest("https://example.test/api/db/auto-press-settings", { method: "POST", body: JSON.stringify({ useGlobalAiSettings: true }) }));
    expect(response.status).toBe(409);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("also protects the generic settings API", async () => {
    const response = await PUT(new NextRequest("https://example.test/api/db/settings", { method: "PUT", body: JSON.stringify({ key: "cp-auto-press-settings", value: { useGlobalAiSettings: true } }) }));
    expect(response.status).toBe(409);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("allows explicit activation only after the matching Worker contract is available", async () => {
    mocks.capable.mockResolvedValue(true);
    const response = await POST(new NextRequest("https://example.test/api/db/auto-press-settings", { method: "POST", body: JSON.stringify({ useGlobalAiSettings: true }) }));
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith("cp-auto-press-settings", expect.objectContaining({ useGlobalAiSettings: true }));
  });
});
