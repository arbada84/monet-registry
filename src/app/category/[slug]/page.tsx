import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import type { Article } from "@/types/article";
import { serverGetTopArticles, serverGetSetting, serverGetCategoryArticlePage } from "@/lib/db-server";
import { categoryPageHref, parseCategoryPage, CATEGORY_PAGE_SIZE } from "@/lib/category-pagination";
import { serializeJsonLd } from "@/lib/serialize-json-ld";
import { getSiteType } from "@/lib/site-type";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";
import { InsightKoreaCategoryPage } from "@/components/themes/insightkorea";
import { CulturePeopleCategoryPage } from "@/components/themes/culturepeople";
import AdBanner from "@/components/ui/AdBanner";
import PopupRenderer from "@/components/ui/PopupRenderer";
import CategoryArticleList from "./components/CategoryArticleList";

import { getBaseUrl } from "@/lib/get-base-url";
import { buildCategorySeoCopy } from "@/lib/seo-copy";
import { toPublicArticlePreview } from "@/lib/public-article-preview";

export const revalidate = 300;

const BASE_URL = getBaseUrl();

interface Props {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const loadCategoryPage = cache(async (category: string, page: number) => {
  const result = await serverGetCategoryArticlePage(category, page);
  if (page > 1 && result.articles.length === 0) notFound();
  return result;
});

async function resolvePage(searchParams: Props["searchParams"], category: string) {
  const search = await searchParams;
  const page = parseCategoryPage(search?.page);
  if (page === null) notFound();
  if (search?.items !== undefined) permanentRedirect(categoryPageHref(category, 1));
  return page;
}

const resolveCategoryName = cache(async (slug: string): Promise<string> => {
  const decoded = decodeURIComponent(slug);
  // DB에 저장된 동적 카테고리 목록에서 이름 확인
  try {
    const cats = await serverGetSetting<{ name: string }[] | null>("cp-categories", null);
    if (cats) {
      const found = cats.find((c) => c.name === decoded || c.name.toLowerCase() === decoded.toLowerCase());
      if (found) return found.name;
    }
  } catch (error) {
    console.error("[category] 카테고리 설정 조회 실패:", error);
  }
  return decoded;
});

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const categoryName = await resolveCategoryName(slug);
  const page = await resolvePage(searchParams, categoryName);
  await loadCategoryPage(categoryName, page);
  const canonicalUrl = `${BASE_URL}${categoryPageHref(categoryName, page)}`;
  const seoCopy = buildCategorySeoCopy(categoryName);
  return {
    title: seoCopy.title,
    description: seoCopy.description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: "website",
      title: seoCopy.openGraphTitle,
      description: seoCopy.description,
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

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const categoryName = await resolveCategoryName(slug);
  const page = await resolvePage(searchParams, categoryName);
  // Validate before rendering so unavailable pages do not become a streamed empty success.
  const articlePage = await loadCategoryPage(categoryName, page);
  const articles = articlePage.articles.map(toPublicArticlePreview);

  const [siteTypeResult, categoriesResult, siteSettingsResult] = await Promise.allSettled([
    getSiteType(),
    serverGetSetting<CategoryItem[]>("cp-categories", []),
    serverGetSetting<SiteSettings>("cp-site-settings", {}),
  ]);
  const siteType = siteTypeResult.status === "fulfilled" ? siteTypeResult.value : "culturepeople";
  const categories = categoriesResult.status === "fulfilled" ? categoriesResult.value : [];
  const siteSettingsData = siteSettingsResult.status === "fulfilled" ? siteSettingsResult.value : {};

  // insightkorea/culturepeople 테마에서만 allArticles 필요 (이중 조회 방지)
  let allArticles: Article[] = [];
  if (siteType === "insightkorea" || siteType === "culturepeople") {
    try {
      allArticles = (await serverGetTopArticles(10)).map(toPublicArticlePreview);
    } catch (error) {
      console.error("[category] 인기 기사 조회 실패:", error);
    }
  }

  // Schema.org CollectionPage JSON-LD
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${categoryName} 뉴스`,
    description: `${categoryName} 최신 뉴스`,
    url: `${BASE_URL}${categoryPageHref(categoryName, page)}`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: articles.map((a, i) => ({
        "@type": "ListItem",
        position: (page - 1) * CATEGORY_PAGE_SIZE + i + 1,
        url: `${BASE_URL}/article/${a.no ?? a.id}`,
        name: a.title,
      })),
    },
  };

  if (siteType === "insightkorea" || siteType === "culturepeople") {
    const CategoryComp = siteType === "culturepeople" ? CulturePeopleCategoryPage : InsightKoreaCategoryPage;
    return (
      <div className="w-full min-h-screen" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
        <CategoryComp
          articles={articles}
          categoryName={categoryName}
          pagination={{ page, hasNext: articlePage.hasNext }}
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
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <PopupRenderer />
      <CulturepeopleHeader0 />

      <div className="mx-auto max-w-[1200px] px-4 py-8">
        <AdBanner position="top" height={90} className="mb-6" />

        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6 pb-4 border-b-2" style={{ borderColor: "#E8192C" }}>
          <h1 className="text-2xl font-bold text-gray-900">{categoryName}</h1>
        </div>

        <CategoryArticleList articles={articles} categoryName={categoryName} pagination={{ page, hasNext: articlePage.hasNext }} />

        <AdBanner position="bottom" height={90} className="mt-6" />
      </div>

      <CulturepeopleFooter6 />
    </div>
  );
}
