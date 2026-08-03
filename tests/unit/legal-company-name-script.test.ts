import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  countLegacyCompanyNames,
  normalizeLegalSetting,
  replaceLegacyCompanyNames,
} from "../../scripts/lib/legal-company-name.mjs";
import { containsLegacyOperatorName } from "@/lib/legal-company-name";

describe("legal company name normalization", () => {
  it("normalizes only approved policy fields", () => {
    const original = {
      termsOfService: "(주)컬처피플미디어 약관",
      privacyPolicy: "컬처피플미디어 방침",
      auditNote: "컬처피플미디어 과거 기록",
    };
    const result = normalizeLegalSetting(original, "컬피");
    expect(result.replacements).toBe(2);
    expect(result.changedFields).toEqual(["termsOfService", "privacyPolicy"]);
    expect(result.value.termsOfService).toBe("컬피 약관");
    expect(result.value.privacyPolicy).toBe("컬피 방침");
    expect(result.value.auditNote).toBe("컬처피플미디어 과거 기록");
    expect(original.termsOfService).toContain("컬처피플미디어");
  });

  it("handles empty live settings as a safe no-op", () => {
    expect(normalizeLegalSetting(null)).toEqual({ value: null, changedFields: [], replacements: 0 });
    expect(countLegacyCompanyNames("(주)컬처피플미디어와 컬처피플미디어")).toBe(2);
    expect(replaceLegacyCompanyNames("(주)컬처피플미디어", "컬피")).toBe("컬피");
  });

  it("prevents the former operator name from being saved again in the administrator", () => {
    expect(containsLegacyOperatorName("컬피 이용약관")).toBe(false);
    expect(containsLegacyOperatorName("(주)컬처피플미디어 이용약관")).toBe(true);
    const source = readFileSync("src/app/cam/terms/page.tsx", "utf8");
    expect(source).toContain("containsLegacyOperatorName");
  });
});
