---
phase: 12-feature-additions
plan: 01
subsystem: api, ui
tags: [sharp, webp, image-processing, resize, admin-settings]

requires:
  - phase: 11-code-cleanup-quality
    provides: clean codebase with archived scripts and ESLint rules

provides:
  - automatic image resize and WebP conversion on upload
  - admin-configurable image upload settings (max width, quality, toggle)
  - getImageUploadSettings() server function

affects: [upload, admin-settings, image-pipeline]

tech-stack:
  added: []
  patterns: [image-processing-pipeline, settings-driven-behavior]

key-files:
  created: []
  modified:
    - src/lib/supabase-server-db.ts
    - src/app/api/upload/image/route.ts
    - src/app/cam/settings/page.tsx

key-decisions:
  - "sharp를 사용한 리사이즈+WebP 변환을 워터마크 전에 적용 (리사이즈 -> WebP -> 워터마크 순서)"
  - "GIF는 애니메이션 보존을 위해 변환에서 제외"
  - "설정 실패 시 원본 이미지 그대로 업로드 (graceful fallback)"

patterns-established:
  - "Image processing pipeline: resize/convert -> watermark -> upload"

requirements-completed: [PERF-03]

duration: 3min
completed: 2026-04-01
---

# Phase 12 Plan 01: 이미지 업로드 자동 리사이즈 + WebP 변환 Summary

**sharp를 사용한 이미지 업로드 시 자동 리사이즈(최대 너비 제한) + WebP 변환, 어드민 설정 페이지에서 크기/품질 조정 가능**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-01T16:49:26Z
- **Completed:** 2026-04-01T16:52:20Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- getImageUploadSettings() 함수를 supabase-server-db.ts에 추가 (watermark 패턴과 동일)
- 이미지 업로드 3개 경로(multipart, URL rehost, proxy fallback) 모두에 리사이즈+WebP 변환 적용
- 어드민 설정 페이지에 이미지 업로드 설정 섹션 추가 (활성화 토글, 최대 크기, 품질)

## Task Commits

Each task was committed atomically:

1. **Task 1: 이미지 설정 저장/조회 함수 추가** - `785e448` (feat)
2. **Task 2: upload/image route.ts에 리사이즈 + WebP 변환 로직 삽입** - `76638fb` (feat)
3. **Task 3: 어드민 설정 페이지에 이미지 업로드 설정 섹션 추가** - `fd39274` (feat)

## Files Created/Modified
- `src/lib/supabase-server-db.ts` - ImageUploadSettings 인터페이스 + getImageUploadSettings() 함수
- `src/app/api/upload/image/route.ts` - maybeResizeAndConvert() 함수 + 3개 업로드 경로에 적용
- `src/app/cam/settings/page.tsx` - 이미지 업로드 설정 UI 섹션 (WebP 토글, 최대 크기, 품질)

## Decisions Made
- sharp를 사용한 리사이즈+WebP 변환을 워터마크 전에 적용 (리사이즈 -> WebP -> 워터마크 순서)
- GIF는 애니메이션 보존을 위해 변환에서 제외
- 설정 실패 시 원본 이미지 그대로 업로드 (graceful fallback)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 이미지 업로드 리사이즈/WebP 변환 완료, Plan 12-02로 진행 가능
- cp-image-settings 키가 site_settings 테이블에 저장됨 (첫 저장 시 자동 생성)

---
*Phase: 12-feature-additions*
*Completed: 2026-04-01*
