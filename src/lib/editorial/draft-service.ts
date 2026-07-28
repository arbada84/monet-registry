import "server-only";

import crypto from "node:crypto";
import { callGemini, callOpenAI } from "@/lib/ai-prompt";
import { resolveAiApiKey, serverGetAiSettings } from "@/lib/ai-settings-server";
import { DEFAULT_GEMINI_TEXT_MODEL, DEFAULT_OPENAI_AUTOMATION_MODEL } from "@/lib/ai-model-options";
import { validateEvidenceLockedDraft } from "@/lib/editorial/engine";

const PROMPT_VERSION = "editorial-evidence-locked-v1";
const SYSTEM_PROMPT = `당신은 CulturePeople 편집 보조자다.
제공된 evidence 이외의 사실, 수치, 날짜, 인용, 인명, 기관, 현장 묘사를 추가하지 않는다.
각 문단 끝에 사용한 evidence ID를 [evidence:ID] 형식으로 표시한다.
출처의 주장은 출처가 주장한 것으로 쓰고 사실처럼 단정하지 않는다.
JSON만 반환한다: {"title":"", "outline":[""], "draft":""}.
자동 발행을 제안하거나 승인하지 않는다.`;

function parseJsonObject(raw: string): { title: string; outline: string[]; draft: string } {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned) as { title?: unknown; outline?: unknown; draft?: unknown };
  if (typeof parsed.title !== "string" || typeof parsed.draft !== "string" || !Array.isArray(parsed.outline)) {
    throw new Error("AI 초안 JSON 형식이 올바르지 않습니다.");
  }
  return {
    title: parsed.title.slice(0, 300),
    outline: parsed.outline.map(String).slice(0, 20),
    draft: parsed.draft.slice(0, 50_000),
  };
}

export async function generateEvidenceLockedDraft(input: {
  candidateTitle: string;
  evidence: Array<{
    id: string;
    excerpt: string;
    evidenceEligible: boolean;
    fixture: boolean;
  }>;
}) {
  const eligible = input.evidence.filter((item) => item.evidenceEligible && !item.fixture && item.excerpt.trim());
  if (!eligible.length) throw Object.assign(new Error("사용 가능한 근거가 없어 초안을 생성할 수 없습니다."), { status: 422 });
  const settings = await serverGetAiSettings();
  const provider = settings.provider === "openai" || settings.aiProvider === "openai" ? "openai" : "gemini";
  const apiKey = resolveAiApiKey(settings, provider);
  if (!apiKey) throw Object.assign(new Error("AI API 키가 설정되지 않았습니다."), { status: 503 });
  const model = provider === "openai"
    ? settings.openaiModel || settings.aiModel || DEFAULT_OPENAI_AUTOMATION_MODEL
    : settings.geminiModel || settings.aiModel || DEFAULT_GEMINI_TEXT_MODEL;
  const evidencePayload = eligible.map((item) => ({ id: item.id, excerpt: item.excerpt }));
  const content = JSON.stringify({
    candidateTitle: input.candidateTitle,
    evidence: evidencePayload,
  });
  const raw = provider === "openai"
    ? await callOpenAI(apiKey, model, SYSTEM_PROMPT, content, { timeoutMs: 45_000, maxOutputTokens: 4096 })
    : await callGemini(apiKey, model, SYSTEM_PROMPT, content, { timeoutMs: 45_000, maxOutputTokens: 4096 });
  const draft = parseJsonObject(raw);
  const validation = validateEvidenceLockedDraft({
    draft: `${draft.title}\n${draft.draft}`,
    evidenceExcerpts: eligible.map((item) => item.excerpt),
  });
  return {
    provider,
    model,
    promptVersion: PROMPT_VERSION,
    evidenceIds: eligible.map((item) => item.id),
    inputHash: crypto.createHash("sha256").update(content).digest("hex"),
    outputHash: crypto.createHash("sha256").update(JSON.stringify(draft)).digest("hex"),
    draft,
    validation,
    autoPublishAllowed: false as const,
  };
}
