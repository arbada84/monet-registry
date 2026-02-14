"use client";

import { useEffect, useState } from "react";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";

interface AboutInfo {
  companyName: string;
  ceo: string;
  publisher: string;
  editor: string;
  bizNumber: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  history: { year: string; content: string }[];
  introText: string;
}

const DEFAULT_ABOUT: AboutInfo = {
  companyName: "(주)컬처피플미디어",
  ceo: "홍길동",
  publisher: "홍길동",
  editor: "김영수",
  bizNumber: "123-45-67890",
  address: "서울특별시 중구 세종대로 110 컬처피플빌딩 12층",
  phone: "02-1234-5678",
  fax: "02-1234-5679",
  email: "contact@culturepeople.co.kr",
  history: [
    { year: "2024", content: "컬처피플 뉴스 포털 서비스 런칭" },
    { year: "2024", content: "인터넷신문 등록 (서울 아 00000)" },
    { year: "2024", content: "(주)컬처피플미디어 법인 설립" },
  ],
  introText: "컬처피플은 문화를 전하는 사람들이라는 뜻으로, 한국의 문화, 연예, 스포츠, 라이프 등 다양한 분야의 뉴스를 신속하고 정확하게 전달하는 종합 인터넷 뉴스 미디어입니다.\n\n우리는 독자에게 가치 있는 정보를 제공하고, 건강한 미디어 생태계를 만들어 나가는 것을 목표로 합니다.\n\n전문 기자진과 함께 깊이 있는 기사를 통해 독자 여러분과 소통하겠습니다.",
};

export default function AboutPage() {
  const [about, setAbout] = useState<AboutInfo>(DEFAULT_ABOUT);

  useEffect(() => {
    const stored = localStorage.getItem("cp-about");
    if (stored) setAbout({ ...DEFAULT_ABOUT, ...JSON.parse(stored) });
  }, []);

  return (
    <div className="w-full min-h-screen" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <CulturepeopleHeader0 />

      <div className="mx-auto max-w-[800px] px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-8 pb-4 border-b-2" style={{ borderColor: "#E8192C" }}>
          회사 소개
        </h1>

        {/* Intro */}
        <section className="mb-10">
          <div className="text-base text-gray-700 leading-[1.9] whitespace-pre-wrap">
            {about.introText}
          </div>
        </section>

        {/* Company Info */}
        <section className="mb-10">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="inline-block h-5 w-1 rounded-full" style={{ backgroundColor: "#E8192C" }} />
            회사 정보
          </h2>
          <table className="w-full text-sm border-t border-gray-300">
            <tbody>
              {[
                ["회사명", about.companyName],
                ["대표이사", about.ceo],
                ["발행인", about.publisher],
                ["편집인", about.editor],
                ["사업자등록번호", about.bizNumber],
                ["주소", about.address],
                ["대표전화", about.phone],
                ["팩스", about.fax],
                ["이메일", about.email],
              ].map(([label, value]) => (
                <tr key={label} className="border-b border-gray-200">
                  <th className="py-3 px-4 text-left bg-gray-50 w-[140px] font-medium text-gray-600">{label}</th>
                  <td className="py-3 px-4 text-gray-800">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* History */}
        {about.history.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="inline-block h-5 w-1 rounded-full" style={{ backgroundColor: "#E8192C" }} />
              연혁
            </h2>
            <div className="space-y-3">
              {about.history.map((h, i) => (
                <div key={i} className="flex gap-4 text-sm">
                  <span className="font-bold text-gray-900 w-[60px] shrink-0">{h.year}</span>
                  <span className="text-gray-700">{h.content}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <CulturepeopleFooter6 />
    </div>
  );
}
