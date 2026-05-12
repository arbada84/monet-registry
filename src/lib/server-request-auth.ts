import "server-only";

import type { NextRequest } from "next/server";
import { timingSafeEqual, verifyAuthToken } from "@/lib/cookie-auth";

export async function isCronOrAdminRequest(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") || "";
  if (cronSecret && authHeader.startsWith("Bearer ") && timingSafeEqual(authHeader.slice(7), cronSecret)) {
    return true;
  }

  const cookie = request.cookies.get("cp-admin-auth");
  const result = await verifyAuthToken(cookie?.value || "");
  return result.valid;
}
