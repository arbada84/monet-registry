import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasRepresentativeLegalApproval, isApprovedAboutInfo, isApprovedLegalPolicy, isApprovedYouthProtection, resolveYouthProtection } from "@/lib/legal-content";

describe("public legal content guard", () => {
  it("never presents placeholder or incomplete youth information as approved", () => {
    expect(isApprovedYouthProtection("청소년보호책임자 - 성명: 홍길동 - 연락처: example@example.com" )).toBe(false);
    expect(resolveYouthProtection(null).approved).toBe(false);
    expect(resolveYouthProtection(null).content).toContain("설정되지 않았습니다");
  });

  it("accepts only a sufficiently complete non-placeholder representative value", () => {
    const approved = `청소년보호정책\n컬피는 청소년 보호를 위해 유해정보를 차단합니다.\n청소년보호책임자\n- 성명: 박영래\n- 직위: 책임자\n- 연락처: youth@culturepeople.co.kr\n- 시행일: 2026-07-21`;
    expect(isApprovedYouthProtection(approved)).toBe(true);
    expect(resolveYouthProtection(approved).approved).toBe(true);
  });

  it("does not keep a public hardcoded DEFAULT_YOUTH fallback", () => {
    const youthPage = readFileSync("src/app/youth-policy/page.tsx", "utf8");
    const termsPage = readFileSync("src/app/terms/page.tsx", "utf8");
    expect(youthPage).not.toContain("DEFAULT_YOUTH");
    expect(termsPage).not.toContain("DEFAULT_YOUTH");
  });

  it("requires representative company fields and stored policy text", () => {
    expect(isApprovedAboutInfo({ companyName: "회사" })).toBe(false);
    expect(isApprovedAboutInfo({ companyName: "컬피", ceo: "박영래", publisher: "박영래", editor: "박영래", bizNumber: "000-00-00000", address: "서울", email: "contact@culturepeople.co.kr" })).toBe(true);
    expect(isApprovedLegalPolicy("개인정보처리방침", "privacy")).toBe(false);
    expect(hasRepresentativeLegalApproval({ representativeApproved: true })).toBe(false);
    expect(hasRepresentativeLegalApproval({ representativeApproved: true, representativeApprovedAt: "2026-07-21T00:00:00Z" })).toBe(true);
  });
});
