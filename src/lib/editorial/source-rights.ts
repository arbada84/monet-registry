import type { EditorialPackage } from "@/lib/editorial/schema";

function parseAllowedUses(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function applyEditorialSourceRightsSnapshot(
  pkg: EditorialPackage,
  trusted: Map<string, Record<string, unknown>>,
): EditorialPackage {
  const sources = pkg.sources.map((source) => {
    const policy = trusted.get(source.id);
    const fixture = source.fixture || Number(policy?.fixture || 0) === 1;
    return {
      ...source,
      fixture,
      usageBasis: fixture ? "synthetic_fixture" : String(policy?.usage_basis || "unconfirmed"),
      rightsGrade: (fixture ? "X" : String(policy?.rights_grade || "D")) as EditorialPackage["sources"][number]["rightsGrade"],
      allowedUses: fixture ? [] : parseAllowedUses(policy?.allowed_uses_json),
      evidenceEligible: !fixture && Number(policy?.evidence_eligible || 0) === 1,
      trainingEligible: !fixture && Number(policy?.training_eligible || 0) === 1,
    };
  });
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const evidence = pkg.evidence.map((item) => {
    const source = sourceById.get(item.sourceId);
    return {
      ...item,
      fixture: item.fixture || Boolean(source?.fixture),
      evidenceEligible: Boolean(source?.evidenceEligible) && !item.fixture && !source?.fixture,
    };
  });
  return { ...pkg, sources, evidence };
}
