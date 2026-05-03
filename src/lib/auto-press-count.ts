export const DEFAULT_AUTO_PRESS_COUNT = 5;

export function normalizeAutoPressCount(value: unknown, fallback = DEFAULT_AUTO_PRESS_COUNT): number {
  const fallbackCount = Math.max(1, Math.trunc(Number(fallback) || DEFAULT_AUTO_PRESS_COUNT));
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallbackCount;
  return Math.max(1, Math.trunc(parsed));
}
