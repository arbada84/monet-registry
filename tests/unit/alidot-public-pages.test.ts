import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALIDOT_LEGAL, ALIDOT_PATHS } from "@/lib/alidot-legal";

const siteTypes = ["netpro", "insightkorea", "culturepeople"] as const;
const alidotPages = [
  ["/alidot", "src/app/alidot/page.tsx"],
  ["/alidot/terms", "src/app/alidot/terms/page.tsx"],
  ["/alidot/privacy", "src/app/alidot/privacy/page.tsx"],
] as const;
const legalPages = ["terms", "privacy", "about", "contact", "advertising", "youth-policy"];

describe("Alidot public pages", () => {
  it("has one source of truth for the approved operator identity", () => {
    expect(ALIDOT_LEGAL.operatorName).toBe("컬피");
    expect(ALIDOT_LEGAL.representativeName).toBe("이서련");
    expect(ALIDOT_LEGAL.businessRegistrationNumber).toBe("543-26-01016");
    expect(ALIDOT_LEGAL.tiktokIntegrationStatus).toBe("not_connected");
    expect(ALIDOT_PATHS.dataDeletion).toBe("/alidot/privacy#data-deletion");
  });

  it.each(siteTypes.flatMap((siteType) => alidotPages.map(([route, file]) => [siteType, route, file] as const)))(
    "supports %s rendering for %s",
    (siteType, route, file) => {
      const source = readFileSync(file, "utf8");
      const shell = readFileSync("src/components/alidot/AlidotPublicShell.tsx", "utf8");
      expect(source).toContain("getSiteType()");
      expect(source).toContain("AlidotPublicShell");
      expect(shell).toContain(`siteType === "${siteType}"`.replace('siteType === "netpro"', "CulturepeopleHeader0"));
      expect(route.startsWith("/alidot")).toBe(true);
    },
  );

  it.each(siteTypes.flatMap((siteType) => legalPages.map((page) => [siteType, page] as const)))(
    "keeps the %s theme contract on /%s",
    (siteType, page) => {
      const source = readFileSync(`src/app/${page}/page.tsx`, "utf8");
      expect(source).toContain("getSiteType");
      if (siteType === "culturepeople") expect(source).toContain("CulturePeopleHeader");
      else if (siteType === "insightkorea") expect(source).toContain("InsightKoreaHeader");
      else expect(source).toContain("CulturepeopleHeader0");
    },
  );

  it("does not expose placeholders, the former company name, or unimplemented TikTok features", () => {
    const source = alidotPages.map(([, file]) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(/(?:\(주\))?컬처피플미디어/);
    expect(source).not.toMatch(/TODO|홍길동|준비\s*중/i);
    expect(source).toContain("현재 계정 연결이나 자동 게시 기능을 제공하지 않습니다");
    expect(source).toContain('id: "data-deletion"');
  });

  it("disables CulturePeople tracking and ads on Alidot routes", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toContain('pathname === "/alidot" || pathname.startsWith("/alidot/")');
    expect(layout.match(/!isAlidotPage/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it("keeps Alidot in the general sitemap and out of the news sitemap", () => {
    const sitemap = readFileSync("src/app/sitemap.xml/route.ts", "utf8");
    const newsSitemap = readFileSync("src/app/news-sitemap.xml/route.ts", "utf8");
    expect(sitemap).toContain("${baseUrl}/alidot");
    expect(sitemap).toContain("${baseUrl}/alidot/terms");
    expect(sitemap).toContain("${baseUrl}/alidot/privacy");
    expect(newsSitemap).not.toContain("/alidot");
  });
});
