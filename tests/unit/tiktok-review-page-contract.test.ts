import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALIDOT_LEGAL } from "@/lib/alidot-legal";
import {
  TIKTOK_REVIEW_INTEGRATION_STATUS,
  TIKTOK_REVIEW_MODE,
  TIKTOK_REVIEW_STATUS_LABELS,
} from "@/lib/tiktok-review/fixture";

const pageSource = readFileSync("src/app/cam/alidot/tiktok-review/page.tsx", "utf8");
const formSource = readFileSync("src/app/cam/alidot/tiktok-review/TikTokReviewForm.tsx", "utf8");

describe("TikTok review prototype contract", () => {
  it("keeps the integration disconnected and blocks submission claims", () => {
    expect(ALIDOT_LEGAL.tiktokIntegrationStatus).toBe("not_connected");
    expect(TIKTOK_REVIEW_MODE).toBe("ui_demo");
    expect(TIKTOK_REVIEW_INTEGRATION_STATUS).toBe("not_connected");
    expect(TIKTOK_REVIEW_STATUS_LABELS).toContain("Production 심사 제출 금지");
    expect(formSource).toContain('data-production-submission-allowed="false"');
    expect(formSource).toContain('data-server-upload-enabled="false"');
  });

  it("sets explicit page-level noindex and creates no API route", () => {
    expect(pageSource).toContain("index: false");
    expect(pageSource).toContain("follow: false");
    expect(pageSource).toContain("noarchive: true");
    expect(existsSync("src/app/api/alidot/tiktok/review-readiness/route.ts")).toBe(false);
  });

  it("uses memory-only object URLs and contains no persistence or network client", () => {
    expect(formSource).toContain("URL.createObjectURL");
    expect(formSource).toContain("URL.revokeObjectURL");
    expect(formSource).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    expect(formSource).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/);
    expect(formSource).not.toMatch(/open\.tiktokapis\.com|open-upload\.tiktokapis\.com/);
    expect(formSource).toContain("createUnavailableReviewVideoInfo");
    expect(formSource).toContain("브라우저 미리보기만 제한된 상태입니다");
  });

  it("keeps the page internal and outside reporter access", () => {
    const layout = readFileSync("src/app/cam/layout.tsx", "utf8");
    const middleware = readFileSync("src/middleware.ts", "utf8");
    const sitemap = readFileSync("src/app/sitemap.xml/route.ts", "utf8");
    const newsSitemap = readFileSync("src/app/news-sitemap.xml/route.ts", "utf8");
    expect(layout).toContain('/cam/alidot/tiktok-review');
    expect(middleware.match(/REPORTER_ALLOWED_PATHS\s*=\s*\[[\s\S]*?\]/)?.[0]).not.toContain("tiktok/review");
    expect(sitemap).not.toContain("/cam/alidot/tiktok-review");
    expect(newsSitemap).not.toContain("/cam/alidot/tiktok-review");
  });
});
