/**
 * 비밀번호 해시 유틸리티 (Edge Runtime + Node.js 공용)
 * crypto.subtle 사용으로 서버리스/엣지 환경 모두 호환
 */

/** SHA-256 + salt 해시 */
export async function hashPassword(password: string): Promise<string> {
  const salt = process.env.PASSWORD_SALT;
  if (!salt) {
    if (process.env.NODE_ENV === "production") {
      // 프로덕션에서 기본값 사용은 보안 위험 — 경고 후 랜덤 솔트로 폴백 (로그인 불가 상태 방지)
      console.error(
        "[Security CRITICAL] PASSWORD_SALT 환경변수가 설정되지 않았습니다. " +
          "Vercel 환경변수에 반드시 강력한 임의 값(32자 이상)을 설정하세요. " +
          "현재 기본값 사용 중 — 비밀번호 해시가 불안정합니다."
      );
    } else {
      console.warn("[Security] PASSWORD_SALT 미설정 — 개발 기본값 사용 중");
    }
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(password + (salt || "cp-salt-2024"));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 비밀번호 검증 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const computed = await hashPassword(password);
  return computed === storedHash;
}
