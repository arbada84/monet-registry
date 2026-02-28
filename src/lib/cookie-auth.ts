// Edge Runtime + Node.js 모두 호환 (crypto.subtle 사용)
if (!process.env.COOKIE_SECRET) {
  console.warn(
    "[Security] COOKIE_SECRET 환경변수가 설정되지 않았습니다. " +
      "프로덕션 환경에서는 반드시 강력한 임의 값을 설정하세요."
  );
}
const SECRET = process.env.COOKIE_SECRET || "cp-cookie-secret-2024-change-me";

async function hmacSign(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Base64URL 인코딩 (Edge Runtime 호환) */
function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const chars: string[] = [];
  bytes.forEach(b => chars.push(String.fromCharCode(b)));
  return btoa(chars.join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/** Base64URL 디코딩 */
function fromBase64Url(b64: string): string {
  try {
    const std = b64.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(std);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

/**
 * 인증 토큰 생성
 * 포맷: base64url("ts|name|role").hmac(base64url_payload)
 */
export async function generateAuthToken(name: string = "", role: string = ""): Promise<string> {
  const ts = Date.now().toString();
  const payload = `${ts}|${name}|${role}`;
  const b64 = toBase64Url(payload);
  const sig = await hmacSign(b64, SECRET);
  return `${b64}.${sig}`;
}

/** 상수 시간 문자열 비교 — 타이밍 공격 방어 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export interface TokenPayload {
  valid: boolean;
  name: string;
  role: string;
}

/**
 * 인증 토큰 검증
 * 구형 토큰(ts.sig)과 신형 토큰(base64url.sig) 모두 지원
 */
export async function verifyAuthToken(value: string): Promise<TokenPayload> {
  const INVALID: TokenPayload = { valid: false, name: "", role: "" };
  if (!value || value === "true") return INVALID;

  const lastDot = value.lastIndexOf(".");
  if (lastDot < 0) return INVALID;

  const b64 = value.slice(0, lastDot);
  const sig = value.slice(lastDot + 1);

  // HMAC 서명 검증 (b64 문자열 자체가 메시지)
  const expected = await hmacSign(b64, SECRET);
  if (!timingSafeEqual(sig, expected)) return INVALID;

  // 신형 포맷 파싱: base64url("ts|name|role")
  const decoded = fromBase64Url(b64);
  const parts = decoded.split("|");

  let ts: string;
  let name = "";
  let role = "";

  if (parts.length >= 1 && /^\d+$/.test(parts[0])) {
    // 신형 포맷
    ts = parts[0];
    name = parts[1] ?? "";
    role = parts[2] ?? "";
  } else if (/^\d+$/.test(b64)) {
    // 구형 포맷 (ts.sig) — 하위 호환성
    ts = b64;
  } else {
    return INVALID;
  }

  const tsNum = parseInt(ts, 10);
  if (isNaN(tsNum)) return INVALID;
  if (Date.now() - tsNum > 24 * 60 * 60 * 1000) return INVALID; // 24h 만료

  return { valid: true, name, role };
}
