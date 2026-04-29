import { Redis } from "@upstash/redis/cloudflare";

let redis: InstanceType<typeof Redis> | null = null;

try {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (url && token) {
    redis = new Redis({ url, token });
  }
} catch (e) {
  console.error("[redis] initialization failed:", e);
}

export { redis };

export interface RateLimitOptions {
  failClosedInProduction?: boolean;
  context?: string;
}

function shouldFailClosed(options?: RateLimitOptions): boolean {
  return Boolean(options?.failClosedInProduction && process.env.NODE_ENV === "production");
}

/**
 * Fixed-window rate limiting backed by Upstash Redis.
 *
 * The default remains fail-open for local development availability. Sensitive
 * production paths should pass `failClosedInProduction` so abuse protection is
 * not silently disabled when Redis is missing or unavailable.
 */
export async function checkRateLimit(
  ip: string,
  prefix: string,
  maxPerWindow: number,
  windowSeconds: number,
  options?: RateLimitOptions
): Promise<boolean> {
  const context = options?.context ?? prefix;

  if (!redis) {
    if (shouldFailClosed(options)) {
      console.error(`[rate-limit] Redis unavailable for ${context}; failing closed in production`);
      return false;
    }
    return true;
  }

  try {
    const key = `${prefix}${ip}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }
    return count <= maxPerWindow;
  } catch (e) {
    console.error(`[rate-limit] Redis check failed for ${context}:`, e);
    return !shouldFailClosed(options);
  }
}
