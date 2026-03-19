"use client";

/**
 * ScriptUnit — 직접 스크립트 광고 단위 (클라이언트 컴포넌트)
 * dangerouslySetInnerHTML 대신 useEffect에서 스크립트를 동적으로 DOM에 삽입합니다.
 */
import { useEffect, useRef } from "react";

interface ScriptUnitProps {
  scriptCode: string;
}

export default function ScriptUnit({ scriptCode }: ScriptUnitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || !containerRef.current || !scriptCode) return;
    initialized.current = true;

    const container = containerRef.current;

    // scriptCode에서 <script> 태그와 그 외 HTML을 분리해서 처리
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = scriptCode;

    // 일반 HTML 요소 복사
    Array.from(tempDiv.childNodes).forEach((node) => {
      if (node.nodeName !== "SCRIPT") {
        container.appendChild(node.cloneNode(true));
      }
    });

    // script 태그는 새로 생성해야 실행됨
    // 보안: 허용된 광고 도메인만 외부 스크립트 로드 허용
    const ALLOWED_SCRIPT_DOMAINS = [
      "googleads.g.doubleclick.net", "pagead2.googlesyndication.com",
      "ads.google.com", "www.googletagmanager.com", "www.google-analytics.com",
      "connect.facebook.net", "platform.twitter.com",
      "ads-partners.coupang.com", "coupa.ng",
      "t1.daumcdn.net", "s.yimg.jp",
      "cdn.taboola.com", "cdn.outbrain.com",
    ];
    const scriptTags = Array.from(tempDiv.querySelectorAll("script"));
    scriptTags.forEach((originalScript) => {
      // 외부 스크립트: 허용 도메인 검증
      if (originalScript.src) {
        try {
          const srcHost = new URL(originalScript.src).hostname.toLowerCase();
          const allowed = ALLOWED_SCRIPT_DOMAINS.some(
            (d) => srcHost === d || srcHost.endsWith("." + d)
          );
          if (!allowed) {
            console.warn("[ScriptUnit] 비허용 스크립트 도메인 차단:", srcHost);
            return;
          }
        } catch {
          return; // 잘못된 URL 무시
        }
      }
      const newScript = document.createElement("script");
      Array.from(originalScript.attributes).forEach((attr) => {
        newScript.setAttribute(attr.name, attr.value);
      });
      if (originalScript.src) {
        newScript.src = originalScript.src;
        newScript.async = originalScript.async;
      } else {
        // 인라인 스크립트: 위험한 패턴 차단
        const code = originalScript.textContent || "";
        if (/document\.cookie|localStorage|sessionStorage|fetch\s*\(|XMLHttpRequest|eval\s*\(/i.test(code)) {
          console.warn("[ScriptUnit] 인라인 스크립트에서 의심스러운 코드 차단");
          return;
        }
        newScript.textContent = code;
      }
      container.appendChild(newScript);
    });
  }, [scriptCode]);

  return <div ref={containerRef} />;
}
