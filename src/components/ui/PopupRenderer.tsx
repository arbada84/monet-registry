"use client";

/**
 * PopupRenderer — 공개 페이지에 팝업/배너를 렌더링하는 클라이언트 컴포넌트
 * 어드민 > 팝업/배너 관리에서 설정한 내용을 공개 페이지에 표시합니다.
 */
import { useEffect, useState } from "react";

interface PopupBanner {
  id: string;
  name: string;
  type: "popup" | "topbanner" | "bottombanner";
  enabled: boolean;
  imageUrl: string;
  linkUrl: string;
  htmlContent: string;
  startDate: string;
  endDate: string;
  showOnce: boolean;
  width: string;
  height: string;
  position: "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

function isActive(popup: PopupBanner): boolean {
  if (!popup.enabled) return false;
  const today = new Date().toISOString().slice(0, 10);
  if (popup.startDate && today < popup.startDate) return false;
  if (popup.endDate && today > popup.endDate) return false;
  return true;
}

function getPositionStyle(pos: PopupBanner["position"]): React.CSSProperties {
  const base: React.CSSProperties = { position: "fixed", zIndex: 9999 };
  switch (pos) {
    case "center":       return { ...base, top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    case "top-left":     return { ...base, top: 20, left: 20 };
    case "top-right":    return { ...base, top: 20, right: 20 };
    case "bottom-left":  return { ...base, bottom: 20, left: 20 };
    case "bottom-right": return { ...base, bottom: 20, right: 20 };
    default:             return { ...base, top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }
}

export default function PopupRenderer() {
  const [popups, setPopups] = useState<PopupBanner[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    // 설정에서 팝업 목록 로드
    fetch("/api/db/settings?key=cp-popups&fallback=[]", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const list: PopupBanner[] = data.value ?? [];
        // 오늘 하루 보지 않기 적용
        const today = new Date().toISOString().slice(0, 10);
        const filtered = list.filter((p) => {
          if (!isActive(p)) return false;
          if (p.showOnce) {
            const key = `cp-popup-dismissed-${p.id}`;
            const dismissedDate = localStorage.getItem(key);
            if (dismissedDate === today) return false;
          }
          return true;
        });
        setPopups(filtered);
      })
      .catch(() => {});
  }, []);

  const dismiss = (popup: PopupBanner) => {
    if (popup.showOnce) {
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem(`cp-popup-dismissed-${popup.id}`, today);
    }
    setDismissed((prev) => new Set([...prev, popup.id]));
  };

  const visible = popups.filter((p) => !dismissed.has(p.id));
  if (visible.length === 0) return null;

  const topBanners = visible.filter((p) => p.type === "topbanner");
  const bottomBanners = visible.filter((p) => p.type === "bottombanner");
  const modalPopups = visible.filter((p) => p.type === "popup");

  return (
    <>
      {/* 상단 띠배너 */}
      {topBanners.map((p) => (
        <div
          key={p.id}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9998,
            background: "#1A1A1A",
            color: "#FFF",
            textAlign: "center",
            padding: "8px 48px",
            fontSize: 13,
          }}
        >
          {p.htmlContent ? (
            <div dangerouslySetInnerHTML={{ __html: p.htmlContent }} />
          ) : p.linkUrl ? (
            <a href={p.linkUrl} target="_blank" rel="noopener" style={{ color: "#FFF", textDecoration: "underline" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.imageUrl && <img src={p.imageUrl} alt={p.name} style={{ maxHeight: 40, verticalAlign: "middle" }} />}
              {!p.imageUrl && p.name}
            </a>
          ) : (
            p.name
          )}
          <button
            onClick={() => dismiss(p)}
            style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#FFF", fontSize: 18, cursor: "pointer", lineHeight: 1 }}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
      ))}

      {/* 하단 띠배너 */}
      {bottomBanners.map((p) => (
        <div
          key={p.id}
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 9998,
            background: "#1A1A1A",
            color: "#FFF",
            textAlign: "center",
            padding: "8px 48px",
            fontSize: 13,
          }}
        >
          {p.htmlContent ? (
            <div dangerouslySetInnerHTML={{ __html: p.htmlContent }} />
          ) : p.linkUrl ? (
            <a href={p.linkUrl} target="_blank" rel="noopener" style={{ color: "#FFF", textDecoration: "underline" }}>
              {p.name}
            </a>
          ) : (
            p.name
          )}
          <button
            onClick={() => dismiss(p)}
            style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#FFF", fontSize: 18, cursor: "pointer", lineHeight: 1 }}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
      ))}

      {/* 팝업 오버레이 */}
      {modalPopups.length > 0 && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999 }}
          onClick={(e) => { if (e.target === e.currentTarget) dismiss(modalPopups[0]); }}
        >
          {modalPopups.slice(0, 1).map((p) => (
            <div
              key={p.id}
              style={{
                ...getPositionStyle(p.position),
                background: "#FFF",
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
                width: `${p.width || 500}px`,
                maxWidth: "90vw",
              }}
            >
              <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 12px", borderBottom: "1px solid #EEE" }}>
                {p.showOnce && (
                  <span style={{ fontSize: 12, color: "#999", marginRight: "auto" }}>오늘 하루 보지 않기</span>
                )}
                <button
                  onClick={() => dismiss(p)}
                  style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#666", lineHeight: 1 }}
                  aria-label="닫기"
                >
                  ×
                </button>
              </div>
              <div style={{ minHeight: p.height ? `${p.height}px` : "auto" }}>
                {p.htmlContent ? (
                  <div style={{ padding: 20 }} dangerouslySetInnerHTML={{ __html: p.htmlContent }} />
                ) : p.imageUrl ? (
                  p.linkUrl ? (
                    <a href={p.linkUrl} target="_blank" rel="noopener" onClick={() => dismiss(p)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.imageUrl} alt={p.name} style={{ width: "100%", display: "block" }} />
                    </a>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt={p.name} style={{ width: "100%", display: "block" }} />
                  )
                ) : (
                  <div style={{ padding: 20, textAlign: "center", color: "#666" }}>{p.name}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
