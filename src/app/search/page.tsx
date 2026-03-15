import type { Metadata } from "next";
import { Suspense } from "react";
import { serverGetTopArticles, serverSearchArticles } from "@/lib/db-server";
import { getSiteType } from "@/lib/site-type";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";
import { InsightKoreaHeader, InsightKoreaFooter } from "@/components/themes/insightkorea";
import AdBanner from "@/components/ui/AdBanner";
import PopupRenderer from "@/components/ui/PopupRenderer";
import SearchContent from "./components/SearchContent";
import type { Article } from "@/types/article";
import { getBaseUrl } from "@/lib/get-base-url";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ q?: string; category?: string; sort?: string }>;
}

const BASE_URL = getBaseUrl();

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  if (!q) return {
    title: "검색",
    alternates: { canonical: `${BASE_URL}/search` },
    robots: { index: false, follow: true },
  };
  return {
    title: `'${q}' 검색 결과`,
    description: `컬처피플에서 '${q}' 검색 결과를 확인하세요.`,
    alternates: { canonical: `${BASE_URL}/search` },
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const { q, category, sort } = await searchParams;

  // 인기 기사(추천용): DB 레벨에서 상위 5건만 조회
  const [popularArticles, siteType] = await Promise.all([serverGetTopArticles(5), getSiteType()]);

  let results: Article[] = [];
  if (q) {
    // DB 전문검색 (tsvector + pg_trgm) — 관련도순 정렬 완료 상태로 반환
    results = await serverSearchArticles(q.trim());
  }

  // 카테고리 필터 적용
  if (category && results.length > 0) {
    results = results.filter((a) => a.category === category);
  }

  // 정렬 적용 (관련도 정렬은 sort 파라미터 없을 때만)
  if (sort === "views") {
    results = [...results].sort((a, b) => (b.views || 0) - (a.views || 0));
  } else if (sort === "date") {
    results = [...results].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }
  // sort 없을 때는 관련도순 유지

  const Header = siteType === "insightkorea" ? InsightKoreaHeader : CulturepeopleHeader0;
  const Footer = siteType === "insightkorea" ? InsightKoreaFooter : CulturepeopleFooter6;

  return (
    <div className="w-full min-h-screen" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <PopupRenderer />
      <Header />
      <div className="mx-auto max-w-[1200px] px-4 pt-4">
        <AdBanner position="top" height={90} />
      </div>
      <Suspense fallback={<div className="mx-auto max-w-[1200px] px-4 py-20 text-center text-gray-500">로딩 중...</div>}>
        <SearchContent
          initialQuery={q || ""}
          initialResults={results}
          initialCategory={category || ""}
          initialSort={sort || ""}
          popularArticles={popularArticles}
        />
      </Suspense>
      <div className="mx-auto max-w-[1200px] px-4 pb-4">
        <AdBanner position="bottom" height={90} />
      </div>
      <Footer />
    </div>
  );
}
