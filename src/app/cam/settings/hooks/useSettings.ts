"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { getSetting, saveSetting as persistSetting } from "@/lib/db";
import type { WatermarkSettings } from "@/types/article";
import type { SafeSmtpStatus } from "@/types/smtp";

export type SaveSetting = typeof persistSetting;
export type SettingsChangeHandler = (field: keyof SiteSettings, value: string) => void;

export interface CommentSettings {
  enabled: boolean;
}

export interface SmtpSettings {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpSecure: boolean;
  senderName: string;
  senderEmail: string;
  smtpRuntimeStatus?: SafeSmtpStatus;
}

export interface ImageUploadSettings {
  enabled: boolean;
  maxWidth: number;
  quality: number;
}

export interface SiteSettings {
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

const DEFAULT_COMMENT_SETTINGS: CommentSettings = { enabled: true };

const DEFAULT_SMTP: SmtpSettings = {
  smtpHost: "smtp.naver.com",
  smtpPort: 465,
  smtpUser: "",
  smtpPass: "",
  smtpSecure: true,
  senderName: "컬처피플",
  senderEmail: "",
};

const DEFAULT_WATERMARK: WatermarkSettings = {
  enabled: false,
  type: "text",
  text: "",
  imageUrl: "",
  opacity: 0.5,
  size: 20,
  position: "bottom-right",
};

const DEFAULT_IMAGE_SETTINGS: ImageUploadSettings = {
  enabled: true,
  maxWidth: 1920,
  quality: 80,
};

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

export function useSettings() {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [logoError, setLogoError] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [commentSettings, setCommentSettings] = useState<CommentSettings>(DEFAULT_COMMENT_SETTINGS);
  const [commentSaved, setCommentSaved] = useState(false);

  const [smtp, setSmtp] = useState<SmtpSettings>(DEFAULT_SMTP);
  const [smtpSaved, setSmtpSaved] = useState(false);
  const [smtpSaveError, setSmtpSaveError] = useState("");
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [smtpPassChanged, setSmtpPassChanged] = useState(false);

  const [wmSettings, setWmSettings] = useState<WatermarkSettings>(DEFAULT_WATERMARK);
  const [wmSaved, setWmSaved] = useState(false);
  const [wmSaveError, setWmSaveError] = useState("");

  const [imageSettings, setImageSettings] = useState<ImageUploadSettings>(DEFAULT_IMAGE_SETTINGS);
  const [imgSettSaved, setImgSettSaved] = useState(false);
  const [imgSettSaveError, setImgSettSaveError] = useState("");

  const [wmImgUploading, setWmImgUploading] = useState(false);
  const [wmImgError, setWmImgError] = useState("");
  const [wmPreviewUrl, setWmPreviewUrl] = useState("");

  useEffect(() => {
    getSetting<SiteSettings | null>("cp-site-settings", null).then((stored) => {
      if (stored) setSettings({ ...DEFAULT_SETTINGS, ...stored });
    });
    getSetting<CommentSettings | null>("cp-comment-settings", null).then((stored) => {
      if (stored) setCommentSettings({ ...DEFAULT_COMMENT_SETTINGS, ...stored });
    });
    getSetting<WatermarkSettings | null>("cp-watermark-settings", null).then((stored) => {
      if (stored) setWmSettings({ ...DEFAULT_WATERMARK, ...stored });
    });
    getSetting<SmtpSettings | null>("cp-newsletter-settings", null).then((stored) => {
      if (stored) setSmtp({ ...DEFAULT_SMTP, ...stored });
    });
    getSetting<ImageUploadSettings | null>("cp-image-settings", null).then((stored) => {
      if (stored) setImageSettings({ ...DEFAULT_IMAGE_SETTINGS, ...stored });
    });
  }, []);

  const handleChange = (field: keyof SiteSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleLogoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
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
      await persistSetting("cp-site-settings", settings);
      setSaved(true);
      setSaveError("");
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장에 실패했습니다. 다시 시도해주세요.");
    }
  };

  return {
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
    saveSetting: persistSetting,
  };
}
