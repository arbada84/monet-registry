"use client";

/**
 * CoupangUnit — 쿠팡 파트너스 광고 단위 (클라이언트 컴포넌트)
 * 쿠팡 파트너스 g.js를 동적으로 로드하고 PartnersCoupang.G 인스턴스를 생성합니다.
 */
import { useEffect, useRef } from "react";

interface CoupangUnitProps {
  partnersId: string;
  bannerId?: string;
  template?: "banner" | "dynamic" | "search" | "product";
  subId?: string;
  keyword?: string;
  width?: string;
  height?: string;
}

declare global {
  interface Window {
    PartnersCoupang: {
      G: new (config: Record<string, unknown>) => void;
    };
  }
}

export default function CoupangUnit({
  partnersId,
  bannerId,
  template = "banner",
  subId,
  keyword,
  width = "728",
  height = "90",
}: CoupangUnitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const initCoupang = () => {
      if (!window.PartnersCoupang) return;
      try {
        const config: Record<string, unknown> = {
          id: Number(partnersId.replace(/\D/g, "")),
          template,
          width: Number(width),
          height: Number(height),
        };
        if (bannerId) config.bannerId = bannerId;
        if (subId) config.subId = subId;
        if (keyword) config.keyword = keyword;
        new window.PartnersCoupang.G(config);
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
    document.head.appendChild(script);
  }, [partnersId, bannerId, template, subId, keyword, width, height]);

  return <div ref={containerRef} />;
}
