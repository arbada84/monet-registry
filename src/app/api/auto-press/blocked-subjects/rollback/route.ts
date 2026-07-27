import { NextRequest } from "next/server";
import { z } from "zod";
import { authorizePolicyMutation, policyApiError, policyApiResponse } from "@/lib/auto-press-policy-api";
import { rollbackPolicyVersion } from "@/lib/auto-press-policy-repository";

const schema = z.object({
  targetVersion: z.number().int().positive(),
  generation: z.number().int().nonnegative(),
  reason: z.string().trim().min(5).max(500),
});

export async function POST(request: NextRequest) {
  const authorized = await authorizePolicyMutation(request, "rollback", "policy-rollback");
  if (authorized.error) return authorized.error;
  try {
    const body = schema.parse(await request.json());
    const result = await rollbackPolicyVersion({
      targetVersion: body.targetVersion,
      expectedStateGeneration: body.generation,
      reason: body.reason,
      actor: authorized.context.actor,
      idempotencyKey: authorized.context.idempotencyKey,
    });
    return policyApiResponse({ success: true, ...result });
  } catch (error) {
    return policyApiError(error);
  }
}

