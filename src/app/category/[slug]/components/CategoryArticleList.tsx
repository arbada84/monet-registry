import CategoryPagination from "@/components/ui/CategoryPagination";
import type { CategoryPaginationState } from "@/lib/category-pagination";
import Link from "@/components/ui/PublicLink";
import Image from "next/image";
import type { Article } from "@/types/article";

interface Props {
  articles: Article[];
  categoryName: string;
  pagination: CategoryPaginationState;
}

export default function CategoryArticleList({ articles, categoryName, pagination }: Props) {
  if (articles.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="text-gray-500 text-lg mb-4">아직 기사가 없습니다.</p>
        <Link
          href="/"
          className="inline-block px-5 py-2 rounded text-sm text-white"
          style={{ backgroundColor: "#E8192C" }}
        >
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-0">
        {articles.map((article) => (
          <Link
            key={article.id}
            href={`/article/${article.no ?? article.id}`}
            className="flex gap-4 py-5 border-b border-gray-200 hover:bg-gray-50 transition-colors group"
          >
            {article.thumbnail ? (
              <div className="w-[110px] h-[75px] sm:w-[160px] sm:h-[105px] md:w-[200px] md:h-[130px] shrink-0 overflow-hidden rounded relative">
                <Image
                  src={article.thumbnail}
                  alt={article.title}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform"
                  sizes="(max-width: 640px) 110px, (max-width: 768px) 160px, 200px"
                  unoptimized
                />
              </div>
            ) : (
              <div className="w-[110px] h-[75px] sm:w-[160px] sm:h-[105px] md:w-[200px] md:h-[130px] shrink-0 bg-gray-100 rounded flex items-center justify-center text-gray-300 text-2xl" aria-hidden="true">
                📰
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-[#E8192C] transition-colors leading-snug">
                {article.title}
              </h2>
              <p className="text-sm text-gray-600 line-clamp-2 mb-3 leading-relaxed">
                {(article.summary || (article.body || "").replace(/<[^>]*>/g, "")).slice(0, 120)}{(article.summary || article.body || "").length > 120 ? "..." : ""}
              </p>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span>{article.date}</span>
                <span>조회 {(article.views || 0).toLocaleString()}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <CategoryPagination categoryName={categoryName} {...pagination} />
    </div>
  );
}
