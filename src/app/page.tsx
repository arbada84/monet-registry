import type { Metadata } from "next";
import type { Article } from "@/types/article";
import { serverGetHomeArticles, serverGetSetting } from "@/lib/db-server";
import { getSiteType } from "@/lib/site-type";
import CulturepeopleLanding from "@/components/pages/culturepeople-landing";
import { InsightKoreaLanding } from "@/components/themes/insightkorea";
import { CulturePeopleLanding } from "@/components/themes/culturepeople";
import AdBanner from "@/components/ui/AdBanner";
import { getBaseUrl } from "@/lib/get-base-url";

export const revalidate = 3600; // 1시간 ISR 캐시

const BASE_URL = getBaseUrl();
const HOME_ARTICLE_LIMIT = 240;

export const metadata: Metadata = {
  title: "컬처피플 - 문화·엔터·비즈 뉴스",
  description: "컬처피플은 문화, 엔터테인먼트, 비즈니스, 스포츠, 라이프 등 다양한 분야의 최신 뉴스를 전합니다.",
  keywords: ["뉴스", "문화", "엔터테인먼트", "비즈니스", "스포츠", "라이프", "컬처피플"],
  alternates: {
    canonical: BASE_URL,
  },
};

const siteSchema = {
  "@context": "https://schema.org",
  "@type": "NewsMediaOrganization",
  name: "컬처피플",
  url: "https://culturepeople.co.kr",
  logo: "https://culturepeople.co.kr/icon-512.png",
  sameAs: [],
  potentialAction: {
    "@type": "SearchAction",
    target: "https://culturepeople.co.kr/search?q={search_term_string}",
    "query-input": "required name=search_term_string",
  },
};

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

export default async function Home() {
  let articles: Article[] = [];
  let siteType: import("@/lib/site-type").SiteType = "netpro";
  let categories: CategoryItem[] = [];
  let siteSettingsData: SiteSettings = {};
  try {
    [articles, siteType, categories, siteSettingsData] = await Promise.all([
      serverGetHomeArticles(HOME_ARTICLE_LIMIT),
      getSiteType(),
      serverGetSetting<CategoryItem[]>("cp-categories", []),
      serverGetSetting<SiteSettings>("cp-site-settings", {}),
    ]);
  } catch (e) {
    console.error("[Home] 데이터 로드 실패:", e instanceof Error ? e.message : e);
  }
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteSchema) }}
      />
      {siteType === "culturepeople" ? (
        <CulturePeopleLanding
          articles={articles}
          initialCategories={categories}
          initialSiteSettings={siteSettingsData}
          adSlots={{
            top: <AdBanner position="top" height={90} className="mb-4" />,
            "home-mid-1": <AdBanner position="home-mid-1" height={90} className="mb-4" />,
            "home-mid-2": <AdBanner position="home-mid-2" height={90} className="my-8" />,
            bottom: <AdBanner position="bottom" height={90} className="my-8" />,
          }}
        />
      ) : siteType === "insightkorea" ? (
        <InsightKoreaLanding
          articles={articles}
          initialCategories={categories}
          initialSiteSettings={siteSettingsData}
          adSlots={{
            top: <AdBanner position="top" height={90} className="mb-4" />,
            "home-mid-1": <AdBanner position="home-mid-1" height={90} className="mb-4" />,
            "home-mid-2": <AdBanner position="home-mid-2" height={90} className="my-8" />,
            bottom: <AdBanner position="bottom" height={90} className="my-8" />,
          }}
        />
      ) : (
        <CulturepeopleLanding articles={articles} />
      )}
    </>
  );
}
