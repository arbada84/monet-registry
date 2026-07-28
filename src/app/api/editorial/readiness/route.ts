import { NextRequest } from "next/server";
import { authorizeEditorialRead, editorialApiError, editorialApiResponse } from "@/lib/editorial/api";
import { evaluateAutomationReadiness } from "@/lib/editorial/analysis";
import { getEditorialAutomationMetrics } from "@/lib/editorial/repository";

export async function GET(request: NextRequest) {
  const authorized = await authorizeEditorialRead(request);
  if (authorized.error) return authorized.error;
  try {
    const metrics = await getEditorialAutomationMetrics();
    return editorialApiResponse({
      success: true,
      metrics,
      readiness: evaluateAutomationReadiness(metrics),
    });
  } catch (error) {
    return editorialApiError(error);
  }
}
