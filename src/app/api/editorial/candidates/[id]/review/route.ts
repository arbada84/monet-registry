import { NextRequest } from "next/server";
import { z } from "zod";
import { authorizeEditorialMutation, editorialApiError, editorialApiResponse } from "@/lib/editorial/api";
import { getEditorialCandidate, saveEditorialReview } from "@/lib/editorial/repository";

const schema = z.object({
  version: z.number().int().positive(),
  reviewType: z.enum(["general", "sensitive", "rights", "correction"]),
  decision: z.enum(["approved", "changes_requested", "held", "rejected"]),
  memo: z.string().trim().min(3).max(2000),
  labels: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  isFixture: z.boolean().default(false),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const body = schema.parse(await request.json());
    const capability = body.reviewType === "sensitive" ? "sensitive-review" : "review";
    const authorized = await authorizeEditorialMutation(request, capability, "candidate-review");
    if (authorized.error) return authorized.error;
    const { id } = await context.params;
    const detail = await getEditorialCandidate(id);
    if (detail.candidate.highRisk.length && body.reviewType !== "sensitive") {
      return editorialApiResponse({ success: false, error: "민감 후보는 sensitive review가 필요합니다." }, 422);
    }
    const result = await saveEditorialReview({
      candidateId: id,
      ...body,
      actor: authorized.actor,
      idempotencyKey: authorized.idempotencyKey,
    });
    return editorialApiResponse({ success: true, ...result });
  } catch (error) {
    return editorialApiError(error);
  }
}
