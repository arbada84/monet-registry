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

export async function serverGetAiSettings(): Promise<StoredAiSettings> {
  const value = await serverGetSetting<StoredAiSettings | null>("cp-ai-settings", {});
  return normalizeStoredAiSettings(value);
}
