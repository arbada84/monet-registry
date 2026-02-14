"use client";

import { useEffect, useState } from "react";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";

const DEFAULT_PRIVACY = `(주)컬처피플미디어(이하 "회사")는 이용자의 개인정보를 중요시하며, 「개인정보 보호법」 등 관련 법규를 준수하고 있습니다.

1. 수집하는 개인정보 항목
회사는 뉴스레터 구독, 기사 제보 등을 위해 아래와 같은 개인정보를 수집하고 있습니다.
- 필수항목: 이메일 주소
- 선택항목: 이름, 연락처

2. 개인정보의 수집 및 이용 목적
- 뉴스레터 발송
- 기사 제보 접수 및 회신
- 서비스 이용 통계 분석

3. 개인정보의 보유 및 이용 기간
이용자의 개인정보는 수집 및 이용 목적이 달성된 후에는 지체 없이 파기합니다.
단, 관계 법령에 의해 보존할 필요가 있는 경우 해당 법령에서 정한 기간 동안 보존합니다.

4. 개인정보의 파기 절차 및 방법
전자적 파일 형태의 정보는 기록을 재생할 수 없는 기술적 방법을 사용하여 삭제합니다.

5. 개인정보 보호책임자
- 성명: 이민수
- 직위: 개인정보보호 담당
- 연락처: privacy@culturepeople.co.kr

6. 개인정보처리방침 변경
이 개인정보처리방침은 시행일로부터 적용되며, 변경 시 웹사이트를 통해 공지합니다.

시행일: 2024년 1월 1일`;

export default function PrivacyPage() {
  const [privacy, setPrivacy] = useState(DEFAULT_PRIVACY);

  useEffect(() => {
    const stored = localStorage.getItem("cp-terms");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.privacyPolicy) setPrivacy(parsed.privacyPolicy);
    }
  }, []);

  return (
    <div className="w-full min-h-screen" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <CulturepeopleHeader0 />

      <div className="mx-auto max-w-[800px] px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-8 pb-4 border-b-2" style={{ borderColor: "#E8192C" }}>
          개인정보처리방침
        </h1>

        <div className="text-sm text-gray-700 leading-[1.9] whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded p-6">
          {privacy}
        </div>
      </div>

      <CulturepeopleFooter6 />
    </div>
  );
}
