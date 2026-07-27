import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public browser smoke mode", () => {
  it("separates public pages from admin fixtures and checks desktop/mobile interactions", () => {
    const source = readFileSync("scripts/browser-smoke.mjs", "utf8");
    expect(source).toContain('args.has("--public-site-only")');
    expect(source).toContain('{ name: "desktop", width: 1440, height: 1100 }');
    expect(source).toContain('{ name: "mobile", width: 390, height: 844 }');
    expect(source).toContain('searchOverlay: true');
    expect(source).toContain('mobileMenu: viewport.name === "mobile"');
    expect(source).toContain('pageResult.checks.noHorizontalOverflow');
    expect(source).toContain('pageResult.checks.imagesLoaded');
  });

  it("downgrades known ad frames while preserving same-origin HTTP failures", () => {
    const source = readFileSync("scripts/browser-smoke.mjs", "utf8");
    expect(source).toContain("isKnownAdvertisingIframeSrc");
    expect(source).toContain('"googlesyndication.com"');
    expect(source).toContain('"ads-partners.coupang.com"');
    expect(source).toContain('"adtrafficquality.google"');
    expect(source).toContain("isKnownAdvertisingPageError");
    expect(source).toContain("Known external advertising script error");
    expect(source).toContain("if (!sameOrigin(response.url())) return;");
    expect(source).toContain("response.status() >= 400");
  });

  it("has a separate read-only admin operations mode", () => {
    const source = readFileSync("scripts/browser-smoke.mjs", "utf8");
    expect(source).toContain('args.has("--admin-ops-read-only")');
    expect(source).toContain("readOnlyNoMutation");
    expect(source).toContain('"/cam/portal-review"');
  });
});
