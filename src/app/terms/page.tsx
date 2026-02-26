import type { Metadata } from "next";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";
import { serverGetSetting } from "@/lib/db-server";
import TermsContent from "./TermsContent";

export const metadata: Metadata = {
  title: "약관 및 정책",
  description: "컬처피플미디어 이용약관 및 개인정보처리방침",
};

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

const DEFAULT_PRIVACY = `(주)컬처피플미디어(이하 "회사")는 이용자의 개인정보를 중요시하며, 「개인정보 보호법」 등 관련 법규를 준수하고 있습니다.

1. 수집하는 개인정보 항목
- 필수항목: 이메일 주소
- 선택항목: 이름, 연락처

2. 개인정보의 수집 및 이용 목적
- 뉴스레터 발송
- 기사 제보 접수 및 회신

3. 개인정보 보호책임자
- 연락처: privacy@culturepeople.co.kr`;

const DEFAULT_YOUTH = `청소년보호정책

(주)컬처피플미디어는 청소년이 유해한 정보에 노출되지 않도록 최선을 다하고 있습니다.

1. 청소년 유해 정보 차단
회사는 청소년에게 유해한 내용이 포함된 기사를 게재하지 않습니다.

2. 청소년보호책임자
- 성명: 홍길동
- 직위: 청소년보호 담당
- 연락처: youth@culturepeople.co.kr`;

export default async function TermsPage() {
  const parsed = await serverGetSetting<{
    termsOfService?: string;
    privacyPolicy?: string;
    youthProtection?: string;
  } | null>("cp-terms", null);

  const termsOfService = parsed?.termsOfService || DEFAULT_TERMS;
  const privacyPolicy = parsed?.privacyPolicy || DEFAULT_PRIVACY;
  const youthProtection = parsed?.youthProtection || DEFAULT_YOUTH;

  return (
    <div className="w-full min-h-screen" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <CulturepeopleHeader0 />

      <div className="mx-auto max-w-[800px] px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 pb-4 border-b-2" style={{ borderColor: "#E8192C" }}>
          약관 및 정책
        </h1>

        <TermsContent
          termsOfService={termsOfService}
          privacyPolicy={privacyPolicy}
          youthProtection={youthProtection}
        />
      </div>

      <CulturepeopleFooter6 />
    </div>
  );
}
