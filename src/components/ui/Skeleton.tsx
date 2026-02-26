// 기본 Skeleton 애니메이션 블록
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-gray-200 rounded ${className}`}
    />
  );
}

// 기사 카드 스켈레톤 (뉴스 그리드용)
export function ArticleCardSkeleton() {
  return (
    <div className="border border-gray-100 rounded overflow-hidden">
      <Skeleton className="w-full aspect-[16/9]" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

// 히어로 섹션 스켈레톤
export function HeroSkeleton() {
  return (
    <div className="w-full">
      <div className="max-w-[1200px] mx-auto px-4 py-6">
        <div className="flex flex-col gap-4 md:flex-row">
          {/* 메인 큰 기사 */}
          <div className="flex-1">
            <Skeleton className="w-full aspect-[16/9] rounded" />
            <div className="mt-3 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          {/* 사이드 기사 목록 */}
          <div className="w-full md:w-[300px] space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="w-20 h-16 shrink-0 rounded" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// 뉴스 그리드 스켈레톤 (4열)
export function NewsGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6">
      <Skeleton className="h-6 w-32 mb-4" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: count }).map((_, i) => (
          <ArticleCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// 기사 본문 페이지 스켈레톤
export function ArticlePageSkeleton() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8">
      <div className="flex flex-col gap-8 lg:flex-row">
        {/* 본문 */}
        <article className="flex-1 min-w-0">
          {/* 브레드크럼 */}
          <div className="flex gap-2 mb-4">
            <Skeleton className="h-3 w-8" />
            <Skeleton className="h-3 w-4" />
            <Skeleton className="h-3 w-16" />
          </div>
          {/* 제목 */}
          <Skeleton className="h-8 w-full mb-2" />
          <Skeleton className="h-8 w-4/5 mb-4" />
          {/* 메타 */}
          <div className="flex gap-3 mb-6 pb-6 border-b border-gray-200">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
          {/* 요약 */}
          <Skeleton className="h-16 w-full mb-6 rounded" />
          {/* 썸네일 */}
          <Skeleton className="w-full aspect-[16/9] mb-6 rounded" />
          {/* 본문 줄 */}
          <div className="space-y-3">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className={`h-4 ${i % 5 === 4 ? "w-2/3" : "w-full"}`} />
            ))}
          </div>
        </article>
        {/* 사이드바 */}
        <aside className="w-full lg:w-[320px] shrink-0">
          <div className="border border-gray-200 rounded p-4 mb-4">
            <Skeleton className="h-5 w-24 mb-3" />
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-3 py-2 border-b border-gray-100 last:border-0">
                <Skeleton className="h-6 w-6 shrink-0 rounded-sm" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

// 카테고리/검색 결과 목록 스켈레톤
export function ArticleListSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6">
      <Skeleton className="h-7 w-48 mb-6" />
      <div className="space-y-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex gap-4 border-b border-gray-100 pb-4">
            <Skeleton className="w-32 h-24 shrink-0 rounded" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
