import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/get-base-url", () => ({
  getBaseUrl: () => "https://culturepeople.co.kr",
}));

describe("notify-search helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("submits IndexNow requests with server auth and a timeout signal", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, indexNow: { submitted: true, status: 202 } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { notifyIndexNow } = await import("@/lib/notify-search");

    const result = await notifyIndexNow(301, "URL_DELETED");
    const [, init] = fetchMock.mock.calls[0];

    expect(fetchMock).toHaveBeenCalledWith(
      "https://culturepeople.co.kr/api/seo/index-now",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer cron-secret" },
        body: JSON.stringify({ url: "https://culturepeople.co.kr/article/301", action: "URL_DELETED" }),
      }),
    );
    expect(init.signal).toBeDefined();
    expect(result).toMatchObject({
      ok: true,
      submitted: true,
      skipped: false,
      status: 202,
      url: "https://culturepeople.co.kr/article/301",
      action: "URL_DELETED",
    });
  });

  it("does not call the retired Google sitemap ping endpoint", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { submitGooglePing } = await import("@/lib/notify-search");

    const result = await submitGooglePing();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      submitted: false,
      skipped: true,
      url: "https://culturepeople.co.kr/sitemap.xml",
    });
  });
});
