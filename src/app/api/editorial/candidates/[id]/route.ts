import { NextRequest } from "next/server";
import { z } from "zod";
import { authorizeEditorialMutation, authorizeEditorialRead, editorialApiError, editorialApiResponse } from "@/lib/editorial/api";
import { editorialStateSchema } from "@/lib/editorial/schema";
import { getEditorialCandidate, updateEditorialCandidate } from "@/lib/editorial/repository";

const patchSchema = z.object({
  generation: z.number().int().nonnegative(),
  state: editorialStateSchema,
  title: z.string().trim().min(1).max(500).optional(),
  assignedTo: z.string().trim().max(160).optional(),
});

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authorized = await authorizeEditorialRead(request);
  if (authorized.error) return authorized.error;
  try {
    const { id } = await context.params;
    return editorialApiResponse({ success: true, ...(await getEditorialCandidate(id)), actor: authorized.actor });
  } catch (error) {
    return editorialApiError(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const body = patchSchema.parse(await request.json());
    const capability = body.state === "approved" || body.state === "rejected"
      ? "review"
      : body.state === "corrected" || body.state === "retracted"
        ? "correct"
        : "edit";
    const authorized = await authorizeEditorialMutation(request, capability, "candidate-update");
    if (authorized.error) return authorized.error;
    const { id } = await context.params;
    const result = await updateEditorialCandidate({
      id,
      ...body,
      actor: authorized.actor,
      idempotencyKey: authorized.idempotencyKey,
    });
    return editorialApiResponse({ success: true, ...result });
  } catch (error) {
    return editorialApiError(error);
  }
}
