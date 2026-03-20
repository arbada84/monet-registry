"use client";

import { useState, useEffect } from "react";
import { getSetting, saveSetting } from "@/lib/db";
import Link from "next/link";

type SiteType = "netpro" | "insightkorea" | "culturepeople";

interface SiteTypeSettings {
  type: SiteType;
}

const SITE_TYPES: { id: SiteType; name: string; description: string; preview: string; accent: string }[] = [
  {
    id: "netpro",
    name: "넷프로 (오리지널)",
    description: "컬처피플 기본 디자인. 빨간색 네비게이션 바, 히어로 캐러셀, 카테고리별 뉴스 그리드 레이아웃.",
    preview: "현재 사용 중인 기본 디자인입니다.",
    accent: "#C41422",
  },
  {
    id: "insightkorea",
    name: "인사이트코리아",
    description: "대형 히어로 이미지 + 사이드 기사 레이아웃, 카테고리별 섹션 그리드, 우측 사이드바(많이 본 뉴스), 깔끔한 신문 스타일.",
    preview: "전문 경제/시사 매체 스타일의 디자인입니다.",
    accent: "#d2111a",
  },
  {
    id: "culturepeople",
    name: "컬처피플",
    description: "보라색 브랜드 테마. 매거진 스타일 히어로, 카테고리별 속보 그리드, 깔끔한 가독성 우선 레이아웃. 모바일 최적화.",
    preview: "컬처피플 고유 브랜드 아이덴티티를 반영한 디자인입니다.",
    accent: "#5B4B9E",
  },
];

export default function SiteTypePage() {
  const [current, setCurrent] = useState<SiteType>("netpro");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSetting<SiteTypeSettings>("cp-site-type", { type: "netpro" }).then((s) => {
      setCurrent(s?.type || "netpro");
    });
  }, []);

  const handleSelect = async (type: SiteType) => {
    if (type === current) return;
    setSaving(true);
    setSaved(false);
    try {
      await saveSetting("cp-site-type", { type });
      setCurrent(type);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // 저장 실패
    } finally {
      setSaving(false);
    }
  };

  const currentAccent = SITE_TYPES.find((t) => t.id === current)?.accent || "#C41422";

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">사이트 타입</h1>
          <p className="text-sm text-gray-500 mt-1">사이트 디자인 테마를 선택합니다. 변경 즉시 반영됩니다.</p>
        </div>
        {saved && (
          <span className="px-3 py-1.5 bg-green-50 text-green-700 text-sm rounded-lg border border-green-200">
            저장 완료! 사이트에 즉시 반영됩니다.
          </span>
        )}
      </div>

      <div className="grid gap-4">
        {SITE_TYPES.map((t) => {
          const isActive = current === t.id;
          return (
            <button
              key={t.id}
              onClick={() => handleSelect(t.id)}
              disabled={saving}
              className={`w-full text-left p-6 rounded-xl border-2 transition-all ${
                isActive
                  ? "shadow-sm"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              } ${saving ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
              style={isActive ? { borderColor: t.accent, backgroundColor: `${t.accent}08` } : undefined}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-bold" style={{ color: isActive ? t.accent : "#111" }}>
                      {t.name}
                    </h3>
                    {isActive && (
                      <span className="px-2 py-0.5 text-xs font-semibold text-white rounded" style={{ backgroundColor: t.accent }}>
                        사용 중
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{t.description}</p>
                  <p className="text-xs text-gray-400 mt-2">{t.preview}</p>
                </div>
                <div className="w-6 h-6 rounded-full border-2 shrink-0 ml-4 mt-1 flex items-center justify-center"
                  style={{ borderColor: isActive ? t.accent : "#d1d5db" }}
                >
                  {isActive && <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.accent }} />}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-8 p-4 bg-gray-50 rounded-lg text-sm text-gray-500">
        <p className="font-semibold text-gray-700 mb-1">참고사항</p>
        <ul className="list-disc list-inside space-y-1">
          <li>타입 변경 시 사이트가 즉시 전환됩니다 (캐시 최대 60초 후 반영)</li>
          <li>모든 타입은 동일한 DB와 기사 데이터를 사용합니다</li>
          <li>어드민 페이지(/cam)는 타입에 영향받지 않습니다</li>
          <li>
            <Link href="/" target="_blank" style={{ color: currentAccent }} className="hover:underline">
              사이트 미리보기 (새 탭)
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
