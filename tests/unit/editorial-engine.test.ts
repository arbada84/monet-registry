import { describe, expect, it } from "vitest";
import {
  clusterEditorialSources,
  detectEditorialHighRisk,
  editorialTextSimilarity,
  evaluateEditorialPackage,
  validateEvidenceLockedDraft,
} from "@/lib/editorial/engine";
import { applyEditorialSourceRightsSnapshot } from "@/lib/editorial/source-rights";
import { editorialPackageSchema } from "@/lib/editorial/schema";

function packageFixture(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    candidateId: "candidate-1",
    title: "공연 관객 1200명 집계",
    state: "collected",
    articleType: "CP-1",
    sources: [{
      id: "source-1",
      sourceType: "first_party",
      sourceName: "공식 통계",
      sourceUrl: "https://data.example.org/report",
      title: "공연 집계",
      body: "공연 관객은 1200명으로 집계됐다.",
      fixture: false,
      usageBasis: "licensed",
      allowedUses: ["evidence"],
      rightsGrade: "B",
      evidenceEligible: true,
      trainingEligible: false,
    }],
    claims: [{
      id: "claim-1",
      text: "공연 관객은 1200명이다.",
      kind: "fact",
      importance: "core",
      evidenceIds: ["evidence-1"],
    }],
    evidence: [{
      id: "evidence-1",
      sourceId: "source-1",
      relation: "supporting",
      excerpt: "공연 관객은 1200명으로 집계됐다.",
      excerptHash: "a".repeat(64),
      fixture: false,
      evidenceEligible: true,
    }],
    humanReviewRequired: true,
    autoPublishAllowed: false,
    ...overrides,
  };
}

describe("editorial evidence engine", () => {
  it("routes a rights-cleared low-risk package to human review, never publication", () => {
    const input = packageFixture();
    input.sources.push({
      ...input.sources[0],
      id: "source-2",
      sourceName: "독립 집계",
      sourceUrl: "https://independent.example.net/audience",
      title: "지역 공연 통계",
      body: "지역 공연 통계는 관객 증가 추세를 별도로 집계했다.",
    });
    const result = evaluateEditorialPackage(input);
    expect(result).toMatchObject({ ok: true, nextState: "review_required", evidenceCoverage: 1 });
  });

  it("blocks fixtures and unconfirmed material from evidence", () => {
    const input = packageFixture();
    input.sources[0] = { ...input.sources[0], fixture: true, usageBasis: "synthetic_fixture", rightsGrade: "X", evidenceEligible: false };
    input.evidence[0] = { ...input.evidence[0], fixture: true, evidenceEligible: false, relation: "unresolved" };
    const result = evaluateEditorialPackage(input);
    expect(result.ok).toBe(false);
    expect(result.nextState).toBe("blocked_rights");
  });

  it("routes conflicting core evidence to counterview review", () => {
    const input = packageFixture();
    input.evidence.push({
      id: "evidence-2",
      sourceId: "source-1",
      relation: "contradicting",
      excerpt: "다른 집계는 900명이다.",
      excerptHash: "b".repeat(64),
      fixture: false,
      evidenceEligible: true,
    });
    input.claims[0].evidenceIds.push("evidence-2");
    expect(evaluateEditorialPackage(input)).toMatchObject({
      ok: false,
      nextState: "needs_counterview",
    });
  });

  it("clusters syndicated copies and detects sensitive language", () => {
    const source = {
      ...packageFixture().sources[0],
      rightsGrade: "B" as const,
    };
    const clusters = clusterEditorialSources([
      source,
      { ...source, id: "source-2", sourceUrl: "https://data.example.org/report?utm_source=copy" },
    ]);
    expect(clusters).toHaveLength(1);
    expect(editorialTextSimilarity("같은 공연 소식입니다.", "같은 공연 소식입니다.")).toBe(1);
    expect(detectEditorialHighRisk("후보자의 선거 관련 혐의를 수사한다")).toEqual(expect.arrayContaining(["allegation", "politics"]));
  });

  it("rejects unsupported protected tokens in an AI draft", () => {
    expect(validateEvidenceLockedDraft({
      draft: "관객은 9999명이었다.",
      evidenceExcerpts: ["관객은 1200명이었다."],
    })).toMatchObject({ ok: false });
  });

  it("ignores client-supplied rights until the server registry approves the source", () => {
    const submitted = editorialPackageSchema.parse(packageFixture());
    const blocked = applyEditorialSourceRightsSnapshot(submitted, new Map());
    expect(blocked.sources[0]).toMatchObject({
      usageBasis: "unconfirmed",
      rightsGrade: "D",
      evidenceEligible: false,
      trainingEligible: false,
    });
    expect(blocked.evidence[0].evidenceEligible).toBe(false);
    expect(evaluateEditorialPackage(blocked).nextState).toBe("blocked_rights");

    const approved = applyEditorialSourceRightsSnapshot(submitted, new Map([[
      "source-1",
      {
        fixture: 0,
        usage_basis: "licensed",
        rights_grade: "B",
        allowed_uses_json: JSON.stringify(["evidence"]),
        evidence_eligible: 1,
        training_eligible: 0,
      },
    ]]));
    expect(approved.sources[0]).toMatchObject({
      usageBasis: "licensed",
      rightsGrade: "B",
      evidenceEligible: true,
      trainingEligible: false,
    });
    expect(approved.evidence[0].evidenceEligible).toBe(true);
  });
});
