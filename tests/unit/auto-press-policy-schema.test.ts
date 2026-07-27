import blockedSubjectsConfig from "../../config/auto-press-blocked-subjects.json";
import { describe, expect, it } from "vitest";
import {
  buildPolicySnapshot,
  validatePolicySubjects,
  verifyPolicySnapshot,
} from "@/lib/auto-press-policy-schema";
import { getAutoPressBlockedSubjectMatch } from "@/lib/auto-press-content-policy";

const subjects = blockedSubjectsConfig.subjects.map((subject) => ({
  ...subject,
  termGroups: subject.termGroups || [],
  status: "active" as const,
  reason: "",
  notes: "",
}));

describe("auto-press dynamic policy schema", () => {
  it("preserves all 34 static subjects and rules", () => {
    const result = validatePolicySubjects(subjects, { baselineSubjectCount: 34 });
    expect(result.validation.valid).toBe(true);
    expect(result.validation.subjectCount).toBe(34);
    expect(result.validation.ruleCount).toBe(216);
  });

  it("blocks an overly broad standalone rule", () => {
    const result = validatePolicySubjects([{
      id: "too-broad",
      label: "너무 넓은 정책",
      status: "active",
      reason: "",
      notes: "",
      terms: ["문화"],
      termGroups: [],
      domains: [],
    }]);
    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors.join(" ")).toContain("너무 넓은 단일어");
  });

  it("detects a destructive subject-count reduction", () => {
    const result = validatePolicySubjects(subjects.slice(0, 10), { baselineSubjectCount: 34 });
    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors.join(" ")).toContain("20% 이상 감소");
  });

  it("builds and verifies an immutable checksum snapshot", async () => {
    const snapshot = await buildPolicySnapshot(3, subjects);
    await expect(verifyPolicySnapshot(snapshot)).resolves.toEqual(snapshot);
    await expect(verifyPolicySnapshot({ ...snapshot, subjects: snapshot.subjects.slice(1) })).rejects.toThrow("checksum");
  });

  it("uses an injected policy and reports the matched field", () => {
    const match = getAutoPressBlockedSubjectMatch({
      title: "테스트 단체 정기행사",
      sourceUrl: "https://news.example.com/a",
    }, {
      subjects: [{ id: "test", label: "테스트", terms: ["테스트 단체"], termGroups: [], domains: [] }],
    });
    expect(match).toMatchObject({ blocked: true, subjectId: "test", matchedField: "title" });
  });
});
