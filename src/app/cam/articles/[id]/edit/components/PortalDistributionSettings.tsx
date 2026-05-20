"use client";

interface PortalDistributionSettingsProps {
  distIndexNow: boolean;
  distGooglePing: boolean;
  updateDistDefaults: (key: "indexNow" | "googlePing", val: boolean) => void;
}

export function PortalDistributionSettings({
  distIndexNow,
  distGooglePing,
  updateDistDefaults,
}: PortalDistributionSettingsProps) {
  return (
    <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600 }}>포털 배포</h3>
        <span style={{ fontSize: 11, color: "#999" }}>선택 상태는 다음 작성 시에도 유지됩니다</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label
          style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "10px 14px", borderRadius: 8, cursor: "pointer",
            background: distIndexNow ? "#E3F2FD" : "#FAFAFA",
            border: `1px solid ${distIndexNow ? "#90CAF9" : "#EEE"}`,
          }}
        >
          <input
            type="checkbox"
            checked={distIndexNow}
            onChange={(e) => updateDistDefaults("indexNow", e.target.checked)}
            style={{ width: 16, height: 16, marginTop: 2 }}
          />
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>IndexNow 색인 요청</div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>게시 시 Bing, Yandex, 네이버 등에 즉시 색인 요청</div>
          </div>
        </label>
        <label
          style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "10px 14px", borderRadius: 8, cursor: "pointer",
            background: distGooglePing ? "#E3F2FD" : "#FAFAFA",
            border: `1px solid ${distGooglePing ? "#90CAF9" : "#EEE"}`,
          }}
        >
          <input
            type="checkbox"
            checked={distGooglePing}
            onChange={(e) => updateDistDefaults("googlePing", e.target.checked)}
            style={{ width: 16, height: 16, marginTop: 2 }}
          />
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>Google 사이트맵 ping</div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Google에 사이트맵 갱신 알림 전송</div>
          </div>
        </label>
      </div>
      <div style={{ fontSize: 12, color: "#999", marginTop: 10 }}>
        <a href="/cam/seo" style={{ color: "#1565C0", textDecoration: "underline" }}>SEO 설정</a>에서 API 키 등록 |
        <a href="/cam/distribute" style={{ color: "#1565C0", textDecoration: "underline", marginLeft: 4 }}>일괄 배포 관리</a>
      </div>
    </div>
  );
}
