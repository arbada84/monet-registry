import { HeroSkeleton, NewsGridSkeleton } from "@/components/ui/Skeleton";

// 홈 페이지 로딩 스켈레톤
export default function HomeLoading() {
  return (
    <div className="w-full min-h-screen">
      {/* 헤더 스켈레톤 */}
      <div className="h-14 border-b border-gray-200 bg-white" />
      <HeroSkeleton />
      <NewsGridSkeleton count={8} />
    </div>
  );
}
