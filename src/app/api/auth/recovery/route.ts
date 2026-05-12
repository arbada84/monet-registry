import { NextRequest, NextResponse } from "next/server";
import { consumeAdminRecoveryToken } from "@/lib/admin-recovery-token";
import { generateAuthToken } from "@/lib/cookie-auth";

const COOKIE_NAME = "cp-admin-auth";

function shouldUseSecureCookie(req: NextRequest): boolean {
  const host = req.headers.get("host")?.toLowerCase() ?? "";
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]")) {
    return false;
  }
  const forwardedProto = req.headers.get("x-forwarded-proto")?.toLowerCase();
  return forwardedProto === "https" || req.nextUrl.protocol === "https:" || process.env.NODE_ENV === "production";
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const record = await consumeAdminRecoveryToken(token);
  if (!record) {
    return NextResponse.json({ success: false, error: "Recovery token is invalid or expired." }, { status: 401 });
  }

  const authToken = await generateAuthToken(record.name, record.role);
  const redirectUrl = new URL("/cam/dashboard", req.url);
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(COOKIE_NAME, authToken, {
    httpOnly: true,
    secure: shouldUseSecureCookie(req),
    sameSite: "lax",
    maxAge: 60 * 60,
    path: "/",
  });
  return response;
}
