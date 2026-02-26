"use client";

// ============================================================================
// CUSTOMIZATION - 이 섹션의 값들을 수정하여 프로젝트에 맞게 조정하세요
// ============================================================================

const COLORS = {
  light: {
    accent: "#E8192C",
    bg: "#FFFFFF",
    text: "#333333",
    title: "#000000",
    muted: "#999999",
    border: "#EEEEEE",
    divider: "#CCCCCC",
  },
  dark: {
    accent: "#E8192C",
    bg: "#1A1A1A",
    text: "#E0E0E0",
    title: "#FFFFFF",
    muted: "#AAAAAA",
    border: "#333333",
    divider: "#444444",
  },
} as const;

const DEFAULT_CATEGORIES = [
  {
    name: "뉴스",
    articles: [
      { title: "국회, 2026년 추경 예산안 심사 착수", image: "https://picsum.photos/seed/cp-cn1/280/180", date: "2026.02.14" },
      { title: "수도권 신도시 교통 대책 마련 촉구", image: "https://picsum.photos/seed/cp-cn2/280/180", date: "2026.02.14" },
      { title: "중소기업 디지털 전환 지원 정책 확대", image: "https://picsum.photos/seed/cp-cn3/280/180", date: "2026.02.13" },
      { title: "환경부, 탄소중립 실행 계획 2단계 발표", image: "https://picsum.photos/seed/cp-cn4/280/180", date: "2026.02.13" },
      { title: "지방자치단체 재정 건전성 평가 결과 공개", image: "https://picsum.photos/seed/cp-cn5/280/180", date: "2026.02.12" },
      { title: "외교부, 한미 정상회담 일정 조율 중", image: "https://picsum.photos/seed/cp-cn6/280/180", date: "2026.02.12" },
    ],
  },
  {
    name: "연예",
    articles: [
      { title: "신예 배우 김하늘, 칸 영화제 초청작 주연 발탁", image: "https://picsum.photos/seed/cp-ce1/280/180", date: "2026.02.14" },
      { title: "아이돌 그룹 '스타라이즈' 월드투어 전석 매진", image: "https://picsum.photos/seed/cp-ce2/280/180", date: "2026.02.14" },
      { title: "넷플릭스 한국 오리지널 시리즈 글로벌 1위", image: "https://picsum.photos/seed/cp-ce3/280/180", date: "2026.02.13" },
      { title: "예능 프로그램 '함께 살아요' 시청률 20% 돌파", image: "https://picsum.photos/seed/cp-ce4/280/180", date: "2026.02.13" },
      { title: "베테랑 가수 이정현, 30주년 기념 콘서트 개최", image: "https://picsum.photos/seed/cp-ce5/280/180", date: "2026.02.12" },
      { title: "한국 웹툰 원작 할리우드 영화 제작 확정", image: "https://picsum.photos/seed/cp-ce6/280/180", date: "2026.02.12" },
    ],
  },
];

// ============================================================================
// END CUSTOMIZATION
// ============================================================================

import { useState, useEffect } from "react";
import { getArticles } from "@/lib/db";
import type { Article } from "@/types/article";

const PLACEHOLDER_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 280 180'%3E%3Crect width='280' height='180' fill='%23E5E7EB'/%3E%3C/svg%3E";

interface CategoryData {
  name: string;
  articles: { id?: string; title: string; image: string; date: string }[];
}

interface CulturepeopleCategoryNews3Props {
  mode?: "light" | "dark";
  articles?: Article[];
}

export default function CulturepeopleCategoryNews3({
  mode = "light",
  articles: articlesProp,
}: CulturepeopleCategoryNews3Props) {
  const colors = COLORS[mode];
  const [categories, setCategories] = useState<CategoryData[]>(DEFAULT_CATEGORIES);

  useEffect(() => {
    (async () => {
      try {
        const articles = (articlesProp !== undefined ? articlesProp : await getArticles())
          .filter((a) => a.status === "게시")
          .sort((a, b) => b.date.localeCompare(a.date));

        if (articles.length > 0) {
          const byCat: Record<string, typeof articles> = {};
          articles.forEach((a) => {
            const cat = a.category || "뉴스";
            if (!byCat[cat]) byCat[cat] = [];
            byCat[cat].push(a);
          });

          const catData: CategoryData[] = Object.entries(byCat)
            .filter(([, arr]) => arr.length >= 1)
            .slice(0, 4)
            .map(([cat, arr]) => ({
              name: cat,
              articles: arr.slice(0, 6).map((a, i) => ({
                id: a.id,
                title: a.title,
                image: a.thumbnail || PLACEHOLDER_IMG,
                date: a.date?.replace(/-/g, ".") || "",
              })),
            }));

          if (catData.length > 0) setCategories(catData);
        }
      } catch { /* ignore */ }
    })();
  }, [articlesProp]);

  return (
    <section
      className="w-full"
      style={{ backgroundColor: colors.bg, fontFamily: "'Noto Sans KR', sans-serif" }}
    >
      <div className="mx-auto max-w-[1200px] px-4 py-6">
        {categories.map((category, catIdx) => (
          <div key={category.name}>
            {/* Category Header */}
            <div
              className="mb-4 flex items-center justify-between border-b-2 pb-2"
              style={{ borderColor: colors.accent }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-sm text-xs font-bold text-white"
                  style={{ backgroundColor: colors.accent }}
                >
                  {category.name.charAt(0)}
                </span>
                <h2 className="text-lg font-bold" style={{ color: colors.title }}>
                  {category.name}
                </h2>
              </div>
              <a
                href={`/category/${encodeURIComponent(category.name)}`}
                className="text-xs hover:underline"
                style={{ color: colors.muted }}
              >
                더보기 &gt;
              </a>
            </div>

            {/* Articles Grid */}
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {category.articles.map((article, idx) => (
                <a
                  key={idx}
                  href={article.id ? `/article/${article.id}` : "#"}
                  className="group block overflow-hidden"
                >
                  <div className="aspect-[280/180] overflow-hidden rounded-sm">
                    <img
                      src={article.image}
                      alt={article.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = PLACEHOLDER_IMG; }}
                    />
                  </div>
                  <h3
                    className="mt-2 line-clamp-2 text-sm font-medium leading-snug transition-colors group-hover:text-[#E8192C]"
                    style={{ color: colors.title }}
                  >
                    {article.title}
                  </h3>
                  <span className="mt-1 block text-xs" style={{ color: colors.muted }}>
                    {article.date}
                  </span>
                </a>
              ))}
            </div>

            {/* Divider between categories */}
            {catIdx < categories.length - 1 && (
              <hr
                className="mb-6"
                style={{ borderColor: colors.border }}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
