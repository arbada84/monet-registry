"use client";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ko">
      <body>
        <div style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#f9fafb",
          padding: "1rem",
          fontFamily: "sans-serif",
        }}>
          <div style={{ textAlign: "center", maxWidth: 400 }}>
            <div style={{ fontSize: 80, fontWeight: 900, color: "#d1d5db", marginBottom: 16 }}>!</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 8 }}>
              심각한 오류가 발생했습니다
            </h1>
            <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 32 }}>
              페이지를 불러오는 중 오류가 발생했습니다.
            </p>
            <button
              onClick={reset}
              style={{
                padding: "10px 24px",
                background: "#E8192C",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              다시 시도
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
