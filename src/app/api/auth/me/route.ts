import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("cp-admin-auth");
  if (cookie?.value !== "true") {
    return NextResponse.json({ authed: false });
  }
  return NextResponse.json({ authed: true });
}
