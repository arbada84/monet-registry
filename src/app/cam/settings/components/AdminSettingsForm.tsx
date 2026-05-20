"use client";

import { useSettings } from "../hooks/useSettings";
import { BrandSettings } from "./BrandSettings";
import { CommentSettings } from "./CommentSettings";
import { ImageUploadSettings } from "./ImageUploadSettings";
import { LogoUploadSettings } from "./LogoUploadSettings";
import { RegistrationSettings } from "./RegistrationSettings";
import { SiteInfoSettings } from "./SiteInfoSettings";
import { SmtpSettingsSection } from "./SmtpSettingsSection";
import { WatermarkSettingsSection } from "./WatermarkSettingsSection";

export function AdminSettingsForm() {
  const {
    settings,
    saved,
    saveError,
    logoError,
    logoUploading,
    commentSettings,
    setCommentSettings,
    commentSaved,
    setCommentSaved,
    smtp,
    setSmtp,
    smtpSaved,
    setSmtpSaved,
    smtpSaveError,
    setSmtpSaveError,
    smtpTesting,
    setSmtpTesting,
    smtpTestResult,
    setSmtpTestResult,
    smtpPassChanged,
    setSmtpPassChanged,
    wmSettings,
    setWmSettings,
    wmSaved,
    setWmSaved,
    wmSaveError,
    setWmSaveError,
    imageSettings,
    setImageSettings,
    imgSettSaved,
    setImgSettSaved,
    imgSettSaveError,
    setImgSettSaveError,
    wmImgUploading,
    setWmImgUploading,
    wmImgError,
    setWmImgError,
    wmPreviewUrl,
    setWmPreviewUrl,
    handleChange,
    handleLogoUpload,
    handleSave,
    saveSetting,
  } = useSettings();

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
        <BrandSettings settings={settings} onChange={handleChange} />

        <LogoUploadSettings
          settings={settings}
          logoError={logoError}
          logoUploading={logoUploading}
          onLogoUpload={handleLogoUpload}
        />

        <SiteInfoSettings settings={settings} onChange={handleChange} />

        <RegistrationSettings settings={settings} onChange={handleChange} />

        <CommentSettings
          commentSettings={commentSettings}
          setCommentSettings={setCommentSettings}
          commentSaved={commentSaved}
          setCommentSaved={setCommentSaved}
          saveSetting={saveSetting}
        />

        <WatermarkSettingsSection
          wmSettings={wmSettings}
          setWmSettings={setWmSettings}
          wmSaved={wmSaved}
          setWmSaved={setWmSaved}
          wmSaveError={wmSaveError}
          setWmSaveError={setWmSaveError}
          wmImgUploading={wmImgUploading}
          setWmImgUploading={setWmImgUploading}
          wmImgError={wmImgError}
          setWmImgError={setWmImgError}
          wmPreviewUrl={wmPreviewUrl}
          setWmPreviewUrl={setWmPreviewUrl}
          saveSetting={saveSetting}
        />

        <ImageUploadSettings
          imageSettings={imageSettings}
          setImageSettings={setImageSettings}
          imgSettSaved={imgSettSaved}
          setImgSettSaved={setImgSettSaved}
          imgSettSaveError={imgSettSaveError}
          setImgSettSaveError={setImgSettSaveError}
          saveSetting={saveSetting}
        />

        <SmtpSettingsSection
          smtp={smtp}
          setSmtp={setSmtp}
          smtpSaved={smtpSaved}
          setSmtpSaved={setSmtpSaved}
          smtpSaveError={smtpSaveError}
          setSmtpSaveError={setSmtpSaveError}
          smtpTesting={smtpTesting}
          setSmtpTesting={setSmtpTesting}
          smtpTestResult={smtpTestResult}
          setSmtpTestResult={setSmtpTestResult}
          smtpPassChanged={smtpPassChanged}
          setSmtpPassChanged={setSmtpPassChanged}
          saveSetting={saveSetting}
        />

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
