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
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
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

  it("uses the Gemini environment key when the stored key is blank", async () => {
    process.env.GEMINI_API_KEY = "AIza_env_key";

    const { resolveAiApiKey } = await import("@/lib/ai-settings-server");
    expect(resolveAiApiKey({ geminiApiKey: "" }, "gemini")).toBe("AIza_env_key");
  });

  it("ignores accidentally stored masked API keys and falls back to env", async () => {
    process.env.GEMINI_API_KEY = "AIza_env_key";
    process.env.OPENAI_API_KEY = "sk-env-key";

    const { resolveAiApiKey } = await import("@/lib/ai-settings-server");
    expect(resolveAiApiKey({ geminiApiKey: "AIz****abcd" }, "gemini")).toBe("AIza_env_key");
    expect(resolveAiApiKey({ openaiApiKey: "sk-****abcd" }, "openai")).toBe("sk-env-key");
  });
});
