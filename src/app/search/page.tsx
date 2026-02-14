"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";

interface Article {
  id: string;
  title: string;
  category: string;
  date: string;
  status: string;
  views: number;
  body: string;
  thumbnail: string;
}

const SAMPLE_ARTICLES: Article[] = [
  { id: "sample-1", title: "2024 한국 문화예술 트렌드 분석", category: "문화", date: "2024-12-01", status: "게시", views: 1520, body: "올해 한국 문화예술계는 다양한 변화를 겪었습니다...", thumbnail: "" },
  { id: "sample-2", title: "신인 배우 김하늘 인터뷰", category: "연예", date: "2024-12-05", status: "게시", views: 3200, body: "올해 가장 주목받는 신인 배우 김하늘을 만나보았습니다...", thumbnail: "" },
  { id: "sample-3", title: "K리그 2025 시즌 전망", category: "스포츠", date: "2024-12-10", status: "게시", views: 870, body: "2025 시즌 K리그의 전력 변화를 분석합니다...", thumbnail: "" },
  { id: "sample-4", title: "겨울 여행지 추천 BEST 10", category: "라이프", date: "2024-12-12", status: "게시", views: 4100, body: "올 겨울 가볼 만한 국내 여행지를 소개합니다...", thumbnail: "" },
  { id: "sample-5", title: "국립중앙박물관 특별전 포토", category: "포토", date: "2024-12-14", status: "게시", views: 2300, body: "국립중앙박물관에서 열린 특별전의 현장 사진입니다...", thumbnail: "" },
];

function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  const [results, setResults] = useState<Article[]>([]);
  const [searchInput, setSearchInput] = useState(query);

  useEffect(() => {
    if (!query) { setResults([]); return; }
    const stored = localStorage.getItem("cp-articles");
    const all: Article[] = stored ? JSON.parse(stored) : SAMPLE_ARTICLES;
    const q = query.toLowerCase();
    setResults(
      all.filter(
        (a) =>
          a.status === "게시" &&
          (a.title.toLowerCase().includes(q) ||
            a.body.toLowerCase().includes(q) ||
            a.category.toLowerCase().includes(q))
      )
    );
  }, [query]);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8">
      {/* Search Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          window.location.href = `/search?q=${encodeURIComponent(searchInput)}`;
        }}
        className="mb-8"
      >
        <div className="flex h-12 border-2 rounded overflow-hidden" style={{ borderColor: "#E8192C" }}>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="검색어를 입력하세요"
            className="flex-1 px-4 text-base outline-none"
          />
          <button
            type="submit"
            className="px-8 text-white font-medium text-sm"
            style={{ backgroundColor: "#E8192C" }}
          >
            검색
          </button>
        </div>
      </form>

      {/* Results */}
      {query && (
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">
            &apos;{query}&apos; 검색 결과
            <span className="ml-2 text-sm font-normal text-gray-500">{results.length}건</span>
          </h1>
        </div>
      )}

      {query && results.length === 0 && (
        <div className="py-20 text-center text-gray-500">
          <p className="text-lg mb-2">검색 결과가 없습니다.</p>
          <p className="text-sm">다른 검색어로 다시 시도해 주세요.</p>
        </div>
      )}

      <div className="space-y-0">
        {results.map((article) => (
          <Link
            key={article.id}
            href={`/article/${article.id}`}
            className="block py-5 border-b border-gray-200 hover:bg-gray-50 transition-colors group"
          >
            <span className="text-xs px-2 py-0.5 rounded text-white mr-2" style={{ backgroundColor: "#E8192C" }}>
              {article.category}
            </span>
            <h2 className="inline text-base font-bold text-gray-900 group-hover:text-[#E8192C] transition-colors">
              {article.title}
            </h2>
            <p className="text-sm text-gray-600 mt-2 line-clamp-1">{article.body.slice(0, 100)}...</p>
            <div className="text-xs text-gray-400 mt-2">{article.date} · 조회 {article.views.toLocaleString()}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <div className="w-full min-h-screen" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <CulturepeopleHeader0 />
      <Suspense fallback={<div className="mx-auto max-w-[1200px] px-4 py-20 text-center text-gray-500">로딩 중...</div>}>
        <SearchContent />
      </Suspense>
      <CulturepeopleFooter6 />
    </div>
  );
}
