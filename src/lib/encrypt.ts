/**
 * AES-256-GCM 암호화/복호화 유틸리티
 * COOKIE_SECRET을 키로 사용하여 민감 데이터(IMAP 비밀번호 등)를 암호화
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

function getEncryptionKey(): Buffer {
  const secret = process.env.COOKIE_SECRET || "dev-fallback-secret-key-32chars!";
  // SHA-256으로 32바이트 키 생성
  return createHash("sha256").update(secret).digest();
}

/** 평문을 AES-256-GCM으로 암호화. 반환: "iv:authTag:ciphertext" (hex) */
export function encrypt(plaintext: string): string {
  if (!plaintext) return "";
  const key = getEncryptionKey();
  const iv = randomBytes(12); // GCM 권장 96비트
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/** AES-256-GCM 복호화. 입력: "iv:authTag:ciphertext" (hex) */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return "";
  // 암호화되지 않은 평문인 경우 그대로 반환 (마이그레이션 호환)
  if (!ciphertext.includes(":") || ciphertext.split(":").length !== 3) {
    return ciphertext;
  }
  try {
    const [ivHex, authTagHex, encrypted] = ciphertext.split(":");
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    // 복호화 실패 시 평문으로 간주 (마이그레이션)
    return ciphertext;
  }
}

/** 문자열이 암호화된 형식인지 확인 (iv:authTag:ciphertext, 모두 hex) */
export function isEncrypted(value: string): boolean {
  if (!value || !value.includes(":")) return false;
  const parts = value.split(":");
  if (parts.length !== 3) return false;
  // iv=24자, authTag=32자, ciphertext=1자 이상 (모두 hex)
  return parts[0].length === 24 && /^[0-9a-f]+$/i.test(parts[0])
    && parts[1].length === 32 && /^[0-9a-f]+$/i.test(parts[1])
    && parts[2].length > 0 && /^[0-9a-f]+$/i.test(parts[2]);
}
