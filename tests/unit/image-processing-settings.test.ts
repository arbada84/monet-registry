import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  store: {
    readSiteSetting: vi.fn(),
  },
}));

vi.mock("@/lib/site-settings-store", () => mocks.store);

describe("image processing settings", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("reads watermark settings through the shared site settings store", async () => {
    mocks.store.readSiteSetting.mockResolvedValueOnce({
      enabled: true,
      type: "text",
      text: "CulturePeople",
      opacity: 0.7,
      size: 25,
    });

    const { getWatermarkSettings, DEFAULT_WATERMARK_SETTINGS } = await import("@/lib/image-processing-settings");

    await expect(getWatermarkSettings()).resolves.toEqual({
      ...DEFAULT_WATERMARK_SETTINGS,
      enabled: true,
      text: "CulturePeople",
      opacity: 0.7,
      size: 25,
    });
    expect(mocks.store.readSiteSetting).toHaveBeenCalledWith(
      "cp-watermark-settings",
      DEFAULT_WATERMARK_SETTINGS,
      { useServiceKey: true },
    );
  });

  it("normalizes stringified image upload settings and clamps unsafe values", async () => {
    mocks.store.readSiteSetting.mockResolvedValueOnce(JSON.stringify({
      enabled: false,
      maxWidth: 9000,
      quality: -5,
    }));

    const { getImageUploadSettings } = await import("@/lib/image-processing-settings");

    await expect(getImageUploadSettings()).resolves.toEqual({
      enabled: false,
      maxWidth: 4096,
      quality: 1,
    });
  });
});
