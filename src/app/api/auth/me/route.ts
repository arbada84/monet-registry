import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/cookie-auth";

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("cp-admin-auth");
  const { valid, name, role } = await verifyAuthToken(cookie?.value ?? "");
  if (!valid) {
    return NextResponse.json({ authed: false });
  }
  return NextResponse.json({ authed: true, name, role: role || "admin" });
}
