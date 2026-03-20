"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
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
  categoryName: string;
  allArticles: Article[];
  adSlots?: Record<string, React.ReactNode>;
  categories?: CategoryItem[];
  siteSettings?: SiteSettings;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PER_PAGE = 20;

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
  return (html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function CulturePeopleCategoryPage({
  articles = [],
  categoryName = "",
  allArticles = [],
  adSlots = {},
  categories,
  siteSettings,
}: Props) {
  const searchParams = useSearchParams();
  const urlItems = Math.max(PER_PAGE, parseInt(searchParams.get("items") || String(PER_PAGE), 10));
  const [visibleCount, setVisibleCount] = useState(urlItems);

  useEffect(() => {
    setVisibleCount(urlItems);
  }, [urlItems]);

  // articles는 서버에서 이미 필터+정렬 완료
  const published = articles;
  const visible = published.slice(0, visibleCount);
  const hasMore = visibleCount < published.length;

  // 인기 기사 (조회수 기준)
  const topViewed = useMemo(
    () =>
      [...allArticles]
        .filter((a) => a.status === "게시")
        .sort((a, b) => (b.views || 0) - (a.views || 0))
        .slice(0, 10),
    [allArticles]
  );

  const handleLoadMore = () => {
    const newCount = visibleCount + PER_PAGE;
    setVisibleCount(newCount);
    const params = new URLSearchParams(window.location.search);
    params.set("items", String(newCount));
    window.history.replaceState(null, "", `?${params.toString()}`);
  };

  return (
    <div className="w-full min-h-screen bg-white" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <PopupRenderer />
      <CulturePeopleHeader initialCategories={categories} initialSiteSettings={siteSettings} />

      <div className="mx-auto max-w-[1200px] px-4 py-6 md:py-8">
        {/* 상단 광고 */}
        {adSlots["top"] && <div className="mb-6">{adSlots["top"]}</div>}

        {/* 카테고리 헤더 */}
        <div className="mb-6 pb-3 border-b-2" style={{ borderColor: BRAND.deepPurple }}>
          <h1 className="text-2xl font-bold text-gray-900">{categoryName}</h1>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* ─── 기사 목록 ─── */}
          <div className="flex-1 min-w-0">
            <div className="divide-y" style={{ borderColor: "#F0F0F0" }}>
              {visible.map((a, idx) => (
                <div key={a.id}>
                  <Link
                    href={`/article/${a.no ?? a.id}`}
                    className="flex gap-4 py-5 group"
                  >
                    {/* 왼쪽: 썸네일 */}
                    {a.thumbnail && (
                      <div className="relative w-[120px] h-[80px] sm:w-[160px] sm:h-[107px] shrink-0 rounded-lg overflow-hidden bg-gray-50">
                        <Image
                          src={a.thumbnail}
                          alt={a.title}
                          fill
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                          sizes="(max-width: 640px) 120px, 160px"
                        />
                      </div>
                    )}

                    {/* 오른쪽: 텍스트 */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <h2 className="text-[15px] md:text-base font-semibold text-gray-900 leading-snug mb-1.5 group-hover:text-[#5B4B9E] line-clamp-2">
                        {a.title}
                      </h2>
                      <p className="text-[13px] text-gray-500 line-clamp-2 leading-relaxed mb-2 hidden sm:block">
                        {stripHtml(a.body).slice(0, 150)}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-gray-400">
                        {a.author && <span>{a.author}</span>}
                        <span>{formatDate(a.date)}</span>
                        <span>조회 {(a.views || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </Link>

                  {/* 5번째 기사 뒤에 중간 광고 */}
                  {idx === 4 && adSlots["middle"] && (
                    <div className="py-3">{adSlots["middle"]}</div>
                  )}
                </div>
              ))}
            </div>

            {/* 더보기 버튼 */}
            {hasMore && (
              <button
                onClick={handleLoadMore}
                className="w-full py-3.5 mt-5 text-sm font-medium rounded-lg border transition-colors"
                style={{
                  borderColor: BRAND.lavender,
                  color: BRAND.deepPurple,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = BRAND.lavenderBg;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                }}
              >
                더보기 ({published.length - visibleCount}건 남음)
              </button>
            )}

            {/* 기사 없음 */}
            {published.length === 0 && (
              <div className="py-20 text-center text-gray-400">
                이 카테고리에 게시된 기사가 없습니다.
              </div>
            )}

            {/* 하단 광고 */}
            {adSlots["bottom"] && <div className="mt-6">{adSlots["bottom"]}</div>}

            {/* 쿠팡 자동 추천 */}
            <CoupangAutoAd
              keyword={categoryName}
              limit={4}
              layout="grid"
              className="my-6"
            />
          </div>

          {/* ─── 사이드바 ─── */}
          <aside className="w-full lg:w-[300px] shrink-0">
            <div className="sticky top-20">
              {/* 인기기사 */}
              <div className="mb-4 pb-2 border-b-2" style={{ borderColor: BRAND.deepPurple }}>
                <h3 className="text-base font-bold text-gray-900">인기기사</h3>
              </div>
              <div className="space-y-3">
                {topViewed.map((a, i) => (
                  <Link key={a.id} href={`/article/${a.no ?? a.id}`} className="flex gap-3 group">
                    <span
                      className="text-lg font-bold shrink-0 w-6 text-center"
                      style={{ color: i < 3 ? BRAND.deepPurple : "#999" }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-sm text-gray-700 leading-snug line-clamp-2 group-hover:text-[#5B4B9E]">
                      {a.title}
                    </span>
                  </Link>
                ))}
              </div>

              {/* 사이드바 광고 */}
              {adSlots["right"] && (
                <div className="mt-6">{adSlots["right"]}</div>
              )}

              {/* 쿠팡 */}
              <CoupangAutoAd
                keyword={categoryName}
                limit={2}
                layout="grid"
                className="mt-6"
              />
            </div>
          </aside>
        </div>
      </div>

      <CulturePeopleFooter />
    </div>
  );
}
