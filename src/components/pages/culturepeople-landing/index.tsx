"use client";

import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleHero1 from "@/components/registry/culturepeople-hero-1";
import CulturepeopleNewsGrid2 from "@/components/registry/culturepeople-news-grid-2";
import CulturepeopleCategoryNews3 from "@/components/registry/culturepeople-category-news-3";
import CulturepeopleTextLinks4 from "@/components/registry/culturepeople-text-links-4";
import CulturepeopleBanner5 from "@/components/registry/culturepeople-banner-5";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";

interface CulturepeopleLandingProps {
  mode?: "light" | "dark";
}

/**
 * culturepeople-landing - 컬처피플 뉴스 포털 전체 페이지
 *
 * This page combines the following sections:
 * - culturepeople-header-0
 * - culturepeople-hero-1
 * - culturepeople-news-grid-2
 * - culturepeople-category-news-3
 * - culturepeople-text-links-4
 * - culturepeople-banner-5
 * - culturepeople-footer-6
 */
export default function CulturepeopleLanding({ mode = "light" }: CulturepeopleLandingProps) {
  return (
    <div className="w-full min-h-screen">
      <CulturepeopleHeader0 mode={mode} />
      <CulturepeopleHero1 mode={mode} />
      <CulturepeopleNewsGrid2 mode={mode} />
      <CulturepeopleCategoryNews3 mode={mode} />
      <CulturepeopleTextLinks4 mode={mode} />
      <CulturepeopleBanner5 mode={mode} />
      <CulturepeopleFooter6 mode={mode} />
    </div>
  );
}
