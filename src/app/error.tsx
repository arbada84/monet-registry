"use client";
import { useEffect } from "react";
import Link from "next/link";

export default function Error({
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md">
        <div className="text-8xl font-black text-gray-300 mb-4">500</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">오류가 발생했습니다</h1>
        <p className="text-gray-500 mb-8 text-sm leading-relaxed">
          일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-2.5 bg-[#E8192C] text-white text-sm font-medium rounded hover:bg-[#c0141f] transition-colors"
          >
            다시 시도
          </button>
          <Link
            href="/"
            className="px-6 py-2.5 border border-gray-300 text-gray-600 text-sm font-medium rounded hover:bg-gray-100 transition-colors"
          >
            홈으로
          </Link>
        </div>
      </div>
    </div>
  );
}
