import { ArticlePageSkeleton } from "@/components/ui/Skeleton";

// 기사 상세 페이지 로딩 스켈레톤
export default function ArticleLoading() {
  return (
    <div className="w-full min-h-screen">
      {/* 헤더 스켈레톤 */}
      <div className="h-14 border-b border-gray-200 bg-white" />
      <ArticlePageSkeleton />
    </div>
  );
}
