import { NextRequest } from "next/server";
import { authorizeEditorialMutation, authorizeEditorialRead, editorialApiError, editorialApiResponse } from "@/lib/editorial/api";
import { evaluateEditorialPackage } from "@/lib/editorial/engine";
import { editorialPackageSchema } from "@/lib/editorial/schema";
import {
  applyTrustedEditorialSourceRights,
  createEditorialCandidateFromPackage,
  getEditorialRuntimeState,
  listEditorialCandidates,
} from "@/lib/editorial/repository";

export async function GET(request: NextRequest) {
  const authorized = await authorizeEditorialRead(request);
  if (authorized.error) return authorized.error;
  try {
    const params = new URL(request.url).searchParams;
    const state = params.get("state") || undefined;
    const limit = Math.max(1, Math.min(Number(params.get("limit") || 100), 200));
    const [runtime, candidates] = await Promise.all([
      getEditorialRuntimeState(),
      listEditorialCandidates({ state, limit }),
    ]);
    return editorialApiResponse({ success: true, runtime, candidates, actor: authorized.actor });
  } catch (error) {
    return editorialApiError(error);
  }
}

export async function POST(request: NextRequest) {
  const authorized = await authorizeEditorialMutation(request, "create", "candidate-create");
  if (authorized.error) return authorized.error;
  try {
    const submitted = editorialPackageSchema.parse(await request.json());
    const pkg = await applyTrustedEditorialSourceRights(submitted);
    const gate = evaluateEditorialPackage(pkg);
    const result = await createEditorialCandidateFromPackage({
      package: pkg,
      gate,
      actor: authorized.actor,
      idempotencyKey: authorized.idempotencyKey,
    });
    return editorialApiResponse({ success: true, gate, ...result }, 201);
  } catch (error) {
    return editorialApiError(error);
  }
}
