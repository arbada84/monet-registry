"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { login } from "@/lib/auth";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await login(id, password);
    if (result.success) {
      // 미들웨어가 설정한 redirect 파라미터: /cam/* 경로만 허용 (Open Redirect 방지)
      const redirectTo = searchParams.get("redirect");
      const decoded = redirectTo ? decodeURIComponent(redirectTo) : "";
      const safeRedirect = decoded.startsWith("/cam/") && !decoded.includes("//") && !decoded.includes("\\")
        ? decoded
        : "/cam/dashboard";
      router.replace(safeRedirect);
    } else {
      setError(result.error || "로그인 실패");
    }
    setLoading(false);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F5F5F5",
        fontFamily: "'Noto Sans KR', sans-serif",
      }}
    >
      <div
        style={{
          width: 400,
          background: "#FFFFFF",
          borderRadius: 12,
          border: "1px solid #EEEEEE",
          padding: "40px 32px",
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div
            style={{
              fontWeight: 800,
              fontSize: 28,
              color: "#4A3A8E",
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            <svg viewBox="0 0 100 100" width="36" height="36" aria-hidden="true">
              <circle cx="36" cy="62" r="27" fill="#C8BDE4" />
              <circle cx="64" cy="62" r="27" fill="#8B7BBE" />
              <circle cx="36" cy="38" r="27" fill="#6B5BAE" />
              <circle cx="64" cy="38" r="27" fill="#4A3A8E" />
            </svg>
            컬처피플
          </div>
          <div style={{ fontSize: 16, color: "#666" }}>관리자 로그인</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "#333",
                marginBottom: 6,
              }}
            >
              아이디
            </label>
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="아이디를 입력하세요"
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 14,
                border: "1px solid #DDD",
                borderRadius: 8,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "#333",
                marginBottom: 6,
              }}
            >
              비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 14,
                border: "1px solid #DDD",
                borderRadius: 8,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <div
              style={{
                marginBottom: 16,
                padding: "10px 12px",
                background: "#FFF0F0",
                border: "1px solid #FFCCCC",
                borderRadius: 8,
                color: "#E8192C",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px 0",
              background: loading ? "#CCC" : "#E8192C",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? "default" : "pointer",
            }}
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F5F5" }} />}>
      <LoginForm />
    </Suspense>
  );
}
