export type AiProvider = "gemini" | "openai";

export type AiModelOption = {
  value: string;
  label: string;
  description?: string;
};

export const DEFAULT_GEMINI_TEXT_MODEL = "gemini-2.5-flash";
export const DEFAULT_OPENAI_TEXT_MODEL = "gpt-6.1-sol";
export const DEFAULT_OPENAI_AUTOMATION_MODEL = "gpt-6-luna";

export const GEMINI_TEXT_MODELS: AiModelOption[] = [
  {
    value: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash (운영 추천)",
    description: "안정 버전이며 속도, 품질, 비용 균형이 좋아 자동등록 기본값으로 사용합니다.",
  },
  {
    value: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro (고품질)",
    description: "복잡한 편집 품질이 더 중요할 때 사용합니다.",
  },
  {
    value: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite (저비용/고속)",
    description: "가벼운 요약, 분류, 대량 처리에 적합합니다.",
  },
  {
    value: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro 미리보기 (최신)",
    description: "최신 미리보기 모델입니다. 운영 자동등록에는 2.5 계열을 우선 권장합니다.",
  },
  {
    value: "gemini-3.1-flash-lite-preview",
    label: "Gemini 3.1 Flash-Lite 미리보기 (최신 경량)",
    description: "최신 경량 미리보기 모델입니다. 제한이나 종료 공지가 더 빠를 수 있습니다.",
  },
  {
    value: "gemini-3-flash-preview",
    label: "Gemini 3 Flash 미리보기",
    description: "Gemini 3 계열 미리보기 모델입니다.",
  },
  {
    value: "gemini-2.0-flash",
    label: "Gemini 2.0 Flash (지원 종료 예정, 전환 권장)",
    description: "Google 문서상 이전 모델로 분류되어 2.5 Flash 전환을 권장합니다.",
  },
  {
    value: "gemini-2.0-flash-lite",
    label: "Gemini 2.0 Flash-Lite (지원 종료 예정, 전환 권장)",
    description: "Google 문서상 이전 모델로 분류되어 2.5 Flash-Lite 전환을 권장합니다.",
  },
];

export const OPENAI_TEXT_MODELS: AiModelOption[] = [
  { value: "gpt-6.1-sol", label: "GPT-6.1 Sol (품질·비용 균형)", description: "공통 AI 설정 기본값. Responses API를 사용합니다." },
  { value: "gpt-6.1-terra", label: "GPT-6.1 Terra (글쓰기)", description: "자연스러운 글쓰기와 편집 작업용 모델입니다." },
  { value: "gpt-6-luna", label: "GPT-6 Luna (자동등록 비용·속도 추천)", description: "반복 편집 작업용 기본값. Responses API를 사용합니다." },
  { value: "gpt-6-astra", label: "GPT-6 Astra (고난도·고비용)", description: "복잡한 작업용 모델. 자동등록에 선택하면 비용과 지연을 확인하세요." },
  {
    value: "gpt-5.5",
    label: "GPT-5.5 (기존 호환)",
    description: "기존 저장 설정과의 호환용 모델입니다.",
  },
  {
    value: "gpt-5.4-mini",
    label: "GPT-5.4 Mini (기존 경량)",
    description: "GPT-5 계열 경량 모델입니다. 응답 API로 호출합니다.",
  },
  {
    value: "gpt-4.1-mini",
    label: "GPT-4.1 Mini (기존 호환)",
    description: "현재 자동등록처럼 반복 호출이 많은 작업의 비용/속도 균형 모델입니다.",
  },
  {
    value: "gpt-4.1",
    label: "GPT-4.1 (안정 고품질)",
    description: "Chat Completions 호환 고품질 모델입니다.",
  },
  {
    value: "gpt-4.1-nano",
    label: "GPT-4.1 Nano (저비용/고속)",
    description: "가벼운 분류나 요약에 적합합니다.",
  },
  {
    value: "gpt-4o-mini",
    label: "GPT-4o Mini (구형 저비용)",
    description: "기존 호환용으로 유지합니다.",
  },
  {
    value: "gpt-4o",
    label: "GPT-4o (구형 범용)",
    description: "기존 호환용으로 유지합니다.",
  },
];

export function getTextModelOptions(provider: AiProvider): AiModelOption[] {
  return provider === "openai" ? OPENAI_TEXT_MODELS : GEMINI_TEXT_MODELS;
}

export function getDefaultModelForProvider(provider: AiProvider, scope: "settings" | "automation" = "settings"): string {
  if (provider === "openai") {
    return scope === "automation" ? DEFAULT_OPENAI_AUTOMATION_MODEL : DEFAULT_OPENAI_TEXT_MODEL;
  }
  return DEFAULT_GEMINI_TEXT_MODEL;
}

export function usesOpenAIResponsesApi(model: string): boolean {
  return /^(gpt-[5-9](?:[.-]|$)|o[134])/.test(model);
}
