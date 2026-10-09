import { isPublicSiteSetting, PUBLIC_SETTING_CACHE_SECONDS } from "@/lib/public-site-settings";

const values = new Map<string, { value: unknown; expiresAt: number }>();
const pending = new Map<string, Promise<unknown>>();

export function clearPublicSettingCache(key: string): void {
  values.delete(key);
}

export async function getPublicSetting<T>(key: string, fallback: T): Promise<T> {
  if (!isPublicSiteSetting(key)) throw new Error("Not a public presentation setting");
  const cached = values.get(key);
  let value = cached && cached.expiresAt > Date.now() ? cached.value : undefined;
  if (!cached || cached.expiresAt <= Date.now()) {
    let request = pending.get(key);
    if (!request) {
      request = (async () => {
        const res = await fetch(`/api/public/site-settings?key=${encodeURIComponent(key)}`, {
          credentials: "omit",
          cache: "default",
        });
        const data = await res.json();
        if (!res.ok || data.success !== true) throw new Error("Public setting unavailable");
        values.set(key, { value: data.value, expiresAt: Date.now() + PUBLIC_SETTING_CACHE_SECONDS * 1000 });
        return data.value;
      })();
      pending.set(key, request);
      void request.finally(() => pending.delete(key)).catch(() => {});
    }
    value = await request;
  }
  // Callers have different defaults and may sort/edit arrays; never share mutable values.
  return value === null || value === undefined ? fallback : structuredClone(value) as T;
}
