import "server-only";

import { NextRequest, NextResponse } from "next/server";
import {
  assertPolicySameOrigin,
  policyMutationRateLimit,
  requireIdempotencyKey,
  requirePolicyCapability,
  type PolicyActor,
  type PolicyCapability,
} from "@/lib/auto-press-policy-auth";

export interface PolicyMutationContext {
  actor: PolicyActor;
  idempotencyKey: string;
}

export async function authorizePolicyRead(request: NextRequest, capability: PolicyCapability = "view") {
  return requirePolicyCapability(request, capability);
}

export async function authorizePolicyMutation(
  request: NextRequest,
  capability: PolicyCapability,
  action: string,
): Promise<{ context: PolicyMutationContext; error?: never } | { context?: never; error: NextResponse }> {
  const authorized = await requirePolicyCapability(request, capability);
  if (authorized.error) return { error: authorized.error };
  const originError = assertPolicySameOrigin(request);
  if (originError) return { error: originError };
  const rateError = policyMutationRateLimit(authorized.actor, action, capability === "publish" || capability === "rollback" ? 5 : 30);
  if (rateError) return { error: rateError };
  const idempotency = requireIdempotencyKey(request);
  if (idempotency instanceof NextResponse) return { error: idempotency };
  return { context: { actor: authorized.actor, idempotencyKey: idempotency } };
}

export function policyApiResponse(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export function policyApiError(error: unknown) {
  const candidate = error as { name?: string; status?: number; currentGeneration?: number; state?: unknown; validation?: unknown };
  const inputError = candidate?.name === "ZodError";
  const status = Number(candidate?.status || (inputError ? 400 : 500));
  const safeStatus = [400, 401, 403, 404, 409, 413, 422, 423, 429, 503].includes(status) ? status : 500;
  return policyApiResponse({
    success: false,
    error: inputError
      ? "요청 입력값이 올바르지 않습니다."
      : safeStatus === 500
        ? "편집정책 요청을 처리하지 못했습니다."
        : (error instanceof Error ? error.message : String(error)),
    ...(candidate.currentGeneration == null ? {} : { currentGeneration: candidate.currentGeneration }),
    ...(candidate.state == null ? {} : { state: candidate.state }),
    ...(candidate.validation == null ? {} : { validation: candidate.validation }),
  }, safeStatus);
}
