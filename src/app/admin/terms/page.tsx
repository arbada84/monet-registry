"use client";

import { useEffect, useState } from "react";
import { getSetting, saveSetting } from "@/lib/db";

interface TermsData {
  termsOfService: string;
  privacyPolicy: string;
  youthPolicy: string;
  emailPolicy: string;
}

const DEFAULT_TERMS: TermsData = {
  termsOfService: `제1조 (목적)
이 약관은 컬처피플(이하 "회사")이 운영하는 인터넷 사이트에서 제공하는 인터넷 관련 서비스(이하 "서비스")를 이용함에 있어 회사와 이용자의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.

제2조 (정의)
① "사이트"란 회사가 서비스를 이용자에게 제공하기 위하여 컴퓨터 등 정보통신설비를 이용하여 설정한 가상의 공간을 말합니다.
② "이용자"란 "사이트"에 접속하여 이 약관에 따라 회사가 제공하는 서비스를 받는 회원 및 비회원을 말합니다.

제3조 (약관의 게시와 개정)
① 회사는 이 약관의 내용을 이용자가 쉽게 알 수 있도록 서비스 초기 화면에 게시합니다.
② 회사는 관련법을 위배하지 않는 범위에서 이 약관을 개정할 수 있습니다.`,

  privacyPolicy: `1. 개인정보의 처리 목적
컬처피플은 다음의 목적을 위하여 개인정보를 처리합니다. 처리하고 있는 개인정보는 다음의 목적 이외의 용도로는 이용되지 않으며, 이용 목적이 변경되는 경우에는 별도의 동의를 받는 등 필요한 조치를 이행할 예정입니다.

가. 서비스 제공: 콘텐츠 제공, 맞춤서비스 제공 등
나. 회원 관리: 회원제 서비스 이용에 따른 본인확인, 개인식별 등

2. 개인정보의 처리 및 보유기간
컬처피플은 법령에 따른 개인정보 보유·이용기간 또는 정보주체로부터 개인정보를 수집 시에 동의받은 개인정보 보유·이용기간 내에서 개인정보를 처리·보유합니다.

3. 개인정보의 제3자 제공
컬처피플은 정보주체의 개인정보를 원칙적으로 외부에 제공하지 않습니다.`,

  youthPolicy: `컬처피플은 청소년이 건전한 인격체로 성장할 수 있도록 하기 위해 청소년 보호에 관한 법률에서 정한 유해매체물이 청소년에게 유통되지 않도록 방지하고 있으며, 청소년의 건전한 성장을 저해하는 내용물로부터 청소년을 보호하기 위해 다음과 같이 청소년 보호정책을 시행하고 있습니다.

1. 유해정보에 대한 청소년 접근 제한 및 관리 조치
2. 유해정보로부터의 청소년 보호를 위한 기술적 조치
3. 유해정보로부터의 청소년 보호를 위한 교육
4. 유해정보 관련 신고·접수 처리`,

  emailPolicy: `컬처피플은 정보통신망법 등 관련 법률에 따라 이메일 무단 수집을 거부합니다.

본 사이트에 게시된 이메일 주소가 전자우편 수집 프로그램이나 그 밖의 기술적 장치를 이용하여 무단으로 수집되는 것을 거부하며, 이를 위반 시 정보통신망법에 의해 형사처벌됨을 유의하시기 바랍니다.`,
};

const TAB_LABELS: Record<keyof TermsData, string> = {
  termsOfService: "이용약관",
  privacyPolicy: "개인정보처리방침",
  youthPolicy: "청소년 보호정책",
  emailPolicy: "이메일 무단수집 거부",
};

export default function AdminTermsPage() {
  const [terms, setTerms] = useState<TermsData>(DEFAULT_TERMS);
  const [activeTab, setActiveTab] = useState<keyof TermsData>("termsOfService");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    getSetting<TermsData | null>("cp-terms", null).then((stored) => {
      if (stored) setTerms({ ...DEFAULT_TERMS, ...stored });
    });
  }, []);

  const handleSave = async () => {
    try {
      await saveSetting("cp-terms", terms);
      setSaved(true);
      setSaveError("");
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장에 실패했습니다. 다시 시도해주세요.");
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 24 }}>
        약관 관리
      </h1>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, flexWrap: "wrap" }}>
        {(Object.keys(TAB_LABELS) as Array<keyof TermsData>).map((key) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              padding: "8px 18px",
              fontSize: 14,
              fontWeight: activeTab === key ? 600 : 400,
              color: activeTab === key ? "#E8192C" : "#666",
              background: activeTab === key ? "#FFF0F0" : "#FFF",
              border: `1px solid ${activeTab === key ? "#E8192C" : "#DDD"}`,
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 800 }}>
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "#111" }}>
            {TAB_LABELS[activeTab]}
          </h2>
          <textarea
            value={terms[activeTab]}
            onChange={(e) => {
              setTerms((prev) => ({ ...prev, [activeTab]: e.target.value }));
              setSaved(false);
            }}
            rows={20}
            style={{
              width: "100%",
              padding: "14px 16px",
              fontSize: 14,
              border: "1px solid #DDD",
              borderRadius: 8,
              outline: "none",
              boxSizing: "border-box",
              resize: "vertical",
              lineHeight: 1.8,
              fontFamily: "'Noto Sans KR', sans-serif",
            }}
          />
          <div style={{ fontSize: 12, color: "#999", marginTop: 8 }}>
            HTML 태그 사용 가능합니다. 저장 후 프론트엔드 약관 페이지에 반영됩니다.
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <button
            onClick={handleSave}
            style={{ padding: "12px 32px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
          >
            저장
          </button>
          {saved && (
            <span style={{ marginLeft: 12, fontSize: 14, color: "#4CAF50", fontWeight: 500 }}>
              저장되었습니다!
            </span>
          )}
          {saveError && <span style={{ marginLeft: 12, fontSize: 13, color: "#E8192C" }}>{saveError}</span>}
        </div>
      </div>
    </div>
  );
}
