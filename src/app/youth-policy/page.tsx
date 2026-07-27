import type { Metadata } from "next";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";
import { InsightKoreaHeader, InsightKoreaFooter } from "@/components/themes/insightkorea";
import { CulturePeopleHeader, CulturePeopleFooter } from "@/components/themes/culturepeople";
import { serverGetSetting } from "@/lib/db-server";
import { getSiteType, getSiteAccentColor } from "@/lib/site-type";
import { getBaseUrl } from "@/lib/get-base-url";
import { hasRepresentativeLegalApproval, resolveYouthProtection } from "@/lib/legal-content";

// 청소년보호정책은 자주 바뀌지 않으므로 1시간 ISR
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "청소년보호정책",
  description: "컬처피플미디어 청소년보호정책",
  alternates: { canonical: `${getBaseUrl()}/youth-policy` },
};

export default async function YouthPolicyPage() {
  const [parsed, siteType] = await Promise.all([
    serverGetSetting<{ youthProtection?: string } | null>("cp-terms", null),
    getSiteType(),
  ]);
  const youthProtection = resolveYouthProtection(parsed?.youthProtection);
  const youthProtectionApproved = hasRepresentativeLegalApproval(parsed) && youthProtection.approved;
  const Header = siteType === "culturepeople" ? CulturePeopleHeader : siteType === "insightkorea" ? InsightKoreaHeader : CulturepeopleHeader0;
  const Footer = siteType === "culturepeople" ? CulturePeopleFooter : siteType === "insightkorea" ? InsightKoreaFooter : CulturepeopleFooter6;
  const accent = getSiteAccentColor(siteType);

  return (
    <div className="w-full min-h-screen" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <Header />

      <div className="mx-auto max-w-[800px] px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-8 pb-4 border-b-2" style={{ borderColor: accent }}>
          청소년보호정책
        </h1>

        <div
          data-legal-status={youthProtectionApproved ? "approved" : "missing"}
          className="text-sm text-gray-700 leading-[1.9] whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded p-6"
        >
          {youthProtection.content}
        </div>
      </div>

      <Footer />
    </div>
  );
}
