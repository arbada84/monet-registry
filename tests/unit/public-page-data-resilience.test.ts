import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_SITE_TYPE } from "@/lib/site-type-options";

describe("public page data-provider resilience", () => {
  it("keeps public pages renderable when a read provider is unavailable", () => {
    const home = readFileSync("src/app/page.tsx", "utf8");
    const search = readFileSync("src/app/search/page.tsx", "utf8");
    const category = readFileSync("src/app/category/[slug]/page.tsx", "utf8");
    expect(home).toContain("Promise.allSettled");
    expect(home).toContain('siteTypeResult.status === "fulfilled" ? siteTypeResult.value : "culturepeople"');
    expect(home).toContain("export const revalidate = 60");
    expect(home).not.toContain('dynamic = "force-dynamic"');
    expect(search).toContain("Promise.allSettled");
    expect(search).toContain('popularResult.status === "fulfilled" ? popularResult.value : []');
    expect(category).toContain("Promise.allSettled");
    expect(category).toContain('articlesResult.status === "fulfilled" ? articlesResult.value : []');
    expect(category).toContain('siteTypeResult.status === "fulfilled" ? siteTypeResult.value : "culturepeople"');
  });

  it("treats an HTTP health response as server readiness even when a dependency reports 503", () => {
    const smoke = readFileSync("scripts/browser-smoke.mjs", "utf8");
    expect(smoke).toMatch(/async function probeBase\(\)[\s\S]*?await fetch\(resolveUrl\("\/api\/health"\)[\s\S]*?return true;/);
  });

  it("keeps CulturePeople branding when site settings cannot be read", () => {
    const siteType = readFileSync("src/lib/site-type.ts", "utf8");
    expect(DEFAULT_SITE_TYPE).toBe("culturepeople");
    expect(siteType).toContain("{ type: DEFAULT_SITE_TYPE }");
  });
});
