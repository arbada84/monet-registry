import type { NotificationRecord } from "@/types/article";

type LocalizableNotification = Pick<NotificationRecord, "title" | "message">;

function normalizeProvider(provider: string): string {
  if (provider.toLowerCase() === "r2") return "Cloudflare R2";
  if (provider.toLowerCase() === "supabase") return "Supabase";
  return provider;
}

export function localizeOperationalMessage(value: string): string {
  if (!value) return value;

  const trimmed = value.trim();
  const mediaStorageCron = trimmed.match(/^Media storage check failed before (auto-press|auto-news) run$/i);
  if (mediaStorageCron) {
    return mediaStorageCron[1] === "auto-press"
      ? "보도자료 자동등록 실행 전 미디어 저장소 점검 실패"
      : "자동 뉴스 발행 실행 전 미디어 저장소 점검 실패";
  }

  const unhealthyProvider = trimmed.match(/^Media storage is unhealthy \(([^)]+)\); image uploads may fail or fall back to original URLs\.$/i);
  if (unhealthyProvider) {
    return `미디어 저장소 상태가 비정상입니다(${normalizeProvider(unhealthyProvider[1])}). 이미지 업로드가 실패하거나 원본 URL로 대체될 수 있습니다.`;
  }

  const supabaseBucket = trimmed.match(/^Supabase Storage bucket '([^']+)' returned HTTP (\d+): (.+)$/i);
  if (supabaseBucket) {
    const [, bucket, status, message] = supabaseBucket;
    const quota = /quota|exceed_storage_size_quota|storage size exceeded|restricted/i.test(message);
    if (quota) {
      return `Supabase Storage 버킷 '${bucket}'이 HTTP ${status}를 반환했습니다. 저장공간 한도 초과로 프로젝트가 제한된 상태입니다. Cloudflare R2 전환이 완료되기 전까지 대량 이미지 발행을 중단하거나 Supabase 한도 해제를 진행해야 합니다.`;
    }
    return `Supabase Storage 버킷 '${bucket}' 점검이 실패했습니다(HTTP ${status}). ${message}`;
  }

  const r2Bucket = trimmed.match(/^Cloudflare R2 bucket list returned HTTP (\d+): (.+)$/i);
  if (r2Bucket) {
    const [, status, message] = r2Bucket;
    if (/enable R2|not enabled/i.test(message)) {
      return `Cloudflare R2 버킷 목록 확인이 실패했습니다(HTTP ${status}). Cloudflare 대시보드에서 R2를 먼저 활성화해야 합니다.`;
    }
    return `Cloudflare R2 버킷 목록 확인이 실패했습니다(HTTP ${status}). ${message}`;
  }

  const replacements: Array<[RegExp, string]> = [
    [/^AI 편집 실패: (.+?) — .+$/i, "AI 편집 실패: $1"],
    [/^\[auto-news\] 실행 실패: .+$/i, "자동 뉴스 실행 실패. 세부 오류는 관리자 로그를 확인하세요."],
    [/^\[auto-press\] 실행 실패: .+$/i, "보도자료 자동등록 실행 실패. 세부 오류는 관리자 로그를 확인하세요."],
    [/^Media storage is not healthy\.$/i, "미디어 저장소 상태가 정상적이지 않습니다."],
    [/^Run \/api\/cron\/media-storage-health to diagnose media storage before publishing\.$/i, "발행 전에 미디어 저장소 상태 점검을 실행하세요."],
    [/^Move new media writes to Cloudflare R2 before resuming heavy publishing, or wait for Supabase quota reset before legacy media migration\.$/i, "대량 발행을 재개하기 전에 새 이미지 저장을 Cloudflare R2로 전환하거나 Supabase 한도 초기화 이후 기존 미디어 이전을 진행하세요."],
    [/^Fix the failing media storage checks before enabling high-volume image uploads\.$/i, "대량 이미지 업로드를 켜기 전에 실패한 미디어 저장소 점검 항목을 먼저 해결하세요."],
    [/^Media storage health request failed \((\d+)\)$/i, "미디어 저장소 상태 점검 요청이 실패했습니다($1)."],
    [/^Media storage health has not been checked yet\.$/i, "미디어 저장소 상태를 아직 점검하지 않았습니다."],
    [/^Run media storage health check before high-volume publishing\.$/i, "대량 발행 전에 미디어 저장소 상태 점검을 실행하세요."],
    [/^Media storage write probe failed\.$/i, "미디어 저장소 쓰기 점검이 실패했습니다."],
    [/^Media storage health refresh failed\.$/i, "미디어 저장소 상태 새로고침이 실패했습니다."],
    [/^Write probe passed\.$/i, "쓰기 점검을 통과했습니다."],
    [/^Write probe failed\. Check provider credentials, quota, and public media URL\.$/i, "쓰기 점검이 실패했습니다. 저장소 인증정보, 사용량 한도, 공개 미디어 URL을 확인하세요."],
    [/^Try again or check server logs\.$/i, "다시 시도하거나 서버 로그를 확인하세요."],
    [/^Supabase Storage env is configured for bucket '([^']+)'\.$/i, "Supabase Storage 환경변수가 '$1' 버킷 기준으로 설정되어 있습니다."],
    [/^Supabase Storage env is missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY\.$/i, "Supabase Storage 환경변수 NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_KEY가 누락되었습니다."],
    [/^Supabase Storage bucket '([^']+)' is reachable\.$/i, "Supabase Storage 버킷 '$1'에 정상 접근했습니다."],
    [/^Supabase Storage bucket check failed\.$/i, "Supabase Storage 버킷 점검이 실패했습니다."],
    [/^Supabase Storage probe failed: (.+)$/i, "Supabase Storage 점검이 실패했습니다: $1"],
    [/^R2 env is configured for bucket '([^']+)'\.$/i, "Cloudflare R2 환경변수가 '$1' 버킷 기준으로 설정되어 있습니다."],
    [/^R2 env is incomplete: missing (.+)\.$/i, "Cloudflare R2 환경변수가 불완전합니다. 누락 항목: $1."],
    [/^Cloudflare API env is missing, so R2 account\/bucket status could not be verified\.$/i, "Cloudflare API 환경변수가 없어 R2 계정/버킷 상태를 확인하지 못했습니다."],
    [/^Cloudflare R2 bucket '([^']+)' exists\.$/i, "Cloudflare R2 버킷 '$1'이 존재합니다."],
    [/^Cloudflare R2 is enabled, but bucket '([^']+)' was not found\.$/i, "Cloudflare R2는 활성화되어 있지만 '$1' 버킷을 찾지 못했습니다."],
    [/^Cloudflare R2 dashboard probe failed: (.+)$/i, "Cloudflare R2 대시보드 점검이 실패했습니다: $1"],
    [/^Enable R2 once in the Cloudflare dashboard, then rerun Cloudflare bootstrap to create\/verify media buckets\.$/i, "Cloudflare 대시보드에서 R2를 한 번 활성화한 뒤 Cloudflare bootstrap을 다시 실행해 미디어 버킷을 생성/확인하세요."],
    [/^Create the configured R2 bucket or update CLOUDFLARE_R2_PROD_BUCKET\/R2_BUCKET before switching MEDIA_STORAGE_PROVIDER=r2\.$/i, "MEDIA_STORAGE_PROVIDER=r2로 전환하기 전에 설정된 R2 버킷을 생성하거나 CLOUDFLARE_R2_PROD_BUCKET/R2_BUCKET 값을 수정하세요."],
    [/^Media storage write probe was requested, but the active provider is not fully configured\.$/i, "미디어 저장소 쓰기 점검을 요청했지만 활성 저장소 설정이 완료되지 않았습니다."],
    [/^Media storage write probe upload failed\. Check provider write credentials and quota\.$/i, "미디어 저장소 쓰기 점검 업로드가 실패했습니다. 쓰기 인증정보와 사용량 한도를 확인하세요."],
    [/^Media storage write probe uploaded and is publicly readable at (.+)$/i, "미디어 저장소 쓰기 점검 파일을 업로드했고 공개 접근도 확인했습니다: $1"],
    [/^Media storage write probe uploaded but public read returned HTTP (\d+): (.+)$/i, "미디어 저장소 쓰기 점검 파일은 업로드됐지만 공개 읽기가 실패했습니다(HTTP $1): $2"],
    [/^Fix the public media domain\/base URL before switching high-volume uploads to this provider\.$/i, "대량 업로드를 이 저장소로 전환하기 전에 공개 미디어 도메인/base URL을 먼저 수정하세요."],
    [/^Media storage write probe failed: (.+)$/i, "미디어 저장소 쓰기 점검이 실패했습니다: $1"],
  ];

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(trimmed)) return trimmed.replace(pattern, replacement);
  }

  return value;
}

export function localizeOperationalMessages(values: string[]): string[] {
  return values.map(localizeOperationalMessage);
}

export function localizeNotificationText<T extends LocalizableNotification>(notification: T): T {
  return {
    ...notification,
    title: localizeOperationalMessage(notification.title),
    message: localizeOperationalMessage(notification.message),
  };
}
