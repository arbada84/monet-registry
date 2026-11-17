import { getDefaultModelForProvider, type AiProvider } from "./ai-model-options";

export interface AiSelectionSettings {
  provider?: string;
  aiProvider?: string;
  openaiModel?: string;
  geminiModel?: string;
  aiModel?: string;
}

interface AutomationAiSelection {
  useGlobalAiSettings?: boolean;
  aiProvider?: string;
  aiModel?: string;
}

export function resolveAiSelection(
  global: AiSelectionSettings = {},
  automation?: AutomationAiSelection,
): { provider: AiProvider; model: string } {
  const globalProvider = global.provider || global.aiProvider;
  const useGlobal = (!automation || automation.useGlobalAiSettings === true) && Boolean(globalProvider);
  const requested = useGlobal ? globalProvider : automation ? automation.aiProvider || "gemini" : globalProvider;
  if (requested && requested !== "openai" && requested !== "gemini") throw new Error("Unsupported AI provider");
  const provider = requested === "openai" ? "openai" : "gemini";
  const providerModel = provider === "openai" ? global.openaiModel : global.geminiModel;
  const model = (useGlobal || !automation ? providerModel || global.aiModel : automation.aiModel)?.trim();
  const wrongProvider = provider === "openai" ? model?.startsWith("gemini-") : /^(gpt-|o\d)/.test(model || "");
  return {
    provider,
    model: model && !wrongProvider ? model : getDefaultModelForProvider(provider, automation ? "automation" : "settings"),
  };
}
