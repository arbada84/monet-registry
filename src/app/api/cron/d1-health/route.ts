import { NextRequest, NextResponse } from "next/server";
import { d1HttpHealthCheck, getD1HttpStatus } from "@/lib/d1-http-client";
import { isCronOrAdminRequest } from "@/lib/server-request-auth";

async function handler(request: NextRequest) {
  if (!await isCronOrAdminRequest(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const status = getD1HttpStatus();
  if (!status.configured) {
    return NextResponse.json({
      success: false,
      configured: false,
      status,
      error: `D1 HTTP API is not configured. Missing: ${status.missing.join(", ")}`,
    }, { status: 503 });
  }

  try {
    const health = await d1HttpHealthCheck();
    return NextResponse.json({
      success: health.ok,
      configured: true,
      status,
      health,
    }, { status: health.ok ? 200 : 503 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      configured: true,
      status,
      error: error instanceof Error ? error.message : "D1 health check failed",
    }, { status: 503 });
  }
}

export const maxDuration = 30;
export const GET = handler;
export const POST = handler;
