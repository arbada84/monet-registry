import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { serverGetArticleById, serverGetArticles, serverGetSetting } from "@/lib/db-server";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";
import ArticleShare from "./components/ArticleShare";
import ArticleBody from "./components/ArticleBody";
import CommentSection from "./components/CommentSection";
import NewsletterWidget from "./components/NewsletterWidget";
import ArticleViewTracker from "./components/ArticleViewTracker";
import AdBanner from "@/components/ui/AdBanner";
import PopupRenderer from "@/components/ui/PopupRenderer";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const article = await serverGetArticleById(id);
  if (!article) return { title: "기사를 찾을 수 없습니다" };

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

export default async function ArticlePage({ params }: Props) {
  const { id } = await params;
  const [article, allArticles, seoSettings] = await Promise.all([
    serverGetArticleById(id),
    serverGetArticles(),
    serverGetSetting<SeoSettings>("cp-seo-settings", {}),
  ]);

  if (!article) notFound();

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
    dateModified: article.date,
    author: article.author ? [{ "@type": "Person", name: article.author }] : undefined,
    image: article.thumbnail || article.ogImage ? [article.thumbnail || article.ogImage] : undefined,
    url: `${baseUrl}/article/${article.id}`,
    publisher: {
      "@type": "Organization",
      name: "컬처피플",
      url: baseUrl,
    },
  };

  const published = allArticles.filter((a) => a.status === "게시");

  const relatedArticles = published
    .filter((a) => a.category === article.category && a.id !== article.id)
    .slice(0, 5);

  const top10 = [...published]
    .map((a) => ({ id: a.id, title: a.title, views: a.views || 0 }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

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
                  alt={article.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 800px"
                  priority
                />
              </div>
            )}

            <ArticleBody html={article.body} />

            {article.tags && (
              <div className="flex flex-wrap gap-2 mb-8 pt-6 border-t border-gray-200">
                {article.tags.split(",").map((tag) => (
                  <Link
                    key={tag.trim()}
                    href={`/search?q=${encodeURIComponent(tag.trim())}`}
                    className="px-3 py-1 text-xs border border-gray-300 rounded-full text-gray-600 hover:border-[#E8192C] hover:text-[#E8192C] transition-colors"
                  >
                    #{tag.trim()}
                  </Link>
                ))}
              </div>
            )}

            <ArticleShare title={article.title} />

            {article.author && (
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded mb-8">
                <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-lg font-bold text-gray-500 shrink-0">
                  {article.author.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-800">{article.author} 기자</div>
                  <div className="text-xs text-gray-500">컬처피플 기자</div>
                </div>
              </div>
            )}

            <CommentSection articleId={article.id} />
          </article>

          {/* 사이드바 */}
          <aside className="w-full lg:w-[320px] shrink-0">
            {/* 인기 TOP 10 */}
            {top10.length > 0 && (
              <div className="border border-gray-200 rounded p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-block h-5 w-1 rounded-full" style={{ backgroundColor: "#E8192C" }} />
                  <h3 className="text-base font-bold text-gray-900">인기 TOP 10</h3>
                </div>
                <div className="space-y-0">
                  {top10.map((item, idx) => (
                    <Link
                      key={item.id}
                      href={`/article/${item.id}`}
                      className="flex items-start gap-3 border-b border-gray-100 py-2.5 last:border-b-0 hover:bg-gray-50 transition-colors"
                    >
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-xs font-bold text-white"
                        style={{ backgroundColor: idx < 3 ? "#E8192C" : "#999" }}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="block text-sm text-gray-700 leading-snug line-clamp-2 hover:text-[#E8192C]">
                          {item.title}
                        </span>
                        <span className="text-[11px] text-gray-400">{item.views.toLocaleString()}회</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* 관련 기사 */}
            {relatedArticles.length > 0 && (
              <div className="border border-gray-200 rounded p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-block h-5 w-1 rounded-full" style={{ backgroundColor: "#E8192C" }} />
                  <h3 className="text-base font-bold text-gray-900">관련 기사</h3>
                </div>
                <ul className="space-y-2">
                  {relatedArticles.map((ra) => (
                    <li key={ra.id}>
                      <Link
                        href={`/article/${ra.id}`}
                        className="block text-sm text-gray-700 hover:text-[#E8192C] leading-snug py-1 border-b border-gray-100 last:border-b-0"
                      >
                        {ra.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <NewsletterWidget />

            <AdBanner height={250} className="hidden lg:flex" />
          </aside>
        </div>
      </div>

      <CulturepeopleFooter6 />
    </div>
  );
}
