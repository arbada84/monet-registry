import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"], // 자동 포맷 변환 (avif 우선, webp 폴백)
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      // http는 보안상 허용하지 않음 (기사 썸네일은 HTTPS URL만 사용)
    ],
    minimumCacheTTL: 60 * 60 * 24, // 24시간 캐시
  },
  // 카페24 배포: mysql2는 서버 전용 패키지로 클라이언트 번들에서 제외
  serverExternalPackages: ["mysql2"],
};

export default nextConfig;
