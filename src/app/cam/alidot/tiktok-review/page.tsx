import type { Metadata } from "next";
import { TikTokReviewForm } from "./TikTokReviewForm";

export const metadata: Metadata = {
  title: "알리닷 영상 등록 UI | CulturePeople",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    googleBot: { index: false, follow: false, noarchive: true },
  },
};

export default function TikTokReviewPage() {
  return <TikTokReviewForm />;
}

