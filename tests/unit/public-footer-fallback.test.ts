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

  it.each([
    "src/app/about/page.tsx",
    "src/app/contact/page.tsx",
  ])("does not expose the business address on public information page %s", (path) => {
    const source = readFileSync(path, "utf8");
    expect(source).not.toContain('["주소", about.address]');
    expect(source).not.toContain("주소: {address}");
    expect(source).not.toContain("about?.address");
  });

  it.each([
    "src/components/themes/culturepeople/CulturePeopleFooter.tsx",
    "src/components/themes/insightkorea/InsightKoreaFooter.tsx",
    "src/components/registry/culturepeople-footer-6/index.tsx",
  ])("does not expose the business address in %s", (path) => {
    const source = readFileSync(path, "utf8");
    expect(source).not.toContain('label: "주소"');
    expect(source).not.toMatch(/\b(?:site|siteInfo|safeSite|safeAbout)\.address\b/);
  });

  it.each([
    "src/components/themes/culturepeople/CulturePeopleFooter.tsx",
    "src/components/themes/insightkorea/InsightKoreaFooter.tsx",
    "src/components/registry/culturepeople-footer-6/index.tsx",
  ])("always links Alidot even when custom menus are configured in %s", (path) => {
    const source = readFileSync(path, "utf8");
    expect(source).toContain('{ label: "알리닷", href: "/alidot" }');
    expect(source).toContain("ensureAlidotLink(footerItems)");
  });
});
