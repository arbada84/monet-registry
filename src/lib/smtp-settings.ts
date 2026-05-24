import "server-only";

import { serverGetSetting } from "@/lib/db-server";
import type { SafeSmtpStatus, SmtpConfigSource } from "@/types/smtp";

export type { SafeSmtpStatus, SmtpConfigSource } from "@/types/smtp";

export const NEWSLETTER_SETTINGS_KEY = "cp-newsletter-settings";

export interface StoredNewsletterSettings {
  enabled?: boolean;
  autoSendOnPublish?: boolean;
  senderName?: string;
  senderEmail?: string;
  replyToEmail?: string;
  welcomeSubject?: string;
  welcomeBody?: string;
  footerText?: string;
  smtpHost?: string;
  smtpPort?: number | string;
  smtpUser?: string;
  smtpPass?: string;
  smtpSecure?: boolean | string;
}

export interface SmtpRuntimeConfig {
  enabled: boolean;
  autoSendOnPublish: boolean;
  senderName: string;
  senderEmail: string;
  replyToEmail: string;
  welcomeSubject: string;
  welcomeBody: string;
  footerText: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  status: SafeSmtpStatus;
}

interface ResolvedValue<T> {
  value: T;
  source: SmtpConfigSource;
}

export interface SmtpResolverOptions {
  overrides?: Partial<StoredNewsletterSettings>;
}

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isMaskedSecret(value: string): boolean {
  return value === "__KEEP__" || value === "••••••••" || /\*{3,}/.test(value);
}

function cleanSecret(value: unknown): string {
  const secret = cleanString(value);
  return secret && !isMaskedSecret(secret) ? secret : "";
}

function parsePort(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  const port = Math.trunc(parsed);
  return port > 0 && port <= 65535 ? port : undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return undefined;
}

function pickString(
  envValue: string,
  overrideValue: unknown,
  storedValue: unknown,
  fallback = "",
): ResolvedValue<string> {
  if (envValue) return { value: envValue, source: "env" };

  const override = cleanString(overrideValue);
  if (override) return { value: override, source: "override" };

  const stored = cleanString(storedValue);
  if (stored) return { value: stored, source: "db" };

  if (fallback) return { value: fallback, source: "default" };
  return { value: "", source: "missing" };
}

function pickSecret(
  envValue: string,
  overrideValue: unknown,
  storedValue: unknown,
): ResolvedValue<string> {
  if (envValue) return { value: envValue, source: "env" };

  const override = cleanSecret(overrideValue);
  if (override) return { value: override, source: "override" };

  const stored = cleanSecret(storedValue);
  if (stored) return { value: stored, source: "db" };

  return { value: "", source: "missing" };
}

function pickPort(
  envValue: string,
  overrideValue: unknown,
  storedValue: unknown,
): ResolvedValue<number> {
  const envPort = parsePort(envValue);
  if (envPort) return { value: envPort, source: "env" };

  const overridePort = parsePort(overrideValue);
  if (overridePort) return { value: overridePort, source: "override" };

  const storedPort = parsePort(storedValue);
  if (storedPort) return { value: storedPort, source: "db" };

  return { value: 587, source: "default" };
}

function pickBoolean(
  envValue: string,
  overrideValue: unknown,
  storedValue: unknown,
  fallback: boolean,
): ResolvedValue<boolean> {
  const envBoolean = parseBoolean(envValue);
  if (envBoolean !== undefined) return { value: envBoolean, source: "env" };

  const overrideBoolean = parseBoolean(overrideValue);
  if (overrideBoolean !== undefined) return { value: overrideBoolean, source: "override" };

  const storedBoolean = parseBoolean(storedValue);
  if (storedBoolean !== undefined) return { value: storedBoolean, source: "db" };

  return { value: fallback, source: "default" };
}

function normalizeStoredNewsletterSettings(value: unknown): StoredNewsletterSettings {
  return value && typeof value === "object" ? value as StoredNewsletterSettings : {};
}

export function getSmtpConfigError(status: SafeSmtpStatus): string | null {
  if (status.configured) return null;
  if (status.missing.includes("pass")) {
    return "SMTP 비밀번호가 설정되어 있지 않습니다. Vercel 환경변수 SMTP_PASS 또는 기존 발송 설정을 확인해주세요.";
  }
  return "SMTP 설정이 불완전합니다. Vercel 환경변수 또는 발송 설정을 확인해주세요.";
}

export async function getSmtpRuntimeConfig(options: SmtpResolverOptions = {}): Promise<SmtpRuntimeConfig> {
  const stored = normalizeStoredNewsletterSettings(
    await serverGetSetting<StoredNewsletterSettings | null>(NEWSLETTER_SETTINGS_KEY, {}),
  );
  const overrides = options.overrides ?? {};

  const host = pickString(env("SMTP_HOST"), overrides.smtpHost, stored.smtpHost);
  const port = pickPort(env("SMTP_PORT"), overrides.smtpPort, stored.smtpPort);
  const user = pickString(env("SMTP_USER"), overrides.smtpUser, stored.smtpUser);
  const pass = pickSecret(env("SMTP_PASS"), overrides.smtpPass, stored.smtpPass);
  const secure = pickBoolean(env("SMTP_SECURE"), overrides.smtpSecure, stored.smtpSecure, false);
  const senderName = pickString(env("SMTP_SENDER_NAME"), overrides.senderName, stored.senderName, "컬처피플");
  const senderEmail = pickString(
    env("SMTP_SENDER_EMAIL"),
    overrides.senderEmail,
    stored.senderEmail,
    user.value,
  );
  const replyToEmail = pickString(
    env("SMTP_REPLY_TO_EMAIL"),
    overrides.replyToEmail,
    stored.replyToEmail,
    senderEmail.value,
  );

  const missing: SafeSmtpStatus["missing"] = [];
  if (!host.value) missing.push("host");
  if (!user.value) missing.push("user");
  if (!pass.value) missing.push("pass");
  if (!senderEmail.value) missing.push("senderEmail");

  const status: SafeSmtpStatus = {
    configured: missing.length === 0,
    missing,
    source: {
      host: host.source,
      port: port.source,
      secure: secure.source,
      user: user.source,
      pass: pass.source,
      senderName: senderName.source,
      senderEmail: senderEmail.source,
      replyToEmail: replyToEmail.source,
    },
    env: {
      hasHost: Boolean(env("SMTP_HOST")),
      hasPort: Boolean(env("SMTP_PORT")),
      hasUser: Boolean(env("SMTP_USER")),
      hasPass: Boolean(env("SMTP_PASS")),
      hasSecure: Boolean(env("SMTP_SECURE")),
      hasSenderName: Boolean(env("SMTP_SENDER_NAME")),
      hasSenderEmail: Boolean(env("SMTP_SENDER_EMAIL")),
      hasReplyToEmail: Boolean(env("SMTP_REPLY_TO_EMAIL")),
    },
    stored: {
      hasHost: Boolean(cleanString(stored.smtpHost)),
      hasUser: Boolean(cleanString(stored.smtpUser)),
      hasPass: Boolean(cleanSecret(stored.smtpPass)),
      hasSenderEmail: Boolean(cleanString(stored.senderEmail)),
    },
  };

  return {
    enabled: stored.enabled !== false,
    autoSendOnPublish: stored.autoSendOnPublish === true,
    senderName: senderName.value,
    senderEmail: senderEmail.value,
    replyToEmail: replyToEmail.value,
    welcomeSubject: cleanString(stored.welcomeSubject),
    welcomeBody: cleanString(stored.welcomeBody),
    footerText: cleanString(stored.footerText),
    host: host.value,
    port: port.value,
    secure: secure.value,
    user: user.value,
    pass: pass.value,
    status,
  };
}

export async function createSmtpTransport(
  config: Pick<SmtpRuntimeConfig, "host" | "port" | "secure" | "user" | "pass">,
  options: { connectionTimeout?: number; greetingTimeout?: number } = {},
) {
  const nodemailer = await import("nodemailer");
  return nodemailer.default.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    ...options,
  });
}
