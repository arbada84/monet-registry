import type { Metadata } from "next";

// 내부 개발/프리뷰 전용 경로 — 검색엔진 색인 대상에서 제외한다.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function InternalPreviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
