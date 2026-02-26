import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"], // 자동 포맷 변환 (avif 우선, webp 폴백)
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
    ],
    minimumCacheTTL: 60 * 60 * 24, // 24시간 캐시
  },
  // 카페24 배포: mysql2는 서버 전용 패키지로 클라이언트 번들에서 제외
  serverExternalPackages: ["mysql2"],
};

export default nextConfig;
