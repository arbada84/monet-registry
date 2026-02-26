import type { Article } from "@/types/article";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleHero1 from "@/components/registry/culturepeople-hero-1";
import CulturepeopleNewsGrid2 from "@/components/registry/culturepeople-news-grid-2";
import CulturepeopleCategoryNews3 from "@/components/registry/culturepeople-category-news-3";
import CulturepeopleTextLinks4 from "@/components/registry/culturepeople-text-links-4";
import CulturepeopleBanner5 from "@/components/registry/culturepeople-banner-5";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";

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
      <CulturepeopleHeader0 mode={mode} />
      <CulturepeopleHero1 mode={mode} articles={articles} />
      <CulturepeopleNewsGrid2 mode={mode} articles={articles} />
      <CulturepeopleCategoryNews3 mode={mode} articles={articles} />
      <CulturepeopleTextLinks4 mode={mode} articles={articles} />
      <CulturepeopleBanner5 mode={mode} />
      <CulturepeopleFooter6 mode={mode} />
    </div>
  );
}
