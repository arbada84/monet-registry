import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("auto-press worker dispatch helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("reports dispatch configuration without exposing secret values", async () => {
    vi.stubEnv("AUTO_PRESS_WORKER_ENQUEUE_URL", "https://worker.example/enqueue");
    vi.stubEnv("AUTO_PRESS_WORKER_SECRET", "worker-secret");
    vi.stubEnv("AUTO_PRESS_WORKER_DISPATCH_ENABLED", "true");

    const { getAutoPressWorkerDispatchStatus } = await import("@/lib/auto-press-worker-dispatch");

    expect(getAutoPressWorkerDispatchStatus()).toEqual({
      configured: true,
      enabled: true,
      hasEnqueueUrl: true,
      hasSecret: true,
    });
  });

  it("posts run dispatch requests with the worker secret bearer header", async () => {
    vi.stubEnv("AUTO_PRESS_WORKER_ENQUEUE_URL", "https://worker.example/enqueue");
    vi.stubEnv("AUTO_PRESS_WORKER_SECRET", "worker-secret");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: true,
      enqueued: 4,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    const { dispatchAutoPressWorker } = await import("@/lib/auto-press-worker-dispatch");
    await expect(dispatchAutoPressWorker({ runId: "press_1", limit: 4 })).resolves.toMatchObject({
      configured: true,
      ok: true,
      status: 200,
      enqueued: 4,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://worker.example/enqueue");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer worker-secret",
    });
    expect(JSON.parse(String(init.body))).toEqual({ runId: "press_1", limit: 4 });
  });

  it("blocks dispatch network calls when the rollout flag is disabled", async () => {
    vi.stubEnv("AUTO_PRESS_WORKER_ENQUEUE_URL", "https://worker.example/enqueue");
    vi.stubEnv("AUTO_PRESS_WORKER_SECRET", "worker-secret");
    vi.stubEnv("AUTO_PRESS_WORKER_DISPATCH_ENABLED", "false");
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const { dispatchAutoPressWorker } = await import("@/lib/auto-press-worker-dispatch");
    await expect(dispatchAutoPressWorker({ runId: "press_1" })).resolves.toMatchObject({
      configured: true,
      ok: false,
      error: expect.stringContaining("AUTO_PRESS_WORKER_DISPATCH_ENABLED"),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the process endpoint fallback and secret header for manual queue processing", async () => {
    vi.stubEnv("AUTO_PRESS_WORKER_ENQUEUE_URL", "https://worker.example/enqueue");
    vi.stubEnv("AUTO_PRESS_WORKER_SECRET", "worker-secret");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: true,
      processed: 2,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    const { processAutoPressWorkerQueue } = await import("@/lib/auto-press-worker-dispatch");
    await expect(processAutoPressWorkerQueue({ limit: 2 })).resolves.toMatchObject({
      configured: true,
      ok: true,
      status: 200,
      processed: 2,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://worker.example/process");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer worker-secret",
    });
    expect(JSON.parse(String(init.body))).toEqual({ limit: 2 });
  });
});
