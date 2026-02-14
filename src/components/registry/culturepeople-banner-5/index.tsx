"use client";

// ============================================================================
// CUSTOMIZATION - 이 섹션의 값들을 수정하여 프로젝트에 맞게 조정하세요
// ============================================================================

const COLORS = {
  light: {
    bg: "#FFFFFF",
    border: "#EEEEEE",
    arrowBg: "rgba(0,0,0,0.4)",
    arrowText: "#FFFFFF",
  },
  dark: {
    bg: "#1A1A1A",
    border: "#333333",
    arrowBg: "rgba(255,255,255,0.2)",
    arrowText: "#FFFFFF",
  },
} as const;

const BANNERS = [
  {
    title: "컬처피플 인터넷 뉴스 홈페이지",
    color: "#E8192C",
    bgGradient: "linear-gradient(135deg, #E8192C 0%, #FF6B6B 100%)",
  },
  {
    title: "컬처피플 뉴스 모바일 앱 출시",
    color: "#2563EB",
    bgGradient: "linear-gradient(135deg, #2563EB 0%, #60A5FA 100%)",
  },
  {
    title: "속보 알림 서비스 무료 구독",
    color: "#059669",
    bgGradient: "linear-gradient(135deg, #059669 0%, #34D399 100%)",
  },
  {
    title: "컬처피플 기자 뉴스 제보하기",
    color: "#D97706",
    bgGradient: "linear-gradient(135deg, #D97706 0%, #FBBF24 100%)",
  },
  {
    title: "광고 문의 및 제휴 안내",
    color: "#7C3AED",
    bgGradient: "linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)",
  },
];

// ============================================================================
// END CUSTOMIZATION
// ============================================================================

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CulturepeopleBanner5Props {
  mode?: "light" | "dark";
}

export default function CulturepeopleBanner5({
  mode = "light",
}: CulturepeopleBanner5Props) {
  const colors = COLORS[mode];
  const [startIndex, setStartIndex] = useState(0);
  const visibleCount = 3;

  const next = useCallback(() => {
    setStartIndex((prev) => (prev + 1) % BANNERS.length);
  }, []);

  const prev = useCallback(() => {
    setStartIndex((prev) => (prev - 1 + BANNERS.length) % BANNERS.length);
  }, []);

  useEffect(() => {
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, [next]);

  const getVisibleBanners = () => {
    const result = [];
    for (let i = 0; i < visibleCount; i++) {
      result.push(BANNERS[(startIndex + i) % BANNERS.length]);
    }
    return result;
  };

  return (
    <section
      className="w-full"
      style={{ backgroundColor: colors.bg, fontFamily: "'Noto Sans KR', sans-serif" }}
    >
      <div className="mx-auto max-w-[1200px] px-4 py-6">
        <div className="relative">
          {/* Navigation Arrows */}
          <button
            onClick={prev}
            className="absolute -left-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full transition-opacity hover:opacity-80"
            style={{ backgroundColor: colors.arrowBg }}
          >
            <ChevronLeft className="h-4 w-4" style={{ color: colors.arrowText }} />
          </button>
          <button
            onClick={next}
            className="absolute -right-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full transition-opacity hover:opacity-80"
            style={{ backgroundColor: colors.arrowBg }}
          >
            <ChevronRight className="h-4 w-4" style={{ color: colors.arrowText }} />
          </button>

          {/* Banner Grid */}
          <AnimatePresence mode="wait">
            <motion.div
              key={startIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {getVisibleBanners().map((banner, idx) => (
                <a
                  key={`${startIndex}-${idx}`}
                  href="#"
                  className="group flex h-[100px] items-center justify-center rounded-sm px-6 text-center transition-transform hover:scale-[1.02]"
                  style={{ background: banner.bgGradient }}
                >
                  <span className="text-base font-bold text-white drop-shadow-sm">
                    {banner.title}
                  </span>
                </a>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
