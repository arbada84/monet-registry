"use client";

import { useEffect, useState } from "react";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";

const DEFAULT_TERMS = `제1조 (목적)
이 약관은 (주)컬처피플미디어(이하 "회사")가 운영하는 컬처피플 뉴스 포털(이하 "서비스")의 이용과 관련하여 회사와 이용자 간의 권리, 의무 및 책임 사항을 규정함을 목적으로 합니다.

제2조 (정의)
1. "서비스"란 회사가 제공하는 인터넷 뉴스 서비스 및 이에 부수되는 모든 서비스를 의미합니다.
2. "이용자"란 서비스에 접속하여 이 약관에 따라 서비스를 이용하는 자를 말합니다.
3. "콘텐츠"란 서비스에 게시된 기사, 사진, 영상, 댓글 등 모든 형태의 정보를 의미합니다.

제3조 (약관의 효력 및 변경)
1. 이 약관은 서비스 화면에 게시하거나 기타의 방법으로 이용자에게 공지함으로써 효력이 발생합니다.
2. 회사는 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있습니다.

제4조 (서비스의 제공)
1. 회사는 다음 각 호의 서비스를 제공합니다.
  - 뉴스 기사 제공 서비스
  - 검색 서비스
  - 뉴스레터 서비스
  - 기타 회사가 정하는 서비스

제5조 (이용자의 의무)
1. 이용자는 서비스 이용 시 관련 법령 및 이 약관을 준수하여야 합니다.
2. 이용자는 타인의 권리를 침해하거나 명예를 훼손하는 행위를 하여서는 안 됩니다.

제6조 (저작권)
1. 서비스에 게시된 모든 콘텐츠의 저작권은 회사 또는 원저작자에게 있습니다.
2. 이용자는 서비스를 통해 얻은 정보를 회사의 사전 승낙 없이 복제, 전송, 출판, 배포, 방송 등의 방법으로 이용하거나 제3자에게 이용하게 하여서는 안 됩니다.`;

export default function TermsPage() {
  const [terms, setTerms] = useState(DEFAULT_TERMS);
  const [activeTab, setActiveTab] = useState<"terms" | "privacy" | "youth">("terms");

  useEffect(() => {
    const stored = localStorage.getItem("cp-terms");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (activeTab === "terms" && parsed.termsOfService) setTerms(parsed.termsOfService);
      else if (activeTab === "privacy" && parsed.privacyPolicy) setTerms(parsed.privacyPolicy);
      else if (activeTab === "youth" && parsed.youthProtection) setTerms(parsed.youthProtection);
    } else {
      setTerms(DEFAULT_TERMS);
    }
  }, [activeTab]);

  return (
    <div className="w-full min-h-screen" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <CulturepeopleHeader0 />

      <div className="mx-auto max-w-[800px] px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 pb-4 border-b-2" style={{ borderColor: "#E8192C" }}>
          약관 및 정책
        </h1>

        <div className="flex gap-2 mb-8">
          {[
            { key: "terms" as const, label: "이용약관" },
            { key: "privacy" as const, label: "개인정보처리방침" },
            { key: "youth" as const, label: "청소년보호정책" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="px-4 py-2 text-sm rounded transition-colors"
              style={{
                backgroundColor: activeTab === tab.key ? "#E8192C" : "#F5F5F5",
                color: activeTab === tab.key ? "#FFF" : "#666",
                fontWeight: activeTab === tab.key ? 600 : 400,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="text-sm text-gray-700 leading-[1.9] whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded p-6">
          {terms}
        </div>
      </div>

      <CulturepeopleFooter6 />
    </div>
  );
}
