import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { canEnableWorkerGlobalAiSettings } from "@/lib/auto-press-worker-capability";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Worker common AI capability", () => {
  it("rejects the legacy Worker instead of allowing a split provider rollout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ai: { model: "gemini-2.5-flash" } })));
    expect(await canEnableWorkerGlobalAiSettings()).toBe(false);
  });
  it("accepts only the explicit contract and readable settings", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ai: { selectionContract: "global-opt-in-v1", settingsReadable: true } })));
    expect(await canEnableWorkerGlobalAiSettings()).toBe(true);
  });
  it("fails closed on network or setting failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await canEnableWorkerGlobalAiSettings()).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ai: { selectionContract: "global-opt-in-v1", settingsReadable: false } })));
    expect(await canEnableWorkerGlobalAiSettings()).toBe(false);
  });
});
