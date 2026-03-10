"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, Home, ChevronUp } from "lucide-react";

export default function MobileBottomNav() {
  const router = useRouter();

  const btnStyle: React.CSSProperties = {
    width: 47,
    height: 49,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(250, 250, 250, 0.9)",
    borderTop: "1px solid #C9C9C9",
    borderRadius: 4,
    boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
  };

  return (
    <div className="md:hidden fixed bottom-3 left-0 right-0 z-50 flex justify-center gap-2 pointer-events-none">
      <button
        style={btnStyle}
        className="pointer-events-auto"
        onClick={() => router.back()}
        aria-label="뒤로가기"
      >
        <ChevronLeft className="h-5 w-5 text-gray-600" />
      </button>
      <button
        style={btnStyle}
        className="pointer-events-auto"
        onClick={() => router.push("/")}
        aria-label="홈"
      >
        <Home className="h-5 w-5 text-gray-600" />
      </button>
      <button
        style={btnStyle}
        className="pointer-events-auto"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="맨 위로"
      >
        <ChevronUp className="h-5 w-5 text-gray-600" />
      </button>
    </div>
  );
}
