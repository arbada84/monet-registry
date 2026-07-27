import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public footer settings fallback", () => {
  it.each([
    "src/components/themes/culturepeople/CulturePeopleFooter.tsx",
    "src/components/themes/insightkorea/InsightKoreaFooter.tsx",
  ])("handles null site and about settings in %s", (path) => {
    const source = readFileSync(path, "utf8");
    expect(source).toContain("const safeSite = site || {}");
    expect(source).toContain("const safeAbout = about || {}");
    expect(source).not.toContain("site.siteName || about.companyName");
  });
});
