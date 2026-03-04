import "./globals.css";

import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_KR } from "next/font/google";
import Script from "next/script";
import Providers from "./providers";
import { getSiteConfig } from "@/config/site";
import { serverGetSetting } from "@/lib/db-server";
import FloatingAds from "@/components/ui/FloatingAds";

// 레이아웃은 ISR로 캐싱 (60초마다 재검증)
// 개별 페이지에서 force-dynamic 또는 revalidate로 재정의 가능
export const revalidate = 60;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

interface SnsSettings {
  twitterHandle?: string;
  facebookAppId?: string;
  kakaoJsKey?: string;
}

interface SeoSettings {
  googleVerification?: string;
  naverVerification?: string;
  bingVerification?: string;
  googleAnalyticsId?: string;
  naverAnalyticsId?: string;
}

export async function generateMetadata(): Promise<Metadata> {
  const siteConfig = getSiteConfig();
  const [sns, seoSettings] = await Promise.all([
    serverGetSetting<SnsSettings>("cp-sns-settings", {}),
    serverGetSetting<SeoSettings>("cp-seo-settings", {}),
  ]);
  const baseUrl = siteConfig.url.replace(/\/$/, "");
  const twitterHandle = sns.twitterHandle ? (sns.twitterHandle.startsWith("@") ? sns.twitterHandle : `@${sns.twitterHandle}`) : "@culturepeople";
  const fbAppId = sns.facebookAppId;

  return {
    title: {
      default: siteConfig.name,
      template: `%s | ${siteConfig.name}`,
    },
    description: siteConfig.description,
    keywords: [
      siteConfig.name,
      "뉴스",
      "연예",
      "스포츠",
      "문화",
      "라이프",
      "포토",
      "한국 뉴스",
      "뉴스포털",
    ],
    authors: [
      {
        name: siteConfig.name,
        url: siteConfig.url,
      },
    ],
    creator: siteConfig.name,
    openGraph: {
      type: "website",
      locale: "ko_KR",
      url: siteConfig.url,
      title: siteConfig.name,
      description: siteConfig.description,
      siteName: siteConfig.name,
      images: [
        {
          url: siteConfig.ogImage,
          width: 1200,
          height: 630,
          alt: siteConfig.name,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: siteConfig.name,
      description: siteConfig.description,
      images: [siteConfig.ogImage],
      creator: twitterHandle,
      site: twitterHandle,
    },
    icons: {
      icon: "/favicon.ico",
      apple: "/icon-192.png",
    },
    manifest: "/manifest.json",
    metadataBase: new URL(siteConfig.url),
    alternates: {
      types: {
        "application/rss+xml": [{ url: `${baseUrl}/api/rss`, title: siteConfig.name }],
        "application/feed+json": [{ url: `${baseUrl}/feed.json`, title: siteConfig.name }],
      },
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
      },
    },
    other: {
      ...(seoSettings.googleVerification ? { "google-site-verification": seoSettings.googleVerification } : {}),
      ...(seoSettings.naverVerification ? { "naver-site-verification": seoSettings.naverVerification } : {}),
      ...(seoSettings.bingVerification ? { "msvalidate.01": seoSettings.bingVerification } : {}),
      ...(fbAppId ? { "fb:app_id": fbAppId } : {}),
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [seoSettings, snsSettings] = await Promise.all([
    serverGetSetting<SeoSettings>("cp-seo-settings", {}),
    serverGetSetting<SnsSettings>("cp-sns-settings", {}),
  ]);

  const gaId = seoSettings.googleAnalyticsId?.trim();
  const naverId = seoSettings.naverAnalyticsId?.trim();
  const kakaoKey = snsSettings.kakaoJsKey?.trim();

  return (
    <html suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoSansKR.variable} antialiased`}
      >
        {/* Google Analytics */}
        {gaId && (
          <>
            <Script
              id="ga-script"
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(gaId)});`,
              }}
            />
          </>
        )}

        {/* 네이버 애널리틱스 */}
        {naverId && (
          <>
            <Script
              id="naver-wcs"
              src="//wcs.naver.net/wcslog.js"
              strategy="afterInteractive"
            />
            <Script id="naver-analytics" strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `if(!wcs_add)var wcs_add={};wcs_add["wa"]=${JSON.stringify(naverId)};if(window.wcs){wcs.inflow();wcs_do();}`,
              }}
            />
          </>
        )}

        {/* 카카오 SDK (ArticleShare 공유 기능용) */}
        {kakaoKey && (
          <>
            <Script
              id="kakao-sdk"
              src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js"
              crossOrigin="anonymous"
              strategy="afterInteractive"
            />
            <Script id="kakao-init" strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `document.getElementById('kakao-sdk').addEventListener('load',function(){if(window.Kakao&&!window.Kakao.isInitialized())window.Kakao.init(${JSON.stringify(kakaoKey)});});`,
              }}
            />
          </>
        )}

        <Providers>
          <div id="app-root" className="flex flex-col min-h-screen">
            <main className="flex-1">{children}</main>
          </div>
          <FloatingAds />
        </Providers>
      </body>
    </html>
  );
}
