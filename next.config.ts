import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // 표준 피드 URL → 실제 API 라우트
      { source: "/rss",      destination: "/api/rss",   permanent: true },
      { source: "/feed",     destination: "/feed.json", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // 클릭재킹 방지 — CSP frame-ancestors로 대체 (X-Frame-Options는 AdSense 미리보기 차단하므로 제거)
          // MIME 스니핑 방지
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          // Referrer 정책
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // 권한 정책 (불필요한 기능 비활성화)
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // CSP is generated in middleware so script-src can use a per-request nonce.
          // HSTS
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
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
  // Keep Node-only packages external so API route bundles do not serialize large parsers.
  serverExternalPackages: [
    "imapflow",
    "mailparser",
    "mammoth",
    "mysql2",
    "nodemailer",
    "pdf-parse",
    "sharp",
  ],
};

export default nextConfig;
