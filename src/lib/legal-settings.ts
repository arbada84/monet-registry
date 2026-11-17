import { z } from "zod";
import { isApprovedLegalPolicy, isApprovedYouthProtection, hasRepresentativeLegalApproval } from "./legal-content";

const fields = ["termsOfService", "privacyPolicy", "youthProtection", "emailPolicy"] as const;
const inputSchema = z.object({
  termsOfService: z.string().max(200000).optional(), privacyPolicy: z.string().max(200000).optional(),
  youthProtection: z.string().max(200000).optional(), emailPolicy: z.string().max(200000).optional(),
  representativeApproved: z.boolean().optional(),
});
const record = (value: unknown) => z.record(z.string(), z.unknown()).safeParse(value).data ?? {};

export function legalSettingsReadiness(value: unknown) {
  const row = record(value);
  const checks = [
    { key: "termsOfService", label: "이용약관 본문과 시행일", ok: isApprovedLegalPolicy(row.termsOfService, "terms") },
    { key: "privacyPolicy", label: "개인정보처리방침 본문과 시행일", ok: isApprovedLegalPolicy(row.privacyPolicy, "privacy") },
    { key: "youthProtection", label: "청소년보호책임자 성명·직위·연락처와 시행일", ok: isApprovedYouthProtection(row.youthProtection) },
  ];
  return { checks, canApprove: checks.every(check => check.ok), representativeApproved: hasRepresentativeLegalApproval(row) };
}

export function prepareLegalSettings(existing: unknown, incoming: unknown, actor: { name: string; role: string }, timestamp = new Date().toISOString()) {
  const parsed = inputSchema.safeParse(incoming);
  if (!parsed.success) return { ok: false as const, status: 400, error: "약관 설정 형식을 확인해주세요." };
  const prior = record(existing);
  const value = { ...prior, ...parsed.data };
  if (parsed.data.representativeApproved === true) {
    if (actor.role !== "superadmin") return { ok: false as const, status: 403, error: "대표자 승인 기록은 최고관리자만 저장할 수 있습니다." };
    if (!legalSettingsReadiness(value).canApprove) return { ok: false as const, status: 400, error: "이용약관·개인정보처리방침·청소년보호책임자 정보를 모두 확인한 뒤 승인해주세요." };
    return { ok: true as const, value: { ...value, representativeApproved: true, representativeApprovedAt: timestamp, representativeApprovedBy: actor.name } };
  }
  if (parsed.data.representativeApproved === false || fields.some(field => field in parsed.data && parsed.data[field] !== prior[field])) {
    return { ok: true as const, value: { ...value, representativeApproved: false, representativeApprovedAt: "", representativeApprovedBy: "" } };
  }
  return { ok: true as const, value };
}
