import { NextRequest } from "next/server";
import { z } from "zod";
import { authorizeEditorialMutation, editorialApiError, editorialApiResponse } from "@/lib/editorial/api";
import { createEditorialCorrection } from "@/lib/editorial/repository";

const schema = z.object({
  articleId: z.string().max(160).optional(),
  articleNo: z.number().int().positive().optional(),
  correctionType: z.enum(["correction", "retraction"]),
  publicSummary: z.string().trim().min(10).max(2000),
  beforeHash: z.string().regex(/^[a-f0-9]{64}$/i),
  afterHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authorized = await authorizeEditorialMutation(request, "correct", "candidate-correction");
  if (authorized.error) return authorized.error;
  try {
    const body = schema.parse(await request.json());
    const { id } = await context.params;
    const result = await createEditorialCorrection({
      candidateId: id,
      ...body,
      actor: authorized.actor,
      idempotencyKey: authorized.idempotencyKey,
    });
    return editorialApiResponse({ success: true, ...result }, 201);
  } catch (error) {
    return editorialApiError(error);
  }
}
