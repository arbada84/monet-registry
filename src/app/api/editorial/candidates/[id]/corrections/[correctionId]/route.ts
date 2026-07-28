import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeEditorialMutation, editorialApiError, editorialApiResponse } from "@/lib/editorial/api";
import { decideEditorialCorrection } from "@/lib/editorial/repository";

const schema = z.object({
  status: z.enum(["approved", "rejected"]),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; correctionId: string }> },
) {
  const authorized = await authorizeEditorialMutation(request, "correct", "candidate-correction-decision");
  if (authorized.error) return authorized.error;
  try {
    const body = schema.parse(await request.json());
    const { id, correctionId } = await context.params;
    const result = await decideEditorialCorrection({
      candidateId: id,
      correctionId,
      status: body.status,
      actor: authorized.actor,
      idempotencyKey: authorized.idempotencyKey,
    });
    if (body.status === "approved") {
      const correction = result.corrections.find((item) => String(item.id) === correctionId);
      const articleNo = Number(correction?.article_no || 0);
      if (articleNo) revalidatePath(`/article/${articleNo}`);
      revalidatePath("/rss.xml");
      revalidatePath("/api/rss");
    }
    return editorialApiResponse({ success: true, ...result });
  } catch (error) {
    return editorialApiError(error);
  }
}
