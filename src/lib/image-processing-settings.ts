import "server-only";

import { readSiteSetting } from "@/lib/site-settings-store";
import type { WatermarkSettings } from "@/types/article";

export interface ImageUploadSettings {
  enabled: boolean;
  maxWidth: number;
  quality: number;
}

export const DEFAULT_WATERMARK_SETTINGS: WatermarkSettings = {
  enabled: false,
  type: "text",
  text: "",
  imageUrl: "",
  opacity: 0.5,
  size: 20,
  position: "bottom-right",
};

export const DEFAULT_IMAGE_UPLOAD_SETTINGS: ImageUploadSettings = {
  enabled: true,
  maxWidth: 1920,
  quality: 80,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return asRecord(parsed);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number, integer = false): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const bounded = Math.max(min, Math.min(number, max));
  return integer ? Math.trunc(bounded) : bounded;
}

function normalizeWatermarkSettings(value: unknown): WatermarkSettings {
  const data = asRecord(value);
  if (!data) return { ...DEFAULT_WATERMARK_SETTINGS };

  return {
    enabled: typeof data.enabled === "boolean" ? data.enabled : DEFAULT_WATERMARK_SETTINGS.enabled,
    type: data.type === "image" ? "image" : "text",
    text: typeof data.text === "string" ? data.text : DEFAULT_WATERMARK_SETTINGS.text,
    imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : DEFAULT_WATERMARK_SETTINGS.imageUrl,
    opacity: clampNumber(data.opacity, DEFAULT_WATERMARK_SETTINGS.opacity, 0.1, 1),
    size: clampNumber(data.size, DEFAULT_WATERMARK_SETTINGS.size, 10, 50, true),
    position: "bottom-right",
  };
}

function normalizeImageUploadSettings(value: unknown): ImageUploadSettings {
  const data = asRecord(value);
  if (!data) return { ...DEFAULT_IMAGE_UPLOAD_SETTINGS };

  return {
    enabled: typeof data.enabled === "boolean" ? data.enabled : DEFAULT_IMAGE_UPLOAD_SETTINGS.enabled,
    maxWidth: clampNumber(data.maxWidth, DEFAULT_IMAGE_UPLOAD_SETTINGS.maxWidth, 320, 4096, true),
    quality: clampNumber(data.quality, DEFAULT_IMAGE_UPLOAD_SETTINGS.quality, 1, 100, true),
  };
}

export async function getWatermarkSettings(): Promise<WatermarkSettings> {
  try {
    const stored = await readSiteSetting<unknown>("cp-watermark-settings", DEFAULT_WATERMARK_SETTINGS, {
      useServiceKey: true,
    });
    return normalizeWatermarkSettings(stored);
  } catch {
    return { ...DEFAULT_WATERMARK_SETTINGS };
  }
}

export async function getImageUploadSettings(): Promise<ImageUploadSettings> {
  try {
    const stored = await readSiteSetting<unknown>("cp-image-settings", DEFAULT_IMAGE_UPLOAD_SETTINGS, {
      useServiceKey: true,
    });
    return normalizeImageUploadSettings(stored);
  } catch {
    return { ...DEFAULT_IMAGE_UPLOAD_SETTINGS };
  }
}
