---
phase: 07-article-audit
plan: 02
subsystem: scripts
tags: [audit, data-quality, articles, supabase, image-cleanup]
dependency_graph:
  requires:
    - phase: 07-01
      provides: audit-script-v2, audit-result-v2 (27건 문제 목록)
  provides:
    - audit-fix-v2.mjs (통합 수정 스크립트)
    - 최종 감사 결과 0건 (AUD-01~AUD-05 달성)
  affects: []
tech_stack:
  added: []
  patterns: [supabase-rest-patch, soft-delete-status, risky-domain-filter]
key_files:
  created:
    - scripts/audit-fix-v2.mjs
  modified:
    - scripts/audit-result-v2.json
key-decisions:
  - "deletedAt 필드 미존재 -- status='삭제'만으로 소프트 삭제 처리"
  - "NEWSWIRE 이미지 작은따옴표 대응 -- src 속성 큰/작은따옴표 모두 매칭"
  - "이미지 제거 후 빈 태그 잔존 -- 수정 스크립트 재실행으로 2차 정리"
patterns-established:
  - "audit-fix-v2.mjs: 감사 결과 JSON 기반 유형별 자동 수정/삭제 패턴"
requirements-completed: [AUD-01, AUD-02, AUD-03, AUD-04, AUD-05]
duration: 5min
completed: "2026-03-26"
---

# Phase 7 Plan 2: 전수 수정 및 연속 2회 감사 0건 달성 Summary

**27건 문제 기사 자동 수정/삭제 (삭제 4건 + 수정 23건) 후 연속 2회 감사 0건 달성, 최종 게시 기사 2,981건**

## Performance

- **Duration:** 5min
- **Started:** 2026-03-26T06:12:24Z
- **Completed:** 2026-03-26T06:17:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- 통합 자동 수정 스크립트 audit-fix-v2.mjs 작성 (삭제 6유형 + 수정 17유형, --dry-run 지원)
- 27건 문제 기사 모두 처리: 소프트 삭제 4건 + 본문 수정 23건
- 잔존 문제 3건 추가 수정 (이미지 제거 후 빈 태그 2건, 작은따옴표 뉴스와이어 이미지 1건)
- 연속 2회 감사에서 totalProblems=0 확인 (AUD-05 달성)
- 최종 게시 기사: 2,981건 (2,985건에서 4건 삭제)

## Task Commits

1. **Task 1: 통합 자동 수정 스크립트 작성** - `67f5a04` (feat)
2. **Task 2: 수정 실행 + 연속 2회 감사 0건 달성** - `a604ae8` (fix)

## Files Created/Modified

- `scripts/audit-fix-v2.mjs` - 감사 결과 기반 유형별 자동 수정/삭제 통합 스크립트
- `scripts/audit-result-v2.json` - 최종 감사 결과 (totalProblems: 0, totalArticles: 2981)

## Decisions Made

1. **deletedAt 필드 미존재**: DB 스키마에 deletedAt 컬럼이 없어 `status="삭제"`만으로 소프트 삭제 처리 (기존 패턴과 동일)
2. **NEWSWIRE 이미지 작은따옴표 대응**: `src='...'` 형태도 매칭하도록 정규식 수정 (`["']` 사용)
3. **이미지 제거 후 빈 태그 잔존**: 1차 수정 후 재감사에서 EMPTY_TAGS 2건 발견 -- 수정 스크립트 재실행으로 해소

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] deletedAt 필드 미존재로 삭제 실패**
- **Found during:** Task 2 (수정 실행)
- **Issue:** `{ status: "삭제", deletedAt: ... }` PATCH가 404 반환 -- articles 테이블에 deletedAt 컬럼 없음
- **Fix:** `{ status: "삭제" }`만으로 소프트 삭제하도록 수정
- **Files modified:** scripts/audit-fix-v2.mjs
- **Verification:** 4건 모두 삭제 성공 (HTTP 204)
- **Committed in:** a604ae8

**2. [Rule 1 - Bug] NEWSWIRE 이미지 작은따옴표 미매칭**
- **Found during:** Task 2 (잔존 문제 수정)
- **Issue:** #2776 기사의 img 태그가 `src='http://newswire...'` 형태 -- 큰따옴표만 매칭하는 정규식이 놓침
- **Fix:** 정규식을 `src=["']...[^"']*newswire..["']`로 수정
- **Files modified:** scripts/audit-fix-v2.mjs
- **Verification:** 재감사에서 0건 확인
- **Committed in:** a604ae8

**3. [Rule 1 - Bug] 이미지 제거 후 빈 태그 잔존**
- **Found during:** Task 2 (1차 재감사)
- **Issue:** RISKY_IMAGE 제거 후 빈 태그 3개 이상 잔존 (EMPTY_TAGS 감사에 걸림)
- **Fix:** 수정 스크립트 재실행으로 EMPTY_TAGS 처리
- **Verification:** 2차 재감사에서 0건 확인
- **Committed in:** a604ae8

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** 모두 실행 중 발견된 정상 이슈. 스크립트 로직 보강으로 해소.

## Issues Encountered

- 1차 수정 실행 후 1차 재감사에서 3건 잔존 (EMPTY_TAGS 2 + NEWSWIRE 1) -- 2차 수정으로 모두 해소

## User Setup Required

None - 데이터 수정 작업이므로 추가 설정 불필요

## Next Phase Readiness

- Phase 07 (article-audit) 완료: AUD-01~AUD-05 모두 달성
- 최종 게시 기사 2,981건, 문제 0건
- 코드 변경이 아닌 데이터 수정이므로 배포 불필요

---
*Phase: 07-article-audit*
*Completed: 2026-03-26*
