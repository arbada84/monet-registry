import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_AUTO_NEWS_SETTINGS, DEFAULT_AUTO_PRESS_SETTINGS } from "@/lib/auto-defaults";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("automatic registration publish defaults", () => {
  it("keeps automatic news stopped by default", () => {
    expect(DEFAULT_AUTO_NEWS_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_AUTO_NEWS_SETTINGS.cronEnabled).toBe(false);
    expect(DEFAULT_AUTO_NEWS_SETTINGS.publishStatus).toBe("임시저장");
  });

  it("defaults automatic press registration to published", () => {
    expect(DEFAULT_AUTO_PRESS_SETTINGS.publishStatus).toBe("게시");
    expect(DEFAULT_AUTO_PRESS_SETTINGS.author).toBe("박영래");
  });

  it("keeps queued auto-press worker jobs published when auto-publish is enabled", () => {
    const route = source("src/app/api/cron/auto-press/route.ts");
    const worker = source("cloudflare/auto-press-worker/src/index.js");

    expect(route).toContain("observationOptions.publishStatus = publishStatus");
    expect(worker).toContain('options.publishStatus || "게시"');
    expect(worker).toContain("authorProfile.name");
    expect(worker).toContain("authorProfile.email || null");
  });
});
