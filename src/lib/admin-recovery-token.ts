import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { serverGetSetting, serverSaveSetting } from "@/lib/db-server";

export interface AdminRecoveryTokenRecord {
  id: string;
  tokenHash: string;
  role: "superadmin" | "admin";
  name: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  createdBy?: string;
}

const RECOVERY_TOKENS_KEY = "cp-admin-recovery-tokens";
const MAX_TTL_MINUTES = 10;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`.replace(/\/+$/, "");
  return "https://culturepeople.co.kr";
}

async function getRecords(): Promise<AdminRecoveryTokenRecord[]> {
  return serverGetSetting<AdminRecoveryTokenRecord[]>(RECOVERY_TOKENS_KEY, []);
}

async function saveRecords(records: AdminRecoveryTokenRecord[]): Promise<void> {
  const now = Date.now();
  const active = records
    .filter((record) => !record.usedAt && new Date(record.expiresAt).getTime() > now)
    .slice(0, 20);
  await serverSaveSetting(RECOVERY_TOKENS_KEY, active);
}

export async function createAdminRecoveryLink(options?: {
  minutes?: number;
  role?: "superadmin" | "admin";
  name?: string;
  createdBy?: string;
}): Promise<{ url: string; expiresAt: string }> {
  const minutes = Math.min(Math.max(1, options?.minutes || 5), MAX_TTL_MINUTES);
  const id = randomBytes(6).toString("hex");
  const secret = randomBytes(24).toString("base64url");
  const token = `${id}.${secret}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + minutes * 60 * 1000).toISOString();
  const records = await getRecords();
  await saveRecords([
    {
      id,
      tokenHash: hashToken(token),
      role: options?.role || "superadmin",
      name: options?.name || "Telegram Recovery",
      createdAt: now.toISOString(),
      expiresAt,
      createdBy: options?.createdBy,
    },
    ...records,
  ]);

  return {
    url: `${getBaseUrl()}/api/auth/recovery?token=${encodeURIComponent(token)}`,
    expiresAt,
  };
}

export async function consumeAdminRecoveryToken(token: string): Promise<AdminRecoveryTokenRecord | null> {
  if (!token || token.length > 200) return null;
  const records = await getRecords();
  const tokenHash = hashToken(token);
  const now = Date.now();
  const target = records.find((record) => record.tokenHash === tokenHash && !record.usedAt);
  if (!target) return null;
  if (new Date(target.expiresAt).getTime() <= now) {
    await saveRecords(records.filter((record) => record.id !== target.id));
    return null;
  }

  const consumedAt = new Date().toISOString();
  const updated = records.map((record) => (
    record.id === target.id ? { ...record, usedAt: consumedAt } : record
  ));
  await saveRecords(updated);
  return { ...target, usedAt: consumedAt };
}
