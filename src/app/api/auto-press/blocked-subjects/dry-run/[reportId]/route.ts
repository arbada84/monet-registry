import { NextRequest } from "next/server";
import { authorizePolicyRead, policyApiError, policyApiResponse } from "@/lib/auto-press-policy-api";
import { getPolicyDryAuditReport } from "@/lib/auto-press-policy-audit-service";

export async function GET(request: NextRequest, context: { params: Promise<{ reportId: string }> }) {
  const authorized = await authorizePolicyRead(request, "dry-run");
  if (authorized.error) return authorized.error;
  try {
    const { reportId } = await context.params;
    const params = new URL(request.url).searchParams;
    const result = await getPolicyDryAuditReport(
      reportId,
      Number(params.get("limit") || 50),
      Number(params.get("offset") || 0),
    );
    return policyApiResponse({ success: true, ...result });
  } catch (error) {
    return policyApiError(error);
  }
}

