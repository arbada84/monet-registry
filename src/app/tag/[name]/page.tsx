import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { serverGetArticlesByTag } from "@/lib/db-server";
import { getSiteType, getSiteAccentColor } from "@/lib/site-type";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";
import { InsightKoreaHeader, InsightKoreaFooter } from "@/components/themes/insightkorea";
import { CulturePeopleHeader, CulturePeopleFooter } from "@/components/themes/culturepeople";
import AdBanner from "@/components/ui/AdBanner";
import PopupRenderer from "@/components/ui/PopupRenderer";
import TagArticleList from "./TagArticleList";

import { getBaseUrl } from "@/lib/get-base-url";
import { isIndexableTagArticleCount } from "@/lib/tag-indexing";

export const revalidate = 3600;

interface Props {
  params: Promise<{ name: string }>;
}

const BASE_URL = getBaseUrl();
const getTagArticles = cache((tag: string) => serverGetArticlesByTag(tag));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const tag = decodeURIComponent(name);
  const articles = await getTagArticles(tag);
  const indexable = isIndexableTagArticleCount(articles.length);
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
    robots: {
      index: indexable,
      follow: true,
      googleBot: {
        index: indexable,
        follow: true,
      },
    },
  };
}

export default async function TagPage({ params }: Props) {
  const { name } = await params;
  const tag = decodeURIComponent(name);

  const [articles, siteType] = await Promise.all([getTagArticles(tag), getSiteType()]);
  if (articles.length === 0) notFound();

  const Header = siteType === "culturepeople" ? CulturePeopleHeader : siteType === "insightkorea" ? InsightKoreaHeader : CulturepeopleHeader0;
  const Footer = siteType === "culturepeople" ? CulturePeopleFooter : siteType === "insightkorea" ? InsightKoreaFooter : CulturepeopleFooter6;
  const accent = getSiteAccentColor(siteType);

  return (
    <div className="w-full min-h-screen" style={{ fontFamily: "var(--font-noto-sans-kr, 'Noto Sans KR'), sans-serif", "--tag-accent": accent } as React.CSSProperties}>
      <PopupRenderer />
      <Header />

      <div className="mx-auto max-w-[1200px] px-4 py-8">
        {/* 헤더 */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
            <Link href="/" className="hover:text-[var(--tag-accent)]">홈</Link>
            <span>&gt;</span>
            <span>태그</span>
            <span>&gt;</span>
            <span>#{tag}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            <span style={{ color: accent }}>#</span>{tag}
          </h1>
          <p className="text-sm text-gray-500 mt-1">총 {articles.length}개의 기사</p>
        </div>

        {/* 상단 광고 */}
        <AdBanner position="top" height={90} className="mb-8" />

        {/* 기사 목록 (클라이언트 컴포넌트: 20건씩 "더 보기" 페이지네이션) */}
        <TagArticleList articles={articles} accent={accent} />

        {/* 하단 광고 */}
        <AdBanner position="bottom" height={250} className="mt-8" />
      </div>

      <Footer />
    </div>
  );
}
