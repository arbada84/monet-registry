"use client";

import { useEffect, useState } from "react";
import { getSetting, saveSetting } from "@/lib/db";
import { inputStyle, labelStyle } from "@/lib/admin-styles";
import type { WatermarkSettings } from "@/types/article";

interface CommentSettings {
  enabled: boolean;
}

const DEFAULT_COMMENT_SETTINGS: CommentSettings = { enabled: true };

const DEFAULT_WATERMARK: WatermarkSettings = {
  enabled: false,
  type: "text",
  text: "",
  imageUrl: "",
  opacity: 0.5,
  size: 20,
  position: "bottom-right",
};

interface SiteSettings {
  siteName: string;
  slogan: string;
  accentColor: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  logo: string;
  ceo: string;
  registerNo: string;
  registerDate: string;
  publisher: string;
  editor: string;
  internetRegisterNo: string;
  youthManager: string;
}

const DEFAULT_SETTINGS: SiteSettings = {
  siteName: "컬처피플",
  slogan: "문화를 전하는 사람들",
  accentColor: "#E8192C",
  address: "서울특별시 송파구 올림픽로34길 27-15, 301호(방이동)",
  phone: "",
  fax: "",
  email: "contact@culturepeople.co.kr",
  logo: "",
  ceo: "이서련",
  registerNo: "",
  registerDate: "",
  publisher: "이서련",
  editor: "이서련",
  internetRegisterNo: "",
  youthManager: "이서련",
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [logoError, setLogoError] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [commentSettings, setCommentSettings] = useState<CommentSettings>(DEFAULT_COMMENT_SETTINGS);
  const [commentSaved, setCommentSaved] = useState(false);

  // 워터마크
  const [wmSettings, setWmSettings] = useState<WatermarkSettings>(DEFAULT_WATERMARK);
  const [wmSaved, setWmSaved] = useState(false);
  const [wmSaveError, setWmSaveError] = useState("");
  const [wmImgUploading, setWmImgUploading] = useState(false);
  const [wmImgError, setWmImgError] = useState("");
  const [wmPreviewUrl, setWmPreviewUrl] = useState("");

  useEffect(() => {
    getSetting<SiteSettings | null>("cp-site-settings", null).then((stored) => {
      if (stored) {
        setSettings({ ...DEFAULT_SETTINGS, ...stored });
      }
    });
    getSetting<CommentSettings | null>("cp-comment-settings", null).then((stored) => {
      if (stored) setCommentSettings({ ...DEFAULT_COMMENT_SETTINGS, ...stored });
    });
    getSetting<WatermarkSettings | null>("cp-watermark-settings", null).then((stored) => {
      if (stored) setWmSettings({ ...DEFAULT_WATERMARK, ...stored });
    });
  }, []);

  const handleChange = (field: keyof SiteSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("이미지 파일은 2MB 이하여야 합니다.");
      e.target.value = "";
      return;
    }
    setLogoError("");
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/image?noWatermark=1", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success && data.url) {
        handleChange("logo", data.url);
      } else {
        setLogoError(data.error || "업로드에 실패했습니다.");
      }
    } catch {
      setLogoError("업로드 중 오류가 발생했습니다.");
    } finally {
      setLogoUploading(false);
      e.target.value = "";
    }
  };

  const handleSave = async () => {
    try {
      await saveSetting("cp-site-settings", settings);
      setSaved(true);
      setSaveError("");
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장에 실패했습니다. 다시 시도해주세요.");
    }
  };

  const handleCommentSave = async () => {
    try {
      await saveSetting("cp-comment-settings", commentSettings);
      setCommentSaved(true);
      setTimeout(() => setCommentSaved(false), 3000);
    } catch {
      // 저장 실패 무시
    }
  };

  return (
    <div>
      <h1
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "#111",
          marginBottom: 24,
        }}
      >
        사이트 설정
      </h1>

      <div
        style={{
          maxWidth: 640,
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {/* Brand Settings */}
        <section
          style={{
            background: "#FFFFFF",
            border: "1px solid #EEEEEE",
            borderRadius: 10,
            padding: 24,
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#111",
              marginBottom: 20,
              paddingBottom: 12,
              borderBottom: "1px solid #EEEEEE",
            }}
          >
            브랜드 설정
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>사이트명</label>
              <input
                type="text"
                value={settings.siteName}
                onChange={(e) => handleChange("siteName", e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>슬로건</label>
              <input
                type="text"
                value={settings.slogan}
                onChange={(e) => handleChange("slogan", e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>악센트 컬러</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <input
                  type="color"
                  value={settings.accentColor}
                  onChange={(e) => handleChange("accentColor", e.target.value)}
                  style={{
                    width: 48,
                    height: 40,
                    border: "1px solid #DDD",
                    borderRadius: 8,
                    cursor: "pointer",
                    padding: 2,
                  }}
                />
                <span style={{ fontSize: 14, color: "#666" }}>
                  {settings.accentColor}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Logo Upload */}
        <section
          style={{
            background: "#FFFFFF",
            border: "1px solid #EEEEEE",
            borderRadius: 10,
            padding: 24,
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#111",
              marginBottom: 20,
              paddingBottom: 12,
              borderBottom: "1px solid #EEEEEE",
            }}
          >
            로고 / 마크 업로드
          </h2>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: logoError ? 8 : 16 }}>
              <input
                type="file"
                accept="image/*"
                disabled={logoUploading}
                onChange={handleLogoUpload}
                style={{ fontSize: 14 }}
              />
              {logoUploading && <span style={{ fontSize: 12, color: "#999" }}>업로드 중...</span>}
            </div>
            {logoError && (
              <div style={{ fontSize: 13, color: "#E8192C", background: "#FFF0F0", border: "1px solid #FFCDD2", borderRadius: 6, padding: "8px 12px", marginBottom: 12 }}>
                {logoError}
              </div>
            )}
            {settings.logo && (
              <div
                style={{
                  marginTop: 12,
                  padding: 16,
                  background: "#FAFAFA",
                  borderRadius: 8,
                  border: "1px solid #EEE",
                  textAlign: "center",
                }}
              >
                <img
                  src={settings.logo}
                  alt="로고 미리보기"
                  style={{ maxWidth: 200, maxHeight: 80, objectFit: "contain" }}
                />
                <div style={{ fontSize: 12, color: "#999", marginTop: 8 }}>
                  로고 미리보기
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Company Info */}
        <section
          style={{
            background: "#FFFFFF",
            border: "1px solid #EEEEEE",
            borderRadius: 10,
            padding: 24,
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#111",
              marginBottom: 20,
              paddingBottom: 12,
              borderBottom: "1px solid #EEEEEE",
            }}
          >
            회사 정보
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>주소</label>
              <input
                type="text"
                value={settings.address}
                onChange={(e) => handleChange("address", e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>전화번호</label>
                <input
                  type="text"
                  value={settings.phone}
                  onChange={(e) => handleChange("phone", e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>팩스</label>
                <input
                  type="text"
                  value={settings.fax}
                  onChange={(e) => handleChange("fax", e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>이메일</label>
              <input
                type="email"
                value={settings.email}
                onChange={(e) => handleChange("email", e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>대표이사</label>
              <input
                type="text"
                value={settings.ceo}
                onChange={(e) => handleChange("ceo", e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
        </section>

        {/* Legal / Registration Info */}
        <section
          style={{
            background: "#FFFFFF",
            border: "1px solid #EEEEEE",
            borderRadius: 10,
            padding: 24,
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#111",
              marginBottom: 20,
              paddingBottom: 12,
              borderBottom: "1px solid #EEEEEE",
            }}
          >
            법인 / 등록 정보
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>등록번호</label>
                <input
                  type="text"
                  value={settings.registerNo}
                  onChange={(e) => handleChange("registerNo", e.target.value)}
                  placeholder="서울 아 00000"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>등록일</label>
                <input
                  type="text"
                  value={settings.registerDate}
                  onChange={(e) => handleChange("registerDate", e.target.value)}
                  placeholder="2024.01.01"
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>발행인</label>
                <input
                  type="text"
                  value={settings.publisher}
                  onChange={(e) => handleChange("publisher", e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>편집인</label>
                <input
                  type="text"
                  value={settings.editor}
                  onChange={(e) => handleChange("editor", e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>인터넷신문 등록번호</label>
              <input
                type="text"
                value={settings.internetRegisterNo}
                onChange={(e) => handleChange("internetRegisterNo", e.target.value)}
                placeholder="서울 아 00000"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>청소년보호책임자</label>
              <input
                type="text"
                value={settings.youthManager}
                onChange={(e) => handleChange("youthManager", e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
        </section>

        {/* Comment Settings */}
        <section
          style={{
            background: "#FFFFFF",
            border: "1px solid #EEEEEE",
            borderRadius: 10,
            padding: 24,
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#111",
              marginBottom: 20,
              paddingBottom: 12,
              borderBottom: "1px solid #EEEEEE",
            }}
          >
            댓글 설정
          </h2>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "#333" }}>전체 댓글 기능</div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>끄면 모든 기사의 댓글 섹션이 숨겨집니다.</div>
            </div>
            <button
              onClick={async () => {
                const next = { enabled: !commentSettings.enabled };
                setCommentSettings(next);
                try {
                  await saveSetting("cp-comment-settings", next);
                  setCommentSaved(true);
                  setTimeout(() => setCommentSaved(false), 2000);
                } catch { /* ignore */ }
              }}
              style={{
                width: 52,
                height: 28,
                borderRadius: 14,
                background: commentSettings.enabled ? "#E8192C" : "#CCC",
                border: "none",
                cursor: "pointer",
                position: "relative",
                transition: "background 0.2s",
                flexShrink: 0,
              }}
              aria-label={commentSettings.enabled ? "댓글 끄기" : "댓글 켜기"}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: commentSettings.enabled ? 27 : 3,
                  width: 22,
                  height: 22,
                  background: "#FFF",
                  borderRadius: "50%",
                  transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                }}
              />
            </button>
          </div>
          {commentSaved && (
            <div style={{ fontSize: 13, color: "#4CAF50", fontWeight: 500 }}>자동 저장됨</div>
          )}
        </section>

        {/* Watermark Settings */}
        <section
          style={{
            background: "#FFFFFF",
            border: "1px solid #EEEEEE",
            borderRadius: 10,
            padding: 24,
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#111",
              marginBottom: 20,
              paddingBottom: 12,
              borderBottom: "1px solid #EEEEEE",
            }}
          >
            워터마크 설정
          </h2>

          {/* 활성/비활성 토글 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "#333" }}>이미지 워터마크</div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>켜면 이미지 업로드 시 자동으로 워터마크가 적용됩니다.</div>
            </div>
            <button
              onClick={() => setWmSettings((prev) => ({ ...prev, enabled: !prev.enabled }))}
              style={{
                width: 52,
                height: 28,
                borderRadius: 14,
                background: wmSettings.enabled ? "#E8192C" : "#CCC",
                border: "none",
                cursor: "pointer",
                position: "relative",
                transition: "background 0.2s",
                flexShrink: 0,
              }}
              aria-label={wmSettings.enabled ? "워터마크 끄기" : "워터마크 켜기"}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: wmSettings.enabled ? 27 : 3,
                  width: 22,
                  height: 22,
                  background: "#FFF",
                  borderRadius: "50%",
                  transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                }}
              />
            </button>
          </div>

          {wmSettings.enabled && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* 워터마크 타입 선택 */}
              <div>
                <label style={labelStyle}>워터마크 종류</label>
                <div style={{ display: "flex", gap: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="wmType"
                      checked={wmSettings.type === "text"}
                      onChange={() => setWmSettings((prev) => ({ ...prev, type: "text" }))}
                    />
                    텍스트
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="wmType"
                      checked={wmSettings.type === "image"}
                      onChange={() => setWmSettings((prev) => ({ ...prev, type: "image" }))}
                    />
                    이미지 (로고)
                  </label>
                </div>
              </div>

              {/* 텍스트 워터마크 */}
              {wmSettings.type === "text" && (
                <div>
                  <label style={labelStyle}>워터마크 텍스트</label>
                  <input
                    type="text"
                    value={wmSettings.text}
                    onChange={(e) => setWmSettings((prev) => ({ ...prev, text: e.target.value }))}
                    placeholder="(C) 컬처피플"
                    style={inputStyle}
                  />
                </div>
              )}

              {/* 이미지 워터마크 */}
              {wmSettings.type === "image" && (
                <div>
                  <label style={labelStyle}>워터마크 이미지</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={wmImgUploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 2 * 1024 * 1024) {
                          setWmImgError("이미지 파일은 2MB 이하여야 합니다.");
                          e.target.value = "";
                          return;
                        }
                        setWmImgError("");
                        setWmImgUploading(true);
                        try {
                          const formData = new FormData();
                          formData.append("file", file);
                          const res = await fetch("/api/upload/image?noWatermark=1", { method: "POST", body: formData });
                          const data = await res.json();
                          if (data.success && data.url) {
                            setWmSettings((prev) => ({ ...prev, imageUrl: data.url }));
                          } else {
                            setWmImgError(data.error || "업로드에 실패했습니다.");
                          }
                        } catch {
                          setWmImgError("업로드 중 오류가 발생했습니다.");
                        } finally {
                          setWmImgUploading(false);
                          e.target.value = "";
                        }
                      }}
                      style={{ fontSize: 14 }}
                    />
                    {wmImgUploading && <span style={{ fontSize: 12, color: "#999" }}>업로드 중...</span>}
                  </div>
                  {wmImgError && (
                    <div style={{ fontSize: 13, color: "#E8192C", background: "#FFF0F0", border: "1px solid #FFCDD2", borderRadius: 6, padding: "8px 12px", marginBottom: 8 }}>
                      {wmImgError}
                    </div>
                  )}
                  {wmSettings.imageUrl && (
                    <div style={{ padding: 12, background: "#FAFAFA", borderRadius: 8, border: "1px solid #EEE", textAlign: "center" }}>
                      <img
                        src={wmSettings.imageUrl}
                        alt="워터마크 이미지"
                        style={{ maxWidth: 160, maxHeight: 60, objectFit: "contain" }}
                      />
                      <div style={{ fontSize: 12, color: "#999", marginTop: 6 }}>워터마크 이미지 미리보기</div>
                    </div>
                  )}
                </div>
              )}

              {/* 투명도 */}
              <div>
                <label style={labelStyle}>투명도: {Math.round(wmSettings.opacity * 100)}%</label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={Math.round(wmSettings.opacity * 100)}
                  onChange={(e) => setWmSettings((prev) => ({ ...prev, opacity: Number(e.target.value) / 100 }))}
                  style={{ width: "100%" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#999" }}>
                  <span>10% (투명)</span>
                  <span>100% (불투명)</span>
                </div>
              </div>

              {/* 크기 비율 */}
              <div>
                <label style={labelStyle}>크기 (원본 대비): {wmSettings.size}%</label>
                <input
                  type="range"
                  min="10"
                  max="50"
                  step="5"
                  value={wmSettings.size}
                  onChange={(e) => setWmSettings((prev) => ({ ...prev, size: Number(e.target.value) }))}
                  style={{ width: "100%" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#999" }}>
                  <span>10% (작게)</span>
                  <span>50% (크게)</span>
                </div>
              </div>

              {/* 위치 (현재 고정) */}
              <div>
                <label style={labelStyle}>위치</label>
                <div style={{ fontSize: 14, color: "#666", padding: "8px 12px", background: "#F5F5F5", borderRadius: 6 }}>
                  하단 우측 (고정)
                </div>
              </div>

              {/* 미리보기 테스트 */}
              <div>
                <label style={labelStyle}>워터마크 미리보기 테스트</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={async () => {
                      setWmPreviewUrl("");
                      // 먼저 설정 저장
                      try {
                        await saveSetting("cp-watermark-settings", wmSettings);
                      } catch { /* ignore */ }
                      // 테스트 이미지 생성 (600x400 회색 배경)
                      const canvas = document.createElement("canvas");
                      canvas.width = 600;
                      canvas.height = 400;
                      const ctx = canvas.getContext("2d");
                      if (ctx) {
                        // 그래디언트 배경
                        const grad = ctx.createLinearGradient(0, 0, 600, 400);
                        grad.addColorStop(0, "#667eea");
                        grad.addColorStop(1, "#764ba2");
                        ctx.fillStyle = grad;
                        ctx.fillRect(0, 0, 600, 400);
                        ctx.fillStyle = "#FFF";
                        ctx.font = "bold 24px sans-serif";
                        ctx.textAlign = "center";
                        ctx.fillText("워터마크 테스트 이미지", 300, 200);
                      }
                      canvas.toBlob(async (blob) => {
                        if (!blob) return;
                        const formData = new FormData();
                        formData.append("file", blob, "test.png");
                        try {
                          const res = await fetch("/api/upload/image", { method: "POST", body: formData });
                          const data = await res.json();
                          if (data.success && data.url) {
                            setWmPreviewUrl(data.url);
                          }
                        } catch { /* ignore */ }
                      }, "image/png");
                    }}
                    style={{
                      padding: "8px 16px",
                      fontSize: 13,
                      fontWeight: 500,
                      background: "#F5F5F5",
                      border: "1px solid #DDD",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    미리보기 생성
                  </button>
                  <span style={{ fontSize: 12, color: "#999" }}>설정 저장 후 테스트 이미지에 워터마크를 적용합니다.</span>
                </div>
                {wmPreviewUrl && (
                  <div style={{ marginTop: 12, padding: 12, background: "#FAFAFA", borderRadius: 8, border: "1px solid #EEE", textAlign: "center" }}>
                    <img
                      src={wmPreviewUrl}
                      alt="워터마크 미리보기"
                      style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 6 }}
                    />
                    <div style={{ fontSize: 12, color: "#999", marginTop: 6 }}>워터마크 적용 결과</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 워터마크 저장 버튼 */}
          <div style={{ marginTop: 16 }}>
            <button
              onClick={async () => {
                try {
                  await saveSetting("cp-watermark-settings", wmSettings);
                  setWmSaved(true);
                  setWmSaveError("");
                  setTimeout(() => setWmSaved(false), 3000);
                } catch (e) {
                  setWmSaveError(e instanceof Error ? e.message : "저장에 실패했습니다.");
                }
              }}
              style={{
                padding: "10px 24px",
                background: "#E8192C",
                color: "#FFF",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              워터마크 설정 저장
            </button>
            {wmSaved && (
              <span style={{ marginLeft: 12, fontSize: 14, color: "#4CAF50", fontWeight: 500 }}>
                저장되었습니다!
              </span>
            )}
            {wmSaveError && (
              <div style={{ fontSize: 13, color: "#E8192C", background: "#FFF0F0", border: "1px solid #FFCDD2", borderRadius: 6, padding: "8px 12px", marginTop: 8 }}>
                {wmSaveError}
              </div>
            )}
          </div>
        </section>

        {/* Save Button */}
        <div>
          <button
            onClick={handleSave}
            style={{
              padding: "12px 32px",
              background: "#E8192C",
              color: "#FFF",
              border: "none",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            저장
          </button>
          {saved && (
            <span
              style={{
                marginLeft: 12,
                fontSize: 14,
                color: "#4CAF50",
                fontWeight: 500,
              }}
            >
              저장되었습니다!
            </span>
          )}
          {saveError && (
            <div style={{ fontSize: 13, color: "#E8192C", background: "#FFF0F0", border: "1px solid #FFCDD2", borderRadius: 6, padding: "8px 12px", marginTop: 12 }}>
              {saveError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
