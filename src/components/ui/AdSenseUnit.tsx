"use client";

/**
 * AdSenseUnit — Google AdSense 광고 단위 (클라이언트 컴포넌트)
 * - slotId가 없으면 렌더링하지 않음
 * - 자동 광고는 layout.tsx의 글로벌 스크립트가 처리 (개별 컴포넌트 불필요)
 * - 광고 로드 실패 시 컨테이너 자동 숨김
 */
import { useEffect, useRef, useState } from "react";

interface AdSenseUnitProps {
  publisherId: string;
  slotId: string;
  format?: string;
  responsive?: boolean;
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
}: AdSenseUnitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pushed = useRef(false);
  const [filled, setFilled] = useState(true);

  useEffect(() => {
    if (pushed.current || !slotId) return;
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
      } else {
        // ins 요소 미생성 → 광고 로드 실패 → 빈 공간 방지
        setFilled(false);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [slotId]);

  // slotId 없거나 로드 실패 시 렌더링하지 않음
  if (!slotId || !filled) return null;

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
