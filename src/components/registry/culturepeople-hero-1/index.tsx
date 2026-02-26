"use client";

// ============================================================================
// CUSTOMIZATION
// ============================================================================

const COLORS = {
  light: {
    accent: "#E8192C",
    bg: "#FFFFFF",
    text: "#333333",
    muted: "#999999",
    overlay: "rgba(0,0,0,0.45)",
    overlayText: "#FFFFFF",
    dotActive: "#E8192C",
    dotInactive: "rgba(255,255,255,0.5)",
  },
  dark: {
    accent: "#E8192C",
    bg: "#1A1A1A",
    text: "#F5F5F5",
    muted: "#AAAAAA",
    overlay: "rgba(0,0,0,0.6)",
    overlayText: "#FFFFFF",
    dotActive: "#E8192C",
    dotInactive: "rgba(255,255,255,0.4)",
  },
} as const;

const DEFAULT_SLIDES = [
  { category: "문화", title: "전통과 현대가 만나는 한국 문화의 새로운 물결", subtitle: "서울 곳곳에서 펼쳐지는 문화 축제 현장을 찾아서", image: "https://picsum.photos/seed/cp-hero1/760/430" },
  { category: "뉴스", title: "2026년 경제 전망: 전문가들이 본 올해의 핵심 이슈", subtitle: "성장률 회복과 함께 주목해야 할 산업 트렌드", image: "https://picsum.photos/seed/cp-hero2/760/430" },
  { category: "스포츠", title: "국가대표팀, 아시안게임 금메달 행진 이어간다", subtitle: "역대 최다 메달 기록 경신을 향한 도전", image: "https://picsum.photos/seed/cp-hero3/760/430" },
  { category: "연예", title: "한류 콘텐츠, 글로벌 스트리밍 시장 점유율 1위 달성", subtitle: "K-드라마와 K-팝이 이끄는 문화 수출의 현주소", image: "https://picsum.photos/seed/cp-hero4/760/430" },
];

// ============================================================================

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Article } from "@/types/article";

interface SlideData {
  id?: string;
  category: string;
  title: string;
  subtitle: string;
  image: string;
}

const PLACEHOLDER_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 760 430'%3E%3Crect width='760' height='430' fill='%23E5E7EB'/%3E%3C/svg%3E";

interface CulturepeopleHero1Props {
  mode?: "light" | "dark";
  articles?: Article[];
}

export default function CulturepeopleHero1({ mode = "light", articles }: CulturepeopleHero1Props) {
  const colors = COLORS[mode];
  const [current, setCurrent] = useState(0);
  const [slides, setSlides] = useState<SlideData[]>(DEFAULT_SLIDES);

  useEffect(() => {
    if (!articles || articles.length === 0) return;
    try {
      const allArticles = articles.filter((a) => a.status === "게시");

      // 서버 DB에서 헤드라인 목록 조회
      let selected: typeof allArticles = [];
      fetch("/api/db/settings?key=cp-headline-articles&fallback=%5B%5D", { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => {
          const headlineIds: string[] = data.value ?? [];
          if (headlineIds.length > 0) {
            headlineIds.forEach((hid: string) => {
              const found = allArticles.find((a) => a.id === hid);
              if (found) selected.push(found);
            });
          }
          if (selected.length < 3) {
            selected = [...allArticles].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
          }
          if (selected.length > 0) {
            setSlides(selected.slice(0, 10).map((a) => ({
              id: a.id,
              category: a.category || "뉴스",
              title: a.title,
              subtitle: a.summary || (a.body ? a.body.replace(/<[^>]*>/g, "").slice(0, 80) + "..." : ""),
              image: a.thumbnail || PLACEHOLDER_IMG,
            })));
          }
        })
        .catch(() => {
          // Fallback: 최신순
          const latest = [...allArticles].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
          if (latest.length > 0) {
            setSlides(latest.map((a) => ({
              id: a.id,
              category: a.category || "뉴스",
              title: a.title,
              subtitle: a.summary || (a.body ? a.body.replace(/<[^>]*>/g, "").slice(0, 80) + "..." : ""),
              image: a.thumbnail || PLACEHOLDER_IMG,
            })));
          }
        });
    } catch { /* ignore */ }
  }, [articles]);

  const next = useCallback(() => {
    setCurrent((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  const prev = useCallback(() => {
    setCurrent((prev) => (prev - 1 + slides.length) % slides.length);
  }, [slides.length]);

  useEffect(() => {
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, [next]);

  const slideContent = (
    <>
      <img src={slides[current].image} alt={slides[current].title} className="h-full w-full object-cover" />
      <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)" }} />
      <div className="absolute bottom-0 left-0 right-0 p-6">
        <span className="mb-2 inline-block rounded-sm px-2 py-0.5 text-xs font-bold text-white" style={{ backgroundColor: colors.accent }}>
          {slides[current].category}
        </span>
        <h2 className="mb-1 text-xl font-bold leading-tight md:text-2xl" style={{ color: colors.overlayText }}>
          {slides[current].title}
        </h2>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>
          {slides[current].subtitle}
        </p>
      </div>
    </>
  );

  return (
    <section className="w-full" style={{ backgroundColor: colors.bg, fontFamily: "'Noto Sans KR', sans-serif" }}>
      <div className="mx-auto max-w-[1200px] px-4 py-5">
        <div className="relative aspect-[760/430] w-full overflow-hidden rounded-sm">
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-0"
            >
              <a
                href={slides[current].id ? `/article/${slides[current].id}` : "/"}
                className="block h-full w-full cursor-pointer"
              >
                {slideContent}
              </a>
            </motion.div>
          </AnimatePresence>

          <button onClick={prev} className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white transition-colors hover:bg-black/50 z-10">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button onClick={next} className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white transition-colors hover:bg-black/50 z-10">
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 z-10">
            {slides.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrent(idx)}
                className="h-2 rounded-full transition-all"
                style={{
                  width: idx === current ? 20 : 8,
                  backgroundColor: idx === current ? colors.dotActive : colors.dotInactive,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
