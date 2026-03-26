import { cache, Suspense } from "react";
import type { Metadata } from "next";
import { serverGetTopArticles, serverGetSetting, serverGetArticlesByCategory } from "@/lib/db-server";
import { getSiteType } from "@/lib/site-type";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";
import { InsightKoreaCategoryPage } from "@/components/themes/insightkorea";
import { CulturePeopleCategoryPage } from "@/components/themes/culturepeople";
import AdBanner from "@/components/ui/AdBanner";
import PopupRenderer from "@/components/ui/PopupRenderer";
import CategoryArticleList from "./components/CategoryArticleList";

import { getBaseUrl } from "@/lib/get-base-url";

export const revalidate = 3600;

const BASE_URL = getBaseUrl();

interface Props {
  params: Promise<{ slug: string }>;
}

const resolveCategoryName = cache(async (slug: string): Promise<string> => {
  const decoded = decodeURIComponent(slug);
  // DB에 저장된 동적 카테고리 목록에서 이름 확인
  const cats = await serverGetSetting<{ name: string }[] | null>("cp-categories", null);
  if (cats) {
    const found = cats.find((c) => c.name === decoded || c.name.toLowerCase() === decoded.toLowerCase());
    if (found) return found.name;
  }
  return decoded;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const categoryName = await resolveCategoryName(slug);
  const canonicalUrl = `${BASE_URL}/category/${encodeURIComponent(categoryName)}`;
  return {
    title: `${categoryName} 뉴스`,
    description: `컬처피플 ${categoryName} 카테고리 뉴스를 확인하세요.`,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: "website",
      title: `${categoryName} 뉴스 - 컬처피플`,
      description: `컬처피플 ${categoryName} 카테고리 뉴스`,
      url: canonicalUrl,
      images: [`${BASE_URL}/api/og?title=${encodeURIComponent(categoryName)}&category=${encodeURIComponent(categoryName)}`],
    },
  };
}

interface CategoryItem {
  name: string;
  order: number;
  visible: boolean;
  parentId?: string | null;
}

interface SiteSettings {
  siteName?: string;
  slogan?: string;
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const categoryName = await resolveCategoryName(slug);

  const [articles, siteType, categories, siteSettingsData] = await Promise.all([
    serverGetArticlesByCategory(categoryName),
    getSiteType(),
    serverGetSetting<CategoryItem[]>("cp-categories", []),
    serverGetSetting<SiteSettings>("cp-site-settings", {}),
  ]);

  // insightkorea/culturepeople 테마에서만 allArticles 필요 (이중 조회 방지)
  const allArticles = (siteType === "insightkorea" || siteType === "culturepeople") ? await serverGetTopArticles(10) : [];

  const articleCount = articles.length;

  // Schema.org CollectionPage JSON-LD
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${categoryName} 뉴스`,
    description: `${categoryName} 최신 뉴스`,
    url: `${BASE_URL}/category/${slug}`,
    numberOfItems: articleCount,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: articles.slice(0, 10).map((a, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${BASE_URL}/article/${a.no ?? a.id}`,
        name: a.title,
      })),
    },
  };

  if (siteType === "insightkorea" || siteType === "culturepeople") {
    const CategoryComp = siteType === "culturepeople" ? CulturePeopleCategoryPage : InsightKoreaCategoryPage;
    return (
      <div className="w-full min-h-screen" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <CategoryComp
          articles={articles}
          categoryName={categoryName}
          allArticles={allArticles}
          categories={categories}
          siteSettings={siteSettingsData}
          adSlots={{
            top: <AdBanner position="top" height={90} className="mb-6" />,
            middle: <AdBanner position="middle" height={90} className="my-4" />,
            bottom: <AdBanner position="bottom" height={90} className="mt-6" />,
          }}
        />
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      {/* Schema.org JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <PopupRenderer />
      <CulturepeopleHeader0 />

      <div className="mx-auto max-w-[1200px] px-4 py-8">
        <AdBanner position="top" height={90} className="mb-6" />

        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6 pb-4 border-b-2" style={{ borderColor: "#E8192C" }}>
          <h1 className="text-2xl font-bold text-gray-900">{categoryName}</h1>
          <span className="text-sm text-gray-500">{articleCount}건</span>
        </div>

        {/* 클라이언트 컴포넌트: 더 보기 버튼 + 기사 목록 */}
        <Suspense fallback={<div className="py-10 text-center text-gray-400">로딩 중...</div>}>
          <CategoryArticleList articles={articles} categoryName={categoryName} />
        </Suspense>

        <AdBanner position="bottom" height={90} className="mt-6" />
      </div>

      <CulturepeopleFooter6 />
    </div>
  );
}
