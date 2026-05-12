import "server-only";

import {
  isD1SettingsDualWriteStrict,
  shouldDualWriteD1Settings,
  shouldUseD1ReadAdapter,
} from "@/lib/database-provider";
import { d1GetSetting, d1SaveSetting } from "@/lib/d1-server-db";

interface SupabaseEnv {
  url: string;
  key: string;
}

function getSupabaseEnv(useServiceKey = false): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = useServiceKey
    ? process.env.SUPABASE_SERVICE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || process.env.SUPABASE_SERVICE_KEY?.trim();
  if (!url || !key) return null;
  return { url, key };
}

function supabaseHeaders(key: string, write = false): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...(write ? { Prefer: "resolution=merge-duplicates,return=minimal" } : {}),
  };
}

function parseStoredValue<T>(value: unknown, fallback: T): T {
  if (typeof value === "string" && value.trim()) {
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }
  return value === undefined ? fallback : (value as T);
}

async function readSupabaseSiteSetting<T>(key: string, fallback: T, useServiceKey: boolean): Promise<T> {
  const env = getSupabaseEnv(useServiceKey);
  if (!env) return fallback;

  try {
    const res = await fetch(
      `${env.url}/rest/v1/site_settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
      { headers: supabaseHeaders(env.key), cache: "no-store" },
    );
    if (!res.ok) return fallback;
    const rows = (await res.json().catch(() => [])) as Array<{ value?: unknown }>;
    return parseStoredValue(rows[0]?.value, fallback);
  } catch {
    return fallback;
  }
}

async function writeSupabaseSiteSetting(key: string, value: unknown): Promise<void> {
  const env = getSupabaseEnv(true);
  if (!env) return;

  const res = await fetch(`${env.url}/rest/v1/site_settings`, {
    method: "POST",
    headers: supabaseHeaders(env.key, true),
    body: JSON.stringify({ key, value }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Supabase save setting error ${res.status}: ${await res.text()}`);
  }
}

export async function readSiteSetting<T>(
  key: string,
  fallback: T,
  options: { useServiceKey?: boolean } = {},
): Promise<T> {
  if (shouldUseD1ReadAdapter()) {
    return d1GetSetting<T>(key, fallback);
  }
  return readSupabaseSiteSetting(key, fallback, options.useServiceKey ?? false);
}

export async function writeSiteSetting(
  key: string,
  value: unknown,
  options: { bestEffort?: boolean } = {},
): Promise<void> {
  const bestEffort = options.bestEffort ?? false;

  try {
    if (shouldUseD1ReadAdapter()) {
      await d1SaveSetting(key, value);
      return;
    }

    await writeSupabaseSiteSetting(key, value);

    if (shouldDualWriteD1Settings()) {
      try {
        await d1SaveSetting(key, value);
      } catch (error) {
        if (isD1SettingsDualWriteStrict()) throw error;
        console.warn(`[site-settings] Failed to dual-write "${key}" to D1.`, error);
      }
    }
  } catch (error) {
    if (!bestEffort) throw error;
    console.warn(`[site-settings] Failed to write "${key}".`, error);
  }
}
