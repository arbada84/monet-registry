import { ArticleListSkeleton } from "@/components/ui/Skeleton";

// 카테고리 페이지 로딩 스켈레톤
export default function CategoryLoading() {
  return (
    <div className="w-full min-h-screen">
      <div className="h-14 border-b border-gray-200 bg-white" />
      <ArticleListSkeleton count={10} />
    </div>
  );
}
