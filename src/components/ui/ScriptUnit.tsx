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
    const scriptTags = Array.from(tempDiv.querySelectorAll("script"));
    scriptTags.forEach((originalScript) => {
      const newScript = document.createElement("script");
      // 속성 복사
      Array.from(originalScript.attributes).forEach((attr) => {
        newScript.setAttribute(attr.name, attr.value);
      });
      if (originalScript.src) {
        newScript.src = originalScript.src;
        newScript.async = originalScript.async;
      } else {
        newScript.textContent = originalScript.textContent;
      }
      container.appendChild(newScript);
    });
  }, [scriptCode]);

  return <div ref={containerRef} />;
}
