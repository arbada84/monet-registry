import { Redis } from "@upstash/redis";

// ── 공통 Redis 인스턴스 (Edge Runtime + Node.js 호환) ──────────
let redis: InstanceType<typeof Redis> | null = null;
try {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (url && token) {
    redis = new Redis({ url, token });
  }
} catch (e) {
  console.error("[redis] 초기화 실패:", e);
}

export { redis };

/**
 * Redis 기반 고정 윈도우 Rate Limiting (공통 유틸).
 * Redis 미설정 또는 장애 시 true 반환 (가용성 우선).
 * @returns true = 허용, false = 제한 초과
 */
export async function checkRateLimit(
  ip: string,
  prefix: string,
  maxPerWindow: number,
  windowSeconds: number
): Promise<boolean> {
  if (!redis) return true;
  try {
    const key = `${prefix}${ip}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }
    return count <= maxPerWindow;
  } catch (e) {
    console.error(`[${prefix}] Redis Rate Limit 실패:`, e);
    return true;
  }
}
