import { ArticleListSkeleton } from "@/components/ui/Skeleton";

// 검색 페이지 로딩 스켈레톤
export default function SearchLoading() {
  return (
    <div className="w-full min-h-screen">
      <div className="h-14 border-b border-gray-200 bg-white" />
      <ArticleListSkeleton count={8} />
    </div>
  );
}
