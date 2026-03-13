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
    unoptimized: true, // Vercel Hobby 플랜 이미지 최적화 한도 초과 방지 — 원본 URL 직접 로드
  },
  // mysql2는 서버 전용 패키지 — 클라이언트 번들에서 제외 (로컬 개발 MySQL 직접 접속용)
  serverExternalPackages: ["mysql2", "sharp"],
};

export default nextConfig;
