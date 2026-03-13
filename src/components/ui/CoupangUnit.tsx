"use client";

/**
 * CoupangUnit — 쿠팡 파트너스 광고 단위 (클라이언트 컴포넌트)
 * 쿠팡 파트너스 g.js를 동적으로 로드하고 PartnersCoupang.G 인스턴스를 생성합니다.
 * - 모바일: 화면 폭에 맞춰 자동 축소 (overflow 방지)
 * - 로드 실패 시 컨테이너 자동 숨김
 */
import { useEffect, useRef, useState } from "react";

interface CoupangUnitProps {
  /** 직접 숫자 ID (쿠팡 파트너스 배너 id) */
  id?: number;
  /** 레거시: 문자열 형식 파트너스 ID (숫자만 추출) */
  partnersId?: string;
  /** 트래킹 코드 (예: "AF1979086") */
  trackingCode?: string;
  bannerId?: string;
  template?: "banner" | "dynamic" | "search" | "product" | "carousel";
  subId?: string;
  keyword?: string;
  width?: string | number;
  height?: string | number;
}

declare global {
  interface Window {
    PartnersCoupang: {
      G: new (config: Record<string, unknown>) => void;
    };
  }
}

export default function CoupangUnit({
  id,
  partnersId,
  trackingCode,
  bannerId,
  template = "banner",
  subId,
  keyword,
  width = "728",
  height = "90",
}: CoupangUnitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const numId = id ?? (partnersId ? Number(partnersId.replace(/\D/g, "")) : 0);

    const initCoupang = () => {
      if (!window.PartnersCoupang) return;
      try {
        const config: Record<string, unknown> = {
          id: numId,
          template,
          width: Number(width),
          height: Number(height),
        };
        if (trackingCode) config.trackingCode = trackingCode;
        if (bannerId) config.bannerId = bannerId;
        if (subId) config.subId = subId;
        if (keyword) config.keyword = keyword;
        new window.PartnersCoupang.G(config);
        setLoaded(true);
      } catch {
        // ignore
      }
    };

    // g.js 이미 로드된 경우
    if (window.PartnersCoupang) {
      initCoupang();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://ads-partners.coupang.com/g.js";
    script.async = true;
    script.onload = initCoupang;
    script.onerror = () => setLoaded(false);
    document.head.appendChild(script);
  }, [id, partnersId, trackingCode, bannerId, template, subId, keyword, width, height]);

  // 쿠팡 광고가 원본 크기(728px)보다 화면이 작을 때 축소 비율 적용
  const numWidth = Number(width) || 728;
  const numHeight = Number(height) || 90;

  return (
    <div
      ref={containerRef}
      style={{
        maxWidth: "100%",
        overflow: "hidden",
        /* 모바일에서 728px iframe을 화면 폭에 맞춰 축소 */
        ...(numWidth > 400 ? {
          width: "100%",
          aspectRatio: `${numWidth}/${numHeight}`,
          maxHeight: numHeight,
        } : {}),
      }}
    />
  );
}
