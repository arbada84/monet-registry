import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  serverGetSetting: vi.fn(),
}));

vi.mock("@/lib/db-server", () => ({
  serverGetSetting: mocks.serverGetSetting,
}));

describe("server AI settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to an empty settings object when the stored value is null", async () => {
    mocks.serverGetSetting.mockResolvedValueOnce(null);

    const { serverGetAiSettings } = await import("@/lib/ai-settings-server");
    await expect(serverGetAiSettings()).resolves.toEqual({});
    expect(mocks.serverGetSetting).toHaveBeenCalledWith("cp-ai-settings", {});
  });

  it("preserves valid stored AI settings", async () => {
    mocks.serverGetSetting.mockResolvedValueOnce({ geminiApiKey: "AI_test", provider: "gemini" });

    const { serverGetAiSettings } = await import("@/lib/ai-settings-server");
    await expect(serverGetAiSettings()).resolves.toEqual({ geminiApiKey: "AI_test", provider: "gemini" });
  });
});
