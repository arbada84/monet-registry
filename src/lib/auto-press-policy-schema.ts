import { z } from "zod";

export const POLICY_STATE_ID = "blocked-subjects";
export const STATIC_POLICY_VERSION = 2;
export const POLICY_SNAPSHOT_MAX_BYTES = 512 * 1024;

const subjectId = z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/);
const ruleTerm = z.string().trim().min(2).max(120);
const domain = z.string().trim().toLowerCase().min(3).max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/);

export const autoPressPolicySubjectSchema = z.object({
  id: subjectId,
  label: z.string().trim().min(1).max(100),
  status: z.enum(["active", "inactive"]).default("active"),
  reason: z.string().trim().max(500).default(""),
  notes: z.string().trim().max(2000).default(""),
  terms: z.array(ruleTerm).max(100).default([]),
  termGroups: z.array(z.array(ruleTerm).min(2).max(5)).max(50).default([]),
  domains: z.array(domain).max(50).default([]),
});

export const autoPressPolicySnapshotSchema = z.object({
  version: z.number().int().positive(),
  policy: z.string().trim().min(1).max(300),
  generatedAt: z.string().datetime(),
  checksum: z.string().default(""),
  subjects: z.array(autoPressPolicySubjectSchema.omit({ reason: true, notes: true })).min(1).max(200),
});

export type AutoPressPolicySubject = z.infer<typeof autoPressPolicySubjectSchema>;
export type AutoPressPolicySnapshot = z.infer<typeof autoPressPolicySnapshotSchema>;

export interface AutoPressPolicyValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  subjectCount: number;
  ruleCount: number;
}

export function normalizePolicyValue(value: unknown): string {
  return String(value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

export function countPolicyRules(subjects: Array<Pick<AutoPressPolicySubject, "terms" | "termGroups" | "domains">>): number {
  return subjects.reduce((count, subject) => (
    count + subject.terms.length + subject.termGroups.length + subject.domains.length
  ), 0);
}

export function validatePolicySubjects(
  input: unknown,
  options: { baselineSubjectCount?: number } = {},
): { subjects: AutoPressPolicySubject[]; validation: AutoPressPolicyValidation } {
  const parsed = z.array(autoPressPolicySubjectSchema).min(1).max(200).safeParse(input);
  if (!parsed.success) {
    return {
      subjects: [],
      validation: {
        valid: false,
        errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
        warnings: [],
        subjectCount: 0,
        ruleCount: 0,
      },
    };
  }

  const subjects = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  const rules = new Map<string, string>();
  const riskyStandaloneTerms = new Set(["교회", "종교", "선교", "문화", "예술", "교육", "센터", "재단", "협회"]);

  for (const subject of subjects) {
    if (ids.has(subject.id)) errors.push(`중복 subject ID: ${subject.id}`);
    ids.add(subject.id);
    if (subject.status === "active" && !subject.terms.length && !subject.termGroups.length && !subject.domains.length) {
      errors.push(`${subject.id}: 활성 정책에 규칙이 없습니다.`);
    }
    for (const term of subject.terms) {
      const normalized = normalizePolicyValue(term);
      if (riskyStandaloneTerms.has(normalized)) errors.push(`${subject.id}: 너무 넓은 단일어 '${term}'은 사용할 수 없습니다.`);
      const key = `term:${normalized}`;
      if (rules.has(key)) errors.push(`${subject.id}: '${term}' 규칙이 ${rules.get(key)}와 중복됩니다.`);
      rules.set(key, subject.id);
    }
    for (const group of subject.termGroups) {
      const normalized = group.map(normalizePolicyValue).sort().join("+");
      const key = `group:${normalized}`;
      if (rules.has(key)) errors.push(`${subject.id}: term group이 ${rules.get(key)}와 중복됩니다.`);
      rules.set(key, subject.id);
    }
    for (const value of subject.domains) {
      const key = `domain:${normalizePolicyValue(value)}`;
      if (rules.has(key)) errors.push(`${subject.id}: domain '${value}'이 ${rules.get(key)}와 중복됩니다.`);
      rules.set(key, subject.id);
    }
  }

  const baseline = options.baselineSubjectCount || 0;
  if (baseline > 0 && subjects.length < Math.ceil(baseline * 0.8)) {
    errors.push(`정책 수가 기준 ${baseline}개에서 ${subjects.length}개로 20% 이상 감소했습니다.`);
  } else if (baseline > 0 && subjects.length < baseline) {
    warnings.push(`정책 수가 기준 ${baseline}개보다 ${baseline - subjects.length}개 적습니다.`);
  }

  const ruleCount = countPolicyRules(subjects);
  if (ruleCount === 0) errors.push("활성화 가능한 규칙이 하나도 없습니다.");
  return {
    subjects,
    validation: {
      valid: errors.length === 0,
      errors,
      warnings,
      subjectCount: subjects.length,
      ruleCount,
    },
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "checksum")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(typeof value === "string" ? value : stableJson(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((item) => item.toString(16).padStart(2, "0")).join("");
}

export async function buildPolicySnapshot(
  version: number,
  subjects: AutoPressPolicySubject[],
  generatedAt = new Date().toISOString(),
): Promise<AutoPressPolicySnapshot> {
  const snapshot: AutoPressPolicySnapshot = {
    version,
    policy: "CulturePeople editorial non-publication policy for promotional press releases",
    generatedAt,
    checksum: "",
    subjects: subjects
      .filter((subject) => subject.status === "active")
      .map(({ id, label, status, terms, termGroups, domains }) => ({ id, label, status, terms, termGroups, domains })),
  };
  snapshot.checksum = await sha256Hex(snapshot);
  if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > POLICY_SNAPSHOT_MAX_BYTES) {
    throw new Error(`Policy snapshot exceeds ${POLICY_SNAPSHOT_MAX_BYTES} bytes.`);
  }
  return snapshot;
}

export async function verifyPolicySnapshot(input: unknown): Promise<AutoPressPolicySnapshot> {
  const snapshot = autoPressPolicySnapshotSchema.parse(input);
  const expected = await sha256Hex(snapshot);
  if (snapshot.checksum !== expected) throw new Error("Policy snapshot checksum mismatch.");
  if (!snapshot.subjects.length) throw new Error("Policy snapshot has no subjects.");
  return snapshot;
}

