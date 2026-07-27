import { NextRequest } from "next/server";
import { authorizePolicyRead, policyApiError, policyApiResponse } from "@/lib/auto-press-policy-api";
import { getPolicyState, getPolicyVersion, listRuntimeObservations } from "@/lib/auto-press-policy-repository";

const EXPECTED_INTERVAL_MS: Record<string, number | null> = {
  "next-main": 24 * 60 * 60 * 1000,
  "next-retry": 60 * 60 * 1000,
  "worker-scheduled": 10 * 60 * 1000,
  "worker-queue": null,
};
const GRACE_MS: Record<string, number> = {
  "next-main": 75 * 60 * 1000,
  "next-retry": 15 * 60 * 1000,
  "worker-scheduled": 5 * 60 * 1000,
  "worker-queue": 60 * 1000,
};

export async function GET(request: NextRequest) {
  const authorized = await authorizePolicyRead(request);
  if (authorized.error) return authorized.error;
  try {
    const [state, observations] = await Promise.all([getPolicyState(), listRuntimeObservations()]);
    const published = state?.publishedVersion ? await getPolicyVersion(state.publishedVersion) : null;
    const now = Date.now();
    const consumers = observations.map((item) => {
      const interval = EXPECTED_INTERVAL_MS[item.consumer];
      const stale = interval == null
        ? false
        : now - new Date(item.observedAt).getTime() > interval + (GRACE_MS[item.consumer] || 0);
      return {
        ...item,
        matchesPublished: Boolean(published?.checksum && item.checksum === published.checksum),
        stale,
      };
    });
    return policyApiResponse({
      success: true,
      state,
      published,
      consumers,
      warning: consumers.some((item) => item.stale || !item.matchesPublished),
    });
  } catch (error) {
    return policyApiError(error);
  }
}

