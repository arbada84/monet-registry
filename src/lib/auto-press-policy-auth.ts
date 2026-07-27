import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getTokenPayload, isTokenBlacklisted, type TokenPayload } from "@/lib/cookie-auth";

export type PolicyCapability = "view" | "edit" | "validate" | "dry-run" | "publish" | "rollback" | "queue-action" | "article-action";

const CAPABILITIES: Record<string, Set<PolicyCapability>> = {
  admin: new Set(["view", "edit", "validate", "dry-run", "queue-action"]),
  superadmin: new Set(["view", "edit", "validate", "dry-run", "publish", "rollback", "queue-action", "article-action"]),
};

export interface PolicyActor {
  name: string;
  role: "admin" | "superadmin";
}

interface PolicySession {
  name: string;
  role: string;
}

async function getPolicySession(request: NextRequest): Promise<PolicySession | null> {
  const cookie = request.cookies.get("cp-admin-auth");
  if (!cookie?.value || await isTokenBlacklisted(cookie.value)) return null;
  const payload: TokenPayload | null = await getTokenPayload(request);
  if (!payload?.valid) return null;
  return {
    name: payload.name || "관리자",
    role: payload.role,
  };
}

export async function getPolicyActor(request: NextRequest): Promise<PolicyActor | null> {
  const session = await getPolicySession(request);
  if (!session || !CAPABILITIES[session.role]) return null;
  return session as PolicyActor;
}

export async function requirePolicyCapability(
  request: NextRequest,
  capability: PolicyCapability,
): Promise<{ actor: PolicyActor; error?: never } | { actor?: never; error: NextResponse }> {
  const session = await getPolicySession(request);
  if (!session) {
    return { error: NextResponse.json({ success: false, error: "관리자 쿠키 인증이 필요합니다." }, { status: 401 }) };
  }
  if (!CAPABILITIES[session.role]?.has(capability)) {
    return { error: NextResponse.json({ success: false, error: "이 작업을 수행할 권한이 없습니다." }, { status: 403 }) };
  }
  return { actor: session as PolicyActor };
}

export function assertPolicySameOrigin(request: NextRequest): NextResponse | null {
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

export function policyMutationRateLimit(actor: PolicyActor, action: string, limit = 20, windowMs = 60_000): NextResponse | null {
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

export function requireIdempotencyKey(request: NextRequest): string | NextResponse {
  const value = String(request.headers.get("idempotency-key") || "").trim();
  if (!/^[A-Za-z0-9._:-]{12,120}$/.test(value)) {
    return NextResponse.json({ success: false, error: "유효한 Idempotency-Key가 필요합니다." }, { status: 400 });
  }
  return value;
}
