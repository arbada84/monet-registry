import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  serverGetSetting: vi.fn(),
}));

vi.mock("@/lib/db-server", () => ({
  serverGetSetting: mocks.serverGetSetting,
}));

import { GET } from "@/app/ads.txt/route";

describe("/ads.txt", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("serves the CulturePeople AdSense seller line when settings are empty", async () => {
    mocks.serverGetSetting.mockResolvedValueOnce({});

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    await expect(response.text()).resolves.toBe("google.com, pub-7637714403564102, DIRECT, f08c47fec0942fa0\n");
  });

  it("uses manually configured ads.txt content when present", async () => {
    mocks.serverGetSetting.mockResolvedValueOnce({
      adsTxtContent: "google.com, pub-manual, DIRECT, f08c47fec0942fa0",
    });

    const response = await GET();

    await expect(response.text()).resolves.toBe("google.com, pub-manual, DIRECT, f08c47fec0942fa0\n");
  });

  it("generates ads.txt from ca-pub publisher IDs", async () => {
    mocks.serverGetSetting.mockResolvedValueOnce({
      adsensePublisherId: "ca-pub-1234567890123456",
    });

    const response = await GET();

    await expect(response.text()).resolves.toBe("google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
  });

  it("falls back to the default seller line when settings lookup fails", async () => {
    mocks.serverGetSetting.mockRejectedValueOnce(new Error("settings unavailable"));

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("google.com, pub-7637714403564102, DIRECT, f08c47fec0942fa0\n");
  });

  it("falls back to the default seller line when settings are null", async () => {
    mocks.serverGetSetting.mockResolvedValueOnce(null);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("google.com, pub-7637714403564102, DIRECT, f08c47fec0942fa0\n");
  });
});
