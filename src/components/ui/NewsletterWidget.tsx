"use client";

import { useState } from "react";

export default function NewsletterWidget() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setStatus("loading");
    try {
      const res = await fetch("/api/db/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus("success");
        setMessage(data.message || "구독해 주셔서 감사합니다!");
        setEmail("");
      } else {
        setStatus("error");
        setMessage(data.error || "구독에 실패했습니다.");
      }
    } catch {
      setStatus("error");
      setMessage("네트워크 오류가 발생했습니다.");
    }
  };

  if (status === "success") {
    return (
      <div
        className="my-8 rounded-lg p-6 text-center"
        style={{ background: "linear-gradient(135deg, #E8192C10 0%, #E8192C05 100%)", border: "1px solid #E8192C30" }}
      >
        <div className="text-2xl mb-2">✓</div>
        <div className="font-bold text-gray-900 mb-1">구독 완료!</div>
        <div className="text-sm text-gray-600">{message}</div>
      </div>
    );
  }

  return (
    <div
      className="my-8 rounded-lg p-6"
      style={{ background: "linear-gradient(135deg, #E8192C08 0%, #E8192C03 100%)", border: "1px solid #E8192C20" }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">✉️</span>
        <span className="font-bold text-gray-900 text-sm">컬처피플 뉴스레터 구독</span>
      </div>
      <p className="text-xs text-gray-500 mb-4">최신 문화 뉴스를 이메일로 받아보세요.</p>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일 주소 입력"
          disabled={status === "loading"}
          className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded outline-none focus:border-[#E8192C] bg-white disabled:opacity-60"
          required
        />
        <button
          type="submit"
          disabled={status === "loading" || !email.trim()}
          className="px-4 py-2 text-white text-sm font-medium rounded disabled:opacity-50 whitespace-nowrap"
          style={{ background: "#E8192C" }}
        >
          {status === "loading" ? "처리 중..." : "구독"}
        </button>
      </form>

      {status === "error" && (
        <div className="mt-2 text-xs text-red-600">{message}</div>
      )}
    </div>
  );
}
