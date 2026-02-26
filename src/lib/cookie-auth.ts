// Edge Runtime + Node.js 모두 호환 (crypto.subtle 사용)
const SECRET = process.env.COOKIE_SECRET || "cp-cookie-secret-2024-change-me";

async function hmacSign(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function generateAuthToken(): Promise<string> {
  const ts = Date.now().toString();
  const sig = await hmacSign(ts, SECRET);
  return `${ts}.${sig}`;
}

export async function verifyAuthToken(value: string): Promise<boolean> {
  if (!value || value === "true") return false;
  const [ts, sig] = value.split(".");
  if (!ts || !sig) return false;
  const tsNum = parseInt(ts, 10);
  if (isNaN(tsNum)) return false;
  if (Date.now() - tsNum > 24 * 60 * 60 * 1000) return false; // 24h 만료
  const expected = await hmacSign(ts, SECRET);
  return sig === expected;
}
