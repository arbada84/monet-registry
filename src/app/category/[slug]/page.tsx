import type { Metadata } from "next";
import { serverGetArticles, serverGetSetting } from "@/lib/db-server";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";
import AdBanner from "@/components/ui/AdBanner";
import PopupRenderer from "@/components/ui/PopupRenderer";
import CategoryArticleList from "./components/CategoryArticleList";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://culturepeople.co.kr";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

async function resolveCategoryName(slug: string): Promise<string> {
  const decoded = decodeURIComponent(slug);
  // DB에 저장된 동적 카테고리 목록에서 이름 확인
  const cats = await serverGetSetting<{ name: string }[] | null>("cp-categories", null);
  if (cats) {
    const found = cats.find((c) => c.name === decoded || c.name.toLowerCase() === decoded.toLowerCase());
    if (found) return found.name;
  }
  return decoded;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const categoryName = await resolveCategoryName(slug);
  return {
    title: `${categoryName} 뉴스`,
    description: `컬처피플 ${categoryName} 카테고리 뉴스를 확인하세요.`,
    openGraph: {
      type: "website",
      title: `${categoryName} 뉴스 - 컬처피플`,
      description: `컬처피플 ${categoryName} 카테고리 뉴스`,
    },
  };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const categoryName = await resolveCategoryName(slug);

  const allArticles = await serverGetArticles();
  const articles = allArticles.filter(
    (a) => a.category === categoryName && a.status === "게시"
  );

  const articleCount = articles.length;

  // Schema.org CollectionPage JSON-LD
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${categoryName} 뉴스`,
    description: `${categoryName} 최신 뉴스`,
    url: `${BASE_URL}/category/${slug}`,
  };

  return (
    <div className="w-full min-h-screen" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      {/* Schema.org JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <PopupRenderer />
      <CulturepeopleHeader0 />

      <div className="mx-auto max-w-[1200px] px-4 py-8">
        <AdBanner position="top" height={90} className="mb-6" />

        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6 pb-4 border-b-2" style={{ borderColor: "#E8192C" }}>
          <h1 className="text-2xl font-bold text-gray-900">{categoryName}</h1>
          <span className="text-sm text-gray-500">{articleCount}건</span>
        </div>

        {/* 클라이언트 컴포넌트: 더 보기 버튼 + 기사 목록 */}
        <CategoryArticleList articles={articles} categoryName={categoryName} />

        <AdBanner position="bottom" height={90} className="mt-6" />
      </div>

      <CulturepeopleFooter6 />
    </div>
  );
}
