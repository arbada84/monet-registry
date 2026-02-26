"use client";

import Link from "next/link";

interface Props {
  currentPage: number;
  totalPages: number;
  slug: string;
}

export default function CategoryPagination({ currentPage, totalPages, slug }: Props) {
  const getPageNumbers = () => {
    const pages: number[] = [];
    let start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  const pageUrl = (page: number) => `/category/${slug}?page=${page}`;

  return (
    <div className="flex flex-wrap justify-center items-center gap-1 mt-8">
      <Link
        href={pageUrl(Math.max(1, currentPage - 1))}
        aria-disabled={currentPage === 1}
        className={`px-3 py-2 border rounded text-sm ${currentPage === 1 ? "border-gray-200 text-gray-300 pointer-events-none" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
      >
        &lt;
      </Link>
      {getPageNumbers().map((page) => (
        <Link
          key={page}
          href={pageUrl(page)}
          className={`px-3 py-2 border rounded text-sm font-medium ${page === currentPage ? "border-[#E8192C] text-white" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
          style={page === currentPage ? { backgroundColor: "#E8192C" } : {}}
        >
          {page}
        </Link>
      ))}
      <Link
        href={pageUrl(Math.min(totalPages, currentPage + 1))}
        aria-disabled={currentPage === totalPages}
        className={`px-3 py-2 border rounded text-sm ${currentPage === totalPages ? "border-gray-200 text-gray-300 pointer-events-none" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
      >
        &gt;
      </Link>
    </div>
  );
}
