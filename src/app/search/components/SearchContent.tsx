"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Article } from "@/types/article";

const ITEMS_PER_PAGE = 10;

function highlightText(text: string, query: string): ReactNode {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} style={{ background: "#FEF08A", padding: 0 }}>
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function getPageNumbers(currentPage: number, totalPages: number): number[] {
  const pages: number[] = [];
  let start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);
  if (end - start < 4) start = Math.max(1, end - 4);
  for (let i = start; i <= end; i++) pages.push(i);
  return pages;
}

interface Props {
  initialQuery: string;
  initialResults: Article[];
  initialCategory: string;
  initialSort: string;
  popularArticles: Article[];
}

export default function SearchContent({
  initialQuery,
  initialResults,
  initialCategory,
  initialSort,
  popularArticles,
}: Props) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [currentPage, setCurrentPage] = useState(1);

  // 결과에서 카테고리 목록 동적 추출 (필터 적용 전 전체 기준은 서버에서 처리됨)
  // 클라이언트에서는 현재 결과 기준으로 표시
  const availableCategories = [...new Set(initialResults.map((a) => a.category))].sort();

  const totalPages = Math.max(1, Math.ceil(initialResults.length / ITEMS_PER_PAGE));
  const paginatedResults = initialResults.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchInput)}`);
    }
  };

  const handleCategoryChange = (cat: string) => {
    const params = new URLSearchParams();
    if (initialQuery) params.set("q", initialQuery);
    if (cat) params.set("category", cat);
    if (initialSort && initialSort !== "date") params.set("sort", initialSort);
    setCurrentPage(1);
    router.push(`/search?${params.toString()}`);
  };

  const handleSortChange = (sort: string) => {
    const params = new URLSearchParams();
    if (initialQuery) params.set("q", initialQuery);
    if (initialCategory) params.set("category", initialCategory);
    if (sort && sort !== "date") params.set("sort", sort);
    setCurrentPage(1);
    router.push(`/search?${params.toString()}`);
  };

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8">
      {/* 검색바 */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex h-12 border-2 rounded overflow-hidden" style={{ borderColor: "#E8192C" }}>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="검색어를 입력하세요"
            className="flex-1 px-4 text-base outline-none"
            aria-label="검색어"
          />
          <button type="submit" className="px-8 text-white font-medium text-sm" style={{ backgroundColor: "#E8192C" }}>
            검색
          </button>
        </div>
      </form>

      {/* 검색 결과 헤더 + 필터/정렬 */}
      {initialQuery && (
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900 mb-4">
            &apos;{initialQuery}&apos; 검색 결과
            <span className="ml-2 text-sm font-normal text-gray-500">{initialResults.length}건</span>
          </h1>

          {initialResults.length > 0 && (
            <div className="flex flex-wrap items-center gap-4">
              {/* 카테고리 필터 */}
              <div className="flex items-center gap-2">
                <label htmlFor="category-filter" className="text-sm text-gray-600 shrink-0">
                  카테고리
                </label>
                <select
                  id="category-filter"
                  value={initialCategory}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-[#E8192C]"
                >
                  <option value="">전체</option>
                  {availableCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* 정렬 옵션 */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">정렬</span>
                <div className="flex gap-1">
                  {(["date", "views"] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => handleSortChange(opt)}
                      className="px-3 py-1.5 rounded text-sm border transition-colors"
                      style={
                        initialSort === opt
                          ? { backgroundColor: "#E8192C", color: "#fff", borderColor: "#E8192C" }
                          : { backgroundColor: "#fff", color: "#374151", borderColor: "#D1D5DB" }
                      }
                    >
                      {opt === "date" ? "최신순" : "조회수순"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 검색 결과 없을 때 */}
      {initialQuery && initialResults.length === 0 && (
        <div>
          <div className="py-12 text-center text-gray-500">
            <p className="text-lg mb-2">검색 결과가 없습니다.</p>
            <p className="text-sm">다른 검색어로 다시 시도해 주세요.</p>
          </div>

          {/* 인기 기사 추천 */}
          {popularArticles.length > 0 && (
            <div className="mt-4">
              <h2 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b-2" style={{ borderColor: "#E8192C" }}>
                인기 기사
              </h2>
              <div className="space-y-0">
                {popularArticles.map((article, idx) => (
                  <Link
                    key={article.id}
                    href={`/article/${article.id}`}
                    className="flex items-center gap-4 py-4 border-b border-gray-200 hover:bg-gray-50 transition-colors group"
                  >
                    <span
                      className="text-xl font-bold shrink-0 w-8 text-center"
                      style={{ color: idx < 3 ? "#E8192C" : "#9CA3AF" }}
                    >
                      {idx + 1}
                    </span>
                    {article.thumbnail && (
                      <div className="w-16 h-11 shrink-0 overflow-hidden rounded relative">
                        <Image
                          src={article.thumbnail}
                          alt={article.title}
                          fill
                          className="object-cover"
                          sizes="64px"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 group-hover:text-[#E8192C] transition-colors line-clamp-2">
                        {article.title}
                      </p>
                      <span className="text-xs text-gray-400">조회 {article.views.toLocaleString()}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 결과 목록 */}
      <div className="space-y-0">
        {paginatedResults.map((article) => (
          <Link
            key={article.id}
            href={`/article/${article.id}`}
            className="block py-5 border-b border-gray-200 hover:bg-gray-50 transition-colors group"
          >
            <span className="text-xs px-2 py-0.5 rounded text-white mr-2" style={{ backgroundColor: "#E8192C" }}>
              {article.category}
            </span>
            <h2 className="inline text-base font-bold text-gray-900 group-hover:text-[#E8192C] transition-colors">
              {highlightText(article.title, initialQuery)}
            </h2>
            <p className="text-sm text-gray-600 mt-2 line-clamp-1">
              {highlightText(
                (article.summary || article.body.replace(/<[^>]*>/g, "")).slice(0, 100) + "...",
                initialQuery
              )}
            </p>
            <div className="text-xs text-gray-400 mt-2">
              {article.date} · 조회 {article.views.toLocaleString()}
            </div>
          </Link>
        ))}
      </div>

      {/* 페이지네이션 */}
      {initialResults.length > ITEMS_PER_PAGE && (
        <div className="flex flex-wrap justify-center items-center gap-1 mt-8">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className={`px-3 py-2 border rounded text-sm ${currentPage === 1 ? "border-gray-200 text-gray-300" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
          >
            &lt;
          </button>
          {getPageNumbers(currentPage, totalPages).map((page) => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={`px-3 py-2 border rounded text-sm font-medium ${page === currentPage ? "text-white border-[#E8192C]" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
              style={page === currentPage ? { backgroundColor: "#E8192C" } : {}}
            >
              {page}
            </button>
          ))}
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className={`px-3 py-2 border rounded text-sm ${currentPage === totalPages ? "border-gray-200 text-gray-300" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
          >
            &gt;
          </button>
        </div>
      )}
    </div>
  );
}
