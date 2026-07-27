import type { Metadata } from "next";
import { BlockedSubjectPolicyManager } from "@/components/cam/auto-press/blocked-subject-policy-manager";

export const metadata: Metadata = {
  title: "보도자료 편집정책 관리 | CulturePeople",
  robots: { index: false, follow: false },
};

export default function BlockedSubjectPolicyPage() {
  return <BlockedSubjectPolicyManager />;
}

