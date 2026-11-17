import { describe, expect, it } from "vitest";
import { legalSettingsReadiness, prepareLegalSettings } from "@/lib/legal-settings";
import { isApprovedYouthProtection } from "@/lib/legal-content";

const complete = {
  termsOfService: "이용약관 시행일과 이용 원칙. ".repeat(25),
  privacyPolicy: "개인정보처리방침 시행일과 처리 원칙. ".repeat(25),
  youthProtection: "청소년보호책임자\n성명: 검증담당자\n직위: 책임자\n연락처: youth@culturepeople.co.kr\n시행일: 2026-11-18\n" + "청소년의 권익 보호를 위한 정책입니다. ".repeat(5),
  emailPolicy: "이메일 무단수집 거부",
};
const actor = { name: "서버 관리자", role: "superadmin" };
const timestamp = "2026-11-18T00:00:00.000Z";

describe("representative legal approval", () => {
  it("lists missing policies without marking drafts approved", () => {
    const result = legalSettingsReadiness(null);
    expect(result.canApprove).toBe(false);
    expect(result.representativeApproved).toBe(false);
    expect(result.checks.filter(check => !check.ok)).toHaveLength(3);
  });
  it("allows saving an unapproved draft", () => {
    expect(prepareLegalSettings({}, { termsOfService: "초안", representativeApproved: false }, { name: "편집자", role: "admin" })).toMatchObject({ ok: true, value: { termsOfService: "초안", representativeApproved: false } });
  });
  it("requires real policy fields before approval", () => {
    expect(prepareLegalSettings({}, { representativeApproved: true }, actor)).toMatchObject({ ok: false, status: 400 });
  });
  it.each(["admin", "reporter", ""])("rejects an approval by role %s", role => {
    expect(prepareLegalSettings({}, { ...complete, representativeApproved: true }, { name: "actor", role })).toMatchObject({ ok: false, status: 403 });
  });
  it("records the server actor and timestamp, not body-supplied approval metadata", () => {
    const result = prepareLegalSettings({}, { ...complete, representativeApproved: true, representativeApprovedBy: "forged", representativeApprovedAt: "2099-01-01" }, actor, timestamp);
    expect(result).toMatchObject({ ok: true, value: { representativeApproved: true, representativeApprovedBy: actor.name, representativeApprovedAt: timestamp } });
  });
  it("revokes prior approval when a client changes policy text without explicitly requesting a new approval", () => {
    const existing = { ...complete, representativeApproved: true, representativeApprovedAt: timestamp, representativeApprovedBy: actor.name };
    expect(prepareLegalSettings(existing, { privacyPolicy: "변경된 초안", representativeApprovedAt: "2099-01-01" }, actor)).toMatchObject({ ok: true, value: { representativeApproved: false, representativeApprovedAt: "", representativeApprovedBy: "" } });
  });
  it("does not allow a client to forge the timestamp of unchanged approved content", () => {
    expect(prepareLegalSettings({ ...complete, representativeApproved: true, representativeApprovedAt: timestamp }, { representativeApprovedAt: "2099-01-01" }, actor)).toMatchObject({ ok: true, value: { representativeApprovedAt: timestamp } });
  });
  it.each(["성명", "직위", "연락처", "시행일"])("requires a nonempty %s value", field => {
    const invalid = complete.youthProtection.replace(new RegExp(`${field}: [^\\n]+`), `${field}: `);
    expect(isApprovedYouthProtection(invalid)).toBe(false);
  });
});
