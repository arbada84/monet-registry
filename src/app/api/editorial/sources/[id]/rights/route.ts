import { NextRequest } from "next/server";
import { z } from "zod";
import { authorizeEditorialMutation, editorialApiError, editorialApiResponse } from "@/lib/editorial/api";
import { updateEditorialSourceRights } from "@/lib/editorial/repository";

const schema = z.object({
  generation: z.number().int().min(0),
  usageBasis: z.string().min(3).max(120),
  rightsGrade: z.enum(["A", "B", "C", "D", "X"]),
  allowedUses: z.array(z.string().min(1).max(80)).max(30),
  evidenceEligible: z.boolean(),
  trainingEligible: z.boolean(),
  blockReason: z.string().max(500).optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authorized = await authorizeEditorialMutation(request, "rights", "source-rights");
  if (authorized.error) return authorized.error;
  try {
    const body = schema.parse(await request.json());
    const { id } = await context.params;
    const source = await updateEditorialSourceRights({
      sourceId: id,
      ...body,
      actor: authorized.actor,
      idempotencyKey: authorized.idempotencyKey,
    });
    return editorialApiResponse({ success: true, source });
  } catch (error) {
    return editorialApiError(error);
  }
}
