import { NextRequest } from "next/server";
import { z } from "zod";
import { authorizePolicyMutation, policyApiError, policyApiResponse } from "@/lib/auto-press-policy-api";
import { getAutoPressBlockedSubjectMatch } from "@/lib/auto-press-content-policy";
import { getPolicyBundle } from "@/lib/auto-press-policy-repository";

const schema = z.object({
  version: z.number().int().positive(),
  input: z.object({
    title: z.string().max(500).optional(),
    summary: z.string().max(5000).optional(),
    bodyText: z.string().max(50_000).optional(),
    sourceUrl: z.string().max(2048).optional(),
    sourceName: z.string().max(300).optional(),
    tags: z.string().max(2000).optional(),
  }),
});

export async function POST(request: NextRequest) {
  const authorized = await authorizePolicyMutation(request, "validate", "policy-match");
  if (authorized.error) return authorized.error;
  try {
    const body = schema.parse(await request.json());
    const bundle = await getPolicyBundle(body.version);
    if (!bundle) return policyApiResponse({ success: false, error: "정책 버전을 찾지 못했습니다." }, 404);
    const match = getAutoPressBlockedSubjectMatch(body.input, { subjects: bundle.subjects.filter((subject) => subject.status === "active") });
    return policyApiResponse({ success: true, match });
  } catch (error) {
    return policyApiError(error);
  }
}

