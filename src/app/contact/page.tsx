import type { Metadata } from "next";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";
import { InsightKoreaHeader, InsightKoreaFooter } from "@/components/themes/insightkorea";
import { CulturePeopleHeader, CulturePeopleFooter } from "@/components/themes/culturepeople";
import { serverGetSetting } from "@/lib/db-server";
import { getSiteType, getSiteAccentColor } from "@/lib/site-type";
import { getBaseUrl } from "@/lib/get-base-url";
import { hasRepresentativeLegalApproval, isApprovedAboutInfo } from "@/lib/legal-content";

// 연락처 정보는 자주 바뀌지 않으므로 1시간 ISR
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "기사제보 및 소비자 민원",
  description: "컬피가 운영하는 컬처피플 기사 제보, 소비자 민원, 정정·반론보도 요청 안내",
  alternates: { canonical: `${getBaseUrl()}/contact` },
};

interface AboutInfo {
  companyName?: string;
  ceo?: string;
  publisher?: string;
  editor?: string;
  bizNumber?: string;
  phone?: string;
  email?: string;
}

export default async function ContactPage() {
  const [about, siteType] = await Promise.all([
    serverGetSetting<AboutInfo | null>("cp-about", null),
    getSiteType(),
  ]);
  const Header = siteType === "culturepeople" ? CulturePeopleHeader : siteType === "insightkorea" ? InsightKoreaHeader : CulturepeopleHeader0;
  const Footer = siteType === "culturepeople" ? CulturePeopleFooter : siteType === "insightkorea" ? InsightKoreaFooter : CulturepeopleFooter6;
  const accent = getSiteAccentColor(siteType);

  const legalInfoApproved = isApprovedAboutInfo(about) && hasRepresentativeLegalApproval(about);
  const email = about?.email || "";
  const phone = about?.phone || "";

  return (
    <div className="w-full min-h-screen" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <Header />

      <div className="mx-auto max-w-[800px] px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 pb-4 border-b-2" style={{ borderColor: accent }}>
          기사제보 및 소비자 민원
        </h1>

        <div data-contact-legal-status={legalInfoApproved ? "approved" : "missing"} className="text-sm text-gray-700 leading-[1.9] bg-gray-50 border border-gray-200 rounded p-6 space-y-6">
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">기사 제보</h2>
            <p>취재가 필요한 소식이나 제보하고 싶은 내용이 있다면 아래 이메일로 보내주세요. 담당자가 확인 후 순차적으로 연락드립니다.</p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 mb-2">소비자 민원</h2>
            <p>서비스 이용 중 불편사항이나 문의사항은 아래 연락처로 접수해주시기 바랍니다.</p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 mb-2">정정·반론보도 요청</h2>
            <p>보도 내용에 대한 정정 또는 반론보도를 요청하시려면 기사 URL과 요청 사유를 함께 아래 이메일로 보내주세요.</p>
          </section>

          <section className="pt-4 border-t border-gray-200">
            <h2 className="font-semibold text-gray-900 mb-2">연락처</h2>
            {email ? <p>이메일: <a href={`mailto:${email}`} className="underline">{email}</a></p> : <p>대표자가 승인한 연락처가 설정되지 않았습니다.</p>}
            {phone && <p>전화: {phone}</p>}
          </section>
        </div>
      </div>

      <Footer />
    </div>
  );
}
