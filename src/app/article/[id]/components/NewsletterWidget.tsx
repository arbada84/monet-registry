"use client";

import { useState } from "react";

export default function NewsletterWidget() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/db/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setEmail("");
        setResult({ ok: true, msg: "구독이 완료되었습니다!" });
      } else {
        setResult({ ok: false, msg: data.error || "구독에 실패했습니다." });
      }
    } catch {
      setResult({ ok: false, msg: "구독에 실패했습니다." });
    }
    setLoading(false);
  };

  return (
    <div className="hidden lg:block border border-gray-200 rounded p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-block h-5 w-1 rounded-full" style={{ backgroundColor: "#E8192C" }} />
        <h3 className="text-base font-bold text-gray-900">뉴스레터 구독</h3>
      </div>
      <p className="text-xs text-gray-500 mb-3">매일 주요 뉴스를 이메일로 받아보세요.</p>

      {result && (
        <div className={`mb-3 px-3 py-2 rounded text-xs ${result.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {result.msg}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="이메일 주소"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-2 outline-none focus:border-[#E8192C]"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 text-sm text-white rounded font-medium hover:opacity-90 disabled:opacity-50"
          style={{ background: "#E8192C" }}
        >
          {loading ? "처리 중..." : "구독하기"}
        </button>
      </form>
    </div>
  );
}
