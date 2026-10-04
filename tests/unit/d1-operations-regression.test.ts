import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

describe("D1 operations regression", () => {
  it("retains CDN sitemap cache instead of overriding it with no-store", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(config.headers.find((entry: { source: string }) => entry.source === "/sitemap.xml").headers[0].value).toContain("s-maxage=3600");
  });

  it("runs usage monitoring on the hourly scheduler without changing retry behavior", async () => {
    const scheduler = (await import("../../cloudflare/workers/auto-press-retry-scheduler.js")).default;
    const tasks: Promise<unknown>[] = [];
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ success: true, report: { riskLevel: "ok" }, sent: false })));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await scheduler.scheduled({ cron: "0 * * * *" }, { CRON_SECRET: "secret", SITE_URL: "https://culturepeople.co.kr" }, { waitUntil: (task: Promise<unknown>) => tasks.push(task) });
      await Promise.all(tasks);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls.map((call) => String(call[0]))).toContain("https://culturepeople.co.kr/api/cron/cloudflare-usage-report?send=1&alertOnly=1");
    } finally { vi.unstubAllGlobals(); }
  });
});
