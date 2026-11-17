import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuthToken } from "@/lib/cookie-auth";
import { normalizeAiApiKey, resolveAiApiKey, serverGetAiSettings } from "@/lib/ai-settings-server";
import { checkRateLimit } from "@/lib/redis";

const inputSchema = z.object({
  provider: z.enum(["openai", "gemini"]),
  model: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._:-]+$/),
  apiKey: z.string().trim().max(4096).optional(),
}).strict();
const errorSchema = z.object({ error: z.object({
  code: z.union([z.string(), z.number()]).optional(), status: z.string().optional(),
  details: z.array(z.object({ reason: z.string().optional() })).optional(),
}) });
const modelSchema = z.object({ id: z.string().optional(), name: z.string().optional() });

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuthToken(req.cookies.get("cp-admin-auth")?.value ?? "");
  if (!auth.valid || !["admin", "superadmin"].includes(auth.role)) {
    return reply({ success: false, error: "관리자 로그인이 필요합니다." }, 403);
  }
  if (req.headers.get("origin") !== req.nextUrl.origin || req.headers.get("sec-fetch-site") === "cross-site") {
    return reply({ success: false, error: "허용되지 않은 요청입니다." }, 403);
  }
  if (!await checkRateLimit(auth.name, "cp:ai:connection-test:", 6, 60, { failClosedInProduction: true, context: "ai-connection-test" })) {
    return reply({ success: false, error: "지금은 테스트 요청을 처리할 수 없습니다. 1분 후 다시 시도하고, 계속되면 관리자에게 확인해주세요." }, 429);
  }
  const input = inputSchema.safeParse(await req.json().catch(() => null));
  if (!input.success) return reply({ success: false, error: "키와 모델 입력 형식을 확인해주세요." }, 400);
  const { provider, model, apiKey } = input.data;
  if (apiKey && (/\*{3,}|•{3,}/.test(apiKey) || !normalizeAiApiKey(apiKey))) {
    return reply({ success: false, code: "masked_key", error: "마스킹된 키는 검사할 수 없습니다. 실제 키를 다시 입력해주세요." }, 400);
  }
  // An explicitly empty field means environment-only, matching the form label.
  const key = apiKey === undefined
    ? resolveAiApiKey(await serverGetAiSettings(), provider)
    : normalizeAiApiKey(apiKey) || resolveAiApiKey({}, provider);
  if (!key) return reply({ success: false, code: "missing_key", error: "입력한 API 키 또는 서버 환경변수에 키가 없습니다." }, 400);
  if (/\s|[\r\n]/.test(key)) return reply({ success: false, code: "malformed_key", error: "키에 공백이 포함돼 있습니다. 키 전체를 다시 붙여넣어주세요." }, 400);

  try {
    const url = provider === "openai"
      ? `https://api.openai.com/v1/models/${encodeURIComponent(model)}`
      : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`;
    const response = await fetch(url, {
      headers: provider === "openai" ? { Authorization: `Bearer ${key}` } : { "x-goog-api-key": key },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const data: unknown = await response.json().catch(() => null);
    const parsedError = errorSchema.safeParse(data);
    const code = parsedError.success ? String(parsedError.data.error.code ?? parsedError.data.error.status ?? "") : "";
    if (!response.ok || parsedError.success) {
      const invalidGeminiKey = parsedError.success && parsedError.data.error.details?.some(detail => detail.reason === "API_KEY_INVALID");
      const error = response.status === 401 || code === "invalid_api_key" || code === "API_KEY_INVALID" || invalidGeminiKey
        ? "입력한 키의 인증이 거부되었습니다. 키가 만료·폐기되었거나 다른 서비스의 키인지 확인해주세요."
        : code === "insufficient_quota" || code === "billing_hard_limit_reached"
          ? "API 잔액 또는 사용 예산이 부족합니다. API 결제·사용 한도를 확인해주세요."
          : response.status === 404 || code === "model_not_found"
            ? "선택한 모델이 없거나 이 키의 프로젝트에 모델 접근권한이 없습니다. 다른 모델을 선택해 확인해주세요."
            : response.status === 403
              ? "이 키에 모델 조회 권한이 없습니다. API 프로젝트·키 권한을 확인해주세요. 키 오류로 단정할 수 없습니다."
              : response.status === 429
                ? "API 요청 한도에 도달했습니다. 잠시 후 다시 검사해주세요."
                : response.status >= 500
                  ? "AI 제공자 서버 오류입니다. 잠시 후 다시 검사해주세요."
                  : "모델 조회 요청이 거부되었습니다. 선택한 모델과 API 프로젝트 설정을 확인해주세요.";
      return reply({ success: false, providerStatus: response.status, error }, 400);
    }
    const metadata = modelSchema.safeParse(data);
    const expected = provider === "openai" ? model : `models/${model}`;
    if (!metadata.success || (provider === "openai" ? metadata.data.id : metadata.data.name) !== expected) {
      return reply({ success: false, error: "AI 서버에서 올바른 모델 정보를 받지 못했습니다." }, 502);
    }
    return reply({ success: true, result: "키 인증·모델 조회 성공. 생성 호출과 결제 한도는 별도 확인이 필요합니다.", model, generated: false });
  } catch (error) {
    const timeout = error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name);
    return reply({ success: false, error: timeout ? "연결 확인 시간이 초과되었습니다. 잠시 후 다시 시도해주세요." : "AI 서버에 연결하지 못했습니다. 네트워크 상태를 확인해주세요." }, timeout ? 504 : 502);
  }
}
