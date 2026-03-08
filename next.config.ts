import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // 표준 피드 URL → 실제 API 라우트
      { source: "/rss.xml",  destination: "/api/rss",   permanent: false },
      { source: "/rss",      destination: "/api/rss",   permanent: false },
      { source: "/feed",     destination: "/feed.json", permanent: false },
      { source: "/feed.xml", destination: "/api/rss",   permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // 클릭재킹 방지
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // XSS 필터 (레거시 브라우저)
          { key: "X-XSS-Protection", value: "1; mode=block" },
          // MIME 스니핑 방지
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Referrer 정책
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // 권한 정책 (불필요한 기능 비활성화)
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // 관리자 페이지는 iframe 완전 차단
        source: "/cam/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"], // 자동 포맷 변환 (avif 우선, webp 폴백)
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      // http는 보안상 허용하지 않음 (기사 썸네일은 HTTPS URL만 사용)
    ],
    minimumCacheTTL: 60 * 60 * 24, // 24시간 캐시
  },
  // mysql2는 서버 전용 패키지 — 클라이언트 번들에서 제외 (로컬 개발 MySQL 직접 접속용)
  serverExternalPackages: ["mysql2"],
};

export default nextConfig;
