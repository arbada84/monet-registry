import { NextRequest } from "next/server";
import { authorizePolicyRead, policyApiError, policyApiResponse } from "@/lib/auto-press-policy-api";
import { listPolicyAuditLogs } from "@/lib/auto-press-policy-repository";

export async function GET(request: NextRequest) {
  const authorized = await authorizePolicyRead(request);
  if (authorized.error) return authorized.error;
  try {
    const limit = Math.min(Math.max(Number(new URL(request.url).searchParams.get("limit") || 100), 1), 200);
    return policyApiResponse({ success: true, logs: await listPolicyAuditLogs(limit) });
  } catch (error) {
    return policyApiError(error);
  }
}

