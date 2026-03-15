"use client";

/**
 * CoupangUnit — 쿠팡 파트너스 광고 단위 (클라이언트 컴포넌트)
 * 쿠팡 파트너스 g.js를 동적으로 로드하고 PartnersCoupang.G 인스턴스를 생성합니다.
 * - PartnersCoupang.G는 <ins>를 body에 직접 삽입하므로, MutationObserver로
 *   생성된 <ins>를 감지하여 컨테이너로 이동시킵니다.
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
    if (initialized.current || !containerRef.current) return;
    initialized.current = true;

    const container = containerRef.current;
    const numId = id ?? (partnersId ? Number(partnersId.replace(/\D/g, "")) : 0);

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

    // PartnersCoupang.G는 body에 <ins>를 직접 삽입하므로
    // MutationObserver로 삽입된 <ins>를 감지하여 컨테이너로 이동
    const initInContainer = () => {
      if (!window.PartnersCoupang) return;

      // body에 추가되는 <ins> (쿠팡 위젯 iframe 포함)를 감지
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node instanceof HTMLElement && node.tagName === "INS") {
              // 이 <ins>가 우리 위젯의 iframe을 포함하는지 확인
              const iframe = node.querySelector("iframe");
              if (iframe?.src?.includes(`id=${numId}`)) {
                observer.disconnect();
                container.appendChild(node);
                setLoaded(true);
                return;
              }
            }
          }
        }
      });
      observer.observe(document.body, { childList: true });

      // 생성자 호출 → body에 <ins> 삽입됨 → observer가 감지하여 이동
      try {
        new window.PartnersCoupang.G(config);
      } catch {
        observer.disconnect();
      }

      // 안전장치: 3초 후에도 감지 못하면 정리
      setTimeout(() => {
        observer.disconnect();
        // body에 남아있는 쿠팡 <ins> 중 이 ID의 것을 찾아 이동
        const orphan = document.body.querySelector(
          `ins > iframe[src*="id=${numId}"]`
        )?.parentElement;
        if (orphan && orphan.parentElement === document.body) {
          container.appendChild(orphan);
          setLoaded(true);
        }
      }, 3000);
    };

    // g.js 이미 로드된 경우
    if (window.PartnersCoupang) {
      initInContainer();
      return;
    }

    // g.js를 head에 한 번만 로드 (여러 CoupangUnit이 있어도 중복 방지)
    const existing = document.querySelector(
      'script[src*="ads-partners.coupang.com/g.js"]'
    );
    if (existing) {
      if ((existing as HTMLScriptElement).dataset.loaded === "1") {
        initInContainer();
      } else {
        existing.addEventListener("load", initInContainer);
      }
      return;
    }

    const script = document.createElement("script");
    script.src = "https://ads-partners.coupang.com/g.js";
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "1";
      initInContainer();
    };
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
        ...(numWidth > 400
          ? {
              width: "100%",
              aspectRatio: `${numWidth}/${numHeight}`,
              maxHeight: numHeight,
            }
          : {}),
      }}
    />
  );
}
