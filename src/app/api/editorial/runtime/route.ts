import { NextRequest } from "next/server";
import { z } from "zod";
import { authorizeEditorialMutation, authorizeEditorialRead, editorialApiError, editorialApiResponse } from "@/lib/editorial/api";
import { getEditorialRuntimeState, updateEditorialRuntimeState } from "@/lib/editorial/repository";

const schema = z.object({
  generation: z.number().int().nonnegative(),
  featureEnabled: z.boolean(),
  shadowEnabled: z.boolean(),
  draftEnabled: z.boolean(),
  autoPublishEnabled: z.literal(false),
  verifyKillSwitch: z.boolean().default(false),
});

export async function GET(request: NextRequest) {
  const authorized = await authorizeEditorialRead(request);
  if (authorized.error) return authorized.error;
  try {
    return editorialApiResponse({ success: true, runtime: await getEditorialRuntimeState(), actor: authorized.actor });
  } catch (error) {
    return editorialApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  const authorized = await authorizeEditorialMutation(request, "runtime", "runtime-update");
  if (authorized.error) return authorized.error;
  try {
    const body = schema.parse(await request.json());
    const runtime = await updateEditorialRuntimeState({
      ...body,
      actor: authorized.actor,
      idempotencyKey: authorized.idempotencyKey,
    });
    return editorialApiResponse({ success: true, runtime });
  } catch (error) {
    return editorialApiError(error);
  }
}
