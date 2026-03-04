/**
 * FloatingAds — 플로팅 광고 렌더링 (서버 컴포넌트)
 * floating-left / floating-right 포지션 AdBanner를 화면 양쪽에 고정 표시
 */
import AdBanner from "@/components/ui/AdBanner";

export default function FloatingAds() {
  return (
    <>
      {/* 왼쪽 플로팅 광고 */}
      <div
        style={{
          position: "fixed",
          left: 8,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 50,
          width: 120,
          pointerEvents: "none",
        }}
      >
        <div style={{ pointerEvents: "auto" }}>
          <AdBanner position="floating-left" height={250} />
        </div>
      </div>

      {/* 오른쪽 플로팅 광고 */}
      <div
        style={{
          position: "fixed",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 50,
          width: 120,
          pointerEvents: "none",
        }}
      >
        <div style={{ pointerEvents: "auto" }}>
          <AdBanner position="floating-right" height={250} />
        </div>
      </div>
    </>
  );
}
