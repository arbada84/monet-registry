import type { Metadata } from "next";
import { Suspense } from "react";
import { serverGetArticles } from "@/lib/db-server";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";
import AdBanner from "@/components/ui/AdBanner";
import PopupRenderer from "@/components/ui/PopupRenderer";
import SearchContent from "./components/SearchContent";
import type { Article } from "@/types/article";

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
  const allArticles = await serverGetArticles();

  // 조회수 TOP 5 (검색 결과 없을 때 추천용)
  const popularArticles = [...allArticles]
    .filter((a) => a.status === "게시")
    .sort((a, b) => b.views - a.views)
    .slice(0, 5);

  let results: Article[] = [];
  if (q) {
    const query = q.toLowerCase();

    // 관련도 점수 계산: 제목(4점) > 태그(3점) > 요약(2점) > 본문(1점)
    const scored = allArticles
      .filter((a) => a.status === "게시")
      .map((a) => {
        const titleMatch = a.title.toLowerCase().includes(query);
        const summaryMatch = (a.summary || "").toLowerCase().includes(query);
        const tagsMatch = (a.tags || "").toLowerCase().includes(query);
        const bodyMatch = a.body.replace(/<[^>]*>/g, "").toLowerCase().includes(query);
        const score = (titleMatch ? 4 : 0) + (tagsMatch ? 3 : 0) + (summaryMatch ? 2 : 0) + (bodyMatch ? 1 : 0);
        return { article: a, score };
      })
      .filter((s) => s.score > 0);

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
          initialSort={sort || "date"}
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
