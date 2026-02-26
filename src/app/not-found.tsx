"use client";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md">
        <div className="text-8xl font-black text-[#E8192C] mb-4">404</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">페이지를 찾을 수 없습니다</h1>
        <p className="text-gray-500 mb-8 text-sm leading-relaxed">
          요청하신 페이지가 삭제되었거나 주소가 변경되었습니다.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/"
            className="px-6 py-2.5 bg-[#E8192C] text-white text-sm font-medium rounded hover:bg-[#c0141f] transition-colors"
          >
            홈으로
          </Link>
          <button
            onClick={() => window.history.back()}
            className="px-6 py-2.5 border border-gray-300 text-gray-600 text-sm font-medium rounded hover:bg-gray-100 transition-colors"
          >
            이전 페이지
          </button>
        </div>
      </div>
    </div>
  );
}
