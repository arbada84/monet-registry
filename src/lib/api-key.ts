/**
 * API 키 유틸리티
 * - 키 생성: cpk_<48 hex chars>
 * - 저장: SHA-256 해시만 DB에 보관 (원본 키는 최초 1회만 반환)
 * - 검증: Bearer 토큰을 해싱 후 DB 해시와 비교
 */
import { createHash, randomBytes } from "crypto";
import type { ApiKeyRecord } from "@/types/article";

export function generateApiKey(): string {
  return `cpk_${randomBytes(24).toString("hex")}`;
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Authorization: Bearer <token> 헤더를 검증 */
export async function verifyApiKey(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7).trim();
  if (!token) return false;

  // 환경변수 단일 키 지원 (선택적 빠른 경로) — 타이밍 공격 방지
  const envKey = process.env.ARTICLE_API_KEY;
  if (envKey) {
    const { timingSafeEqual } = await import("@/lib/cookie-auth");
    if (timingSafeEqual(token, envKey)) return true;
  }

  try {
    const { serverGetSetting } = await import("./db-server");
    const keys = await serverGetSetting<ApiKeyRecord[]>("cp-api-keys", []);
    const hash = hashApiKey(token);
    return keys.some((k) => k.keyHash === hash);
  } catch {
    return false;
  }
}
