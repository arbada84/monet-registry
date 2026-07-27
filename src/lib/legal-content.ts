const LEGAL_PLACEHOLDER_PATTERNS = [
  /홍길동/i,
  /example\.(?:com|org|net|test)/i,
  /\bTODO\b/i,
  /법적 정보가 설정되지 않았습니다/i,
];

export const MISSING_YOUTH_PROTECTION = `청소년보호정책

청소년보호책임자 법적 정보가 설정되지 않았습니다.
운영자는 관리자 약관 설정에서 대표자가 승인한 성명, 직위, 연락처와 시행일을 등록해야 합니다.`;

export function isApprovedYouthProtection(value: unknown): value is string {
  const text = String(value || "").trim();
  if (!text || text.length < 80) return false;
  if (LEGAL_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text))) return false;
  return /청소년보호책임자/.test(text) && /성명\s*:/.test(text) && /연락처\s*:/.test(text);
}

export function resolveYouthProtection(value: unknown) {
  if (isApprovedYouthProtection(value)) return { content: String(value).trim(), approved: true as const };
  return { content: MISSING_YOUTH_PROTECTION, approved: false as const };
}

export function isApprovedLegalPolicy(value: unknown, kind: "terms" | "privacy") {
  const text = String(value || "").trim();
  if (text.length < 200 || LEGAL_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text))) return false;
  if (kind === "terms") return /이용약관|제1조/.test(text) && /시행|적용/.test(text);
  return /개인정보/.test(text) && /보호책임자|처리방침/.test(text) && /시행|적용/.test(text);
}

export function isApprovedAboutInfo(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const required = ["companyName", "ceo", "publisher", "editor", "bizNumber", "address", "email"];
  if (required.some((key) => !String(row[key] || "").trim())) return false;
  const combined = required.map((key) => String(row[key])).join("\n");
  return !LEGAL_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(combined)) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(row.email));
}

export function hasRepresentativeLegalApproval(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const timestamp = Date.parse(String(row.representativeApprovedAt || ""));
  return row.representativeApproved === true && Number.isFinite(timestamp);
}
