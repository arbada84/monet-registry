import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { serverGetArticles } from "@/lib/db-server";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";
import AdBanner from "@/components/ui/AdBanner";

interface Props {
  params: Promise<{ name: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const decoded = decodeURIComponent(name);
  return {
    title: `${decoded} 기자`,
    description: `컬처피플 ${decoded} 기자의 기사 목록을 확인하세요.`,
  };
}

export default async function ReporterPage({ params }: Props) {
  const { name } = await params;
  const reporterName = decodeURIComponent(name);

  const allArticles = await serverGetArticles();
  const articles = allArticles
    .filter((a) => a.author === reporterName && a.status === "게시")
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  if (articles.length === 0) notFound();

  const categories = [...new Set(articles.map((a) => a.category))];
  const totalViews = articles.reduce((sum, a) => sum + (a.views || 0), 0);

  return (
    <div className="w-full min-h-screen" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <CulturepeopleHeader0 />

      <div className="mx-auto max-w-[1200px] px-4 py-8">
        {/* 기자 프로필 헤더 */}
        <div className="flex items-center gap-5 mb-8 pb-6 border-b-2" style={{ borderColor: "#E8192C" }}>
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white shrink-0"
            style={{ background: "#E8192C" }}
          >
            {reporterName.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{reporterName} 기자</h1>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-500">
              <span>총 {articles.length}건</span>
              <span>·</span>
              <span>조회 {totalViews.toLocaleString()}회</span>
              {categories.length > 0 && (
                <>
                  <span>·</span>
                  <div className="flex flex-wrap gap-1">
                    {categories.map((cat) => (
                      <Link
                        key={cat}
                        href={`/category/${encodeURIComponent(cat)}`}
                        className="px-2 py-0.5 text-xs rounded-full border hover:border-[#E8192C] hover:text-[#E8192C] transition-colors"
                        style={{ borderColor: "#DDD", color: "#666" }}
                      >
                        {cat}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          {/* 기사 목록 */}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 mb-4">작성 기사</h2>
            <div className="space-y-0 divide-y divide-gray-100">
              {articles.map((article) => (
                <Link
                  key={article.id}
                  href={`/article/${article.id}`}
                  className="flex gap-4 py-4 hover:bg-gray-50 transition-colors px-2 -mx-2 rounded"
                >
                  {article.thumbnail && (
                    <div className="shrink-0 w-[100px] h-[68px] overflow-hidden rounded">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={article.thumbnail}
                        alt={article.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-medium text-gray-900 leading-snug line-clamp-2 mb-1 hover:text-[#E8192C]">
                      {article.title}
                    </h3>
                    {article.summary && (
                      <p className="text-sm text-gray-500 line-clamp-1 mb-1">{article.summary}</p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span
                        className="px-1.5 py-0.5 rounded text-white text-[11px]"
                        style={{ background: "#E8192C" }}
                      >
                        {article.category}
                      </span>
                      <span>{article.date}</span>
                      <span>조회 {(article.views || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* 사이드바 */}
          <aside className="w-full lg:w-[280px] shrink-0">
            {/* 카테고리 분포 */}
            <div className="border border-gray-200 rounded p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-block h-5 w-1 rounded-full" style={{ backgroundColor: "#E8192C" }} />
                <h3 className="text-base font-bold text-gray-900">카테고리별 기사 수</h3>
              </div>
              <ul className="space-y-2">
                {categories.map((cat) => {
                  const count = articles.filter((a) => a.category === cat).length;
                  return (
                    <li key={cat} className="flex items-center justify-between text-sm">
                      <Link href={`/category/${encodeURIComponent(cat)}`} className="text-gray-700 hover:text-[#E8192C]">
                        {cat}
                      </Link>
                      <span className="text-gray-500">{count}건</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <AdBanner height={250} />
          </aside>
        </div>
      </div>

      <CulturepeopleFooter6 />
    </div>
  );
}
