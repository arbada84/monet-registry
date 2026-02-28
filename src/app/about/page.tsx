import type { Metadata } from "next";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";
import { serverGetSetting } from "@/lib/db-server";

// 회사 소개는 자주 바뀌지 않으므로 1시간 ISR
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "회사 소개",
  description: "컬처피플미디어 회사 소개",
};

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
  companyName: "",
  ceo: "",
  publisher: "",
  editor: "",
  bizNumber: "",
  address: "",
  phone: "",
  fax: "",
  email: "",
  history: [],
  introText: "",
};

export default async function AboutPage() {
  const stored = await serverGetSetting<Record<string, unknown> | null>("cp-about", null);

  // 구 필드명 → 신 필드명 마이그레이션
  let migrated: Partial<AboutInfo> = {};
  if (stored) {
    migrated = { ...(stored as Partial<AboutInfo>) };
    if (!migrated.ceo && stored.ceoName) migrated.ceo = stored.ceoName as string;
    if (!migrated.bizNumber && stored.businessNumber) migrated.bizNumber = stored.businessNumber as string;
    if (!migrated.publisher && stored.publisherName) migrated.publisher = stored.publisherName as string;
    if (!migrated.editor && stored.editorName) migrated.editor = stored.editorName as string;
    if (!migrated.history && stored.historyItems) migrated.history = stored.historyItems as AboutInfo["history"];
  }

  const about: AboutInfo = { ...DEFAULT_ABOUT, ...migrated };

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
