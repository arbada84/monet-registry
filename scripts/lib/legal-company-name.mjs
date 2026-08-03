import { createHash } from "node:crypto";

export const LEGACY_COMPANY_NAMES = ["(주)컬처피플미디어", "컬처피플미디어"];
export const LEGAL_POLICY_FIELDS = ["termsOfService", "privacyPolicy", "youthProtection", "emailPolicy"];

export function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function countLegacyCompanyNames(value) {
  if (typeof value !== "string") return 0;
  let remaining = value;
  let count = 0;
  for (const name of LEGACY_COMPANY_NAMES) {
    const parts = remaining.split(name);
    count += parts.length - 1;
    remaining = parts.join("");
  }
  return count;
}

export function replaceLegacyCompanyNames(value, expected = "컬피") {
  if (typeof value !== "string") return value;
  return LEGACY_COMPANY_NAMES.reduce((result, name) => result.split(name).join(expected), value);
}

export function normalizeLegalSetting(value, expected = "컬피") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { value, changedFields: [], replacements: 0 };
  }

  const normalized = { ...value };
  const changedFields = [];
  let replacements = 0;
  for (const field of LEGAL_POLICY_FIELDS) {
    const current = value[field];
    if (typeof current !== "string") continue;
    const fieldReplacements = countLegacyCompanyNames(current);
    if (fieldReplacements === 0) continue;
    normalized[field] = replaceLegacyCompanyNames(current, expected);
    changedFields.push(field);
    replacements += fieldReplacements;
  }
  return { value: normalized, changedFields, replacements };
}
