import { NextRequest } from "next/server";
import { z } from "zod";
import { authorizeEditorialMutation, editorialApiError, editorialApiResponse } from "@/lib/editorial/api";
import { generateEvidenceLockedDraft } from "@/lib/editorial/draft-service";
import { getEditorialCandidate, saveEditorialDraftRun } from "@/lib/editorial/repository";

const schema = z.object({
  version: z.number().int().positive(),
  dryRun: z.boolean().default(true),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authorized = await authorizeEditorialMutation(request, "edit", "candidate-draft");
  if (authorized.error) return authorized.error;
  try {
    const body = schema.parse(await request.json());
    const { id } = await context.params;
    const detail = await getEditorialCandidate(id);
    if (detail.candidate.currentVersion !== body.version) {
      return editorialApiResponse({ success: false, error: "최신 candidate version만 초안을 만들 수 있습니다." }, 409);
    }
    const evidence = detail.evidence.map((item) => ({
      id: String(item.id),
      excerpt: String(item.excerpt || ""),
      evidenceEligible: Number(item.evidence_eligible || 0) === 1,
      fixture: Number(item.fixture || 0) === 1,
    }));
    if (body.dryRun) {
      const eligibleIds = evidence.filter((item) => item.evidenceEligible && !item.fixture).map((item) => item.id);
      return editorialApiResponse({
        success: true,
        dryRun: true,
        status: eligibleIds.length ? "ready" : "blocked_rights",
        eligibleEvidenceIds: eligibleIds,
        autoPublishEnabled: false,
      });
    }
    const generated = await generateEvidenceLockedDraft({
      candidateTitle: detail.candidate.title,
      evidence,
    });
    const status = generated.validation.ok ? "validated" : "blocked";
    const result = await saveEditorialDraftRun({
      candidateId: id,
      version: body.version,
      provider: generated.provider,
      model: generated.model,
      promptVersion: generated.promptVersion,
      evidenceIds: generated.evidenceIds,
      inputHash: generated.inputHash,
      outputHash: generated.outputHash,
      validation: generated.validation,
      status,
      draft: generated.validation.ok ? generated.draft : undefined,
      actor: authorized.actor,
      idempotencyKey: authorized.idempotencyKey,
    });
    return editorialApiResponse({ success: true, generated: { ...generated, draft: generated.validation.ok ? generated.draft : undefined }, ...result });
  } catch (error) {
    return editorialApiError(error);
  }
}
