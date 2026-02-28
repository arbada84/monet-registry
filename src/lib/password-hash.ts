/**
 * 비밀번호 해시 유틸리티 (Edge Runtime + Node.js 공용)
 * crypto.subtle 사용으로 서버리스/엣지 환경 모두 호환
 */

/** SHA-256 + salt 해시 */
export async function hashPassword(password: string): Promise<string> {
  const salt = process.env.PASSWORD_SALT;
  if (!salt) {
    console.warn(
      "[Security] PASSWORD_SALT 환경변수가 설정되지 않았습니다. " +
        "프로덕션 환경에서는 반드시 강력한 임의 값을 설정하세요."
    );
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
