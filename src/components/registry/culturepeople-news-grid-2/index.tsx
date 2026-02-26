"use client";

// ============================================================================
// CUSTOMIZATION - 이 섹션의 값들을 수정하여 프로젝트에 맞게 조정하세요
// ============================================================================

const COLORS = {
  light: {
    accent: "#E8192C",
    bg: "#FFFFFF",
    cardBg: "#FFFFFF",
    text: "#333333",
    title: "#000000",
    muted: "#999999",
    border: "#EEEEEE",
    sidebarBg: "#FFFFFF",
    rankBg: "#F5F5F5",
  },
  dark: {
    accent: "#E8192C",
    bg: "#1A1A1A",
    cardBg: "#222222",
    text: "#E0E0E0",
    title: "#FFFFFF",
    muted: "#AAAAAA",
    border: "#333333",
    sidebarBg: "#222222",
    rankBg: "#2A2A2A",
  },
} as const;

const DEFAULT_GRID_NEWS: { id?: string; title: string; image: string; category: string }[] = [];

const DEFAULT_BEST_ARTICLES: { rank: number; title: string; id?: string; views?: number }[] = [];

const DEFAULT_SIDEBAR_SECTIONS: { title: string; articles: { id?: string; title: string }[] }[] = [];

// ============================================================================
// END CUSTOMIZATION
// ============================================================================

import { useState, useEffect } from "react";
import { getArticles } from "@/lib/db";
import type { Article } from "@/types/article";

const PLACEHOLDER_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 218 161'%3E%3Crect width='218' height='161' fill='%23E5E7EB'/%3E%3C/svg%3E";

interface CulturepeopleNewsGrid2Props {
  mode?: "light" | "dark";
  articles?: Article[];
}

export default function CulturepeopleNewsGrid2({
  mode = "light",
  articles: articlesProp,
}: CulturepeopleNewsGrid2Props) {
  const colors = COLORS[mode];
  const [gridNews, setGridNews] = useState(DEFAULT_GRID_NEWS);
  const [bestArticles, setBestArticles] = useState(DEFAULT_BEST_ARTICLES);
  const [sidebarSections, setSidebarSections] = useState<{ title: string; articles: { id?: string; title: string }[] }[]>(DEFAULT_SIDEBAR_SECTIONS);

  useEffect(() => {
    (async () => {
      try {
        const articles = (articlesProp !== undefined ? articlesProp : await getArticles())
          .filter((a) => a.status === "게시")
          .sort((a, b) => b.date.localeCompare(a.date));

        if (articles.length > 0) {
          // Grid: latest 6 articles
          setGridNews(articles.slice(0, 6).map((a, i) => ({
            id: a.id,
            title: a.title,
            image: a.thumbnail || PLACEHOLDER_IMG,
            category: a.category || "뉴스",
          })));

          // Best: top 10 by views (서버 기반, localStorage 사용 안 함)
          const ranked = articles
            .filter((a) => a.status === "게시")
            .sort((a, b) => (b.views || 0) - (a.views || 0))
            .slice(0, 10);
          setBestArticles(ranked.map((a, i) => ({ rank: i + 1, title: a.title, id: a.id, views: a.views || 0 })));

          // Sidebar: group by category, pick 2 categories
          const byCat: Record<string, typeof articles> = {};
          articles.forEach((a) => {
            const cat = a.category || "뉴스";
            if (!byCat[cat]) byCat[cat] = [];
            byCat[cat].push(a);
          });
          const catEntries = Object.entries(byCat).filter(([, arr]) => arr.length >= 1).slice(0, 2);
          if (catEntries.length > 0) {
            setSidebarSections(catEntries.map(([cat, arr]) => ({
              title: cat,
              articles: arr.slice(0, 3).map((a) => ({ id: a.id, title: a.title })),
            })));
          }
        }
      } catch { /* ignore */ }
    })();
  }, [articlesProp]);

  return (
    <section
      className="w-full"
      style={{ backgroundColor: colors.bg, fontFamily: "'Noto Sans KR', sans-serif" }}
    >
      <div className="mx-auto max-w-[1200px] px-4 pb-6">
        <div className="flex flex-col gap-5 lg:flex-row">
          {/* Left: News Grid */}
          <div className="flex-1">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {gridNews.map((news, idx) => (
                <a
                  key={idx}
                  href={(news as { id?: string }).id ? `/article/${(news as { id?: string }).id}` : "#"}
                  className="group block overflow-hidden"
                >
                  <div className="aspect-[218/161] overflow-hidden rounded-sm">
                    <img
                      src={news.image}
                      alt={news.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = PLACEHOLDER_IMG; }}
                    />
                  </div>
                  <h3
                    className="mt-2 line-clamp-2 text-sm font-medium leading-snug transition-colors group-hover:text-[#E8192C]"
                    style={{ color: colors.title }}
                  >
                    {news.title}
                  </h3>
                </a>
              ))}
            </div>
          </div>

          {/* Right: Sidebar */}
          <div className="w-full shrink-0 lg:w-[320px]">
            {/* Best Articles */}
            <div
              className="mb-5 rounded-sm border p-4"
              style={{ borderColor: colors.border, backgroundColor: colors.sidebarBg }}
            >
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="inline-block h-5 w-1 rounded-full"
                  style={{ backgroundColor: colors.accent }}
                />
                <h3 className="text-base font-bold" style={{ color: colors.title }}>
                  이달의 TOP 10
                </h3>
              </div>
              <div className="space-y-0">
                {bestArticles.map((article) => (
                  <a
                    key={article.rank}
                    href={(article as { id?: string }).id ? `/article/${(article as { id?: string }).id}` : "#"}
                    className="flex items-start gap-3 border-b py-2.5 last:border-b-0"
                    style={{ borderColor: colors.border }}
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-xs font-bold text-white"
                      style={{
                        backgroundColor: article.rank <= 3 ? colors.accent : "#999999",
                      }}
                    >
                      {article.rank}
                    </span>
                    <span
                      className="line-clamp-2 text-sm leading-snug hover:text-[#E8192C]"
                      style={{ color: colors.text }}
                    >
                      {article.title}
                    </span>
                  </a>
                ))}
              </div>
            </div>

            {/* Category Mini Blocks */}
            {sidebarSections.map((section) => (
              <div
                key={section.title}
                className="mb-4 rounded-sm border p-4"
                style={{ borderColor: colors.border, backgroundColor: colors.sidebarBg }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-5 w-1 rounded-full"
                      style={{ backgroundColor: colors.accent }}
                    />
                    <h4 className="text-sm font-bold" style={{ color: colors.title }}>
                      {section.title}
                    </h4>
                  </div>
                  <a
                    href={`/category/${encodeURIComponent(section.title)}`}
                    className="text-xs hover:underline"
                    style={{ color: colors.muted }}
                  >
                    더보기 &gt;
                  </a>
                </div>
                <ul className="space-y-1.5">
                  {section.articles.map((article, idx) => (
                    <li key={idx}>
                      <a
                        href={article.id ? `/article/${article.id}` : "#"}
                        className="block truncate text-sm hover:text-[#E8192C]"
                        style={{ color: colors.text }}
                      >
                        · {article.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
