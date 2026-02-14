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

const DEFAULT_GRID_NEWS = [
  { title: "정부, 2026년 하반기 경제 정책 방향 발표", image: "https://picsum.photos/seed/cp-g1/218/161", category: "뉴스" },
  { title: "서울시, 대규모 도시 재생 프로젝트 착수", image: "https://picsum.photos/seed/cp-g2/218/161", category: "뉴스" },
  { title: "IT 업계, AI 인재 확보 전쟁 심화", image: "https://picsum.photos/seed/cp-g3/218/161", category: "뉴스" },
  { title: "주요 대학 입시 제도 개편안 확정", image: "https://picsum.photos/seed/cp-g4/218/161", category: "뉴스" },
  { title: "한국은행, 기준금리 동결 결정 배경", image: "https://picsum.photos/seed/cp-g5/218/161", category: "경제" },
  { title: "글로벌 반도체 수급 안정세 전망", image: "https://picsum.photos/seed/cp-g6/218/161", category: "경제" },
];

const DEFAULT_BEST_ARTICLES = [
  { rank: 1, title: "2026년 부동산 시장 전망과 투자 전략" },
  { rank: 2, title: "건강보험 개편안, 달라지는 혜택 총정리" },
  { rank: 3, title: "AI가 바꾸는 일상: 생활 속 인공지능 활용법" },
  { rank: 4, title: "올해 주목할 해외여행 트렌드 5가지" },
  { rank: 5, title: "퇴직 후 재취업, 성공하는 사람들의 비결" },
];

const DEFAULT_SIDEBAR_SECTIONS = [
  {
    title: "스포츠",
    articles: [
      "프로야구 2026 시즌 개막전 일정 확정",
      "손흥민, 리그 10호 골 폭발적 활약",
      "여자 배구 올스타전 팬 투표 시작",
    ],
  },
  {
    title: "지역뉴스",
    articles: [
      "부산 해운대 관광특구 야간 축제 개최",
      "제주도 감귤 수확량 역대 최고 기록",
      "대구 도심 재개발 사업 주민 설명회",
    ],
  },
];

// ============================================================================
// END CUSTOMIZATION
// ============================================================================

import { useState, useEffect } from "react";

interface StoredArticle {
  id: string;
  title: string;
  category: string;
  date: string;
  status: string;
  views: number;
  body: string;
  thumbnail: string;
}

interface CulturepeopleNewsGrid2Props {
  mode?: "light" | "dark";
}

export default function CulturepeopleNewsGrid2({
  mode = "light",
}: CulturepeopleNewsGrid2Props) {
  const colors = COLORS[mode];
  const [gridNews, setGridNews] = useState(DEFAULT_GRID_NEWS);
  const [bestArticles, setBestArticles] = useState(DEFAULT_BEST_ARTICLES);
  const [sidebarSections, setSidebarSections] = useState(DEFAULT_SIDEBAR_SECTIONS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("cp-articles");
      if (raw) {
        const articles: StoredArticle[] = JSON.parse(raw)
          .filter((a: StoredArticle) => a.status === "게시")
          .sort((a: StoredArticle, b: StoredArticle) => b.date.localeCompare(a.date));

        if (articles.length > 0) {
          // Grid: latest 6 articles
          setGridNews(articles.slice(0, 6).map((a, i) => ({
            id: a.id,
            title: a.title,
            image: a.thumbnail || `https://picsum.photos/seed/cp-g${i + 1}/218/161`,
            category: a.category || "뉴스",
          })));

          // Best: top 10 by monthly views
          const viewLog: { articleId: string; timestamp: string }[] = JSON.parse(localStorage.getItem("cp-view-log") || "[]");
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          const cutoff = thirtyDaysAgo.toISOString();
          const monthlyViews: Record<string, number> = {};
          viewLog.forEach((v) => {
            if (v.timestamp >= cutoff) monthlyViews[v.articleId] = (monthlyViews[v.articleId] || 0) + 1;
          });
          const ranked = articles
            .map((a) => ({ ...a, monthViews: monthlyViews[a.id] || a.views || 0 }))
            .sort((a, b) => b.monthViews - a.monthViews)
            .slice(0, 10);
          setBestArticles(ranked.map((a, i) => ({ rank: i + 1, title: a.title, id: a.id, views: a.monthViews })));

          // Sidebar: group by category, pick 2 categories
          const byCat: Record<string, StoredArticle[]> = {};
          articles.forEach((a) => {
            const cat = a.category || "뉴스";
            if (!byCat[cat]) byCat[cat] = [];
            byCat[cat].push(a);
          });
          const catEntries = Object.entries(byCat).filter(([, arr]) => arr.length >= 1).slice(0, 2);
          if (catEntries.length > 0) {
            setSidebarSections(catEntries.map(([cat, arr]) => ({
              title: cat,
              articles: arr.slice(0, 3).map((a) => a.title),
            })));
          }
        }
      }
    } catch { /* ignore */ }
  }, []);

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
                        href="#"
                        className="block truncate text-sm hover:text-[#E8192C]"
                        style={{ color: colors.text }}
                      >
                        · {article}
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
