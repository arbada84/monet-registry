"use client";

export default function ArticleError({ reset }: { reset: () => void }) {
  return (
    <div style={{ padding: "40px", textAlign: "center" }}>
      <h2 style={{ fontSize: "20px", marginBottom: "16px" }}>기사를 불러올 수 없습니다</h2>
      <p style={{ color: "#666", marginBottom: "24px" }}>일시적인 오류가 발생했습니다.</p>
      <button
        onClick={reset}
        style={{ padding: "8px 24px", background: "#E8192C", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
      >
        다시 시도
      </button>
    </div>
  );
}
