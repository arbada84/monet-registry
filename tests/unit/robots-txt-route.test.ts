import { afterEach, describe, expect, it, vi } from "vitest";
import { LEGACY_DEFAULT_ROBOTS_TX } from "@/lib/seo-robots";

const mocks = vi.hoisted(() => ({
  serverGetSetting: vi.fn(),
}));

vi.mock("@/lib/db-server", () => ({
  serverGetSetting: mocks.serverGetSetting,
}));

import { GET } from "@/app/robots.txt/route";

describe("/robots.txt", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("serves the hardened CulturePeople robots policy by default", async () => {
    mocks.serverGetSetting.mockResolvedValueOnce({});

    const response = await GET();
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(response.headers.get("cache-control")).toBe("no-store, no-cache, max-age=0, must-revalidate");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("expires")).toBe("0");
    expect(text).toContain("User-agent: Mediapartners-Google\nAllow: /");
    expect(text).toContain("User-agent: Googlebot\nAllow: /\nDisallow: /cam/\nDisallow: /api/");
    expect(text).toContain("User-agent: GPTBot\nDisallow: /");
    expect(text).toContain("Sitemap: https://culturepeople.co.kr/sitemap.xml");
  });

  it("uses manually configured robots.txt content when it is not the legacy default", async () => {
    mocks.serverGetSetting.mockResolvedValueOnce({
      robotsTxt: "User-agent: TestBot\nDisallow: /private/",
    });

    const response = await GET();

    await expect(response.text()).resolves.toBe("User-agent: TestBot\nDisallow: /private/\n");
  });

  it("upgrades the old admin default instead of serving a weaker stored policy", async () => {
    mocks.serverGetSetting.mockResolvedValueOnce({
      robotsTxt: LEGACY_DEFAULT_ROBOTS_TX,
    });

    const response = await GET();
    const text = await response.text();

    expect(text).toContain("User-agent: Mediapartners-Google");
    expect(text).toContain("User-agent: GPTBot\nDisallow: /");
    expect(text).toContain("User-agent: *\nAllow: /\nDisallow: /cam/\nDisallow: /api/\nCrawl-delay: 10");
  });

  it("keeps emergency noindex mode stronger than any custom content", async () => {
    mocks.serverGetSetting.mockResolvedValueOnce({
      robotsNoIndex: true,
      robotsTxt: "User-agent: *\nAllow: /",
    });

    const response = await GET();

    await expect(response.text()).resolves.toBe("User-agent: *\nDisallow: /\n");
  });

  it("falls back to the hardened policy when settings lookup fails", async () => {
    mocks.serverGetSetting.mockRejectedValueOnce(new Error("settings unavailable"));

    const response = await GET();
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain("User-agent: Mediapartners-Google");
    expect(text).toContain("Sitemap: https://culturepeople.co.kr/sitemap.xml");
  });
});
