import { NextRequest } from "next/server";
import { z } from "zod";
import { authorizePolicyMutation, policyApiError, policyApiResponse } from "@/lib/auto-press-policy-api";
import { cancelPolicyReportQueueItems } from "@/lib/auto-press-policy-audit-service";

const schema = z.object({
  reportId: z.string().regex(/^policy-report-[A-Za-z0-9-]{8,80}$/),
  reportChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  recordKeys: z.array(z.string().trim().regex(/^(queue|retry):.{1,160}$/)).min(1).max(50),
  confirmation: z.string().max(40),
});

export async function POST(request: NextRequest) {
  const authorized = await authorizePolicyMutation(request, "queue-action", "policy-queue-cancel");
  if (authorized.error) return authorized.error;
  try {
    const body = schema.parse(await request.json());
    const result = await cancelPolicyReportQueueItems({
      ...body,
      actor: authorized.context.actor,
      idempotencyKey: authorized.context.idempotencyKey,
    });
    return policyApiResponse({ success: true, ...result });
  } catch (error) {
    return policyApiError(error);
  }
}
