import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getTokenPayload, isTokenBlacklisted } from "@/lib/cookie-auth";

export type EditorialRole = "reporter" | "editor" | "sensitive_editor" | "admin" | "superadmin";
export type EditorialCapability =
  | "view"
  | "create"
  | "edit"
  | "review"
  | "sensitive-review"
  | "correct"
  | "rights"
  | "runtime";

const CAPABILITIES: Record<EditorialRole, Set<EditorialCapability>> = {
  reporter: new Set(["view", "create", "edit"]),
  editor: new Set(["view", "create", "edit", "review", "correct"]),
  sensitive_editor: new Set(["view", "create", "edit", "review", "sensitive-review", "correct"]),
  admin: new Set(["view", "create", "edit", "review", "sensitive-review", "correct"]),
  superadmin: new Set(["view", "create", "edit", "review", "sensitive-review", "correct", "rights", "runtime"]),
};

export interface EditorialActor {
  name: string;
  role: EditorialRole;
}

export async function getEditorialActor(request: NextRequest): Promise<EditorialActor | null> {
  const cookie = request.cookies.get("cp-admin-auth");
  if (!cookie?.value || await isTokenBlacklisted(cookie.value)) return null;
  const payload = await getTokenPayload(request);
  if (!payload?.valid || !(payload.role in CAPABILITIES)) return null;
  return {
    name: payload.name || "관리자",
    role: payload.role as EditorialRole,
  };
}

export async function requireEditorialCapability(
  request: NextRequest,
  capability: EditorialCapability,
): Promise<{ actor: EditorialActor; error?: never } | { actor?: never; error: NextResponse }> {
  const actor = await getEditorialActor(request);
  if (!actor) {
    return { error: NextResponse.json({ success: false, error: "관리자 쿠키 인증이 필요합니다." }, { status: 401 }) };
  }
  if (!CAPABILITIES[actor.role].has(capability)) {
    return { error: NextResponse.json({ success: false, error: "이 작업을 수행할 권한이 없습니다." }, { status: 403 }) };
  }
  return { actor };
}

export function assertEditorialSameOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!origin || !host) {
    return NextResponse.json({ success: false, error: "Origin 확인에 실패했습니다." }, { status: 403 });
  }
  try {
    if (new URL(origin).host !== host) {
      return NextResponse.json({ success: false, error: "허용되지 않은 요청 출처입니다." }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ success: false, error: "잘못된 Origin입니다." }, { status: 403 });
  }
  return null;
}

const mutationWindows = new Map<string, number[]>();

export function editorialMutationRateLimit(actor: EditorialActor, action: string, limit = 30, windowMs = 60_000) {
  const key = `${actor.role}:${actor.name}:${action}`;
  const now = Date.now();
  const active = (mutationWindows.get(key) || []).filter((time) => now - time < windowMs);
  if (active.length >= limit) {
    return NextResponse.json({ success: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 });
  }
  active.push(now);
  mutationWindows.set(key, active);
  return null;
}

export function requireEditorialIdempotencyKey(request: NextRequest): string | NextResponse {
  const value = String(request.headers.get("idempotency-key") || "").trim();
  if (!/^[A-Za-z0-9._:-]{12,120}$/.test(value)) {
    return NextResponse.json({ success: false, error: "유효한 Idempotency-Key가 필요합니다." }, { status: 400 });
  }
  return value;
}
