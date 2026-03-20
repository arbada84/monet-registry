"use client";

import { useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Article } from "@/types/article";
import CulturePeopleHeader from "./CulturePeopleHeader";
import CulturePeopleFooter from "./CulturePeopleFooter";
import ArticleBody from "@/app/article/[id]/components/ArticleBody";
import ArticleShare from "@/app/article/[id]/components/ArticleShare";
import CommentSection from "@/app/article/[id]/components/CommentSection";
import NewsletterWidget from "@/components/ui/NewsletterWidget";
import CoupangAutoAd from "@/components/ui/CoupangAutoAd";
import { parseTags } from "@/lib/html-utils";

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

interface PrevNextArticle {
  no: number;
  title: string;
}

interface Props {
  article: Article;
  bodyFirst: string;
  bodySecond: string;
  commentEnabled: boolean;
  topArticles: Article[];
  adSlots?: Record<string, React.ReactNode>;
  categories?: CategoryItem[];
  siteSettings?: SiteSettings;
  prevArticle?: PrevNextArticle;
  nextArticle?: PrevNextArticle;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(raw: string): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function CulturePeopleArticlePage({
  article,
  bodyFirst,
  bodySecond,
  commentEnabled = false,
  topArticles = [],
  adSlots = {},
  categories,
  siteSettings,
  prevArticle,
  nextArticle,
}: Props) {
  const top10 = useMemo(
    () => topArticles.slice(0, 10),
    [topArticles]
  );

  const tags = useMemo(
    () => (article.tags ? parseTags(article.tags) : []),
    [article.tags]
  );

  // 관련기사: 같은 카테고리, 현재 기사 제외, 최대 4개
  const relatedArticles = useMemo(
    () =>
      topArticles
        .filter((a) => a.category === article.category && a.id !== article.id)
        .slice(0, 4),
    [topArticles, article.category, article.id]
  );

  return (
    <div className="w-full min-h-screen bg-white" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <CulturePeopleHeader initialCategories={categories} initialSiteSettings={siteSettings} />

      <div className="mx-auto max-w-[1200px] px-4 py-6 md:py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* ─── 본문 영역 ─── */}
          <article className="flex-1 min-w-0">
            {/* 카테고리 배지 */}
            <Link
              href={`/category/${encodeURIComponent(article.category)}`}
              className="inline-block px-3 py-1 text-xs font-semibold text-white rounded mb-3 hover:opacity-90 transition-opacity"
              style={{ backgroundColor: BRAND.deepPurple }}
            >
              {article.category}
            </Link>

            {/* 제목 */}
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight mb-4">
              {article.title}
            </h1>

            {/* 메타 정보 */}
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 mb-6 pb-5 border-b" style={{ borderColor: "#E5E5E5" }}>
              {article.author && (
                <Link
                  href={`/reporter/${encodeURIComponent(article.author)}`}
                  className="hover:underline"
                  style={{ color: BRAND.deepPurple }}
                >
                  {article.author?.replace(/ 기자$/, "")} 기자
                </Link>
              )}
              <span className="text-gray-300">|</span>
              <span>입력 {article.date}</span>
              {article.updatedAt && !article.updatedAt.startsWith(article.date?.slice(0, 10) || "") && (
                <>
                  <span className="text-gray-300">|</span>
                  <span>수정 {formatDate(article.updatedAt)}</span>
                </>
              )}
              <span className="text-gray-300">|</span>
              <span>조회 {(article.views || 0).toLocaleString()}</span>
            </div>

            {/* 요약 */}
            {article.summary && (
              <div
                className="mb-6 py-4 px-5 text-sm text-gray-700 leading-relaxed rounded-r-lg"
                style={{
                  borderLeft: `4px solid ${BRAND.deepPurple}`,
                  backgroundColor: BRAND.lavenderBg,
                }}
              >
                {article.summary}
              </div>
            )}

            {/* 대표 이미지 */}
            {article.thumbnail && (
              <div className="mb-6 relative w-full overflow-hidden rounded-lg" style={{ aspectRatio: "16/9" }}>
                <Image
                  src={article.thumbnail}
                  alt={article.thumbnailAlt || article.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 800px"
                  priority
                />
              </div>
            )}

            {/* 본문 상단 광고 */}
            {adSlots["article-top"] && (
              <div className="mb-6">{adSlots["article-top"]}</div>
            )}

            {/* 본문 */}
            {bodySecond ? (
              <>
                <ArticleBody html={bodyFirst} />
                {adSlots["article-inline"] && (
                  <div className="my-6">{adSlots["article-inline"]}</div>
                )}
                <ArticleBody html={bodySecond} />
              </>
            ) : (
              <ArticleBody html={article.body} />
            )}

            {/* 하단 광고 */}
            {adSlots["article-bottom"] && (
              <div className="my-6">{adSlots["article-bottom"]}</div>
            )}

            {/* 쿠팡 자동 추천 */}
            <CoupangAutoAd
              keyword={tags[0] || article.category}
              limit={4}
              layout="scroll"
              className="my-6"
            />

            {/* 관련기사 */}
            {relatedArticles.length > 0 && (
              <div className="mb-6 pt-6 border-t" style={{ borderColor: "#E5E5E5" }}>
                <h3 className="text-base font-bold text-gray-900 relative pl-3 mb-4">
                  <span
                    className="absolute left-0 top-0.5 bottom-0.5 w-1 rounded-full"
                    style={{ backgroundColor: BRAND.deepPurple }}
                  />
                  관련기사
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {relatedArticles.map((a) => (
                    <Link
                      key={a.id}
                      href={`/article/${a.no ?? a.id}`}
                      className="group flex gap-3 items-start"
                    >
                      {a.thumbnail && (
                        <div className="relative w-[100px] h-[66px] shrink-0 rounded-md overflow-hidden bg-gray-100">
                          <Image
                            src={a.thumbnail}
                            alt={a.title}
                            fill
                            className="object-cover transition-transform duration-300 group-hover:scale-105"
                            sizes="100px"
                          />
                        </div>
                      )}
                      <span className="text-sm text-gray-700 leading-snug line-clamp-2 group-hover:text-[#5B4B9E]">
                        {a.title}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* 태그 */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6 pt-6 border-t" style={{ borderColor: "#E5E5E5" }}>
                <span className="text-sm font-semibold text-gray-700 mr-1">키워드</span>
                {tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/tag/${encodeURIComponent(tag)}`}
                    className="px-3 py-1 text-xs border rounded transition-colors"
                    style={{ borderColor: BRAND.lavender, color: BRAND.medium }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = BRAND.deepPurple;
                      (e.currentTarget as HTMLElement).style.color = BRAND.deepPurple;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = BRAND.lavender;
                      (e.currentTarget as HTMLElement).style.color = BRAND.medium;
                    }}
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            )}

            {/* 공유 */}
            <ArticleShare title={article.title} />

            {/* 기자 정보 */}
            {article.author && (
              <Link
                href={`/reporter/${encodeURIComponent(article.author)}`}
                className="flex items-center gap-4 p-4 rounded-lg mb-6 mt-6 transition-colors"
                style={{ backgroundColor: BRAND.lavenderBg }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#EBE6F4"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = BRAND.lavenderBg; }}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0"
                  style={{ background: `linear-gradient(135deg, ${BRAND.deepPurple}, ${BRAND.medium})` }}
                >
                  {article.author.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-800">
                    {article.author?.replace(/ 기자$/, "")} 기자
                    {article.authorEmail ? ` (${article.authorEmail})` : ""}
                  </div>
                  <div className="text-xs" style={{ color: BRAND.medium }}>다른기사 보기 +</div>
                </div>
              </Link>
            )}

            {/* 저작권 */}
            <div className="text-xs text-gray-400 py-4 border-t mb-6" style={{ borderColor: "#F0F0F0" }}>
              저작권자 &copy; {siteSettings?.siteName || "컬처피플"} 무단전재 및 재배포 금지
            </div>

            {/* 이전글/다음글 네비게이션 */}
            {(prevArticle || nextArticle) && (
              <div className="mb-6 border rounded-lg overflow-hidden" style={{ borderColor: "#E5E5E5" }}>
                <div className="flex flex-col md:flex-row">
                  {/* 이전글 */}
                  <div className="flex-1 border-b md:border-b-0 md:border-r" style={{ borderColor: "#E5E5E5" }}>
                    {prevArticle ? (
                      <Link
                        href={`/article/${prevArticle.no}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" className="shrink-0">
                          <path d="M15 18l-6-6 6-6" />
                        </svg>
                        <div className="min-w-0">
                          <span className="text-[11px] text-gray-400 block">이전글</span>
                          <span className="text-sm text-gray-700 line-clamp-1 group-hover:text-[#5B4B9E]">{prevArticle.title}</span>
                        </div>
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-3 text-gray-300">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                          <path d="M15 18l-6-6 6-6" />
                        </svg>
                        <span className="text-sm">이전글이 없습니다</span>
                      </div>
                    )}
                  </div>

                  {/* 다음글 */}
                  <div className="flex-1">
                    {nextArticle ? (
                      <Link
                        href={`/article/${nextArticle.no}`}
                        className="flex items-center justify-end gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group text-right"
                      >
                        <div className="min-w-0">
                          <span className="text-[11px] text-gray-400 block">다음글</span>
                          <span className="text-sm text-gray-700 line-clamp-1 group-hover:text-[#5B4B9E]">{nextArticle.title}</span>
                        </div>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" className="shrink-0">
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </Link>
                    ) : (
                      <div className="flex items-center justify-end gap-3 px-4 py-3 text-gray-300 text-right">
                        <span className="text-sm">다음글이 없습니다</span>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 뉴스레터 */}
            <NewsletterWidget />

            {/* 댓글 */}
            <CommentSection articleId={article.id} articleTitle={article.title} disabled={!commentEnabled} />
          </article>

          {/* ─── 사이드바 ─── */}
          <aside className="w-full lg:w-[300px] shrink-0">
            <div className="sticky top-20">
              {/* 인기기사 TOP10 */}
              <div className="mb-4 pb-2 border-b-2" style={{ borderColor: BRAND.deepPurple }}>
                <h3 className="text-base font-bold text-gray-900">인기기사</h3>
              </div>
              <div className="space-y-3">
                {top10.map((a, i) => (
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

              {/* 사이드바 쿠팡 */}
              <CoupangAutoAd
                keyword={article.category}
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
