import type { Metadata } from "next";
import { serverGetArticles } from "@/lib/db-server";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";
import CategoryArticleList from "./components/CategoryArticleList";

const CATEGORIES: Record<string, string> = {
  "뉴스": "뉴스",
  "연예": "연예",
  "스포츠": "스포츠",
  "문화": "문화",
  "라이프": "라이프",
  "포토": "포토",
  "경제": "경제",
  news: "뉴스",
  entertainment: "연예",
  sports: "스포츠",
  culture: "문화",
  life: "라이프",
  photo: "포토",
  economy: "경제",
};

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://culturepeople.co.kr";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const categoryName = CATEGORIES[decodeURIComponent(slug)] || decodeURIComponent(slug);
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
  const categoryName = CATEGORIES[decodeURIComponent(slug)] || decodeURIComponent(slug);

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

      <CulturepeopleHeader0 />

      <div className="mx-auto max-w-[1200px] px-4 py-8">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6 pb-4 border-b-2" style={{ borderColor: "#E8192C" }}>
          <h1 className="text-2xl font-bold text-gray-900">{categoryName}</h1>
          <span className="text-sm text-gray-500">{articleCount}건</span>
        </div>

        {/* 클라이언트 컴포넌트: 더 보기 버튼 + 기사 목록 */}
        <CategoryArticleList articles={articles} categoryName={categoryName} />
      </div>

      <CulturepeopleFooter6 />
    </div>
  );
}
