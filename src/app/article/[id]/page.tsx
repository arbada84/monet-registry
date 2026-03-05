import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { serverGetArticleById, serverGetArticleByNo, serverGetSetting } from "@/lib/db-server";

// 같은 요청 내에서 중복 DB 쿼리 방지 (generateMetadata + page 공유)
// 숫자면 순서 번호로, UUID면 id로 조회
const getArticle = cache((id: string) => {
  // 숫자 ID: 최대 9자리(10억)로 제한하여 parseInt 오버플로우 방지
  if (/^\d+$/.test(id) && id.length <= 9) return serverGetArticleByNo(parseInt(id, 10));
  return serverGetArticleById(id);
});
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";
import ArticleShare from "./components/ArticleShare";
import ArticleBody from "./components/ArticleBody";
import CommentSection from "./components/CommentSection";
import ArticleViewTracker from "./components/ArticleViewTracker";
import ArticleSidebar from "./components/ArticleSidebar";
import AdBanner from "@/components/ui/AdBanner";
import PopupRenderer from "@/components/ui/PopupRenderer";
import NewsletterWidget from "@/components/ui/NewsletterWidget";
import CoupangUnit from "@/components/ui/CoupangUnit";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const article = await getArticle(id);
  if (!article || article.status !== "게시") return { title: "기사를 찾을 수 없습니다", robots: { index: false, follow: false } };

  const desc = article.metaDescription || article.summary || article.body.replace(/<[^>]*>/g, "").slice(0, 160);
  const staticImage = article.ogImage || article.thumbnail;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://culturepeople.co.kr";
  const ogImageUrl = staticImage || `${baseUrl}/api/og?title=${encodeURIComponent(article.title)}&category=${encodeURIComponent(article.category)}&author=${encodeURIComponent(article.author || "")}&date=${encodeURIComponent(article.date)}`;

  return {
    title: article.title,
    description: desc,
    openGraph: {
      type: "article",
      title: article.title,
      description: desc,
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: desc,
      images: [ogImageUrl],
    },
  };
}

interface SeoSettings {
  canonicalUrl?: string;
}

interface CommentSettings {
  enabled: boolean;
}

/** 본문 HTML을 n번째 </p> 이후 지점에서 분리 (인라인 광고 삽입용) */
function splitBodyAtParagraph(html: string, afterN = 3): [string, string] {
  if (!html) return ["", ""];
  const regex = /<\/p>/gi;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    count++;
    if (count === afterN) {
      const split = m.index + m[0].length;
      return [html.slice(0, split), html.slice(split)];
    }
  }
  return [html, ""];
}

export default async function ArticlePage({ params }: Props) {
  const { id } = await params;
  const [article, seoSettings, commentSettings] = await Promise.all([
    getArticle(id),  // React.cache로 generateMetadata와 쿼리 공유
    serverGetSetting<SeoSettings>("cp-seo-settings", {}),
    serverGetSetting<CommentSettings>("cp-comment-settings", { enabled: true }),
  ]);

  if (!article) notFound();
  // 미공개 기사 직접 URL 접근 차단
  if (article.status !== "게시") notFound();

  const baseUrl =
    seoSettings.canonicalUrl?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://culturepeople.co.kr";

  const schemaOrg = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: article.metaDescription || article.summary || article.body.replace(/<[^>]*>/g, "").slice(0, 160),
    datePublished: article.date,
    dateModified: article.updatedAt || article.date,
    author: article.author ? [{ "@type": "Person", name: article.author }] : undefined,
    image: (() => { const img = article.thumbnail || article.ogImage; return img ? [img] : undefined; })(),
    url: `${baseUrl}/article/${article.no ?? article.id}`,
    publisher: {
      "@type": "Organization",
      name: "컬처피플",
      url: baseUrl,
    },
  };

  return (
    <div className="w-full min-h-screen" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaOrg) }}
      />
      {/* 팝업/배너 렌더링 */}
      <PopupRenderer />
      {/* 조회수 카운트 (클라이언트 사이드) */}
      <ArticleViewTracker articleId={article.id} />

      <CulturepeopleHeader0 />

      <div className="mx-auto max-w-[1200px] px-4 py-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          {/* 기사 본문 */}
          <article className="flex-1 min-w-0">
            {/* 브레드크럼 */}
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-4">
              <Link href="/" className="hover:text-[#E8192C]">홈</Link>
              <span>&gt;</span>
              <Link href={`/category/${article.category}`} className="hover:text-[#E8192C]">{article.category}</Link>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 leading-tight mb-3 md:text-3xl">
              {article.title}
            </h1>

            <div className="flex items-center gap-3 text-sm text-gray-500 mb-6 pb-6 border-b border-gray-200">
              {article.author && <span>{article.author} 기자</span>}
              <span>{article.date}</span>
              <span>조회 {(article.views || 0).toLocaleString()}</span>
            </div>

            {article.summary && (
              <div className="mb-6 p-4 bg-gray-50 border-l-4 rounded text-sm text-gray-700 leading-relaxed" style={{ borderLeftColor: "#E8192C" }}>
                {article.summary}
              </div>
            )}

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

            {/* 쿠팡 파트너스 — 모바일 기사 본문 상단 (320×80, 모바일 전용) */}
            <div className="flex md:hidden justify-center mb-4">
              <CoupangUnit id={274166} trackingCode="AF1979086" template="carousel" width={320} height={80} />
            </div>
            {/* 기사 상단 광고 */}
            <AdBanner position="article-top" height={90} className="mb-6" />

            {(() => {
              const [bodyFirst, bodySecond] = splitBodyAtParagraph(article.body, 3);
              return bodySecond ? (
                <>
                  <ArticleBody html={bodyFirst} />
                  <AdBanner position="article-inline" height={90} className="my-4" />
                  <ArticleBody html={bodySecond} />
                </>
              ) : (
                <ArticleBody html={article.body} />
              );
            })()}

            {/* 기사 하단 광고 */}
            <AdBanner position="article-bottom" height={250} className="my-6" />
            {/* 쿠팡 파트너스 — 개별기사 하단 웹 (727×122, 데스크톱 전용) */}
            <div className="hidden md:flex justify-center mb-6">
              <CoupangUnit id={274165} trackingCode="AF1979086" template="carousel" width={727} height={122} />
            </div>

            {article.tags && (
              <div className="flex flex-wrap gap-2 mb-8 pt-6 border-t border-gray-200">
                {article.tags.split(",").map((tag) => (
                  <Link
                    key={tag.trim()}
                    href={`/tag/${encodeURIComponent(tag.trim())}`}
                    className="px-3 py-1 text-xs border border-gray-300 rounded-full text-gray-600 hover:border-[#E8192C] hover:text-[#E8192C] transition-colors"
                  >
                    #{tag.trim()}
                  </Link>
                ))}
              </div>
            )}

            <ArticleShare title={article.title} />

            {article.author && (
              <Link href={`/reporter/${encodeURIComponent(article.author)}`} className="flex items-center gap-4 p-4 bg-gray-50 rounded mb-8 hover:bg-gray-100 transition-colors">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0" style={{ background: "#E8192C" }}>
                  {article.author.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-800">
                    {article.author} 기자{article.authorEmail ? ` (${article.authorEmail})` : ""}
                  </div>
                  <div className="text-xs text-gray-500">컬처피플 기자 · 기사 모아보기</div>
                </div>
              </Link>
            )}

            <NewsletterWidget />

            <CommentSection articleId={article.id} articleTitle={article.title} disabled={!commentSettings.enabled} />
          </article>

          {/* 사이드바 래퍼: 동적 데이터(top10/관련기사)는 client lazy load, 광고는 서버 렌더링 */}
          <div className="w-full lg:w-[320px] shrink-0">
            <ArticleSidebar articleId={article.id} category={article.category} tags={article.tags} />
            <AdBanner height={250} className="hidden lg:flex" />
          </div>
        </div>
      </div>

      <CulturepeopleFooter6 />
    </div>
  );
}
