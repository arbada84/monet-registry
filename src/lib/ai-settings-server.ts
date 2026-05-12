import "server-only";

import { serverGetSetting } from "@/lib/db-server";

export interface StoredAiSettings {
  provider?: string;
  aiProvider?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  pexelsApiKey?: string;
  openaiModel?: string;
  geminiModel?: string;
  aiModel?: string;
}

export function normalizeStoredAiSettings(value: unknown): StoredAiSettings {
  return value && typeof value === "object" ? value as StoredAiSettings : {};
}

export function normalizeAiApiKey(value: unknown): string {
  const key = typeof value === "string" ? value.trim() : "";
  if (!key) return "";
  // 관리자 화면에서 마스킹된 값이 잘못 저장돼도 실제 API 키로 쓰지 않는다.
  if (/\*{3,}/.test(key)) return "";
  return key;
}

export function resolveAiApiKey(settings: StoredAiSettings, provider: string = "gemini"): string {
  if (provider === "openai") {
    return normalizeAiApiKey(settings.openaiApiKey) || normalizeAiApiKey(process.env.OPENAI_API_KEY);
  }
  return normalizeAiApiKey(settings.geminiApiKey) || normalizeAiApiKey(process.env.GEMINI_API_KEY);
}

export async function serverGetAiSettings(): Promise<StoredAiSettings> {
  const value = await serverGetSetting<StoredAiSettings | null>("cp-ai-settings", {});
  return normalizeStoredAiSettings(value);
}
