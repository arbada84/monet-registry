import { NextResponse } from "next/server";
import { serverGetSetting } from "@/lib/db-server";

export const dynamic = "force-dynamic";

interface SeoSettings {
  robotsNoIndex?: boolean;
}

export async function GET() {
  const baseUrl = "https://culturepeople.co.kr";

  let seoSettings: SeoSettings = {};
  try {
    seoSettings = await serverGetSetting<SeoSettings>("cp-seo-settings", {});
  } catch { /* 기본값 사용 */ }

  let txt: string;
  if (seoSettings.robotsNoIndex) {
    txt = "User-agent: *\nDisallow: /\n";
  } else {
    txt = [
      // ── 정상 검색엔진 허용 ──
      "User-agent: Googlebot",
      "Allow: /",
      "Disallow: /cam/",
      "Disallow: /api/",
      "",
      "User-agent: Yeti",      // 네이버
      "Allow: /",
      "Disallow: /cam/",
      "Disallow: /api/",
      "",
      "User-agent: Bingbot",
      "Allow: /",
      "Disallow: /cam/",
      "Disallow: /api/",
      "",
      "User-agent: Daumoa",    // 다음
      "Allow: /",
      "Disallow: /cam/",
      "Disallow: /api/",
      "",
      // ── AI 검색 답변용 허용 (출처 링크로 유입 효과) ──
      "User-agent: ChatGPT-User",
      "Allow: /",
      "Disallow: /cam/",
      "Disallow: /api/",
      "",
      "User-agent: PerplexityBot",
      "Allow: /",
      "Disallow: /cam/",
      "Disallow: /api/",
      "",
      // ── AI 학습용 크롤러 차단 (트래픽 유입 없이 콘텐츠만 수집) ──
      "User-agent: GPTBot",
      "Disallow: /",
      "",
      "User-agent: Google-Extended",
      "Disallow: /",
      "",
      "User-agent: CCBot",
      "Disallow: /",
      "",
      "User-agent: anthropic-ai",
      "Disallow: /",
      "",
      "User-agent: ClaudeBot",
      "Disallow: /",
      "",
      "User-agent: Claude-Web",
      "Disallow: /",
      "",
      "User-agent: cohere-ai",
      "Disallow: /",
      "",
      "User-agent: Bytespider",
      "Disallow: /",
      "",
      "User-agent: FacebookBot",
      "Disallow: /",
      "",
      "User-agent: Applebot-Extended",
      "Disallow: /",
      "",
      "User-agent: Meta-ExternalAgent",
      "Disallow: /",
      "",
      // ── SEO 스크래퍼 / 콘텐츠 도둑 차단 ──
      "User-agent: SemrushBot",
      "Disallow: /",
      "",
      "User-agent: AhrefsBot",
      "Disallow: /",
      "",
      "User-agent: MJ12bot",
      "Disallow: /",
      "",
      "User-agent: DotBot",
      "Disallow: /",
      "",
      "User-agent: PetalBot",
      "Disallow: /",
      "",
      "User-agent: DataForSeoBot",
      "Disallow: /",
      "",
      // ── 기타 모든 봇: 관리자/API 차단 ──
      "User-agent: *",
      "Allow: /",
      "Disallow: /cam/",
      "Disallow: /api/",
      "Crawl-delay: 10",
      "",
      `Sitemap: ${baseUrl}/sitemap.xml`,
      "",
    ].join("\n");
  }

  return new NextResponse(txt, {
    headers: {
      "Content-Type": "text/plain; charset=UTF-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}
