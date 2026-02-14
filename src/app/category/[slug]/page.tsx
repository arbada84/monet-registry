"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";

interface Article {
  id: string;
  title: string;
  category: string;
  date: string;
  status: string;
  views: number;
  body: string;
  thumbnail: string;
}

const SAMPLE_ARTICLES: Article[] = [
  { id: "sample-1", title: "2024 한국 문화예술 트렌드 분석", category: "문화", date: "2024-12-01", status: "게시", views: 1520, body: "올해 한국 문화예술계는 다양한 변화를 겪었습니다...", thumbnail: "" },
  { id: "sample-2", title: "신인 배우 김하늘 인터뷰", category: "연예", date: "2024-12-05", status: "게시", views: 3200, body: "올해 가장 주목받는 신인 배우 김하늘을 만나보았습니다...", thumbnail: "" },
  { id: "sample-3", title: "K리그 2025 시즌 전망", category: "스포츠", date: "2024-12-10", status: "게시", views: 870, body: "2025 시즌 K리그의 전력 변화를 분석합니다...", thumbnail: "" },
  { id: "sample-4", title: "겨울 여행지 추천 BEST 10", category: "라이프", date: "2024-12-12", status: "게시", views: 4100, body: "올 겨울 가볼 만한 국내 여행지를 소개합니다...", thumbnail: "" },
  { id: "sample-5", title: "국립중앙박물관 특별전 포토", category: "포토", date: "2024-12-14", status: "게시", views: 2300, body: "국립중앙박물관에서 열린 특별전의 현장 사진입니다...", thumbnail: "" },
];

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

export default function CategoryPage() {
  const params = useParams();
  const slug = decodeURIComponent(params.slug as string);
  const categoryName = CATEGORIES[slug] || slug;

  const [articles, setArticles] = useState<Article[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("cp-articles");
    const all: Article[] = stored ? JSON.parse(stored) : SAMPLE_ARTICLES;
    setArticles(all.filter((a) => a.category === categoryName && a.status === "게시"));
  }, [categoryName]);

  return (
    <div className="w-full min-h-screen" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <CulturepeopleHeader0 />

      <div className="mx-auto max-w-[1200px] px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 pb-4 border-b-2" style={{ borderColor: "#E8192C" }}>
          <h1 className="text-2xl font-bold text-gray-900">{categoryName}</h1>
          <span className="text-sm text-gray-500">{articles.length}건</span>
        </div>

        {/* Article List */}
        {articles.length === 0 ? (
          <div className="py-20 text-center text-gray-500">해당 카테고리에 기사가 없습니다.</div>
        ) : (
          <div className="space-y-0">
            {articles.map((article) => (
              <Link
                key={article.id}
                href={`/article/${article.id}`}
                className="flex gap-4 py-5 border-b border-gray-200 hover:bg-gray-50 transition-colors group"
              >
                {/* Thumbnail */}
                {article.thumbnail ? (
                  <div className="w-[200px] h-[130px] shrink-0 overflow-hidden rounded">
                    <img src={article.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  </div>
                ) : (
                  <div className="w-[200px] h-[130px] shrink-0 bg-gray-100 rounded flex items-center justify-center text-gray-300 text-3xl">
                    📰
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-[#E8192C] transition-colors leading-snug">
                    {article.title}
                  </h2>
                  <p className="text-sm text-gray-600 line-clamp-2 mb-3 leading-relaxed">
                    {article.body.slice(0, 120)}...
                  </p>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{article.date}</span>
                    <span>조회 {article.views.toLocaleString()}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <CulturepeopleFooter6 />
    </div>
  );
}
