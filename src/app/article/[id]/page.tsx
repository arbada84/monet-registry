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
  tags: string;
  author: string;
  summary: string;
}

function recordPageView(articleId: string) {
  try {
    const now = new Date().toISOString();
    // Record in view log for analytics
    const viewLog: { articleId: string; timestamp: string; path: string }[] = JSON.parse(localStorage.getItem("cp-view-log") || "[]");
    viewLog.push({ articleId, timestamp: now, path: `/article/${articleId}` });
    // Keep last 10000 entries
    if (viewLog.length > 10000) viewLog.splice(0, viewLog.length - 10000);
    localStorage.setItem("cp-view-log", JSON.stringify(viewLog));

    // Increment article view count
    const raw = localStorage.getItem("cp-articles");
    if (raw) {
      const articles: Article[] = JSON.parse(raw);
      const idx = articles.findIndex((a) => a.id === articleId);
      if (idx !== -1) {
        articles[idx].views = (articles[idx].views || 0) + 1;
        localStorage.setItem("cp-articles", JSON.stringify(articles));
      }
    }
  } catch { /* ignore */ }
}

function getTop10Monthly(): { id: string; title: string; views: number }[] {
  try {
    const raw = localStorage.getItem("cp-articles");
    if (!raw) return [];
    const articles: Article[] = JSON.parse(raw).filter((a: Article) => a.status === "게시");

    // Get view log and filter to last 30 days
    const viewLog: { articleId: string; timestamp: string }[] = JSON.parse(localStorage.getItem("cp-view-log") || "[]");
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.toISOString();

    const monthlyViews: Record<string, number> = {};
    viewLog.forEach((v) => {
      if (v.timestamp >= cutoff) {
        monthlyViews[v.articleId] = (monthlyViews[v.articleId] || 0) + 1;
      }
    });

    // Merge with stored views for articles without log entries
    return articles
      .map((a) => ({
        id: a.id,
        title: a.title,
        views: monthlyViews[a.id] || a.views || 0,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);
  } catch {
    return [];
  }
}

export default function ArticlePage() {
  const params = useParams();
  const [article, setArticle] = useState<Article | null>(null);
  const [relatedArticles, setRelatedArticles] = useState<Article[]>([]);
  const [top10, setTop10] = useState<{ id: string; title: string; views: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("cp-articles");
    const articles: Article[] = stored ? JSON.parse(stored) : [];

    const found = articles.find((a) => a.id === params.id);
    if (found) {
      // Record page view
      recordPageView(found.id);
      // Re-read to get updated view count
      const updated = localStorage.getItem("cp-articles");
      const updatedArticles: Article[] = updated ? JSON.parse(updated) : articles;
      const updatedFound = updatedArticles.find((a) => a.id === params.id) || found;

      setArticle(updatedFound);
      setRelatedArticles(
        updatedArticles
          .filter((a) => a.category === updatedFound.category && a.id !== updatedFound.id && a.status === "게시")
          .slice(0, 5)
      );
    }

    setTop10(getTop10Monthly());
    setLoading(false);
  }, [params.id]);

  if (loading) {
    return (
      <div className="w-full min-h-screen" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
        <CulturepeopleHeader0 />
        <div className="mx-auto max-w-[1200px] px-4 py-20 text-center text-gray-500">로딩 중...</div>
        <CulturepeopleFooter6 />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="w-full min-h-screen" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
        <CulturepeopleHeader0 />
        <div className="mx-auto max-w-[1200px] px-4 py-20 text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">기사를 찾을 수 없습니다</h1>
          <p className="text-gray-500 mb-8">요청하신 기사가 존재하지 않거나 삭제되었습니다.</p>
          <Link href="/" className="text-sm text-white px-6 py-3 rounded" style={{ backgroundColor: "#E8192C" }}>
            홈으로 돌아가기
          </Link>
        </div>
        <CulturepeopleFooter6 />
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <CulturepeopleHeader0 />

      <div className="mx-auto max-w-[1200px] px-4 py-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          {/* Article Content */}
          <article className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-4">
              <Link href="/" className="hover:text-[#E8192C]">홈</Link>
              <span>&gt;</span>
              <Link href={`/category/${article.category}`} className="hover:text-[#E8192C]">{article.category}</Link>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 leading-tight mb-3 md:text-3xl">
              {article.title}
            </h1>

            <div className="flex items-center gap-3 text-sm text-gray-500 mb-6 pb-6 border-b border-gray-200">
              {article.author && <span>{article.author} 기자</span>}
              <span>{article.date}</span>
              <span>조회 {(article.views || 0).toLocaleString()}</span>
            </div>

            {article.summary && (
              <div className="mb-6 p-4 bg-gray-50 border-l-4 rounded text-sm text-gray-700 leading-relaxed" style={{ borderLeftColor: "#E8192C" }}>
                {article.summary}
              </div>
            )}

            {article.thumbnail && (
              <div className="mb-6">
                <img src={article.thumbnail} alt={article.title} className="w-full rounded" />
              </div>
            )}

            <div className="text-base text-gray-800 leading-[1.9] whitespace-pre-wrap mb-8">
              {article.body}
            </div>

            {article.tags && (
              <div className="flex flex-wrap gap-2 mb-8 pt-6 border-t border-gray-200">
                {article.tags.split(",").map((tag) => (
                  <Link
                    key={tag.trim()}
                    href={`/search?q=${encodeURIComponent(tag.trim())}`}
                    className="px-3 py-1 text-xs border border-gray-300 rounded-full text-gray-600 hover:border-[#E8192C] hover:text-[#E8192C] transition-colors"
                  >
                    #{tag.trim()}
                  </Link>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3 mb-8 pb-8 border-b border-gray-200">
              <span className="text-sm font-medium text-gray-600">공유하기</span>
              <button
                onClick={() => { navigator.clipboard.writeText(window.location.href); alert("링크가 복사되었습니다."); }}
                className="px-4 py-2 text-xs border border-gray-300 rounded hover:bg-gray-50"
              >
                링크 복사
              </button>
            </div>

            {article.author && (
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded mb-8">
                <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-lg font-bold text-gray-500 shrink-0">
                  {article.author.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-800">{article.author} 기자</div>
                  <div className="text-xs text-gray-500">컬처피플 기자</div>
                </div>
              </div>
            )}
          </article>

          {/* Sidebar */}
          <aside className="w-full lg:w-[320px] shrink-0">
            {/* TOP 10 Monthly */}
            {top10.length > 0 && (
              <div className="border border-gray-200 rounded p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-block h-5 w-1 rounded-full" style={{ backgroundColor: "#E8192C" }} />
                  <h3 className="text-base font-bold text-gray-900">이달의 TOP 10</h3>
                </div>
                <div className="space-y-0">
                  {top10.map((item, idx) => (
                    <Link
                      key={item.id}
                      href={`/article/${item.id}`}
                      className="flex items-start gap-3 border-b border-gray-100 py-2.5 last:border-b-0 hover:bg-gray-50 transition-colors"
                    >
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-xs font-bold text-white"
                        style={{ backgroundColor: idx < 3 ? "#E8192C" : "#999" }}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="block text-sm text-gray-700 leading-snug line-clamp-2 hover:text-[#E8192C]">
                          {item.title}
                        </span>
                        <span className="text-[11px] text-gray-400">{item.views.toLocaleString()}회</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Related Articles */}
            {relatedArticles.length > 0 && (
              <div className="border border-gray-200 rounded p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-block h-5 w-1 rounded-full" style={{ backgroundColor: "#E8192C" }} />
                  <h3 className="text-base font-bold text-gray-900">관련 기사</h3>
                </div>
                <ul className="space-y-2">
                  {relatedArticles.map((ra) => (
                    <li key={ra.id}>
                      <Link
                        href={`/article/${ra.id}`}
                        className="block text-sm text-gray-700 hover:text-[#E8192C] leading-snug py-1 border-b border-gray-100 last:border-b-0"
                      >
                        {ra.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border border-gray-200 rounded p-4 bg-gray-50 text-center text-xs text-gray-400 h-[250px] flex items-center justify-center">
              광고 영역
            </div>
          </aside>
        </div>
      </div>

      <CulturepeopleFooter6 />
    </div>
  );
}
