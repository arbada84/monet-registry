"use client";

import { useEffect, useState } from "react";
import { getSetting, saveSetting } from "@/lib/db";
import { inputStyle, labelStyle } from "@/lib/admin-styles";

type AdPosition = "top" | "bottom" | "left" | "right" | "middle" | "home-mid-1" | "home-mid-2" | "article-top" | "article-bottom" | "article-inline" | "floating-left" | "floating-right";

type AdDevice = "all" | "pc" | "mobile";

interface AdSlot {
  id: string;
  position: AdPosition;
  name: string;
  enabled: boolean;
  device: AdDevice;
  provider: "adsense" | "coupang" | "image" | "script";
  // Google AdSense
  adsenseSlotId: string;
  adsenseFormat: "auto" | "horizontal" | "vertical" | "rectangle" | "in-article" | "in-feed";
  adsenseResponsive: boolean;
  // Coupang Partners
  coupangBannerId: string;
  coupangSubId: string;
  coupangTemplate: "banner" | "dynamic" | "search" | "product" | "carousel";
  coupangKeyword: string;
  // Image banner
  imageUrl: string;
  linkUrl: string;
  // Script
  scriptCode: string;
  // Common
  width: string;
  height: string;
  startDate: string;
  endDate: string;
  memo: string;
}

interface AdGlobalSettings {
  adsensePublisherId: string;
  adsenseAutoAds: boolean;
  adsenseAnchorAds: boolean;
  coupangPartnersId: string;
  coupangSubId: string;
  coupangAccessKey: string;
  coupangSecretKey: string;
  adsTxtContent: string;
  globalAdEnabled: boolean;
}

const POSITION_LABELS: Record<AdPosition, string> = {
  top: "상단 (헤더 아래)",
  bottom: "하단 (푸터 위)",
  left: "좌측 사이드",
  right: "우측 사이드",
  middle: "중간 (콘텐츠 사이)",
  "home-mid-1": "메인 중간 1 (히어로 하단)",
  "home-mid-2": "메인 중간 2 (뉴스그리드 하단)",
  "article-top": "기사 상단",
  "article-bottom": "기사 하단",
  "article-inline": "기사 본문 중간",
  "floating-left": "플로팅 (좌측)",
  "floating-right": "플로팅 (우측)",
};

const PROVIDER_LABELS = {
  adsense: "Google AdSense",
  coupang: "쿠팡 파트너스",
  image: "이미지 배너",
  script: "직접 스크립트",
};

const DEFAULT_GLOBAL: AdGlobalSettings = {
  adsensePublisherId: "",
  adsenseAutoAds: false,
  adsenseAnchorAds: false,
  coupangPartnersId: "",
  coupangSubId: "",
  coupangAccessKey: "",
  coupangSecretKey: "",
  adsTxtContent: "",
  globalAdEnabled: true,
};

const DEVICE_LABELS: Record<AdDevice, string> = {
  all: "전체 (PC+모바일)",
  pc: "PC 전용",
  mobile: "모바일 전용",
};

const DEFAULT_SLOT: Omit<AdSlot, "id"> = {
  position: "top",
  name: "",
  enabled: true,
  device: "all",
  provider: "adsense",
  adsenseSlotId: "",
  adsenseFormat: "auto",
  adsenseResponsive: true,
  coupangBannerId: "",
  coupangSubId: "",
  coupangTemplate: "banner",
  coupangKeyword: "",
  imageUrl: "",
  linkUrl: "",
  scriptCode: "",
  width: "728",
  height: "90",
  startDate: "",
  endDate: "",
  memo: "",
};

export default function AdminAdsPage() {
  const [globalSettings, setGlobalSettings] = useState<AdGlobalSettings>(DEFAULT_GLOBAL);
  const [ads, setAds] = useState<AdSlot[]>([]);
  const [editing, setEditing] = useState<AdSlot | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [activeTab, setActiveTab] = useState<"global" | "slots" | "preview">("global");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    getSetting<AdGlobalSettings | null>("cp-ads-global", null).then((g) => {
      if (g) setGlobalSettings({ ...DEFAULT_GLOBAL, ...g });
    });
    getSetting<AdSlot[] | null>("cp-ads", null).then((s) => {
      if (s) setAds(s);
    });
  }, []);

  const saveGlobal = async () => {
    try {
      await saveSetting("cp-ads-global", globalSettings);
      setSaved(true);
      setSaveError("");
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장에 실패했습니다. 다시 시도해주세요.");
    }
  };

  const saveAds = async (updated: AdSlot[]): Promise<boolean> => {
    setAds(updated);
    try {
      await saveSetting("cp-ads", updated);
      setSaveError("");
      return true;
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장에 실패했습니다. 다시 시도해주세요.");
      return false;
    }
  };

  const handleAddNew = () => {
    setEditing({ ...DEFAULT_SLOT, id: `ad-${Date.now()}`, name: `광고 ${ads.length + 1}` });
    setActiveTab("slots");
  };

  const handleSaveSlot = async () => {
    if (!editing) return;
    const exists = ads.find((a) => a.id === editing.id);
    const updated = exists ? ads.map((a) => (a.id === editing.id ? editing : a)) : [...ads, editing];
    const ok = await saveAds(updated);
    if (ok) {
      setEditing(null);
      setSaved(true);
      setSaveError("");
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await saveAds(ads.filter((a) => a.id !== id));
    if (ok) setConfirmDelete(null);
  };

  const handleToggle = (id: string) => {
    void saveAds(ads.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));
  };

  const hintStyle: React.CSSProperties = { fontSize: 12, color: "#999", marginTop: 4 };
  const sectionStyle: React.CSSProperties = { background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24, marginBottom: 20 };

  const tabs = [
    { key: "global" as const, label: "글로벌 설정" },
    { key: "slots" as const, label: `광고 슬롯 (${ads.length})` },
    { key: "preview" as const, label: "배치 미리보기" },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>광고 관리</h1>
        <button onClick={handleAddNew} style={{ padding: "10px 20px", background: "#E8192C", color: "#FFF", borderRadius: 8, fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer" }}>
          + 광고 슬롯 추가
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ padding: "8px 18px", fontSize: 14, fontWeight: activeTab === tab.key ? 600 : 400, color: activeTab === tab.key ? "#E8192C" : "#666", background: activeTab === tab.key ? "#FFF0F0" : "#FFF", border: `1px solid ${activeTab === tab.key ? "#E8192C" : "#DDD"}`, borderRadius: 8, cursor: "pointer" }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* === GLOBAL SETTINGS === */}
      {activeTab === "global" && (
        <div style={{ maxWidth: 640 }}>
          {/* Google AdSense */}
          <section style={sectionStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>
              <div style={{ width: 32, height: 32, background: "#4285F4", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#FFF", fontSize: 14, fontWeight: 700 }}>G</div>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>Google AdSense 설정</h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>AdSense 게시자 ID (Publisher ID)</label>
                <input type="text" value={globalSettings.adsensePublisherId} onChange={(e) => setGlobalSettings({ ...globalSettings, adsensePublisherId: e.target.value })} placeholder="ca-pub-xxxxxxxxxxxxxxxx" style={inputStyle} />
                <div style={hintStyle}>AdSense 계정의 게시자 ID입니다. AdSense 대시보드 &gt; 계정 정보에서 확인하세요.</div>
              </div>
              <div>
                <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={globalSettings.adsenseAutoAds} onChange={(e) => setGlobalSettings({ ...globalSettings, adsenseAutoAds: e.target.checked })} style={{ width: 16, height: 16 }} />
                  자동 광고 (Auto Ads) 활성화
                </label>
                <div style={hintStyle}>Google이 자동으로 최적의 위치에 광고를 배치합니다. 개별 슬롯 설정과 별도로 동작합니다.</div>
              </div>
              <div>
                <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={globalSettings.adsenseAnchorAds} onChange={(e) => setGlobalSettings({ ...globalSettings, adsenseAnchorAds: e.target.checked })} style={{ width: 16, height: 16 }} />
                  앵커 광고 (Anchor Ads) 활성화
                </label>
                <div style={hintStyle}>모바일에서 화면 상단/하단에 고정되는 광고입니다.</div>
              </div>
            </div>
          </section>

          {/* Coupang Partners */}
          <section style={sectionStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>
              <div style={{ width: 32, height: 32, background: "#E44232", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#FFF", fontSize: 12, fontWeight: 700 }}>C</div>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>쿠팡 파트너스 설정</h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>쿠팡 파트너스 AF ID</label>
                <input type="text" value={globalSettings.coupangPartnersId} onChange={(e) => setGlobalSettings({ ...globalSettings, coupangPartnersId: e.target.value })} placeholder="AF 코드 (예: AF1234567)" style={inputStyle} />
                <div style={hintStyle}>쿠팡 파트너스 &gt; 링크/배너 생성에서 확인하세요. 수수료 추적에 사용됩니다.</div>
              </div>
              <div>
                <label style={labelStyle}>기본 Sub ID</label>
                <input type="text" value={globalSettings.coupangSubId} onChange={(e) => setGlobalSettings({ ...globalSettings, coupangSubId: e.target.value })} placeholder="추적용 Sub ID (선택)" style={inputStyle} />
                <div style={hintStyle}>광고 성과 추적을 위한 보조 ID입니다. 각 슬롯에서 개별 설정도 가능합니다.</div>
              </div>
            </div>
            <div style={{ marginTop: 16, padding: 16, background: "#FFF8E1", borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#F57F17", marginBottom: 8 }}>쿠팡 Open API (자동 상품 추천)</div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>기사 키워드에 맞는 상품을 자동으로 추천합니다. 쿠팡파트너스 &gt; API 관리에서 키를 발급받으세요.</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Access Key</label>
                  <input type="text" value={globalSettings.coupangAccessKey} onChange={(e) => setGlobalSettings({ ...globalSettings, coupangAccessKey: e.target.value })} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Secret Key</label>
                  <input type="password" value={globalSettings.coupangSecretKey} onChange={(e) => setGlobalSettings({ ...globalSettings, coupangSecretKey: e.target.value })} placeholder="비밀키" style={inputStyle} />
                </div>
              </div>
              <div style={hintStyle}>환경변수(COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY)와 별도로, 여기 저장하면 API가 이 값을 우선 사용합니다.</div>
            </div>
          </section>

          {/* ads.txt */}
          <section style={sectionStyle}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>ads.txt 관리</h2>
            <div>
              <label style={labelStyle}>ads.txt 내용</label>
              <textarea value={globalSettings.adsTxtContent} onChange={(e) => setGlobalSettings({ ...globalSettings, adsTxtContent: e.target.value })} rows={6} placeholder={`google.com, pub-xxxxxxxxxxxxxxxx, DIRECT, f08c47fec0942fa0\n# 쿠팡 파트너스는 ads.txt가 필요하지 않습니다`} style={{ ...inputStyle, fontFamily: "monospace", fontSize: 13, resize: "vertical" }} />
              <div style={hintStyle}>Google AdSense 사용 시 필수입니다. AdSense 대시보드에서 제공하는 내용을 붙여넣으세요.</div>
            </div>
          </section>

          {/* Global toggle */}
          <section style={sectionStyle}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500 }}>
              <input type="checkbox" checked={globalSettings.globalAdEnabled} onChange={(e) => setGlobalSettings({ ...globalSettings, globalAdEnabled: e.target.checked })} style={{ width: 18, height: 18 }} />
              전체 광고 활성화
            </label>
            <div style={hintStyle}>비활성화하면 모든 광고가 사이트에서 숨겨집니다.</div>
          </section>

          <button onClick={saveGlobal} style={{ padding: "12px 32px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
            글로벌 설정 저장
          </button>
          {saved && <span style={{ marginLeft: 12, fontSize: 14, color: "#4CAF50", fontWeight: 500 }}>저장되었습니다!</span>}
          {saveError && (
            <div style={{ fontSize: 13, color: "#E8192C", background: "#FFF0F0", border: "1px solid #FFCDD2", borderRadius: 6, padding: "8px 12px", marginTop: 8 }}>{saveError}</div>
          )}
        </div>
      )}

      {/* === SLOT EDITOR === */}
      {activeTab === "slots" && (
        <div>
          {editing && (
            <div style={{ ...sectionStyle, maxWidth: 640 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>
                {ads.find((a) => a.id === editing.id) ? "광고 슬롯 수정" : "새 광고 슬롯"}
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={labelStyle}>광고명</label>
                  <input type="text" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} style={inputStyle} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: 16 }}>
                  <div>
                    <label style={labelStyle}>광고 제공자</label>
                    <select value={editing.provider} onChange={(e) => setEditing({ ...editing, provider: e.target.value as AdSlot["provider"] })} style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}>
                      {Object.entries(PROVIDER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>위치</label>
                    <select value={editing.position} onChange={(e) => setEditing({ ...editing, position: e.target.value as AdPosition })} style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}>
                      {Object.entries(POSITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>디바이스</label>
                    <select value={editing.device || "all"} onChange={(e) => setEditing({ ...editing, device: e.target.value as AdDevice })} style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}>
                      {Object.entries(DEVICE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <div style={hintStyle}>PC/모바일에 다른 광고를 보여주려면 같은 위치에 각각 설정</div>
                  </div>
                </div>

                {/* Google AdSense specific */}
                {editing.provider === "adsense" && (
                  <div style={{ padding: 16, background: "#F0F4FF", borderRadius: 8, display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#4285F4" }}>Google AdSense 설정</div>
                    <div>
                      <label style={labelStyle}>광고 슬롯 ID</label>
                      <input type="text" value={editing.adsenseSlotId} onChange={(e) => setEditing({ ...editing, adsenseSlotId: e.target.value })} placeholder="1234567890" style={inputStyle} />
                      <div style={hintStyle}>AdSense &gt; 광고 단위 &gt; 코드 가져오기에서 data-ad-slot 값</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 180px), 1fr))", gap: 12 }}>
                      <div>
                        <label style={labelStyle}>광고 형식</label>
                        <select value={editing.adsenseFormat} onChange={(e) => setEditing({ ...editing, adsenseFormat: e.target.value as AdSlot["adsenseFormat"] })} style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}>
                          <option value="auto">자동</option>
                          <option value="horizontal">가로형</option>
                          <option value="vertical">세로형</option>
                          <option value="rectangle">직사각형</option>
                          <option value="in-article">인아티클</option>
                          <option value="in-feed">인피드</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8, marginTop: 22 }}>
                          <input type="checkbox" checked={editing.adsenseResponsive} onChange={(e) => setEditing({ ...editing, adsenseResponsive: e.target.checked })} style={{ width: 16, height: 16 }} />
                          반응형 광고
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* Coupang Partners specific */}
                {editing.provider === "coupang" && (
                  <div style={{ padding: 16, background: "#FFF5F4", borderRadius: 8, display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#E44232" }}>쿠팡 파트너스 설정</div>
                    <div>
                      <label style={labelStyle}>배너/위젯 ID</label>
                      <input type="text" value={editing.coupangBannerId} onChange={(e) => setEditing({ ...editing, coupangBannerId: e.target.value })} placeholder="쿠팡 파트너스에서 생성한 배너 ID" style={inputStyle} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 180px), 1fr))", gap: 12 }}>
                      <div>
                        <label style={labelStyle}>템플릿 유형</label>
                        <select value={editing.coupangTemplate} onChange={(e) => setEditing({ ...editing, coupangTemplate: e.target.value as AdSlot["coupangTemplate"] })} style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}>
                          <option value="banner">배너 광고</option>
                          <option value="dynamic">다이나믹 배너</option>
                          <option value="search">검색 위젯</option>
                          <option value="product">상품 위젯</option>
                          <option value="carousel">캐러셀</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Sub ID (개별)</label>
                        <input type="text" value={editing.coupangSubId} onChange={(e) => setEditing({ ...editing, coupangSubId: e.target.value })} placeholder="이 슬롯 전용 Sub ID" style={inputStyle} />
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>키워드 (다이나믹/검색 위젯용)</label>
                      <input type="text" value={editing.coupangKeyword} onChange={(e) => setEditing({ ...editing, coupangKeyword: e.target.value })} placeholder="노출할 상품 관련 키워드" style={inputStyle} />
                      <div style={hintStyle}>다이나믹 배너, 검색 위젯에서 관련 상품을 표시할 키워드입니다.</div>
                    </div>
                  </div>
                )}

                {editing.provider === "image" && (
                  <>
                    <div>
                      <label style={labelStyle}>이미지 URL</label>
                      <input type="text" value={editing.imageUrl} onChange={(e) => setEditing({ ...editing, imageUrl: e.target.value })} placeholder="https://..." style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>링크 URL</label>
                      <input type="text" value={editing.linkUrl} onChange={(e) => setEditing({ ...editing, linkUrl: e.target.value })} placeholder="클릭 시 이동 URL" style={inputStyle} />
                    </div>
                  </>
                )}

                {editing.provider === "script" && (
                  <div>
                    <label style={labelStyle}>광고 스크립트 코드</label>
                    <textarea value={editing.scriptCode} onChange={(e) => setEditing({ ...editing, scriptCode: e.target.value })} rows={6} style={{ ...inputStyle, fontFamily: "monospace", fontSize: 13, resize: "vertical" }} />
                  </div>
                )}

                {!editing.adsenseResponsive && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: 16 }}>
                    <div>
                      <label style={labelStyle}>너비 (px)</label>
                      <input type="text" value={editing.width} onChange={(e) => setEditing({ ...editing, width: e.target.value })} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>높이 (px)</label>
                      <input type="text" value={editing.height} onChange={(e) => setEditing({ ...editing, height: e.target.value })} style={inputStyle} />
                    </div>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: 16 }}>
                  <div>
                    <label style={labelStyle}>시작일 (선택)</label>
                    <input type="date" value={editing.startDate} onChange={(e) => setEditing({ ...editing, startDate: e.target.value })} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>종료일 (선택)</label>
                    <input type="date" value={editing.endDate} onChange={(e) => setEditing({ ...editing, endDate: e.target.value })} style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>메모</label>
                  <input type="text" value={editing.memo} onChange={(e) => setEditing({ ...editing, memo: e.target.value })} placeholder="관리용 메모" style={inputStyle} />
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <button onClick={handleSaveSlot} style={{ padding: "10px 24px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>저장</button>
                  <button onClick={() => setEditing(null)} style={{ padding: "10px 24px", background: "#FFF", color: "#333", border: "1px solid #DDD", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>취소</button>
                  {saved && <span style={{ fontSize: 14, color: "#4CAF50", fontWeight: 500, alignSelf: "center" }}>저장됨!</span>}
                </div>
                {saveError && (
                  <div style={{ fontSize: 13, color: "#E8192C", background: "#FFF0F0", border: "1px solid #FFCDD2", borderRadius: 6, padding: "8px 12px", marginTop: 4 }}>{saveError}</div>
                )}
              </div>
            </div>
          )}

          {/* Slot list */}
          <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
            {ads.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#999", fontSize: 14 }}>등록된 광고 슬롯이 없습니다.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
                    <th style={{ padding: "10px 20px", textAlign: "left", fontWeight: 500, color: "#666" }}>광고명</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 500, color: "#666" }}>제공자</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 500, color: "#666" }}>위치</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", fontWeight: 500, color: "#666" }}>상태</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", fontWeight: 500, color: "#666", width: 160 }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {ads.map((ad) => (
                    <tr key={ad.id} style={{ borderBottom: "1px solid #EEE" }}>
                      <td style={{ padding: "12px 20px" }}>
                        <div style={{ fontWeight: 500 }}>{ad.name}</div>
                        {ad.memo && <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{ad.memo}</div>}
                      </td>
                      <td style={{ padding: "12px 12px" }}>
                        <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 500, background: ad.provider === "adsense" ? "#E8F0FE" : ad.provider === "coupang" ? "#FFF0EE" : "#F5F5F5", color: ad.provider === "adsense" ? "#1967D2" : ad.provider === "coupang" ? "#E44232" : "#666" }}>
                          {PROVIDER_LABELS[ad.provider]}
                        </span>
                      </td>
                      <td style={{ padding: "12px 12px", color: "#666", fontSize: 13 }}>
                        {POSITION_LABELS[ad.position]}
                        {ad.device && ad.device !== "all" && (
                          <span style={{ display: "inline-block", marginLeft: 4, padding: "1px 6px", borderRadius: 8, fontSize: 10, background: ad.device === "mobile" ? "#E3F2FD" : "#FFF3E0", color: ad.device === "mobile" ? "#1565C0" : "#E65100" }}>
                            {ad.device === "mobile" ? "모바일" : "PC"}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "12px 12px", textAlign: "center" }}>
                        <button onClick={() => handleToggle(ad.id)} style={{ padding: "3px 12px", borderRadius: 12, fontSize: 12, fontWeight: 500, border: "none", cursor: "pointer", background: ad.enabled ? "#E8F5E9" : "#F5F5F5", color: ad.enabled ? "#2E7D32" : "#999" }}>
                          {ad.enabled ? "활성" : "비활성"}
                        </button>
                      </td>
                      <td style={{ padding: "12px 12px", textAlign: "center" }}>
                        <button onClick={() => { setEditing(ad); setActiveTab("slots"); }} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, color: "#333", fontSize: 12, cursor: "pointer", marginRight: 6 }}>수정</button>
                        {confirmDelete === ad.id ? (
                          <>
                            <button onClick={() => handleDelete(ad.id)} style={{ padding: "4px 12px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", marginRight: 4 }}>삭제</button>
                            <button onClick={() => setConfirmDelete(null)} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>취소</button>
                          </>
                        ) : (
                          <button onClick={() => setConfirmDelete(ad.id)} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #E8192C", borderRadius: 6, color: "#E8192C", fontSize: 12, cursor: "pointer" }}>삭제</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* === PREVIEW === */}
      {activeTab === "preview" && (
        <PreviewTab ads={ads} saveAds={saveAds} />
      )}
    </div>
  );

}

/* ── 배치 미리보기 탭 (3화면 + 드래그앤드롭) ── */
type PreviewPage = "home" | "list" | "article";
const PAGE_LABELS: Record<PreviewPage, string> = { home: "메인 (프론트)", list: "뉴스 리스트", article: "기사 본문" };

const PAGE_POSITIONS: Record<PreviewPage, { position: AdPosition; label: string; area?: string }[]> = {
  home: [
    { position: "top", label: "상단 배너", area: "header" },
    { position: "home-mid-1", label: "히어로 하단", area: "hero" },
    { position: "home-mid-2", label: "뉴스그리드 하단", area: "grid" },
    { position: "middle", label: "중간 콘텐츠", area: "content" },
    { position: "bottom", label: "하단 배너", area: "footer" },
    { position: "floating-left", label: "플로팅 좌측", area: "float" },
    { position: "floating-right", label: "플로팅 우측", area: "float" },
  ],
  list: [
    { position: "top", label: "상단 배너", area: "header" },
    { position: "middle", label: "리스트 중간", area: "content" },
    { position: "right", label: "우측 사이드바", area: "sidebar" },
    { position: "bottom", label: "하단 배너", area: "footer" },
  ],
  article: [
    { position: "top", label: "상단 배너", area: "header" },
    { position: "article-top", label: "기사 상단", area: "article" },
    { position: "article-inline", label: "본문 중간", area: "article" },
    { position: "article-bottom", label: "기사 하단", area: "article" },
    { position: "right", label: "우측 사이드바", area: "sidebar" },
    { position: "bottom", label: "하단 배너", area: "footer" },
    { position: "floating-left", label: "플로팅 좌측", area: "float" },
    { position: "floating-right", label: "플로팅 우측", area: "float" },
  ],
};

function PreviewTab({ ads, saveAds }: { ads: AdSlot[]; saveAds: (updated: AdSlot[]) => Promise<boolean> }) {
  const [page, setPage] = useState<PreviewPage>("home");
  const [dragId, setDragId] = useState<string | null>(null);

  const slotsByPos = (pos: AdPosition) => ads.filter((a) => a.position === pos && a.enabled);

  const handleDrop = async (targetPos: AdPosition) => {
    if (!dragId) return;
    const updated = ads.map((a) => a.id === dragId ? { ...a, position: targetPos } : a);
    await saveAds(updated);
    setDragId(null);
  };

  const handleRemoveFromPosition = async (adId: string) => {
    // 광고를 현재 페이지에서 미배치 상태로 변경 (position을 빈 문자열이 아니라 기존 유지하되 enabled=false 처리는 아니고, 미배치 영역 표시)
    // 실제로는 position을 "unassigned" (임시) 로 변경 → 미배치 목록에 표시
    const updated = ads.map((a) => a.id === adId ? { ...a, position: "" as AdPosition } : a);
    await saveAds(updated);
  };

  const slotBadge = (ad: AdSlot, showRemove = false) => {
    const colors: Record<string, { bg: string; fg: string }> = {
      adsense: { bg: "#E8F0FE", fg: "#1967D2" },
      coupang: { bg: "#FFF0EE", fg: "#E44232" },
      image: { bg: "#F3E8FF", fg: "#7C3AED" },
      script: { bg: "#F5F5F5", fg: "#666" },
    };
    const c = colors[ad.provider] || colors.script;
    return (
      <div key={ad.id}
        draggable
        onDragStart={() => setDragId(ad.id)}
        onDragEnd={() => setDragId(null)}
        style={{
          padding: "6px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500,
          background: c.bg, color: c.fg, cursor: "grab", border: `1px solid ${c.fg}22`,
          display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: 10 }}>⠿</span>
        {ad.name}
        <span style={{ fontSize: 10, opacity: 0.7 }}>({PROVIDER_LABELS[ad.provider]})</span>
        {ad.width && ad.height && <span style={{ fontSize: 9, opacity: 0.5 }}>{ad.width}×{ad.height}</span>}
        {showRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); handleRemoveFromPosition(ad.id); }}
            title="이 위치에서 제거"
            style={{
              marginLeft: 4, padding: "0 4px", fontSize: 12, lineHeight: 1,
              background: "transparent", border: "none", color: c.fg, cursor: "pointer",
              opacity: 0.6, fontWeight: 700,
            }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "0.6"; }}
          >
            ✕
          </button>
        )}
      </div>
    );
  };

  const dropZone = (pos: AdPosition, label: string, minH = 50) => {
    const slots = slotsByPos(pos);
    const isOver = dragId !== null;
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "#E8192C"; }}
        onDragLeave={(e) => { e.currentTarget.style.borderColor = slots.length > 0 ? "#A5D6A7" : "#DDD"; }}
        onDrop={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = slots.length > 0 ? "#A5D6A7" : "#DDD"; handleDrop(pos); }}
        style={{
          minHeight: minH, padding: 8, borderRadius: 6,
          border: `2px dashed ${slots.length > 0 ? "#A5D6A7" : "#DDD"}`,
          background: slots.length > 0 ? "#F1F8E9" : isOver ? "#FFF8E1" : "#FAFAFA",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
          transition: "all 0.15s",
        }}
      >
        <div style={{ fontSize: 10, color: "#999", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {label} ({POSITION_LABELS[pos]})
        </div>
        {slots.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center" }}>
            {slots.map((s) => slotBadge(s, true))}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "#CCC" }}>광고를 여기에 드래그하세요</div>
        )}
      </div>
    );
  };

  const contentBlock = (text: string, h = 60) => (
    <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 4, padding: 12, minHeight: h, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#BBB" }}>
      {text}
    </div>
  );

  // 미배치 광고
  const positions = PAGE_POSITIONS[page];
  const pagePositionSet = new Set(positions.map((p) => p.position));
  const unassigned = ads.filter((a) => a.enabled && !pagePositionSet.has(a.position));

  return (
    <div>
      {/* 화면 선택 탭 */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {(Object.keys(PAGE_LABELS) as PreviewPage[]).map((p) => (
          <button key={p} onClick={() => setPage(p)} style={{
            padding: "8px 18px", fontSize: 13, fontWeight: page === p ? 600 : 400,
            color: page === p ? "#FFF" : "#666", background: page === p ? "#E8192C" : "#FFF",
            border: `1px solid ${page === p ? "#E8192C" : "#DDD"}`, borderRadius: 8, cursor: "pointer",
          }}>
            {PAGE_LABELS[p]}
          </button>
        ))}
      </div>

      {/* 레이아웃 미리보기 */}
      <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 16, minHeight: 500 }}>
        <div style={{ background: "#333", borderRadius: "6px 6px 0 0", padding: "8px 16px", color: "#FFF", fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
          {PAGE_LABELS[page]} — culturepeople.co.kr
        </div>

        {/* 공통 상단 */}
        {contentBlock("🔴 컬처피플 헤더 / 네비게이션", 40)}
        <div style={{ marginTop: 8 }}>{dropZone("top", "상단 배너")}</div>

        {/* 메인 페이지 */}
        {page === "home" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {contentBlock("🖼️ 히어로 슬라이더 (주요 뉴스 5개)", 100)}
            {dropZone("home-mid-1", "히어로 하단")}
            {contentBlock("📰 최신 뉴스 그리드 (8개)", 120)}
            {dropZone("home-mid-2", "뉴스그리드 하단")}
            {contentBlock("📂 카테고리별 뉴스", 100)}
            {dropZone("middle", "중간 콘텐츠")}
            {contentBlock("📝 텍스트 뉴스 링크", 60)}
          </div>
        )}

        {/* 리스트 페이지 */}
        {page === "list" && (
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              {contentBlock("📰 기사 카드 1", 50)}
              {contentBlock("📰 기사 카드 2", 50)}
              {contentBlock("📰 기사 카드 3", 50)}
              {dropZone("middle", "리스트 중간")}
              {contentBlock("📰 기사 카드 4", 50)}
              {contentBlock("📰 기사 카드 5", 50)}
              {contentBlock("📰 기사 카드 6", 50)}
            </div>
            <div style={{ width: 200, display: "flex", flexDirection: "column", gap: 8 }}>
              {contentBlock("🔍 검색", 40)}
              {dropZone("right", "사이드바")}
              {contentBlock("🏷️ 인기 태그", 60)}
            </div>
          </div>
        )}

        {/* 기사 본문 페이지 */}
        {page === "article" && (
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              {contentBlock("📰 기사 제목 / 작성자 / 날짜", 50)}
              {contentBlock("🖼️ 대표 이미지", 80)}
              {dropZone("article-top", "기사 상단")}
              {contentBlock("본문 단락 1~3", 80)}
              {dropZone("article-inline", "본문 중간")}
              {contentBlock("본문 단락 4~", 80)}
              {dropZone("article-bottom", "기사 하단")}
              {contentBlock("🏷️ 태그 / 공유 / 기자정보", 50)}
              {contentBlock("💬 댓글 섹션", 60)}
            </div>
            <div style={{ width: 200, display: "flex", flexDirection: "column", gap: 8 }}>
              {contentBlock("📊 인기 기사 TOP10", 100)}
              {dropZone("right", "사이드바")}
              {contentBlock("📂 관련 기사", 80)}
            </div>
          </div>
        )}

        {/* 공통 하단 */}
        <div style={{ marginTop: 8 }}>{dropZone("bottom", "하단 배너")}</div>
        {contentBlock("📋 컬처피플 푸터", 40)}

        {/* 플로팅 (home, article만) */}
        {(page === "home" || page === "article") && (
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <div style={{ flex: 1 }}>{dropZone("floating-left", "플로팅 좌측")}</div>
            <div style={{ flex: 1 }}>{dropZone("floating-right", "플로팅 우측")}</div>
          </div>
        )}
      </div>

      {/* 미배치 광고 영역 (드래그 소스 + 드롭으로 제거) */}
      {ads.filter((a) => a.enabled).length > 0 && (
        <div
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "#F44336"; }}
          onDragLeave={(e) => { e.currentTarget.style.borderColor = "#EEE"; }}
          onDrop={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "#EEE"; if (dragId) { handleRemoveFromPosition(dragId); setDragId(null); } }}
          style={{ marginTop: 16, background: "#FFF", border: "2px solid #EEE", borderRadius: 10, padding: 16, transition: "border-color 0.15s" }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "#333" }}>
            등록된 광고 슬롯 — 드래그하여 위치 변경 · 여기에 드롭하면 위치 해제
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ads.filter((a) => a.enabled).map((a) => slotBadge(a))}
          </div>
          {(() => {
            const unassignedAll = ads.filter((a) => a.enabled && (!a.position || !pagePositionSet.has(a.position)));
            return unassignedAll.length > 0 ? (
              <div style={{ marginTop: 10, fontSize: 11, color: "#F57F17" }}>
                ⚠ 미배치 광고 {unassignedAll.length}개: {unassignedAll.map((a) => a.name + (a.position ? ` [${POSITION_LABELS[a.position] || a.position}]` : " [위치 없음]")).join(", ")}
              </div>
            ) : null;
          })()}
        </div>
      )}

      {/* 범례 */}
      <div style={{ marginTop: 12, display: "flex", gap: 16, fontSize: 12, color: "#999" }}>
        <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#F1F8E9", border: "2px dashed #A5D6A7", borderRadius: 2, marginRight: 4, verticalAlign: "middle" }} />광고 배치됨</span>
        <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#FAFAFA", border: "2px dashed #DDD", borderRadius: 2, marginRight: 4, verticalAlign: "middle" }} />빈 슬롯</span>
        <span>⠿ 드래그하여 위치 이동</span>
      </div>
    </div>
  );
}
