import type { Metadata } from "next";
import { serverGetArticles } from "@/lib/db-server";
import { getSiteType } from "@/lib/site-type";
import CulturepeopleLanding from "@/components/pages/culturepeople-landing";
import { InsightKoreaLanding } from "@/components/themes/insightkorea";
import AdBanner from "@/components/ui/AdBanner";

export const revalidate = 60; // 60초 ISR 캐시

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL?.split(/\s/)[0]?.replace(/\/$/, "") || "https://culturepeople.co.kr";

export const metadata: Metadata = {
  alternates: {
    canonical: BASE_URL,
  },
};

const siteSchema = {
  "@context": "https://schema.org",
  "@type": "NewsMediaOrganization",
  name: "컬처피플",
  url: "https://culturepeople.co.kr",
  logo: "https://culturepeople.co.kr/icon-512.png",
  sameAs: [],
  potentialAction: {
    "@type": "SearchAction",
    target: "https://culturepeople.co.kr/search?q={search_term_string}",
    "query-input": "required name=search_term_string",
  },
};

export default async function Home() {
  const [articles, siteType] = await Promise.all([serverGetArticles(), getSiteType()]);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteSchema) }}
      />
      {siteType === "insightkorea" ? (
        <InsightKoreaLanding
          articles={articles}
          adSlots={{
            top: <AdBanner position="top" height={90} className="mb-4" />,
            "home-mid-1": <AdBanner position="home-mid-1" height={90} className="mb-4" />,
            "home-mid-2": <AdBanner position="home-mid-2" height={90} className="my-8" />,
            bottom: <AdBanner position="bottom" height={90} className="my-8" />,
          }}
        />
      ) : (
        <CulturepeopleLanding articles={articles} />
      )}
    </>
  );
}
