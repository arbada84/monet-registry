import type { Metadata } from "next";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";
import { InsightKoreaHeader, InsightKoreaFooter } from "@/components/themes/insightkorea";
import { CulturePeopleHeader, CulturePeopleFooter } from "@/components/themes/culturepeople";
import { serverGetSetting } from "@/lib/db-server";
import { getSiteType, getSiteAccentColor } from "@/lib/site-type";
import { getBaseUrl } from "@/lib/get-base-url";

// 광고 안내는 자주 바뀌지 않으므로 1시간 ISR
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "광고안내",
  description: "컬처피플미디어 광고 문의 안내",
  alternates: { canonical: `${getBaseUrl()}/advertising` },
};

interface AboutInfo {
  companyName?: string;
  phone?: string;
  email?: string;
}

export default async function AdvertisingPage() {
  const [about, siteType] = await Promise.all([
    serverGetSetting<AboutInfo | null>("cp-about", null),
    getSiteType(),
  ]);
  const Header = siteType === "culturepeople" ? CulturePeopleHeader : siteType === "insightkorea" ? InsightKoreaHeader : CulturepeopleHeader0;
  const Footer = siteType === "culturepeople" ? CulturePeopleFooter : siteType === "insightkorea" ? InsightKoreaFooter : CulturepeopleFooter6;
  const accent = getSiteAccentColor(siteType);

  const email = about?.email || "contact@culturepeople.co.kr";
  const phone = about?.phone || "";
  const siteName = about?.companyName || "컬처피플";

  return (
    <div className="w-full min-h-screen" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <Header />

      <div className="mx-auto max-w-[800px] px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 pb-4 border-b-2" style={{ borderColor: accent }}>
          광고안내
        </h1>

        <div className="text-sm text-gray-700 leading-[1.9] bg-gray-50 border border-gray-200 rounded p-6 space-y-6">
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">광고 문의</h2>
            <p>{siteName}에 광고를 게재하고 싶으신 분은 아래 연락처로 문의해주시기 바랍니다. 지면/배너 형태, 노출 위치, 기간 등 상담 후 안내드립니다.</p>
          </section>

          <section className="pt-4 border-t border-gray-200">
            <h2 className="font-semibold text-gray-900 mb-2">연락처</h2>
            <p>이메일: <a href={`mailto:${email}`} className="underline">{email}</a></p>
            {phone && <p>전화: {phone}</p>}
          </section>
        </div>
      </div>

      <Footer />
    </div>
  );
}
