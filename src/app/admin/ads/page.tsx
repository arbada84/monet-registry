"use client";

import { useEffect, useState } from "react";

type AdPosition = "top" | "bottom" | "left" | "right" | "middle" | "article-top" | "article-bottom" | "article-inline" | "floating-left" | "floating-right";

interface AdSlot {
  id: string;
  position: AdPosition;
  name: string;
  enabled: boolean;
  provider: "adsense" | "coupang" | "image" | "script";
  // Google AdSense
  adsenseSlotId: string;
  adsenseFormat: "auto" | "horizontal" | "vertical" | "rectangle" | "in-article" | "in-feed";
  adsenseResponsive: boolean;
  // Coupang Partners
  coupangBannerId: string;
  coupangSubId: string;
  coupangTemplate: "banner" | "dynamic" | "search" | "product";
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
  adsTxtContent: string;
  globalAdEnabled: boolean;
}

const POSITION_LABELS: Record<AdPosition, string> = {
  top: "상단 (헤더 아래)",
  bottom: "하단 (푸터 위)",
  left: "좌측 사이드",
  right: "우측 사이드",
  middle: "중간 (콘텐츠 사이)",
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
  adsTxtContent: "",
  globalAdEnabled: true,
};

const DEFAULT_SLOT: Omit<AdSlot, "id"> = {
  position: "top",
  name: "",
  enabled: true,
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
  const [activeTab, setActiveTab] = useState<"global" | "slots" | "preview">("global");

  useEffect(() => {
    const g = localStorage.getItem("cp-ads-global");
    if (g) setGlobalSettings({ ...DEFAULT_GLOBAL, ...JSON.parse(g) });
    const s = localStorage.getItem("cp-ads");
    if (s) setAds(JSON.parse(s));
  }, []);

  const saveGlobal = () => {
    localStorage.setItem("cp-ads-global", JSON.stringify(globalSettings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const saveAds = (updated: AdSlot[]) => {
    setAds(updated);
    localStorage.setItem("cp-ads", JSON.stringify(updated));
  };

  const handleAddNew = () => {
    setEditing({ ...DEFAULT_SLOT, id: `ad-${Date.now()}`, name: `광고 ${ads.length + 1}` });
    setActiveTab("slots");
  };

  const handleSaveSlot = () => {
    if (!editing) return;
    const exists = ads.find((a) => a.id === editing.id);
    const updated = exists ? ads.map((a) => (a.id === editing.id ? editing : a)) : [...ads, editing];
    saveAds(updated);
    setEditing(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDelete = (id: string) => {
    if (!confirm("이 광고 슬롯을 삭제하시겠습니까?")) return;
    saveAds(ads.filter((a) => a.id !== id));
  };

  const handleToggle = (id: string) => {
    saveAds(ads.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));
  };

  const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #DDD", borderRadius: 8, outline: "none", boxSizing: "border-box" };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: "#333", marginBottom: 6 };
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
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
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={labelStyle}>템플릿 유형</label>
                        <select value={editing.coupangTemplate} onChange={(e) => setEditing({ ...editing, coupangTemplate: e.target.value as AdSlot["coupangTemplate"] })} style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}>
                          <option value="banner">배너 광고</option>
                          <option value="dynamic">다이나믹 배너</option>
                          <option value="search">검색 위젯</option>
                          <option value="product">상품 위젯</option>
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
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

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
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
                      <td style={{ padding: "12px 12px", color: "#666", fontSize: 13 }}>{POSITION_LABELS[ad.position]}</td>
                      <td style={{ padding: "12px 12px", textAlign: "center" }}>
                        <button onClick={() => handleToggle(ad.id)} style={{ padding: "3px 12px", borderRadius: 12, fontSize: 12, fontWeight: 500, border: "none", cursor: "pointer", background: ad.enabled ? "#E8F5E9" : "#F5F5F5", color: ad.enabled ? "#2E7D32" : "#999" }}>
                          {ad.enabled ? "활성" : "비활성"}
                        </button>
                      </td>
                      <td style={{ padding: "12px 12px", textAlign: "center" }}>
                        <button onClick={() => { setEditing(ad); setActiveTab("slots"); }} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, color: "#333", fontSize: 12, cursor: "pointer", marginRight: 6 }}>수정</button>
                        <button onClick={() => handleDelete(ad.id)} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #E8192C", borderRadius: 6, color: "#E8192C", fontSize: 12, cursor: "pointer" }}>삭제</button>
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
        <div style={sectionStyle}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>광고 배치 미리보기</h3>
          <div style={{ border: "2px dashed #DDD", borderRadius: 8, padding: 12, minHeight: 400 }}>
            <div style={{ background: getSlotBg("top"), border: "1px dashed #CCC", borderRadius: 4, padding: 10, textAlign: "center", fontSize: 12, color: "#666", marginBottom: 8 }}>
              상단 광고 — {getSlotInfo("top")}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ width: 100, background: getSlotBg("left"), border: "1px dashed #CCC", borderRadius: 4, padding: 8, textAlign: "center", fontSize: 11, color: "#666", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
                좌측<br />{getSlotInfo("left")}
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ background: getSlotBg("article-top"), border: "1px dashed #CCC", borderRadius: 4, padding: 8, textAlign: "center", fontSize: 12, color: "#666" }}>기사 상단 — {getSlotInfo("article-top")}</div>
                <div style={{ background: "#FAFAFA", border: "1px solid #EEE", borderRadius: 4, padding: 16, textAlign: "center", fontSize: 12, color: "#BBB" }}>기사 본문 영역</div>
                <div style={{ background: getSlotBg("article-inline"), border: "1px dashed #CCC", borderRadius: 4, padding: 8, textAlign: "center", fontSize: 12, color: "#666" }}>본문 중간 — {getSlotInfo("article-inline")}</div>
                <div style={{ background: "#FAFAFA", border: "1px solid #EEE", borderRadius: 4, padding: 16, textAlign: "center", fontSize: 12, color: "#BBB" }}>기사 본문 계속</div>
                <div style={{ background: getSlotBg("article-bottom"), border: "1px dashed #CCC", borderRadius: 4, padding: 8, textAlign: "center", fontSize: 12, color: "#666" }}>기사 하단 — {getSlotInfo("article-bottom")}</div>
                <div style={{ background: getSlotBg("middle"), border: "1px dashed #CCC", borderRadius: 4, padding: 8, textAlign: "center", fontSize: 12, color: "#666" }}>중간 콘텐츠 — {getSlotInfo("middle")}</div>
              </div>
              <div style={{ width: 100, background: getSlotBg("right"), border: "1px dashed #CCC", borderRadius: 4, padding: 8, textAlign: "center", fontSize: 11, color: "#666", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
                우측<br />{getSlotInfo("right")}
              </div>
            </div>
            <div style={{ background: getSlotBg("bottom"), border: "1px dashed #CCC", borderRadius: 4, padding: 10, textAlign: "center", fontSize: 12, color: "#666", marginTop: 8 }}>
              하단 광고 — {getSlotInfo("bottom")}
            </div>
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 16, fontSize: 12, color: "#999" }}>
            <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#E8F5E9", borderRadius: 2, marginRight: 4, verticalAlign: "middle" }} />활성 슬롯 있음</span>
            <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#F5F5F5", borderRadius: 2, marginRight: 4, verticalAlign: "middle" }} />슬롯 없음</span>
          </div>
        </div>
      )}
    </div>
  );

  function getSlotBg(position: AdPosition) {
    return ads.some((a) => a.position === position && a.enabled) ? "#E8F5E9" : "#F5F5F5";
  }

  function getSlotInfo(position: AdPosition) {
    const slots = ads.filter((a) => a.position === position && a.enabled);
    if (slots.length === 0) return "없음";
    return slots.map((s) => `${PROVIDER_LABELS[s.provider]}`).join(", ");
  }
}
