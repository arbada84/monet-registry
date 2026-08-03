"use client";

import { useState, useEffect } from "react";
import { getSettingStrict, saveSetting } from "@/lib/db";
import Link from "next/link";
import {
  DEFAULT_SITE_TYPE,
  SITE_TYPE_OPTIONS,
  getSiteTypeOption,
  resolveSiteType,
  type SiteType,
} from "@/lib/site-type-options";

interface SiteTypeSettings {
  type: SiteType;
}

export default function SiteTypePage() {
  const [current, setCurrent] = useState<SiteType | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettingStrict<SiteTypeSettings | null>("cp-site-type", { type: DEFAULT_SITE_TYPE })
      .then((settings) => setCurrent(resolveSiteType(settings?.type)))
      .catch((error) => setLoadError(error instanceof Error ? error.message : "사이트 타입을 불러오지 못했습니다."));
  }, []);

  const handleSelect = async (type: SiteType) => {
    if (type === current || current === null) return;
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

  const currentAccent = current ? getSiteTypeOption(current).accent : getSiteTypeOption(DEFAULT_SITE_TYPE).accent;

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

      {loadError && (
        <div role="alert" className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError} 페이지를 새로고침한 뒤 다시 확인해 주세요.
        </div>
      )}

      <div className="grid gap-4">
        {SITE_TYPE_OPTIONS.map((t) => {
          const isActive = current === t.id;
          return (
            <button
              key={t.id}
              onClick={() => handleSelect(t.id)}
              disabled={saving || current === null}
              className={`w-full text-left p-6 rounded-xl border-2 transition-all ${
                isActive
                  ? "shadow-sm"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              } ${saving || current === null ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
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
                  <p className="text-xs text-gray-400 mt-2">선택하면 공개 사이트 전체에 적용됩니다.</p>
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

      {current === null && !loadError && (
        <p aria-live="polite" className="mt-4 text-sm text-gray-500">현재 사이트 타입을 불러오는 중입니다.</p>
      )}

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
