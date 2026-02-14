"use client";

// ============================================================================
// CUSTOMIZATION - 이 섹션의 값들을 수정하여 프로젝트에 맞게 조정하세요
// ============================================================================

const COLORS = {
  light: {
    accent: "#E8192C",
    bg: "#F5F5F5",
    cardBg: "#FFFFFF",
    text: "#333333",
    title: "#000000",
    muted: "#999999",
    border: "#EEEEEE",
  },
  dark: {
    accent: "#E8192C",
    bg: "#111111",
    cardBg: "#1A1A1A",
    text: "#E0E0E0",
    title: "#FFFFFF",
    muted: "#AAAAAA",
    border: "#333333",
  },
} as const;

const DEFAULT_CATEGORY_LINKS = [
  {
    name: "뉴스",
    articles: [
      "정부, 2026 하반기 경제 정책 방향 발표",
      "국회 예산결산특별위원회 활동 개시",
      "공정거래위, 대형 플랫폼 규제안 의결",
      "국토부, 수도권 광역교통 개선 대책 발표",
    ],
  },
  {
    name: "연예",
    articles: [
      "배우 박서준, 할리우드 대작 캐스팅 확정",
      "걸그룹 '루나' 컴백 앨범 차트 1위 석권",
      "예능 PD 김태호 새 프로그램 론칭 예고",
      "독립영화 '봄날의 기억' 베를린 초청",
    ],
  },
  {
    name: "스포츠",
    articles: [
      "프로야구 2026시즌 개막전 일정 확정",
      "축구대표팀, 월드컵 예선 2연승 달성",
      "LPGA 한국 선수 시즌 첫 우승 쾌거",
      "e스포츠 리그 오브 레전드 결승전 매진",
    ],
  },
  {
    name: "지역뉴스",
    articles: [
      "부산 북항 재개발 2단계 사업 착수",
      "광주 AI 산업단지 조성 본격 추진",
      "대전 도시철도 2호선 착공식 개최",
      "강원도 동계 스포츠 관광 활성화 방안",
    ],
  },
  {
    name: "포토뉴스",
    articles: [
      "서울 한강 야경 드론 촬영 화보 공개",
      "전국 벚꽃 명소 개화 현황 총정리",
      "국제 사진전 한국 작가 대상 수상",
      "야생동물 보호구역 멸종위기종 포착",
    ],
  },
  {
    name: "건강과학",
    articles: [
      "국내 연구진, 치매 조기 진단법 개발",
      "우주항공청, 달 탐사 2단계 일정 공개",
      "겨울철 면역력 강화 식품 전문가 추천",
      "AI 기반 신약 개발 임상시험 돌입",
    ],
  },
  {
    name: "미디어",
    articles: [
      "OTT 플랫폼 구독자 수 변화 분석",
      "팟캐스트 시장 성장세 지속, 광고 매출 증가",
      "지상파 뉴스 시청률 하락세 원인 분석",
      "1인 미디어 크리에이터 수익 모델 다변화",
    ],
  },
  {
    name: "교육",
    articles: [
      "2027학년도 대입 제도 개편안 확정 발표",
      "AI 교과서 시범 도입 학교 선정 결과",
      "방과후 코딩 교육 프로그램 참여율 급증",
      "해외 유학생 유치 정책 성과 보고서 발간",
    ],
  },
];

// ============================================================================
// END CUSTOMIZATION
// ============================================================================

import { useState, useEffect } from "react";

interface StoredArticle {
  id: string;
  title: string;
  category: string;
  date: string;
  status: string;
}

interface CulturepeopleTextLinks4Props {
  mode?: "light" | "dark";
}

export default function CulturepeopleTextLinks4({
  mode = "light",
}: CulturepeopleTextLinks4Props) {
  const colors = COLORS[mode];
  const [categoryLinks, setCategoryLinks] = useState(DEFAULT_CATEGORY_LINKS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("cp-articles");
      if (raw) {
        const articles: StoredArticle[] = JSON.parse(raw)
          .filter((a: StoredArticle) => a.status === "게시")
          .sort((a: StoredArticle, b: StoredArticle) => b.date.localeCompare(a.date));

        if (articles.length > 0) {
          const byCat: Record<string, string[]> = {};
          articles.forEach((a) => {
            const cat = a.category || "뉴스";
            if (!byCat[cat]) byCat[cat] = [];
            if (byCat[cat].length < 4) byCat[cat].push(a.title);
          });

          const catLinks = Object.entries(byCat)
            .filter(([, arr]) => arr.length >= 1)
            .slice(0, 8)
            .map(([cat, arr]) => ({ name: cat, articles: arr }));

          if (catLinks.length > 0) setCategoryLinks(catLinks);
        }
      }
    } catch { /* ignore */ }
  }, []);

  return (
    <section
      className="w-full"
      style={{ backgroundColor: colors.bg, fontFamily: "'Noto Sans KR', sans-serif" }}
    >
      <div className="mx-auto max-w-[1200px] px-4 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categoryLinks.map((category) => (
            <div
              key={category.name}
              className="rounded-sm border p-4"
              style={{ borderColor: colors.border, backgroundColor: colors.cardBg }}
            >
              {/* Category Header */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-4 w-1 rounded-full"
                    style={{ backgroundColor: colors.accent }}
                  />
                  <h3 className="text-sm font-bold" style={{ color: colors.title }}>
                    {category.name}
                  </h3>
                </div>
                <a
                  href={`/category/${encodeURIComponent(category.name)}`}
                  className="text-[11px] hover:underline"
                  style={{ color: colors.muted }}
                >
                  더보기 &gt;
                </a>
              </div>

              {/* Article List */}
              <ul className="space-y-2">
                {category.articles.map((article, idx) => (
                  <li key={idx}>
                    <a
                      href="#"
                      className="block truncate text-[13px] leading-relaxed transition-colors hover:text-[#E8192C]"
                      style={{ color: colors.text }}
                    >
                      {article}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
