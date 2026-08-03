import type { Metadata } from "next";
import Link from "next/link";
import AlidotPolicyDocument, { type AlidotPolicySection } from "@/components/alidot/AlidotPolicyDocument";
import AlidotPublicShell from "@/components/alidot/AlidotPublicShell";
import { ALIDOT_LEGAL, ALIDOT_PATHS } from "@/lib/alidot-legal";
import { getBaseUrl } from "@/lib/get-base-url";
import { getSiteType } from "@/lib/site-type";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "알리닷 개인정보처리방침",
  description: "알리닷 공개 페이지와 향후 TikTok 연동에 관한 개인정보 처리 기준을 안내합니다.",
  alternates: { canonical: `${getBaseUrl()}${ALIDOT_PATHS.privacy}` },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
};

const sections: AlidotPolicySection[] = [
  { id: "scope", title: "1. 적용 범위", content: <p>이 방침은 {ALIDOT_LEGAL.operatorName}가 운영하는 알리닷 공개 페이지에 적용됩니다. 컬처피플 뉴스 서비스에는 별도의 개인정보처리방침이 적용됩니다.</p> },
  { id: "current-processing", title: "2. 현재 처리하는 정보", content: <><p>알리닷 공개 페이지는 회원가입, 문의 양식, TikTok 로그인이나 콘텐츠 업로드 기능을 제공하지 않습니다. 알리닷 애플리케이션 DB에는 방문자의 TikTok 계정 정보, 비밀번호, OAuth access token·refresh token, 사용자 영상이나 게시 기록을 저장하지 않습니다.</p><p>웹 호스팅과 보안 과정에서 접속 시각, IP 주소, 브라우저 정보와 오류 기록 같은 기술 로그가 호스팅 사업자에 의해 처리될 수 있습니다. 알리닷 경로에서는 컬처피플의 광고·방문 분석 스크립트를 실행하지 않습니다.</p></> },
  { id: "purpose", title: "3. 처리 목적", content: <p>기술 로그가 생성되는 경우 서비스 전송, 보안 위협 탐지와 장애 대응 목적으로만 처리합니다. 알리닷은 현재 TikTok 계정 연동이나 자동 게시를 목적으로 개인정보를 처리하지 않습니다.</p> },
  { id: "retention", title: "4. 보유와 파기", content: <p>알리닷 애플리케이션은 방문자 계정이나 TikTok 연동 데이터를 보유하지 않습니다. 호스팅 사업자가 생성하는 기술 로그는 해당 사업자의 운영·보안 정책과 관계 법령에 따라 관리됩니다. 향후 알리닷이 별도 개인정보를 수집하기 전에는 항목별 보유 기간과 파기 방법을 이 방침에 먼저 공개합니다.</p> },
  { id: "third-parties", title: "5. 외부 서비스와 국외 처리", content: <p>이 페이지는 Vercel 기반 웹사이트에서 제공됩니다. 페이지 전송 과정의 기술 정보가 국외 인프라에서 처리될 수 있습니다. 현재 알리닷은 TikTok API로 개인정보나 콘텐츠를 전송하지 않습니다.</p> },
  { id: "rights", title: "6. 이용자의 권리", content: <p>이용자는 자신의 정보 처리 여부에 관한 확인과 관련 문의를 할 수 있습니다. 문의 시 비밀번호, OAuth token, 주민등록번호 등 불필요한 민감정보를 보내지 마세요.</p> },
  { id: "data-deletion", title: "7. TikTok 연결 해제 및 데이터 삭제", content: <><p>현재 알리닷은 TikTok 계정 연결 기능과 연동 데이터를 보유하지 않으므로 알리닷에서 삭제할 TikTok OAuth 정보나 게시 이력이 없습니다.</p><p>향후 연결 기능을 제공할 경우 TikTok의 연결된 앱 관리 화면과 알리닷의 연결 관리 기능에서 권한을 철회할 수 있게 하고, 삭제 대상·처리 기한·백업 만료 기간을 기능 제공 전에 공개합니다.</p><p>현재 처리 여부 확인이 필요하면 <Link href={ALIDOT_LEGAL.contactPath} className="font-semibold underline underline-offset-4">컬처피플 공식 문의 페이지</Link>를 이용해 주세요.</p></> },
  { id: "security", title: "8. 안전성 확보", content: <p>운영자는 공개 페이지와 운영 시스템의 접근 권한을 분리하고, 비밀키와 token을 클라이언트 코드나 공개 문서에 기록하지 않습니다. 실제 구현되지 않은 암호화나 보안 기능을 제공한다고 표시하지 않습니다.</p> },
  { id: "changes", title: "9. 방침 변경", content: <p>TikTok 연동, 회원 기능 또는 데이터 저장 기능을 도입하면 실제 데이터 흐름에 맞춰 이 방침을 먼저 변경하고 시행일을 공개합니다.</p> },
  { id: "operator", title: "10. 운영자와 문의", content: <><p>운영자: {ALIDOT_LEGAL.operatorName}<br />대표자: {ALIDOT_LEGAL.representativeName}<br />사업자등록번호: {ALIDOT_LEGAL.businessRegistrationNumber}</p><p>시행일: {ALIDOT_LEGAL.effectiveDate}<br />최종 변경일: {ALIDOT_LEGAL.lastUpdatedDate}</p></> },
];

export default async function AlidotPrivacyPage() {
  const siteType = await getSiteType();
  return <AlidotPublicShell siteType={siteType} currentPath={ALIDOT_PATHS.privacy}><AlidotPolicyDocument title="알리닷 개인정보처리방침" summary="현재 수집하지 않는 정보까지 수집한다고 과장하지 않고, 실제 공개 페이지의 처리 범위와 향후 연동 시 원칙을 구분해 안내합니다." sections={sections} /></AlidotPublicShell>;
}

