import type { Metadata } from "next";
import { Suspense } from "react";
import { serverGetArticles } from "@/lib/db-server";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";
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
    results = allArticles.filter(
      (a) =>
        a.status === "게시" &&
        (a.title.toLowerCase().includes(query) ||
          // HTML 태그 제거 후 본문 검색
          a.body.replace(/<[^>]*>/g, "").toLowerCase().includes(query) ||
          a.category.toLowerCase().includes(query) ||
          (a.tags?.toLowerCase().includes(query) ?? false))
    );
  }

  // 카테고리 필터 적용
  if (category && results.length > 0) {
    results = results.filter((a) => a.category === category);
  }

  // 정렬 적용
  if (sort === "views") {
    results = [...results].sort((a, b) => b.views - a.views);
  } else {
    // 기본: 날짜 내림차순
    results = [...results].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  return (
    <div className="w-full min-h-screen" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <CulturepeopleHeader0 />
      <Suspense fallback={<div className="mx-auto max-w-[1200px] px-4 py-20 text-center text-gray-500">로딩 중...</div>}>
        <SearchContent
          initialQuery={q || ""}
          initialResults={results}
          initialCategory={category || ""}
          initialSort={sort || "date"}
          popularArticles={popularArticles}
        />
      </Suspense>
      <CulturepeopleFooter6 />
    </div>
  );
}
