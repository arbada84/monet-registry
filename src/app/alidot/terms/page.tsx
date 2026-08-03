import type { Metadata } from "next";
import AlidotPolicyDocument, { type AlidotPolicySection } from "@/components/alidot/AlidotPolicyDocument";
import AlidotPublicShell from "@/components/alidot/AlidotPublicShell";
import { ALIDOT_LEGAL, ALIDOT_PATHS } from "@/lib/alidot-legal";
import { getBaseUrl } from "@/lib/get-base-url";
import { getSiteType } from "@/lib/site-type";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "알리닷 서비스 이용약관",
  description: "컬피가 운영하는 알리닷 서비스의 이용 조건과 운영 원칙을 안내합니다.",
  alternates: { canonical: `${getBaseUrl()}${ALIDOT_PATHS.terms}` },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
};

const sections: AlidotPolicySection[] = [
  { id: "purpose", title: "1. 목적과 적용 범위", content: <p>이 약관은 {ALIDOT_LEGAL.operatorName}(이하 “운영자”)가 제공하는 알리닷 서비스의 이용 조건과 운영 원칙을 정합니다. 컬처피플 뉴스 서비스에는 별도의 약관이 적용됩니다.</p> },
  { id: "service", title: "2. 제공 서비스", content: <><p>알리닷은 운영자가 제작·관리하는 숏폼 콘텐츠 브랜드입니다. 주제 선정, 콘텐츠 제작, 검수와 운영 채널 게시 활동을 포함합니다.</p><p>현재 공개 웹페이지에서는 회원가입, 콘텐츠 업로드, TikTok 계정 연결 또는 자동 게시 기능을 제공하지 않습니다.</p></> },
  { id: "rights", title: "3. 콘텐츠 권리", content: <><p>알리닷 콘텐츠의 권리는 운영자 또는 정당한 권리자에게 있습니다. 이용자는 관계 법령이 허용하는 범위를 넘어 콘텐츠를 복제, 배포, 변형하거나 상업적으로 이용해서는 안 됩니다.</p><p>운영자는 제3자의 저작권, 초상권, 상표권과 출처를 존중하며 무단 복제나 워터마크 제거를 허용하지 않습니다.</p></> },
  { id: "prohibited", title: "4. 금지 행위", content: <ul className="list-disc space-y-2 pl-5"><li>서비스 또는 다른 이용자의 정상적인 이용을 방해하는 행위</li><li>운영자나 제3자를 사칭하거나 허위 정보를 유포하는 행위</li><li>서비스의 보안과 접근 제한을 우회하는 행위</li><li>법령 또는 제3자의 권리를 침해하는 콘텐츠 이용</li></ul> },
  { id: "external", title: "5. 외부 플랫폼", content: <p>외부 플랫폼에서 알리닷 콘텐츠를 이용하는 경우 해당 플랫폼의 약관과 정책이 함께 적용됩니다. 알리닷은 TikTok이 제공하거나 보증하는 공식 서비스가 아니며, 외부 플랫폼의 정책 변경이나 장애를 통제하지 않습니다.</p> },
  { id: "future-integration", title: "6. 향후 계정 연동", content: <p>TikTok 계정 연결 또는 게시 기능을 도입하는 경우 운영자는 기능 제공 전에 필요한 권한, 처리 데이터, 사용자 통제와 삭제 방법을 공개하고 별도 동의를 받습니다. 이용자 승인 없이 콘텐츠를 전송하지 않습니다.</p> },
  { id: "changes", title: "7. 서비스와 약관 변경", content: <p>운영자는 관계 법령과 서비스 운영상 필요한 범위에서 기능 또는 약관을 변경할 수 있습니다. 중요한 변경은 적용일과 내용을 알리닷 공개 페이지에 알립니다.</p> },
  { id: "contact", title: "8. 운영자와 문의", content: <><p>운영자: {ALIDOT_LEGAL.operatorName}<br />대표자: {ALIDOT_LEGAL.representativeName}<br />사업자등록번호: {ALIDOT_LEGAL.businessRegistrationNumber}</p><p>문의는 컬처피플의 공식 문의 페이지를 이용할 수 있습니다. 공개 주소는 이 약관에서 별도로 제공하지 않습니다.</p></> },
  { id: "effective", title: "9. 시행일", content: <p>이 약관은 {ALIDOT_LEGAL.effectiveDate}부터 적용합니다. 최종 변경일은 {ALIDOT_LEGAL.lastUpdatedDate}입니다.</p> },
];

export default async function AlidotTermsPage() {
  const siteType = await getSiteType();
  return <AlidotPublicShell siteType={siteType} currentPath={ALIDOT_PATHS.terms}><AlidotPolicyDocument title="알리닷 서비스 이용약관" summary="알리닷의 현재 서비스 범위와 콘텐츠 이용 원칙을 실제 운영 상태에 맞춰 안내합니다." sections={sections} /></AlidotPublicShell>;
}

