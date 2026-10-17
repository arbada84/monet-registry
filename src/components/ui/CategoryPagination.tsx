import Link from "@/components/ui/PublicLink";
import { categoryPageHref, CATEGORY_MAX_PAGE, type CategoryPaginationState } from "@/lib/category-pagination";

export default function CategoryPagination({ categoryName, page, hasNext }: CategoryPaginationState & { categoryName: string }) {
  return (
    <nav aria-label="카테고리 페이지" className="flex items-center justify-center gap-6 mt-8 text-sm">
      {page > 1 && (
        <Link href={categoryPageHref(categoryName, page - 1)} prefetch={false} rel="prev" className="underline underline-offset-4">
          이전
        </Link>
      )}
      <span aria-current="page">{page} 페이지</span>
      {hasNext && page < CATEGORY_MAX_PAGE && (
        <Link href={categoryPageHref(categoryName, page + 1)} prefetch={false} rel="next" className="underline underline-offset-4">
          다음
        </Link>
      )}
    </nav>
  );
}
