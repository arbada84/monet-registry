import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("auto-press worker dispatch URL normalization", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AUTO_PRESS_WORKER_ENQUEUE_URL;
    delete process.env.AUTO_PRESS_WORKER_PROCESS_URL;
    delete process.env.AUTO_PRESS_WORKER_SECRET;
  });

  it("removes accidentally persisted escaped line endings before dispatch", async () => {
    process.env.AUTO_PRESS_WORKER_ENQUEUE_URL = "https://worker.example/enqueue \\r\\n";
    process.env.AUTO_PRESS_WORKER_SECRET = "secret";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, enqueued: 1 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { dispatchAutoPressWorker } = await import("@/lib/auto-press-worker-dispatch");

    await expect(dispatchAutoPressWorker({ runId: "run-1" })).resolves.toMatchObject({ ok: true, enqueued: 1 });
    expect(fetchMock).toHaveBeenCalledWith("https://worker.example/enqueue", expect.any(Object));
  });
});
