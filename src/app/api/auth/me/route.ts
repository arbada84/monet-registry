import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/cookie-auth";

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("cp-admin-auth");
  const authed = await verifyAuthToken(cookie?.value ?? "");
  if (!authed) {
    return NextResponse.json({ authed: false });
  }
  const name = req.cookies.get("cp-admin-name")?.value || "";
  const role = req.cookies.get("cp-admin-role")?.value || "admin";
  return NextResponse.json({ authed: true, name, role });
}
