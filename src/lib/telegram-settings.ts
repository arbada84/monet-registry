import "server-only";

import { decrypt, encrypt, isEncrypted } from "@/lib/encrypt";
import { readSiteSetting, writeSiteSetting } from "@/lib/site-settings-store";

export const TELEGRAM_SETTINGS_KEY = "cp-telegram-settings";

export interface StoredTelegramSettings {
  enabled?: boolean;
  botToken?: string;
  chatIds?: string;
  webhookSecret?: string;
  webhookHeaderSecret?: string;
  allowTempLogin?: boolean;
  notificationTypes?: string;
  timeoutMs?: number;
}

export interface TelegramRuntimeConfig {
  enabledFlag: boolean;
  botToken: string;
  chatIds: string[];
  webhookSecret: string;
  webhookHeaderSecret: string;
  allowTempLogin: boolean;
  notificationTypes: string;
  timeoutMs: number;
  source: {
    botToken: "env" | "admin" | "missing";
    chatIds: "env" | "admin" | "missing";
    webhookSecret: "env" | "admin" | "missing";
    webhookHeaderSecret: "env" | "admin" | "missing";
  };
  stored: {
    hasBotToken: boolean;
    hasWebhookSecret: boolean;
    hasWebhookHeaderSecret: boolean;
  };
  env: {
    hasBotToken: boolean;
    hasChatIds: boolean;
    hasWebhookSecret: boolean;
    hasWebhookHeaderSecret: boolean;
  };
}

export interface TelegramAdminSettingsInput {
  enabled?: boolean;
  botToken?: string;
  chatIds?: string;
  webhookSecret?: string;
  webhookHeaderSecret?: string;
  allowTempLogin?: boolean;
  notificationTypes?: string;
  timeoutMs?: number;
}

export interface TelegramAdminSettingsView {
  enabled: boolean;
  botTokenConfigured: boolean;
  botTokenSource: "env" | "admin" | "missing";
  chatIds: string;
  chatIdsSource: "env" | "admin" | "missing";
  webhookSecretConfigured: boolean;
  webhookSecretSource: "env" | "admin" | "missing";
  webhookHeaderSecretConfigured: boolean;
  webhookHeaderSecretSource: "env" | "admin" | "missing";
  allowTempLogin: boolean;
  notificationTypes: string;
  timeoutMs: number;
}

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

function decryptSecret(value?: string): string {
  if (!value) return "";
  return isEncrypted(value) ? decrypt(value) : value;
}

function encryptSecret(value: string): string {
  const cleaned = value.trim();
  return cleaned ? encrypt(cleaned) : "";
}

export function parseTelegramChatIds(raw?: string): string[] {
  return String(raw || "")
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter((value) => /^-?\d+$/.test(value));
}

function normalizeTimeoutMs(value: unknown): number {
  const parsed = Number(value || 3500);
  if (!Number.isFinite(parsed)) return 3500;
  return Math.min(Math.max(Math.trunc(parsed), 1000), 30000);
}

async function readStoredTelegramSettings(): Promise<StoredTelegramSettings> {
  const stored = await readSiteSetting<StoredTelegramSettings>(TELEGRAM_SETTINGS_KEY, {}, { useServiceKey: true });
  return stored && typeof stored === "object" ? stored : {};
}

function sourceFor(envValue: string, storedValue: string): "env" | "admin" | "missing" {
  if (envValue) return "env";
  if (storedValue) return "admin";
  return "missing";
}

export async function getTelegramRuntimeConfig(): Promise<TelegramRuntimeConfig> {
  const stored = await readStoredTelegramSettings();
  const storedBotToken = decryptSecret(stored.botToken);
  const storedWebhookSecret = decryptSecret(stored.webhookSecret);
  const storedWebhookHeaderSecret = decryptSecret(stored.webhookHeaderSecret);

  const envBotToken = env("TELEGRAM_BOT_TOKEN");
  const envChatIds = env("TELEGRAM_ALLOWED_CHAT_IDS") || env("TELEGRAM_CHAT_ID");
  const envWebhookSecret = env("TELEGRAM_WEBHOOK_SECRET");
  const envWebhookHeaderSecret = env("TELEGRAM_WEBHOOK_HEADER_SECRET");

  const botToken = envBotToken || storedBotToken;
  const chatIdsRaw = envChatIds || stored.chatIds || "";
  const webhookSecret = envWebhookSecret || storedWebhookSecret;
  const webhookHeaderSecret = envWebhookHeaderSecret || storedWebhookHeaderSecret;
  const enabledRaw = process.env.TELEGRAM_ENABLED;
  const enabledFlag = enabledRaw !== undefined ? enabledRaw !== "false" : stored.enabled !== false;

  return {
    enabledFlag,
    botToken,
    chatIds: parseTelegramChatIds(chatIdsRaw),
    webhookSecret,
    webhookHeaderSecret,
    allowTempLogin: process.env.TELEGRAM_ALLOW_TEMP_LOGIN === "true" || stored.allowTempLogin === true,
    notificationTypes: env("TELEGRAM_NOTIFICATION_TYPES") || stored.notificationTypes?.trim() || "",
    timeoutMs: normalizeTimeoutMs(env("TELEGRAM_TIMEOUT_MS") || stored.timeoutMs),
    source: {
      botToken: sourceFor(envBotToken, storedBotToken),
      chatIds: sourceFor(envChatIds, stored.chatIds || ""),
      webhookSecret: sourceFor(envWebhookSecret, storedWebhookSecret),
      webhookHeaderSecret: sourceFor(envWebhookHeaderSecret, storedWebhookHeaderSecret),
    },
    stored: {
      hasBotToken: Boolean(storedBotToken),
      hasWebhookSecret: Boolean(storedWebhookSecret),
      hasWebhookHeaderSecret: Boolean(storedWebhookHeaderSecret),
    },
    env: {
      hasBotToken: Boolean(envBotToken),
      hasChatIds: Boolean(envChatIds),
      hasWebhookSecret: Boolean(envWebhookSecret),
      hasWebhookHeaderSecret: Boolean(envWebhookHeaderSecret),
    },
  };
}

export async function getTelegramAdminSettingsView(): Promise<TelegramAdminSettingsView> {
  const config = await getTelegramRuntimeConfig();
  return {
    enabled: config.enabledFlag,
    botTokenConfigured: Boolean(config.botToken),
    botTokenSource: config.source.botToken,
    chatIds: config.chatIds.join(", "),
    chatIdsSource: config.source.chatIds,
    webhookSecretConfigured: Boolean(config.webhookSecret),
    webhookSecretSource: config.source.webhookSecret,
    webhookHeaderSecretConfigured: Boolean(config.webhookHeaderSecret),
    webhookHeaderSecretSource: config.source.webhookHeaderSecret,
    allowTempLogin: config.allowTempLogin,
    notificationTypes: config.notificationTypes,
    timeoutMs: config.timeoutMs,
  };
}

export async function saveTelegramAdminSettings(input: TelegramAdminSettingsInput): Promise<void> {
  const current = await readStoredTelegramSettings();
  const next: StoredTelegramSettings = { ...current };

  if (typeof input.enabled === "boolean") next.enabled = input.enabled;
  if (typeof input.chatIds === "string") next.chatIds = parseTelegramChatIds(input.chatIds).join(", ");
  if (typeof input.allowTempLogin === "boolean") next.allowTempLogin = input.allowTempLogin;
  if (typeof input.notificationTypes === "string") next.notificationTypes = input.notificationTypes.trim();
  if (input.timeoutMs !== undefined) next.timeoutMs = normalizeTimeoutMs(input.timeoutMs);

  if (typeof input.botToken === "string" && input.botToken.trim()) {
    next.botToken = encryptSecret(input.botToken);
  }
  if (typeof input.webhookSecret === "string" && input.webhookSecret.trim()) {
    next.webhookSecret = encryptSecret(input.webhookSecret);
  }
  if (typeof input.webhookHeaderSecret === "string" && input.webhookHeaderSecret.trim()) {
    next.webhookHeaderSecret = encryptSecret(input.webhookHeaderSecret);
  }

  await writeSiteSetting(TELEGRAM_SETTINGS_KEY, next);
}
