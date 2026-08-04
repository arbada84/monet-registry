import type {
  ReviewContentChecks,
  ReviewMetadata,
  ValidationResult,
} from "@/lib/tiktok-review/types";

export const ACCEPTED_VIDEO_EXTENSIONS = [".mp4", ".mov"] as const;
export const ACCEPTED_VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime"] as const;
export const MAX_REVIEW_VIDEO_BYTES = 4 * 1024 * 1024 * 1024;
export const MAX_TITLE_LENGTH = 100;
export const MAX_CAPTION_LENGTH = 2200;
export const MAX_INTERNAL_NOTE_LENGTH = 500;

type ReviewFile = Pick<File, "name" | "size" | "type">;

export function validateReviewFile(file: ReviewFile): ValidationResult {
  const name = file.name.trim().toLowerCase();
  const hasAcceptedExtension = ACCEPTED_VIDEO_EXTENSIONS.some((extension) => name.endsWith(extension));
  const hasAcceptedMime = ACCEPTED_VIDEO_MIME_TYPES.includes(file.type.toLowerCase() as (typeof ACCEPTED_VIDEO_MIME_TYPES)[number]);
  const errors: string[] = [];

  if (!hasAcceptedExtension || !hasAcceptedMime) {
    errors.push("MP4 또는 MOV 영상만 선택할 수 있습니다. 파일 형식과 MIME 유형을 함께 확인하세요.");
  }
  if (file.size <= 0) errors.push("비어 있는 영상 파일은 사용할 수 없습니다.");
  if (file.size > MAX_REVIEW_VIDEO_BYTES) errors.push("영상 파일은 4GB 이하여야 합니다.");

  return { valid: errors.length === 0, errors };
}

export function normalizeHashtags(value: string): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const token of value.split(/[\s,]+/)) {
    const clean = token.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 50);
    if (!clean) continue;
    const key = clean.toLocaleLowerCase("ko-KR");
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(clean);
    if (normalized.length >= 30) break;
  }
  return normalized;
}

export function formatHashtags(value: string): string {
  return normalizeHashtags(value).map((tag) => `#${tag}`).join(" ");
}

export function validateReviewMetadata(metadata: ReviewMetadata): ValidationResult {
  const errors: string[] = [];
  const title = metadata.title.trim();
  const caption = metadata.caption.trim();

  if (!title) errors.push("제목을 입력하세요.");
  if (title.length > MAX_TITLE_LENGTH) errors.push(`제목은 ${MAX_TITLE_LENGTH}자 이하여야 합니다.`);
  if (!caption) errors.push("캡션을 입력하세요.");
  if (caption.length > MAX_CAPTION_LENGTH) errors.push(`캡션은 ${MAX_CAPTION_LENGTH}자 이하여야 합니다.`);
  if (!metadata.language) errors.push("콘텐츠 언어를 선택하세요.");
  if (metadata.internalNote.length > MAX_INTERNAL_NOTE_LENGTH) {
    errors.push(`내부 관리 메모는 ${MAX_INTERNAL_NOTE_LENGTH}자 이하여야 합니다.`);
  }

  return { valid: errors.length === 0, errors };
}

export function validateContentChecks(checks: ReviewContentChecks): ValidationResult {
  const errors: string[] = [];
  if (!checks.rightsConfirmed) errors.push("영상·음원·이미지·인물 사용 권리를 확인하세요.");
  if (!checks.noCopiedWatermark) errors.push("타 플랫폼 워터마크 복제물이 아님을 확인하세요.");
  if (!checks.privacyReviewed) errors.push("개인정보·민감정보 포함 여부를 확인하세요.");
  if (!checks.guidelinesReviewed) errors.push("TikTok 커뮤니티 가이드라인 확인이 필요합니다.");
  if (!checks.aiContent) errors.push("AI 생성·변형 콘텐츠 여부를 선택하세요.");
  if (!checks.commercialContent) errors.push("광고·브랜드 콘텐츠 여부를 선택하세요.");
  return { valid: errors.length === 0, errors };
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / (1024 ** unitIndex);
  return `${amount >= 10 || unitIndex === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unitIndex]}`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}

