"use client";

import { useState } from "react";

interface Props {
  termsOfService: string;
  privacyPolicy: string;
  youthProtection: string;
  youthProtectionApproved: boolean;
  termsApproved: boolean;
  privacyApproved: boolean;
  accent?: string;
}

export default function TermsContent({ termsOfService, privacyPolicy, youthProtection, youthProtectionApproved, termsApproved, privacyApproved, accent = "#E8192C" }: Props) {
  const [activeTab, setActiveTab] = useState<"terms" | "privacy" | "youth">("terms");

  const contentMap = {
    terms: termsOfService,
    privacy: privacyPolicy,
    youth: youthProtection,
  };

  return (
    <>
      <div className="flex gap-2 mb-8">
        {[
          { key: "terms" as const, label: "이용약관" },
          { key: "privacy" as const, label: "개인정보처리방침" },
          { key: "youth" as const, label: "청소년보호정책" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="px-4 py-2 text-sm rounded transition-colors"
            style={{
              backgroundColor: activeTab === tab.key ? accent : "#F5F5F5",
              color: activeTab === tab.key ? "#FFF" : "#666",
              fontWeight: activeTab === tab.key ? 600 : 400,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        data-terms-legal-status={termsApproved ? "approved" : "missing"}
        data-privacy-legal-status={privacyApproved ? "approved" : "missing"}
        data-youth-legal-status={youthProtectionApproved ? "approved" : "missing"}
        className="text-sm text-gray-700 leading-[1.9] whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded p-6"
      >
        {contentMap[activeTab]}
      </div>
    </>
  );
}
