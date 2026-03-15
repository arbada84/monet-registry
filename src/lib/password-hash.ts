/**
 * 비밀번호 해싱 유틸리티 (bcrypt)
 * - hashPassword: 비밀번호 → bcrypt 해시 (신규 저장용)
 * - verifyPassword: 비밀번호 + 해시 → 일치 여부 검증
 * - legacyHashPassword: 기존 SHA-256 해시 (마이그레이션 호환용)
 */
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

/** 비밀번호를 bcrypt로 해싱 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** 비밀번호와 bcrypt 해시 비교 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // bcrypt 해시는 $2a$ 또는 $2b$로 시작
  if (hash.startsWith("$2")) {
    return bcrypt.compare(password, hash);
  }
  // 레거시 SHA-256 해시 호환 (마이그레이션 기간)
  const legacyHash = await legacyHashPassword(password);
  return legacyHash === hash;
}

/** 레거시 SHA-256 해시 (기존 호환용 — 신규 저장에는 사용하지 않음) */
export async function legacyHashPassword(password: string): Promise<string> {
  const salt = process.env.PASSWORD_SALT;
  if (!salt) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("[Security CRITICAL] PASSWORD_SALT 환경변수 미설정! 프로덕션에서 기본값 사용 불가.");
    }
    console.warn("[Security] PASSWORD_SALT 미설정 — 개발 기본값 사용 중");
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(password + (salt || "cp-salt-2024-dev-only"));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}
