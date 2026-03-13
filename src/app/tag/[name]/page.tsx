import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { serverGetArticles } from "@/lib/db-server";
import { getSiteType } from "@/lib/site-type";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";
import { InsightKoreaHeader, InsightKoreaFooter } from "@/components/themes/insightkorea";
import AdBanner from "@/components/ui/AdBanner";
import PopupRenderer from "@/components/ui/PopupRenderer";

export const revalidate = 60;

interface Props {
  params: Promise<{ name: string }>;
}

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL?.split(/\s/)[0]?.replace(/\/$/, "") || "https://culturepeople.co.kr";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const tag = decodeURIComponent(name);
  const canonicalUrl = `${BASE_URL}/tag/${encodeURIComponent(tag)}`;
  return {
    title: `#${tag} 태그 기사`,
    description: `컬처피플에서 #${tag} 태그 기사를 확인하세요.`,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: "website",
      title: `#${tag} 태그 기사 - 컬처피플`,
      url: canonicalUrl,
    },
  };
}

export default async function TagPage({ params }: Props) {
  const { name } = await params;
  const tag = decodeURIComponent(name);

  const [allArticles, siteType] = await Promise.all([serverGetArticles(), getSiteType()]);
  const articles = allArticles.filter(
    (a) =>
      a.status === "게시" &&
      a.tags
        ?.split(",")
        .map((t) => t.trim())
        .includes(tag)
  );

  const Header = siteType === "insightkorea" ? InsightKoreaHeader : CulturepeopleHeader0;
  const Footer = siteType === "insightkorea" ? InsightKoreaFooter : CulturepeopleFooter6;
  const accent = siteType === "insightkorea" ? "#d2111a" : "#E8192C";

  return (
    <div className="w-full min-h-screen" style={{ fontFamily: "var(--font-noto-sans-kr, 'Noto Sans KR'), sans-serif" }}>
      <PopupRenderer />
      <Header />

      <div className="mx-auto max-w-[1200px] px-4 py-8">
        {/* 헤더 */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
            <Link href="/" className="hover:text-[#E8192C]">홈</Link>
            <span>&gt;</span>
            <span>태그</span>
            <span>&gt;</span>
            <span>#{tag}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            <span className="text-[#E8192C]">#</span>{tag}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{articles.length > 0 ? `총 ${articles.length}개의 기사` : "등록된 기사가 없습니다."}</p>
        </div>

        {/* 상단 광고 */}
        <AdBanner position="top" height={90} className="mb-8" />

        {/* 기사 없을 때 빈 상태 */}
        {articles.length === 0 && (
          <div className="py-24 text-center">
            <div className="text-5xl mb-4 text-gray-200">🏷️</div>
            <p className="text-gray-500 text-sm">아직 <strong>#{tag}</strong> 태그가 붙은 기사가 없습니다.</p>
            <Link href="/" className="mt-4 inline-block text-sm text-[#E8192C] hover:underline">홈으로 돌아가기</Link>
          </div>
        )}

        {/* 기사 목록 */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`/article/${article.no ?? article.id}`}
              className="group block bg-white border border-gray-100 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
            >
              {article.thumbnail ? (
                <div className="relative w-full overflow-hidden" style={{ aspectRatio: "16/9" }}>
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
                  <span className="text-xs font-medium text-[#E8192C]">{article.category}</span>
                  <span className="text-xs text-gray-400">{article.date}</span>
                </div>
                <h2 className="text-sm font-bold text-gray-900 leading-snug mb-2 line-clamp-2 group-hover:text-[#E8192C] transition-colors">
                  {article.title}
                </h2>
                {article.summary && (
                  <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
                    {article.summary}
                  </p>
                )}
                {article.author && (
                  <div className="mt-3 text-xs text-gray-400">{article.author} 기자</div>
                )}
              </div>
            </Link>
          ))}
        </div>

        {/* 하단 광고 */}
        <AdBanner position="bottom" height={250} className="mt-8" />
      </div>

      <Footer />
    </div>
  );
}
