import "server-only";

import { NextRequest, NextResponse } from "next/server";
import {
  assertEditorialSameOrigin,
  editorialMutationRateLimit,
  requireEditorialCapability,
  requireEditorialIdempotencyKey,
  type EditorialCapability,
} from "@/lib/editorial/auth";

export async function authorizeEditorialRead(request: NextRequest) {
  return requireEditorialCapability(request, "view");
}

export async function authorizeEditorialMutation(
  request: NextRequest,
  capability: EditorialCapability,
  action: string,
) {
  const authorized = await requireEditorialCapability(request, capability);
  if (authorized.error) return { error: authorized.error };
  const originError = assertEditorialSameOrigin(request);
  if (originError) return { error: originError };
  const rateError = editorialMutationRateLimit(authorized.actor, action, capability === "runtime" ? 5 : 30);
  if (rateError) return { error: rateError };
  const idempotencyKey = requireEditorialIdempotencyKey(request);
  if (idempotencyKey instanceof NextResponse) return { error: idempotencyKey };
  return { actor: authorized.actor, idempotencyKey };
}

export function editorialApiResponse(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export function editorialApiError(error: unknown) {
  const candidate = error as { name?: string; status?: number; currentGeneration?: number };
  const isInputError = candidate?.name === "ZodError";
  const status = Number(candidate.status || (isInputError ? 400 : 500));
  const safeStatus = [400, 401, 403, 404, 409, 422, 423, 429, 503].includes(status) ? status : 500;
  return editorialApiResponse({
    success: false,
    error: isInputError
      ? "요청 입력값이 올바르지 않습니다."
      : safeStatus === 500
        ? "편집실 요청을 처리하지 못했습니다."
        : error instanceof Error ? error.message : String(error),
    ...(candidate.currentGeneration == null ? {} : { currentGeneration: candidate.currentGeneration }),
  }, safeStatus);
}
