"use client";

import { useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Article } from "@/types/article";
import InsightKoreaHeader from "./InsightKoreaHeader";
import InsightKoreaFooter from "./InsightKoreaFooter";
import ArticleShare from "@/app/article/[id]/components/ArticleShare";
import ArticleBody from "@/app/article/[id]/components/ArticleBody";
import CommentSection from "@/app/article/[id]/components/CommentSection";
import NewsletterWidget from "@/components/ui/NewsletterWidget";

interface Props {
  article: Article;
  bodyFirst: string;
  bodySecond: string;
  commentEnabled: boolean;
  topArticles: Article[];
  adSlots?: Record<string, React.ReactNode>;
}

export default function InsightKoreaArticlePage({ article, bodyFirst, bodySecond, commentEnabled, topArticles, adSlots }: Props) {
  const top10 = useMemo(
    () => topArticles.slice(0, 10),
    [topArticles]
  );

  return (
    <>
      <InsightKoreaHeader />

      <div className="mx-auto max-w-[1200px] px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* 기사 본문 */}
          <article className="flex-1 min-w-0">
            {/* 카테고리 태그 */}
            <Link
              href={`/category/${encodeURIComponent(article.category)}`}
              className="inline-block px-3 py-1 text-xs font-semibold text-white rounded mb-3"
              style={{ backgroundColor: "#d2111a" }}
            >
              {article.category}
            </Link>

            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight mb-4">
              {article.title}
            </h1>

            {/* 메타정보 */}
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 mb-6 pb-5 border-b border-gray-200">
              {article.author && (
                <Link href={`/reporter/${encodeURIComponent(article.author)}`} className="hover:text-[#d2111a]">
                  {article.author} 기자
                </Link>
              )}
              <span>|</span>
              <span>입력 {article.date}</span>
              {article.updatedAt && article.updatedAt !== article.date && (
                <>
                  <span>|</span>
                  <span>수정 {article.updatedAt}</span>
                </>
              )}
              <span>|</span>
              <span>조회 {(article.views || 0).toLocaleString()}</span>
            </div>

            {/* 요약 */}
            {article.summary && (
              <div className="mb-6 py-4 px-5 border-l-4 bg-gray-50 text-sm text-gray-700 leading-relaxed" style={{ borderLeftColor: "#d2111a" }}>
                {article.summary}
              </div>
            )}

            {/* 대표이미지 */}
            {article.thumbnail && (
              <div className="mb-6 relative w-full overflow-hidden rounded" style={{ aspectRatio: "16/9" }}>
                <Image
                  src={article.thumbnail}
                  alt={article.thumbnailAlt || article.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 800px"
                  priority
                  unoptimized={!article.thumbnail.includes("supabase")}
                />
              </div>
            )}

            {adSlots?.["article-top"]}

            {/* 본문 */}
            {bodySecond ? (
              <>
                <ArticleBody html={bodyFirst} />
                {adSlots?.["article-inline"]}
                <ArticleBody html={bodySecond} />
              </>
            ) : (
              <ArticleBody html={article.body} />
            )}

            {adSlots?.["article-bottom"]}

            {/* 태그 */}
            {article.tags && (
              <div className="flex flex-wrap gap-2 mb-6 pt-6 border-t border-gray-200">
                <span className="text-sm font-semibold text-gray-700 mr-1">키워드</span>
                {article.tags.split(",").map((tag) => (
                  <Link
                    key={tag.trim()}
                    href={`/tag/${encodeURIComponent(tag.trim())}`}
                    className="px-3 py-1 text-xs border border-gray-300 rounded text-gray-600 hover:border-[#d2111a] hover:text-[#d2111a]"
                  >
                    #{tag.trim()}
                  </Link>
                ))}
              </div>
            )}

            <ArticleShare title={article.title} />

            {/* 기자정보 */}
            {article.author && (
              <Link
                href={`/reporter/${encodeURIComponent(article.author)}`}
                className="flex items-center gap-4 p-4 bg-gray-50 rounded mb-6 mt-6 hover:bg-gray-100"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0"
                  style={{ background: "#d2111a" }}
                >
                  {article.author.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-800">
                    {article.author} 기자{article.authorEmail ? ` (${article.authorEmail})` : ""}
                  </div>
                  <div className="text-xs text-gray-500">다른기사 보기 +</div>
                </div>
              </Link>
            )}

            <div className="text-xs text-gray-400 py-4 border-t border-gray-100 mb-6">
              저작권자 &copy; 컬처피플 무단전재 및 재배포 금지
            </div>

            <NewsletterWidget />
            <CommentSection articleId={article.id} articleTitle={article.title} disabled={!commentEnabled} />
          </article>

          {/* 사이드바 */}
          <div className="w-full lg:w-[280px] shrink-0">
            <div className="sticky top-4">
              <div className="mb-4 pb-2 border-b-2 border-gray-900">
                <h3 className="text-base font-bold text-gray-900">많이 본 뉴스</h3>
              </div>
              <div className="space-y-3">
                {top10.map((a, i) => (
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
    </>
  );
}
