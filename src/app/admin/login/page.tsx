"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface AdminAccount {
  id: string;
  username: string;
  password: string;
  name: string;
  role: string;
}

const FALLBACK_ACCOUNTS: AdminAccount[] = [
  { id: "acc-1", username: "admin", password: "admin1234", name: "관리자", role: "superadmin" },
];

export default function AdminLoginPage() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState<AdminAccount[]>(FALLBACK_ACCOUNTS);

  useEffect(() => {
    const stored = localStorage.getItem("cp-admin-accounts");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.length > 0) setAccounts(parsed);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const matched = accounts.find(
      (acc) => acc.username === id && acc.password === password
    );

    if (matched) {
      localStorage.setItem("cp-admin-auth", "true");
      localStorage.setItem("cp-admin-user", matched.name || matched.username);
      localStorage.setItem("cp-admin-role", matched.role);
      router.replace("/admin/dashboard");
    } else {
      setError("아이디 또는 비밀번호가 올바르지 않습니다.");
    }
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
              color: "#E8192C",
              marginBottom: 8,
            }}
          >
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
            style={{
              width: "100%",
              padding: "12px 0",
              background: "#E8192C",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            로그인
          </button>
        </form>
      </div>
    </div>
  );
}
