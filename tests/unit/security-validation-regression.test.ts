import { describe, expect, it } from "vitest";
import { z } from "zod";
import { autoPressPolicySubjectSchema, validatePolicySubjects } from "@/lib/auto-press-policy-schema";

describe("security update validation regressions", () => {
  it("rejects oversized collections before validating their elements", () => {
    let visits = 0;
    const element = z.string().superRefine(() => { visits += 1; });
    const result = z.array(element).max(100).safeParse(Array(101).fill("term"));
    expect(result.success).toBe(false);
    expect(visits).toBe(0);
  });

  it("keeps policy normalization and defaults with the updated validator", () => {
    const result = autoPressPolicySubjectSchema.parse({
      id: " test-subject ", label: " Test subject ", terms: [" example term "],
      domains: [" EXAMPLE.COM "],
    });
    expect(result).toMatchObject({
      id: "test-subject", label: "Test subject", status: "active",
      terms: ["example term"], domains: ["example.com"], termGroups: [],
    });
  });

  it("rejects too many policy subjects without returning a publishable snapshot", () => {
    const result = validatePolicySubjects(Array(201).fill({
      id: "test-subject", label: "Test subject", terms: ["example term"],
    }));
    expect(result.validation.valid).toBe(false);
    expect(result.subjects).toEqual([]);
    expect(result.validation.errors.length).toBeGreaterThan(0);
  });
});
