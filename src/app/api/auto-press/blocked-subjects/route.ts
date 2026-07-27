import { NextRequest } from "next/server";
import { z } from "zod";
import { authorizePolicyMutation, authorizePolicyRead, policyApiError, policyApiResponse } from "@/lib/auto-press-policy-api";
import { getStaticAutoPressPolicySnapshot } from "@/lib/auto-press-policy-loader";
import {
  createPolicyDraft,
  getPolicyBundle,
  getPolicyState,
  listPolicyVersions,
  listRuntimeObservations,
  upsertDraftSubject,
} from "@/lib/auto-press-policy-repository";
import { autoPressPolicySubjectSchema } from "@/lib/auto-press-policy-schema";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create-draft"), baseVersion: z.number().int().positive().optional() }),
  z.object({
    action: z.literal("save-subject"),
    version: z.number().int().positive(),
    generation: z.number().int().nonnegative(),
    subject: autoPressPolicySubjectSchema,
  }),
]);

export async function GET(request: NextRequest) {
  const authorized = await authorizePolicyRead(request);
  if (authorized.error) return authorized.error;
  const params = new URL(request.url).searchParams;
  const requestedVersion = Number(params.get("version") || 0) || undefined;
  try {
    const [state, versions, bundle, observations] = await Promise.all([
      getPolicyState(),
      listPolicyVersions(),
      getPolicyBundle(requestedVersion),
      listRuntimeObservations(),
    ]);
    return policyApiResponse({ success: true, source: "d1", state, versions, bundle, observations });
  } catch {
    const snapshot = await getStaticAutoPressPolicySnapshot();
    return policyApiResponse({
      success: true,
      source: "static-fallback",
      warning: "D1 정책 저장소를 읽지 못해 정적 정책을 읽기 전용으로 표시합니다.",
      state: null,
      versions: [],
      observations: [],
      bundle: {
        version: {
          version: snapshot.version,
          state: "published",
          baseVersion: null,
          generation: 0,
          checksum: snapshot.checksum,
          subjectCount: snapshot.subjects.length,
          ruleCount: snapshot.subjects.reduce((count, subject) => count + subject.terms.length + subject.termGroups.length + subject.domains.length, 0),
          createdBy: "static-fallback",
          createdAt: snapshot.generatedAt,
        },
        subjects: snapshot.subjects.map((subject) => ({ ...subject, reason: "", notes: "" })),
        validation: null,
      },
    });
  }
}

export async function POST(request: NextRequest) {
  const authorized = await authorizePolicyMutation(request, "edit", "policy-edit");
  if (authorized.error) return authorized.error;
  try {
    const body = bodySchema.parse(await request.json());
    const bundle = body.action === "create-draft"
      ? await createPolicyDraft(authorized.context.actor, body.baseVersion, authorized.context.idempotencyKey)
      : await upsertDraftSubject(body.version, body.subject, authorized.context.actor, body.generation, authorized.context.idempotencyKey);
    return policyApiResponse({ success: true, bundle });
  } catch (error) {
    return policyApiError(error);
  }
}
