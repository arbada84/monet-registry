"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Article } from "@/types/article";
import CulturePeopleHeader from "./CulturePeopleHeader";
import CulturePeopleFooter from "./CulturePeopleFooter";
import PopupRenderer from "@/components/ui/PopupRenderer";
import CoupangAutoAd from "@/components/ui/CoupangAutoAd";

// ============================================================================
// BRAND COLORS
// ============================================================================
const BRAND = {
  deepPurple: "#5B4B9E",
  medium: "#7B6DAF",
  light: "#B0A5CC",
  lavender: "#D5CFE0",
  lavenderBg: "#F3F0F8",
  white: "#FFFFFF",
  textPrimary: "#1A1A2E",
  textSecondary: "#555555",
  textMuted: "#888888",
  border: "#E5E5E5",
} as const;

// ============================================================================
// TYPES
// ============================================================================

interface CategoryItem {
  id?: string;
  name: string;
  slug?: string;
  order: number;
  visible: boolean;
  parentId?: string | null;
}

interface SiteSettings {
  siteName?: string;
  slogan?: string;
}

interface Props {
  articles: Article[];
  categories?: string[];
  adSlots?: Record<string, React.ReactNode>;
  initialCategories?: CategoryItem[];
  initialSiteSettings?: SiteSettings;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(raw: string): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

function stripHtml(html: string): string {
  return (html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

function getArticleUrl(a: Article): string {
  return `/article/${a.no ?? a.id}`;
}

// ============================================================================
// SUB COMPONENTS
// ============================================================================

/** 히어로 메인 기사 카드 */
function HeroMainCard({ article }: { article: Article }) {
  return (
    <Link href={getArticleUrl(article)} className="group relative block w-full overflow-hidden rounded-xl" style={{ aspectRatio: "16/9", maxHeight: "400px" }}>
      {article.thumbnail ? (
        <Image
          src={article.thumbnail}
          alt={article.thumbnailAlt || article.title}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, 720px"
          priority
        />
      ) : (
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${BRAND.deepPurple}, ${BRAND.medium})` }} />
      )}
      {/* overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-5 md:p-8">
        <span
          className="inline-block px-2.5 py-1 text-[11px] font-semibold text-white rounded mb-3"
          style={{ backgroundColor: BRAND.deepPurple }}
        >
          {article.category}
        </span>
        <h2 className="text-xl md:text-2xl lg:text-3xl font-bold text-white leading-tight line-clamp-2 mb-2">
          {article.title}
        </h2>
        {article.summary && (
          <p className="text-sm text-white/80 line-clamp-2 leading-relaxed hidden md:block">
            {article.summary}
          </p>
        )}
        <span className="text-xs text-white/60 mt-2 inline-block">{formatDate(article.date)}</span>
      </div>
    </Link>
  );
}

/** 히어로 서브 기사 카드 */
function HeroSubCard({ article }: { article: Article }) {
  return (
    <Link href={getArticleUrl(article)} className="group flex gap-3 items-start">
      {article.thumbnail && (
        <div className="relative w-[100px] h-[66px] md:w-[120px] md:h-[80px] shrink-0 rounded-lg overflow-hidden bg-gray-100">
          <Image
            src={article.thumbnail}
            alt={article.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="120px"
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <span className="text-[11px] font-medium" style={{ color: BRAND.deepPurple }}>
          {article.category}
        </span>
        <h3 className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2 mt-0.5 group-hover:text-[#5B4B9E]">
          {article.title}
        </h3>
        <span className="text-[11px] text-gray-400 mt-1 inline-block">{formatDate(article.date)}</span>
      </div>
    </Link>
  );
}

/** 카테고리 섹션 (대표 1개 이미지 + 3개 텍스트 리스트) */
function CategorySection({ category, articles }: { category: string; articles: Article[] }) {
  if (articles.length === 0) return null;

  const mainArticle = articles[0];
  const listArticles = articles.slice(1, 4);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base md:text-lg font-bold text-gray-900 relative pl-3">
          <span
            className="absolute left-0 top-0.5 bottom-0.5 w-1 rounded-full"
            style={{ backgroundColor: BRAND.deepPurple }}
          />
          {category}
        </h2>
        <Link
          href={`/category/${encodeURIComponent(category)}`}
          className="text-xs font-medium hover:underline"
          style={{ color: BRAND.deepPurple }}
        >
          더보기 &gt;
        </Link>
      </div>

      {/* 대표 기사 (이미지 + 제목) */}
      <Link
        href={getArticleUrl(mainArticle)}
        className="group block rounded-lg overflow-hidden mb-2"
      >
        <div className="relative w-full overflow-hidden bg-gray-50" style={{ aspectRatio: "16/9" }}>
          {mainArticle.thumbnail ? (
            <Image
              src={mainArticle.thumbnail}
              alt={mainArticle.title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, 560px"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm">
              No Image
            </div>
          )}
        </div>
        <h3 className="text-[15px] font-semibold text-gray-900 leading-snug line-clamp-2 group-hover:text-[#5B4B9E] mt-2">
          {mainArticle.title}
        </h3>
      </Link>

      {/* 텍스트 리스트 (제목만) */}
      {listArticles.length > 0 && (
        <ul className="list-none m-0 p-0 space-y-1.5 mt-2">
          {listArticles.map((a) => (
            <li key={a.id}>
              <Link
                href={getArticleUrl(a)}
                className="flex items-start gap-1.5 text-[13px] text-gray-700 leading-snug hover:text-[#5B4B9E] transition-colors"
              >
                <span className="shrink-0 mt-[2px]" style={{ color: BRAND.deepPurple }}>·</span>
                <span className="line-clamp-1">{a.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 모바일 히어로 스와이프 */
function MobileHeroSwiper({ articles }: { articles: Article[] }) {
  const [current, setCurrent] = useState(0);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && current < articles.length - 1) {
        setCurrent((p) => p + 1);
      } else if (diff < 0 && current > 0) {
        setCurrent((p) => p - 1);
      }
    }
  }, [current, articles.length]);

  if (articles.length === 0) return null;
  const article = articles[current];

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl"
      style={{ aspectRatio: "16/9" }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <Link href={getArticleUrl(article)} className="block w-full h-full">
        {article.thumbnail ? (
          <Image
            src={article.thumbnail}
            alt={article.title}
            fill
            className="object-cover"
            sizes="100vw"
            priority
          />
        ) : (
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${BRAND.deepPurple}, ${BRAND.medium})` }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <span
            className="inline-block px-2 py-0.5 text-[10px] font-semibold text-white rounded mb-2"
            style={{ backgroundColor: BRAND.deepPurple }}
          >
            {article.category}
          </span>
          <h2 className="text-lg font-bold text-white leading-tight line-clamp-2">
            {article.title}
          </h2>
          <span className="text-[11px] text-white/60 mt-1 inline-block">{formatDate(article.date)}</span>
        </div>
      </Link>

      {/* Indicator Dots */}
      {articles.length > 1 && (
        <div className="absolute bottom-2 right-3 flex gap-1.5">
          {articles.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.preventDefault(); setCurrent(i); }}
              className="w-2 h-2 rounded-full transition-all"
              style={{ backgroundColor: i === current ? BRAND.deepPurple : "rgba(255,255,255,0.5)" }}
              aria-label={`슬라이드 ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function CulturePeopleLanding({
  articles = [],
  categories = [],
  adSlots = {},
  initialCategories = [],
  initialSiteSettings,
}: Props) {
  // 게시 상태 기사만
  const published = useMemo(
    () => articles.filter((a) => a.status === "게시"),
    [articles]
  );

  // 히어로 기사 (최신 4개)
  const heroArticles = useMemo(() => published.slice(0, 4), [published]);
  const heroMain = heroArticles[0];
  const heroSubs = heroArticles.slice(1, 4);

  // 카테고리 목록 결정
  const categoryList = useMemo(() => {
    if (categories && categories.length > 0) return categories;
    if (initialCategories && initialCategories.length > 0) {
      return initialCategories
        .filter((c) => c.visible !== false && !c.parentId)
        .sort((a, b) => a.order - b.order)
        .map((c) => c.name);
    }
    // 기사에서 추출
    const seen = new Set<string>();
    const result: string[] = [];
    for (const a of published) {
      if (a.category && !seen.has(a.category)) {
        seen.add(a.category);
        result.push(a.category);
      }
    }
    return result;
  }, [categories, initialCategories, published]);

  // 카테고리별 기사 그룹핑 (히어로 제외)
  const articlesByCategory = useMemo(() => {
    const heroIds = new Set(heroArticles.map((a) => a.id));
    const remaining = published.filter((a) => !heroIds.has(a.id));
    const map: Record<string, Article[]> = {};
    for (const cat of categoryList) {
      map[cat] = remaining.filter((a) => a.category === cat).slice(0, 4);
    }
    return map;
  }, [published, heroArticles, categoryList]);

  return (
    <div className="w-full min-h-screen bg-white" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <PopupRenderer />
      <CulturePeopleHeader initialCategories={initialCategories} initialSiteSettings={initialSiteSettings} />

      {/* 상단 광고 */}
      {adSlots.top && (
        <div className="mx-auto max-w-[1200px] px-4 pt-4">{adSlots.top}</div>
      )}

      {/* 히어로 섹션 */}
      <section className="mx-auto max-w-[1200px] px-4 py-4 md:py-6">
        {heroMain && (
          <>
            {/* PC: 메인 + 사이드 서브 */}
            <div className="hidden md:flex gap-6">
              <div className="flex-1 min-w-0">
                <HeroMainCard article={heroMain} />
              </div>
              {heroSubs.length > 0 && (
                <div className="w-[320px] shrink-0 flex flex-col gap-4 justify-between">
                  {heroSubs.map((a) => (
                    <HeroSubCard key={a.id} article={a} />
                  ))}
                </div>
              )}
            </div>

            {/* 모바일: 스와이프 */}
            <div className="md:hidden">
              <MobileHeroSwiper articles={heroArticles} />
            </div>
          </>
        )}
      </section>

      {/* 카테고리 섹션들 (2열 그리드) */}
      <div className="mx-auto max-w-[1200px] px-4 pb-10">
        {/* 첫 카테고리 뒤 광고를 위해 분리 */}
        {(() => {
          const elements: React.ReactNode[] = [];
          // 2개씩 묶어서 그리드 행을 구성
          for (let i = 0; i < categoryList.length; i += 2) {
            const pair = categoryList.slice(i, i + 2);
            elements.push(
              <div key={`row-${i}`} className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {pair.map((cat) => (
                  <CategorySection
                    key={cat}
                    category={cat}
                    articles={articlesByCategory[cat] || []}
                  />
                ))}
              </div>
            );

            // 첫 행 뒤 중간 광고
            if (i === 0 && adSlots["home-mid-1"]) {
              elements.push(
                <div key="ad-mid-1" className="mb-6">{adSlots["home-mid-1"]}</div>
              );
            }

            // 두 번째 행 뒤 쿠팡
            if (i === 2) {
              elements.push(
                <CoupangAutoAd
                  key="coupang-mid"
                  keyword={categoryList[2] || "문화"}
                  limit={4}
                  layout="scroll"
                  className="mb-6"
                />
              );
            }
          }
          return elements;
        })()}

        {/* 하단 광고 */}
        {adSlots.bottom && (
          <div className="mt-4 mb-6">{adSlots.bottom}</div>
        )}
      </div>

      <CulturePeopleFooter />
    </div>
  );
}
