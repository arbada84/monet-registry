import crypto from "node:crypto";
import { z } from "zod";

export const analysisManifestSchema = z.object({
  schemaVersion: z.literal(1),
  datasetId: z.string().min(1),
  datasetVersion: z.string().min(1),
  datasetHash: z.string().regex(/^[a-f0-9]{64}$/i),
  queryHash: z.string().regex(/^[a-f0-9]{64}$/i),
  codeHash: z.string().regex(/^[a-f0-9]{64}$/i),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))).max(100_000),
  calculations: z.array(z.object({
    id: z.string().min(1),
    operation: z.enum(["count", "sum", "average"]),
    field: z.string().optional(),
    expected: z.number(),
  })).max(500),
  methodology: z.string().min(1),
  limitations: z.array(z.string().min(1)).min(1),
  chartArtifacts: z.array(z.object({
    id: z.string().min(1).max(160),
    artifactKey: z.string().min(1).max(500).refine((value) => (
      !value.startsWith("/") && !value.startsWith("\\") && !value.split(/[\\/]+/).includes("..")
    ), "artifactKey must be a safe relative key"),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
    mediaType: z.enum(["image/png", "image/webp", "image/svg+xml", "application/json"]),
    description: z.string().min(1).max(500),
  })).max(100),
});

export function reproduceAnalysis(input: unknown) {
  const manifest = analysisManifestSchema.parse(input);
  const actualDatasetHash = crypto.createHash("sha256").update(JSON.stringify(manifest.rows)).digest("hex");
  const results = manifest.calculations.map((calculation) => {
    const values = calculation.field
      ? manifest.rows.map((row) => Number(row[calculation.field!])).filter(Number.isFinite)
      : [];
    const actual = calculation.operation === "count"
      ? manifest.rows.length
      : calculation.operation === "sum"
        ? values.reduce((sum, value) => sum + value, 0)
        : values.length
          ? values.reduce((sum, value) => sum + value, 0) / values.length
          : 0;
    return {
      ...calculation,
      actual,
      matches: Math.abs(actual - calculation.expected) < 1e-9,
    };
  });
  return {
    ok: actualDatasetHash === manifest.datasetHash && results.every((result) => result.matches),
    datasetHash: actualDatasetHash,
    expectedDatasetHash: manifest.datasetHash,
    queryHash: manifest.queryHash,
    codeHash: manifest.codeHash,
    chartArtifacts: manifest.chartArtifacts,
    results,
  };
}

export interface AutomationReadinessInput {
  shadowDays: number;
  pilotCount: number;
  reviewerCount: number;
  holdoutEvaluated: boolean;
  unsupportedCoreClaims: number;
  highRiskAutoPublished: number;
  killSwitchVerified: boolean;
  decisionRecordApproved: boolean;
}

export function evaluateAutomationReadiness(input: AutomationReadinessInput) {
  const blockers: string[] = [];
  if (input.shadowDays < 90) blockers.push("shadow_period_below_90_days");
  if (input.pilotCount < 50) blockers.push("pilot_below_50");
  if (input.reviewerCount < 2) blockers.push("reviewers_below_2");
  if (!input.holdoutEvaluated) blockers.push("holdout_not_evaluated");
  if (input.unsupportedCoreClaims > 0) blockers.push("unsupported_core_claims_present");
  if (input.highRiskAutoPublished > 0) blockers.push("high_risk_auto_publish_detected");
  if (!input.killSwitchVerified) blockers.push("kill_switch_not_verified");
  if (!input.decisionRecordApproved) blockers.push("representative_decision_missing");
  return {
    ready: blockers.length === 0,
    mode: "draft_only" as const,
    autoPublishEnabled: false as const,
    blockers,
  };
}
