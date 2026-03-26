/**
 * 메일 동기화 API
 * POST /api/mail/sync
 *
 * IMAP에서 새 메일을 가져와 DB(settings)에 저장
 * 이미 저장된 메일은 스킵 (uid + account + folder 기준)
 *
 * 핵심 로직은 core.ts에 분리 — auto-press에서 직접 호출 가능
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken, timingSafeEqual } from "@/lib/cookie-auth";
import { runMailSync } from "./core";

async function authenticate(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const bearer = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
    if (bearer && timingSafeEqual(bearer, secret)) return true;
  }
  const cookie = req.cookies.get("cp-admin-auth");
  const result = await verifyAuthToken(cookie?.value ?? "");
  return result.valid;
}

export async function POST(req: NextRequest) {
  if (!await authenticate(req)) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const days = parseInt(String(body.days ?? "7"), 10) || 7;
    const result = await runMailSync(days);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("[mail/sync] error:", e);
    const msg = e instanceof Error ? e.message : "동기화 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const maxDuration = 60;
