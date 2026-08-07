export const TIKTOK_REVIEW_MODE = "ui_demo" as const;
export const TIKTOK_REVIEW_INTEGRATION_STATUS = "not_connected" as const;

export const TIKTOK_REVIEW_FIXTURE = {
  displayName: "TikTok 테스트 계정",
  accountType: "fixture",
  avatarUrl: null,
  plannedScopes: ["user.info.basic", "video.upload"],
} as const;

export const TIKTOK_REVIEW_STATUS_LABELS = [
  "내부 UX prototype",
  "TikTok API 미연결",
  "TikTok 전송 안 함",
  "Production 심사 제출 금지",
] as const;

