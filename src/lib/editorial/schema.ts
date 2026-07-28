import { z } from "zod";

export const editorialStateSchema = z.enum([
  "collected",
  "normalized",
  "evidence_ready",
  "drafting",
  "review_required",
  "sensitive_review",
  "approved",
  "published",
  "corrected",
  "retracted",
  "blocked_rights",
  "blocked_source",
  "needs_evidence",
  "needs_counterview",
  "rejected",
  "discarded",
]);

export const editorialRightsGradeSchema = z.enum(["A", "B", "C", "D", "X"]);

export const editorialSourceSchema = z.object({
  id: z.string().min(1).max(160),
  sourceType: z.string().min(1).max(80),
  sourceName: z.string().max(200).default(""),
  sourceUrl: z.string().url().max(2048).optional(),
  title: z.string().max(500).default(""),
  body: z.string().max(200_000).default(""),
  publishedAt: z.string().max(80).optional(),
  fixture: z.boolean().default(false),
  usageBasis: z.string().max(120).default("unconfirmed"),
  allowedUses: z.array(z.string().max(80)).max(30).default([]),
  rightsGrade: editorialRightsGradeSchema.default("D"),
  evidenceEligible: z.boolean().default(false),
  trainingEligible: z.boolean().default(false),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
});

export const editorialEvidenceSchema = z.object({
  id: z.string().min(1).max(160),
  sourceId: z.string().min(1).max(160),
  relation: z.enum(["supporting", "contradicting", "unresolved"]),
  excerpt: z.string().max(4000).default(""),
  excerptHash: z.string().regex(/^[a-f0-9]{64}$/i),
  fixture: z.boolean().default(false),
  evidenceEligible: z.boolean().default(false),
});

export const editorialClaimSchema = z.object({
  id: z.string().min(1).max(160),
  text: z.string().min(1).max(4000),
  kind: z.enum(["fact", "source_claim", "analysis", "forecast", "unknown"]).default("unknown"),
  importance: z.enum(["core", "supporting"]).default("supporting"),
  evidenceIds: z.array(z.string().min(1).max(160)).max(100).default([]),
});

export const editorialPackageSchema = z.object({
  schemaVersion: z.literal(1),
  candidateId: z.string().min(1).max(160),
  title: z.string().max(500).default(""),
  state: editorialStateSchema.default("collected"),
  articleType: z.enum(["CP-0", "CP-1", "CP-2", "CP-3", "CP-4", "CP-5"]).default("CP-0"),
  sources: z.array(editorialSourceSchema).max(200),
  claims: z.array(editorialClaimSchema).max(1000),
  evidence: z.array(editorialEvidenceSchema).max(2000),
  humanReviewRequired: z.boolean().default(true),
  autoPublishAllowed: z.literal(false).default(false),
});

export type EditorialState = z.infer<typeof editorialStateSchema>;
export type EditorialSource = z.infer<typeof editorialSourceSchema>;
export type EditorialEvidence = z.infer<typeof editorialEvidenceSchema>;
export type EditorialClaim = z.infer<typeof editorialClaimSchema>;
export type EditorialPackage = z.infer<typeof editorialPackageSchema>;
