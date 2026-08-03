export const LEGACY_OPERATOR_NAMES = ["(주)컬처피플미디어", "컬처피플미디어"] as const;

export function containsLegacyOperatorName(value: string): boolean {
  return LEGACY_OPERATOR_NAMES.some((name) => value.includes(name));
}
