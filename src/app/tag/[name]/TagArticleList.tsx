"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Article } from "@/types/article";

const PER_PAGE = 20;

export default function TagArticleList({
  articles,
  accent,
}: {
  articles: Article[];
  accent: string;
}) {
  const [visibleCount, setVisibleCount] = useState(PER_PAGE);
  const visible = articles.slice(0, visibleCount);
  const hasMore = visibleCount < articles.length;

  return (
    <>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {visible.map((article) => (
          <Link
            key={article.id}
            href={`/article/${article.no ?? article.id}`}
            className="group block bg-white border border-gray-100 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
          >
            {article.thumbnail ? (
              <div
                className="relative w-full overflow-hidden"
                style={{ aspectRatio: "16/9" }}
              >
                <Image
                  src={article.thumbnail}
                  alt={article.thumbnailAlt || article.title}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  unoptimized
                />
              </div>
            ) : (
              <div
                className="w-full flex items-center justify-center text-gray-300 text-4xl"
                style={{ aspectRatio: "16/9", background: "#F5F5F5" }}
              >
                📰
              </div>
            )}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-xs font-medium"
                  style={{ color: accent }}
                >
                  {article.category}
                </span>
                <span className="text-xs text-gray-400">{article.date}</span>
              </div>
              <h2 className="text-sm font-bold text-gray-900 leading-snug mb-2 line-clamp-2 transition-colors group-hover:text-[var(--tag-accent)]">
                {article.title}
              </h2>
              {article.summary && (
                <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
                  {article.summary}
                </p>
              )}
              {article.author && (
                <div className="mt-3 text-xs text-gray-400">
                  {article.author?.replace(/ 기자$/, "")} 기자
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
      {hasMore && (
        <div className="mt-8 text-center">
          <button
            onClick={() => setVisibleCount((c) => c + PER_PAGE)}
            className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            더 보기 ({articles.length - visibleCount}건 남음)
          </button>
        </div>
      )}
    </>
  );
}
