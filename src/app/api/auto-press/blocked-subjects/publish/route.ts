import { NextRequest } from "next/server";
import { z } from "zod";
import { authorizePolicyMutation, policyApiError, policyApiResponse } from "@/lib/auto-press-policy-api";
import { publishPolicyVersion } from "@/lib/auto-press-policy-repository";

const schema = z.object({
  version: z.number().int().positive(),
  baseVersion: z.number().int().positive(),
  generation: z.number().int().nonnegative(),
  summary: z.string().trim().min(5).max(500),
});

export async function POST(request: NextRequest) {
  const authorized = await authorizePolicyMutation(request, "publish", "policy-publish");
  if (authorized.error) return authorized.error;
  try {
    const body = schema.parse(await request.json());
    const result = await publishPolicyVersion({
      version: body.version,
      baseVersion: body.baseVersion,
      expectedStateGeneration: body.generation,
      summary: body.summary,
      actor: authorized.context.actor,
      idempotencyKey: authorized.context.idempotencyKey,
    });
    return policyApiResponse({ success: true, ...result });
  } catch (error) {
    return policyApiError(error);
  }
}

