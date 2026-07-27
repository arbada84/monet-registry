import { NextRequest } from "next/server";
import { z } from "zod";
import { authorizePolicyMutation, policyApiError, policyApiResponse } from "@/lib/auto-press-policy-api";
import { validatePolicyDraft } from "@/lib/auto-press-policy-repository";

const schema = z.object({ version: z.number().int().positive() });

export async function POST(request: NextRequest) {
  const authorized = await authorizePolicyMutation(request, "validate", "policy-validate");
  if (authorized.error) return authorized.error;
  try {
    const body = schema.parse(await request.json());
    const result = await validatePolicyDraft(body.version, authorized.context.actor, authorized.context.idempotencyKey);
    return policyApiResponse({ success: true, ...result });
  } catch (error) {
    return policyApiError(error);
  }
}
