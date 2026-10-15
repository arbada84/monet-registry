import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CORRUPT_SITE_TYPE_FALLBACK,
  DEFAULT_SITE_TYPE,
  SITE_TYPE_OPTIONS,
  getSiteTypeOption,
  resolveSiteType,
} from "@/lib/site-type-options";

describe("site type contract", () => {
  it("uses culturepeople for missing settings and netpro only for malformed values", () => {
    expect(DEFAULT_SITE_TYPE).toBe("culturepeople");
    expect(resolveSiteType(undefined)).toBe("culturepeople");
    expect(resolveSiteType(null)).toBe("culturepeople");
    expect(CORRUPT_SITE_TYPE_FALLBACK).toBe("netpro");
    expect(resolveSiteType("broken")).toBe("netpro");
    for (const type of ["netpro", "insightkorea", "culturepeople"] as const) {
      expect(resolveSiteType(type)).toBe(type);
    }
  });

  it("shares one accent definition with the administrator", () => {
    expect(SITE_TYPE_OPTIONS).toHaveLength(3);
    expect(getSiteTypeOption("netpro").accent).toBe("#E8192C");
    const adminSource = readFileSync("src/app/cam/site-type/page.tsx", "utf8");
    expect(adminSource).toContain("SITE_TYPE_OPTIONS");
    expect(adminSource).toContain("getSettingStrict");
    expect(adminSource).not.toContain("#C41422");
  });
});
