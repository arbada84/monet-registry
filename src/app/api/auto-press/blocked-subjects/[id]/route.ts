import { NextRequest } from "next/server";
import { z } from "zod";
import { authorizePolicyMutation, policyApiError, policyApiResponse } from "@/lib/auto-press-policy-api";
import { deleteDraftSubject, upsertDraftSubject } from "@/lib/auto-press-policy-repository";
import { autoPressPolicySubjectSchema } from "@/lib/auto-press-policy-schema";

const patchSchema = z.object({
  version: z.number().int().positive(),
  generation: z.number().int().nonnegative(),
  subject: autoPressPolicySubjectSchema,
});
const deleteSchema = z.object({
  version: z.number().int().positive(),
  generation: z.number().int().nonnegative(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authorized = await authorizePolicyMutation(request, "edit", "policy-edit");
  if (authorized.error) return authorized.error;
  try {
    const { id } = await context.params;
    const body = patchSchema.parse(await request.json());
    if (body.subject.id !== id) return policyApiResponse({ success: false, error: "경로와 subject ID가 일치하지 않습니다." }, 400);
    const bundle = await upsertDraftSubject(body.version, body.subject, authorized.context.actor, body.generation, authorized.context.idempotencyKey);
    return policyApiResponse({ success: true, bundle });
  } catch (error) {
    return policyApiError(error);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authorized = await authorizePolicyMutation(request, "edit", "policy-edit");
  if (authorized.error) return authorized.error;
  try {
    const { id } = await context.params;
    const body = deleteSchema.parse(await request.json());
    const bundle = await deleteDraftSubject(body.version, id, authorized.context.actor, body.generation, authorized.context.idempotencyKey);
    return policyApiResponse({ success: true, bundle });
  } catch (error) {
    return policyApiError(error);
  }
}
