"use client";

/** 서버 쿠키 기반 인증 — HttpOnly 쿠키는 /api/auth/login 에서 설정 */

export async function checkAuth(): Promise<{ authed: boolean; user: string; role: string }> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) return { authed: false, user: "", role: "" };
    const data = await res.json();
    return { authed: data.authed === true, user: data.name || "admin", role: data.role || "admin" };
  } catch {
    return { authed: false, user: "", role: "" };
  }
}

export async function login(
  username: string,
  password: string
): Promise<{ success: boolean; error?: string; name?: string }> {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (data.success) {
      // 로컬스토리지에 표시용 정보 저장 (인증 자체는 HttpOnly 쿠키로)
      localStorage.setItem("cp-admin-user", data.name || username);
      localStorage.setItem("cp-admin-role", data.role || "admin");
    }
    return data;
  } catch {
    return { success: false, error: "서버 오류가 발생했습니다." };
  }
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/login", { method: "DELETE" });
  localStorage.removeItem("cp-admin-user");
  localStorage.removeItem("cp-admin-role");
}
