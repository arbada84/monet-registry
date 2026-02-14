"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
  {
    id: "sample-1",
    title: "2024 한국 문화예술 트렌드 분석",
    category: "문화",
    date: "2024-12-01",
    status: "게시",
    views: 1520,
    body: "올해 한국 문화예술계는 다양한 변화를 겪었습니다...",
    thumbnail: "",
  },
  {
    id: "sample-2",
    title: "신인 배우 김하늘 인터뷰",
    category: "연예",
    date: "2024-12-05",
    status: "게시",
    views: 3200,
    body: "올해 가장 주목받는 신인 배우 김하늘을 만나보았습니다...",
    thumbnail: "",
  },
  {
    id: "sample-3",
    title: "K리그 2025 시즌 전망",
    category: "스포츠",
    date: "2024-12-10",
    status: "임시저장",
    views: 870,
    body: "2025 시즌 K리그의 전력 변화를 분석합니다...",
    thumbnail: "",
  },
  {
    id: "sample-4",
    title: "겨울 여행지 추천 BEST 10",
    category: "라이프",
    date: "2024-12-12",
    status: "게시",
    views: 4100,
    body: "올 겨울 가볼 만한 국내 여행지를 소개합니다...",
    thumbnail: "",
  },
  {
    id: "sample-5",
    title: "국립중앙박물관 특별전 포토",
    category: "포토",
    date: "2024-12-14",
    status: "게시",
    views: 2300,
    body: "국립중앙박물관에서 열린 특별전의 현장 사진입니다...",
    thumbnail: "",
  },
];

export default function AdminArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("cp-articles");
    if (stored) {
      setArticles(JSON.parse(stored));
    } else {
      localStorage.setItem("cp-articles", JSON.stringify(SAMPLE_ARTICLES));
      setArticles(SAMPLE_ARTICLES);
    }
  }, []);

  const handleDelete = (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    const updated = articles.filter((a) => a.id !== id);
    setArticles(updated);
    localStorage.setItem("cp-articles", JSON.stringify(updated));
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>
          기사 관리
        </h1>
        <Link
          href="/admin/articles/new"
          style={{
            padding: "10px 20px",
            background: "#E8192C",
            color: "#FFF",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          + 기사 작성
        </Link>
      </div>

      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #EEEEEE",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {articles.length === 0 ? (
          <div
            style={{
              padding: "40px 20px",
              textAlign: "center",
              color: "#999",
              fontSize: 14,
            }}
          >
            등록된 기사가 없습니다.
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
            }}
          >
            <thead>
              <tr
                style={{
                  background: "#FAFAFA",
                  borderBottom: "1px solid #EEEEEE",
                }}
              >
                <th
                  style={{
                    padding: "10px 20px",
                    textAlign: "left",
                    fontWeight: 500,
                    color: "#666",
                  }}
                >
                  제목
                </th>
                <th
                  style={{
                    padding: "10px 16px",
                    textAlign: "left",
                    fontWeight: 500,
                    color: "#666",
                    width: 100,
                  }}
                >
                  카테고리
                </th>
                <th
                  style={{
                    padding: "10px 16px",
                    textAlign: "left",
                    fontWeight: 500,
                    color: "#666",
                    width: 110,
                  }}
                >
                  날짜
                </th>
                <th
                  style={{
                    padding: "10px 16px",
                    textAlign: "left",
                    fontWeight: 500,
                    color: "#666",
                    width: 80,
                  }}
                >
                  상태
                </th>
                <th
                  style={{
                    padding: "10px 16px",
                    textAlign: "left",
                    fontWeight: 500,
                    color: "#666",
                    width: 80,
                  }}
                >
                  조회수
                </th>
                <th
                  style={{
                    padding: "10px 16px",
                    textAlign: "center",
                    fontWeight: 500,
                    color: "#666",
                    width: 80,
                  }}
                >
                  관리
                </th>
              </tr>
            </thead>
            <tbody>
              {articles.map((article) => (
                <tr
                  key={article.id}
                  style={{ borderBottom: "1px solid #EEEEEE" }}
                >
                  <td style={{ padding: "12px 20px", color: "#111" }}>
                    {article.title}
                  </td>
                  <td style={{ padding: "12px 16px", color: "#666" }}>
                    {article.category}
                  </td>
                  <td style={{ padding: "12px 16px", color: "#666" }}>
                    {article.date}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span
                      style={{
                        padding: "3px 10px",
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 500,
                        background:
                          article.status === "게시" ? "#E8F5E9" : "#FFF3E0",
                        color:
                          article.status === "게시" ? "#2E7D32" : "#E65100",
                      }}
                    >
                      {article.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#666" }}>
                    {article.views.toLocaleString()}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    <button
                      onClick={() => handleDelete(article.id)}
                      style={{
                        padding: "4px 12px",
                        background: "#FFF",
                        border: "1px solid #E8192C",
                        borderRadius: 6,
                        color: "#E8192C",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
