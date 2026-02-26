"use client";

/**
 * AdSenseUnit — Google AdSense 광고 단위 (클라이언트 컴포넌트)
 * ins 태그를 렌더링하고 adsbygoogle.push()를 실행합니다.
 */
import { useEffect, useRef } from "react";

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
  const insRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // ignore
    }
  }, []);

  return (
    <ins
      ref={insRef}
      className="adsbygoogle"
      style={{ display: "block" }}
      data-ad-client={publisherId}
      data-ad-slot={slotId}
      data-ad-format={format}
      data-full-width-responsive={responsive ? "true" : "false"}
    />
  );
}
