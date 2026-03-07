import type { Article } from "@/types/article";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleHero1 from "@/components/registry/culturepeople-hero-1";
import CulturepeopleNewsGrid2 from "@/components/registry/culturepeople-news-grid-2";
import CulturepeopleCategoryNews3 from "@/components/registry/culturepeople-category-news-3";
import CulturepeopleTextLinks4 from "@/components/registry/culturepeople-text-links-4";

import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";
import AdBanner from "@/components/ui/AdBanner";
import PopupRenderer from "@/components/ui/PopupRenderer";
import CoupangUnit from "@/components/ui/CoupangUnit";

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
    <div className="w-full min-h-screen">
      <PopupRenderer />
      <CulturepeopleHeader0 mode={mode} />
      <AdBanner position="top" height={90} className="mx-auto max-w-[1200px] px-4 pt-4" />
      <CulturepeopleHero1 mode={mode} articles={articles} />
      {/* 쿠팡 파트너스 — 헤드라인 하단 1 (1100×120 carousel) */}
      <div className="mx-auto max-w-[1200px] px-4 py-2 flex justify-center">
        <CoupangUnit id={273473} trackingCode="AF1979086" template="carousel" width={1100} height={120} />
      </div>
      <CulturepeopleNewsGrid2 mode={mode} articles={articles} />
      {/* 쿠팡 파트너스 — 헤드라인 하단 2 (1100×120 carousel) */}
      <div className="mx-auto max-w-[1200px] px-4 py-2 flex justify-center">
        <CoupangUnit id={593765} trackingCode="AF1979086" template="carousel" width={1100} height={120} />
      </div>
      <CulturepeopleCategoryNews3 mode={mode} articles={articles} />
      <CulturepeopleTextLinks4 mode={mode} articles={articles} />

      <AdBanner position="bottom" height={90} className="mx-auto max-w-[1200px] px-4 pb-4" />
      <CulturepeopleFooter6 mode={mode} />
    </div>
  );
}
