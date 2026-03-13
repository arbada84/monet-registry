"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Article } from "@/types/article";
import InsightKoreaHeader from "./InsightKoreaHeader";
import InsightKoreaFooter from "./InsightKoreaFooter";
import PopupRenderer from "@/components/ui/PopupRenderer";
import CoupangAutoAd from "@/components/ui/CoupangAutoAd";

interface Props {
  articles: Article[];
  categoryName: string;
  allArticles: Article[];
  adSlots?: Record<string, React.ReactNode>;
}

const PER_PAGE = 20;

export default function InsightKoreaCategoryPage({ articles, categoryName, allArticles, adSlots }: Props) {
  const [visibleCount, setVisibleCount] = useState(PER_PAGE);

  const published = useMemo(
    () => articles.filter((a) => a.status === "게시").sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [articles]
  );

  const visible = published.slice(0, visibleCount);
  const hasMore = visibleCount < published.length;

  const topViewed = useMemo(
    () => [...allArticles].filter((a) => a.status === "게시").sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 10),
    [allArticles]
  );

  return (
    <div className="w-full min-h-screen bg-white" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <PopupRenderer />
      <InsightKoreaHeader />

      <div className="mx-auto max-w-[1200px] px-4 py-8">
        {/* 상단 광고 */}
        {adSlots?.["top"]}

        {/* 카테고리 헤더 */}
        <div className="mb-6 pb-3 border-b-2 border-gray-900">
          <h1 className="text-2xl font-bold text-gray-900">{categoryName}</h1>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* 기사 목록 */}
          <div className="flex-1 min-w-0">
            <div className="divide-y divide-gray-100">
              {visible.map((a, idx) => (
                <div key={a.id}>
                  <Link
                    href={`/article/${a.no ?? a.id}`}
                    className="flex gap-4 py-5 group"
                  >
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-semibold text-gray-900 leading-snug mb-1.5 group-hover:text-[#d2111a] line-clamp-2">
                        {a.title}
                      </h2>
                      <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed">
                        {(a.body || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").slice(0, 150)}
                      </p>
                      <span className="text-xs text-gray-400 mt-2 inline-block">{a.date}</span>
                    </div>
                    {a.thumbnail && (
                      <div className="relative w-[140px] h-[94px] shrink-0 rounded overflow-hidden bg-gray-100">
                        <Image
                          src={a.thumbnail}
                          alt={a.title}
                          fill
                          className="object-cover"
                          sizes="140px"
                          unoptimized
                        />
                      </div>
                    )}
                  </Link>
                  {/* 5번째 기사 뒤에 중간 광고 삽입 */}
                  {idx === 4 && adSlots?.["middle"]}
                </div>
              ))}
            </div>

            {hasMore && (
              <button
                onClick={() => setVisibleCount((c) => c + PER_PAGE)}
                className="w-full py-3 mt-4 text-sm text-gray-600 border border-gray-200 rounded hover:bg-gray-50"
              >
                더보기 ({published.length - visibleCount}건 남음)
              </button>
            )}

            {published.length === 0 && (
              <div className="py-20 text-center text-gray-400">
                이 카테고리에 게시된 기사가 없습니다.
              </div>
            )}

            {/* 하단 광고 + 쿠팡 자동 추천 */}
            {adSlots?.["bottom"]}
            <CoupangAutoAd
              keyword={categoryName}
              limit={4}
              layout="grid"
              className="my-6"
            />
          </div>

          {/* 사이드바 */}
          <div className="w-full lg:w-[280px] shrink-0">
            <div className="sticky top-4">
              <div className="mb-4 pb-2 border-b-2 border-gray-900">
                <h3 className="text-base font-bold text-gray-900">많이 본 뉴스</h3>
              </div>
              <div className="space-y-3">
                {topViewed.map((a, i) => (
                  <Link key={a.id} href={`/article/${a.no ?? a.id}`} className="flex gap-3 group">
                    <span
                      className="text-lg font-bold shrink-0 w-6 text-center"
                      style={{ color: i < 3 ? "#d2111a" : "#999" }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-sm text-gray-700 leading-snug line-clamp-2 group-hover:text-[#d2111a]">
                      {a.title}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <InsightKoreaFooter />
    </div>
  );
}
