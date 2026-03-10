/** 활동 로그 기록 (fire-and-forget) */
export function logActivity(params: {
  action: string;
  target?: string;
  targetId?: string;
  detail?: string;
}) {
  try {
    if (typeof window === "undefined") return;
    const username = localStorage.getItem("cp-admin-user") || "unknown";
    fetch("/api/db/activity-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        username,
        name: username,
        ...params,
      }),
    }).catch(() => {});
  } catch {
    // 로그 실패는 무시
  }
}
