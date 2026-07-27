import { NextRequest } from "next/server";
import { z } from "zod";
import { authorizePolicyMutation, policyApiError, policyApiResponse } from "@/lib/auto-press-policy-api";
import { runPolicyDryAudit } from "@/lib/auto-press-policy-audit-service";

const schema = z.object({
  version: z.number().int().positive().optional(),
  days: z.number().int().min(1).max(365).default(183),
});

export async function POST(request: NextRequest) {
  const authorized = await authorizePolicyMutation(request, "dry-run", "policy-dry-run");
  if (authorized.error) return authorized.error;
  try {
    const body = schema.parse(await request.json());
    const result = await runPolicyDryAudit({
      ...body,
      actor: authorized.context.actor,
      idempotencyKey: authorized.context.idempotencyKey,
    });
    return policyApiResponse({ success: true, ...result });
  } catch (error) {
    return policyApiError(error);
  }
}

