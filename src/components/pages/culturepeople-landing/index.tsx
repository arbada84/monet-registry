import type { Article } from "@/types/article";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleHero1 from "@/components/registry/culturepeople-hero-1";
import CulturepeopleNewsGrid2 from "@/components/registry/culturepeople-news-grid-2";
import CulturepeopleCategoryNews3 from "@/components/registry/culturepeople-category-news-3";
import CulturepeopleTextLinks4 from "@/components/registry/culturepeople-text-links-4";

import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";
import MobileNewsTicker from "@/components/ui/MobileNewsTicker";
import MobileBottomNav from "@/components/ui/MobileBottomNav";
import AdBanner from "@/components/ui/AdBanner";
import PopupRenderer from "@/components/ui/PopupRenderer";

interface CulturepeopleLandingProps {
  mode?: "light" | "dark";
  articles: Article[];
}

/**
 * culturepeople-landing - 컬처피플 뉴스 포털 전체 페이지
 * articles는 서버 컴포넌트(page.tsx)에서 SSR로 주입됩니다.
 */
export default function CulturepeopleLanding({ mode = "light", articles }: CulturepeopleLandingProps) {
  return (
    <div className="w-full min-h-screen pb-16 md:pb-0">
      <PopupRenderer />
      <CulturepeopleHeader0 mode={mode} />
      <AdBanner position="top" height={90} className="mx-auto max-w-[1200px] px-4 pt-4 hidden md:block" />
      <CulturepeopleHero1 mode={mode} articles={articles} />
      <AdBanner position="home-mid-1" height={90} className="mx-auto max-w-[1200px] px-4 py-2" />
      <CulturepeopleNewsGrid2 mode={mode} articles={articles} />

      {/* Mobile: 실시간 뉴스 ticker */}
      <MobileNewsTicker articles={articles} />

      <AdBanner position="home-mid-2" height={90} className="mx-auto max-w-[1200px] px-4 py-2" />
      <CulturepeopleCategoryNews3 mode={mode} articles={articles} />
      <CulturepeopleTextLinks4 mode={mode} articles={articles} />

      <AdBanner position="bottom" height={90} className="mx-auto max-w-[1200px] px-4 pb-4" />
      <CulturepeopleFooter6 mode={mode} />

      {/* Mobile: bottom fixed navigation */}
      <MobileBottomNav />
    </div>
  );
}
