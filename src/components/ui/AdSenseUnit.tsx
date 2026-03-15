"use client";

/**
 * AdSenseUnit — Google AdSense 광고 단위 (클라이언트 컴포넌트)
 * - slotId가 없으면 렌더링하지 않음 (자동 광고 빈 공간 방지)
 * - 광고 로드 실패 시 컨테이너 자동 숨김
 */
import { useEffect, useRef, useState } from "react";

interface AdSenseUnitProps {
  publisherId: string;
  slotId: string;
  format?: string;
  responsive?: boolean;
  /** slotId 없이 자동 광고 앵커 모드 (Google이 자동으로 채움) */
  autoAds?: boolean;
}

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

export default function AdSenseUnit({
  publisherId,
  slotId,
  format = "auto",
  responsive = true,
  autoAds = false,
}: AdSenseUnitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pushed = useRef(false);
  const [filled, setFilled] = useState(true);

  useEffect(() => {
    if (pushed.current) return;

    // 자동 광고 앵커 모드: slotId 없이 Google 자동 광고가 채울 컨테이너
    if (autoAds && !slotId) {
      pushed.current = true;
      // 자동 광고 앵커는 Google이 페이지 분석 후 채우므로 push하지 않음
      // 5초 후 채워지지 않으면 숨김
      const timer = setTimeout(() => {
        if (containerRef.current) {
          const hasContent = containerRef.current.querySelector("ins, iframe");
          if (!hasContent || containerRef.current.getBoundingClientRect().height < 10) {
            setFilled(false);
          }
        }
      }, 5000);
      return () => clearTimeout(timer);
    }

    // 일반 모드: slotId 필요
    if (!slotId) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // ignore
    }

    // 광고 로드 후 실제 콘텐츠가 채워졌는지 확인 (3초 후)
    const timer = setTimeout(() => {
      const ins = containerRef.current?.querySelector("ins.adsbygoogle");
      if (ins) {
        const status = ins.getAttribute("data-ad-status");
        const rect = ins.getBoundingClientRect();
        if (status === "unfilled" || rect.height === 0) {
          setFilled(false);
        }
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [slotId, autoAds]);

  // 광고 로드 실패 시 아무것도 렌더링하지 않음
  if (!filled) return null;
  // slotId도 없고 autoAds도 아니면 렌더링하지 않음
  if (!slotId && !autoAds) return null;

  // 자동 광고 앵커 모드: Google 자동 광고가 인식할 수 있는 컨테이너
  if (autoAds && !slotId) {
    return (
      <div
        ref={containerRef}
        className="adsbygoogle-anchor"
        style={{
          display: "block",
          minHeight: 90,
          maxWidth: "100%",
          overflow: "hidden",
          textAlign: "center",
        }}
        data-ad-client={publisherId}
        data-ad-format={format}
      />
    );
  }

  return (
    <div ref={containerRef} style={{ overflow: "hidden", maxWidth: "100%" }}>
      <ins
        className="adsbygoogle"
        style={{ display: "block", maxWidth: "100%" }}
        data-ad-client={publisherId}
        data-ad-slot={slotId}
        data-ad-format={format}
        data-full-width-responsive={responsive ? "true" : "false"}
      />
    </div>
  );
}
