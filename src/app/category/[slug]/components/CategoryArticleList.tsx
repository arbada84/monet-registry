"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Article } from "@/types/article";

const ITEMS_PER_LOAD = 12;

interface Props {
  articles: Article[];
  categoryName: string;
}

export default function CategoryArticleList({ articles, categoryName }: Props) {
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_LOAD);

  const visibleArticles = articles.slice(0, visibleCount);
  const hasMore = visibleCount < articles.length;

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + ITEMS_PER_LOAD);
  };

  if (articles.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="text-gray-500 text-lg mb-4">아직 기사가 없습니다.</p>
        <Link
          href="/"
          className="inline-block px-5 py-2 rounded text-sm text-white"
          style={{ backgroundColor: "#E8192C" }}
        >
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-0">
        {visibleArticles.map((article) => (
          <Link
            key={article.id}
            href={`/article/${article.id}`}
            className="flex gap-4 py-5 border-b border-gray-200 hover:bg-gray-50 transition-colors group"
          >
            {article.thumbnail ? (
              <div className="w-[110px] h-[75px] sm:w-[160px] sm:h-[105px] md:w-[200px] md:h-[130px] shrink-0 overflow-hidden rounded relative">
                <Image
                  src={article.thumbnail}
                  alt={article.title}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform"
                  sizes="200px"
                />
              </div>
            ) : (
              <div className="w-[110px] h-[75px] sm:w-[160px] sm:h-[105px] md:w-[200px] md:h-[130px] shrink-0 bg-gray-100 rounded flex items-center justify-center text-gray-300 text-2xl">
                📰
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-[#E8192C] transition-colors leading-snug">
                {article.title}
              </h2>
              <p className="text-sm text-gray-600 line-clamp-2 mb-3 leading-relaxed">
                {article.body.replace(/<[^>]*>/g, "").slice(0, 120)}...
              </p>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span>{article.date}</span>
                <span>조회 {article.views.toLocaleString()}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* 더 보기 버튼 */}
      {hasMore && (
        <div className="flex justify-center mt-8">
          <button
            onClick={handleLoadMore}
            className="px-8 py-3 border-2 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            style={{ borderColor: "#E8192C", color: "#E8192C" }}
          >
            더 보기 ({articles.length - visibleCount}건 남음)
          </button>
        </div>
      )}

      {/* 모두 로드됐을 때 */}
      {!hasMore && articles.length > ITEMS_PER_LOAD && (
        <div className="text-center mt-8 text-sm text-gray-400">
          {categoryName} 기사를 모두 확인했습니다.
        </div>
      )}
    </div>
  );
}
