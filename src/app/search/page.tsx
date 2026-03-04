import type { Metadata } from "next";
import { Suspense } from "react";
import { serverGetArticles, serverSearchArticles } from "@/lib/db-server";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";
import AdBanner from "@/components/ui/AdBanner";
import PopupRenderer from "@/components/ui/PopupRenderer";
import SearchContent from "./components/SearchContent";
import type { Article } from "@/types/article";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ q?: string; category?: string; sort?: string }>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  if (!q) return { title: "검색" };
  return {
    title: `'${q}' 검색 결과`,
    description: `컬처피플에서 '${q}' 검색 결과를 확인하세요.`,
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const { q, category, sort } = await searchParams;

  // 인기 기사(추천용): body 불필요하므로 sbGetArticles 사용
  const allArticles = await serverGetArticles();
  const popularArticles = [...allArticles]
    .filter((a) => a.status === "게시")
    .sort((a, b) => b.views - a.views)
    .slice(0, 5);

  let results: Article[] = [];
  if (q) {
    const query = q.toLowerCase();
    // DB 레벨 검색 (body 포함) → 관련도 점수 정렬
    const matched = await serverSearchArticles(query);
    const scored = matched.map((a) => {
      const titleMatch = a.title.toLowerCase().includes(query);
      const summaryMatch = (a.summary || "").toLowerCase().includes(query);
      const tagsMatch = (a.tags || "").toLowerCase().includes(query);
      const bodyMatch = (a.body || "").replace(/<[^>]*>/g, "").toLowerCase().includes(query);
      const score = (titleMatch ? 4 : 0) + (tagsMatch ? 3 : 0) + (summaryMatch ? 2 : 0) + (bodyMatch ? 1 : 0);
      return { article: a, score };
    });
    results = scored.sort((a, b) => b.score - a.score).map((s) => s.article);
  }

  // 카테고리 필터 적용
  if (category && results.length > 0) {
    results = results.filter((a) => a.category === category);
  }

  // 정렬 적용 (관련도 정렬은 sort 파라미터 없을 때만)
  if (sort === "views") {
    results = [...results].sort((a, b) => b.views - a.views);
  } else if (sort === "date") {
    results = [...results].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }
  // sort 없을 때는 관련도순 유지

  return (
    <div className="w-full min-h-screen" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <PopupRenderer />
      <CulturepeopleHeader0 />
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
      <CulturepeopleFooter6 />
    </div>
  );
}
