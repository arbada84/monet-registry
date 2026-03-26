---
phase: 04-automation
plan: 02
subsystem: cron-automation
tags: [bugfix, imap, self-fetch, og-image, keywords]
dependency_graph:
  requires:
    - phase: 04-01
      provides: ai-edit-safe, timing-safe-cron
  provides:
    - mail-sync-direct-call
    - decrypt-error-isolation
    - og-recursion-defense
    - keywords-limit
  affects: [auto-press, auto-news, mail-sync]
tech_stack:
  added: []
  patterns: [core-module-extraction, dynamic-import-for-direct-call]
key_files:
  created:
    - src/app/api/mail/sync/core.ts
  modified:
    - src/app/api/mail/sync/route.ts
    - src/app/api/cron/auto-press/route.ts
    - src/app/api/cron/auto-news/route.ts
key_decisions:
  - "mail/sync 핵심 로직을 core.ts로 분리 (Next.js route export 제약 우회)"
  - "OG 재귀 참조 제거 — thumbnail 없으면 빈 상태로 등록 (OG API가 기본 이미지 사용)"
patterns-established:
  - "Route core extraction: 다른 route에서 호출 필요한 로직은 core.ts로 분리"
requirements-completed: [AUT-02, AUT-03]
duration: 21min
completed: "2026-03-26T02:31:00Z"
---

# Phase 04 Plan 02: 자동화 파이프라인 중간/낮은 우선순위 버그 수정 Summary

**auto-press self-fetch 제거 + IMAP decrypt 에러 격리 + OG 재귀 방어 + keywords 제한 -- 총 4건 버그 수정 + Vercel 배포**

## Performance

- **Duration:** 21min
- **Started:** 2026-03-26T02:10:03Z
- **Completed:** 2026-03-26T02:31:00Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- BUG-08: IMAP decrypt 실패 시 해당 계정만 건너뜀 (전체 크래시 방지)
- BUG-03: auto-press mail/sync self-fetch 제거, runMailSync 직접 함수 호출로 교체
- BUG-06: auto-news OG 이미지 재귀 참조 방어 (thumbnail 없으면 /api/og?id= 설정 제거)
- BUG-07: auto-press keywords GET 파라미터에 50자/20개 제한 추가
- BUG-05: reviewNote 확인 -- 이미 양쪽 모두 "3회 재시도 소진"으로 일치

## Task Commits

Each task was committed atomically:

1. **Task 1: BUG-08 decrypt 에러 격리 + BUG-03 mail/sync 직접 호출** - `bf5913a` (fix)
2. **Task 2: BUG-06 OG 재귀 방어 + BUG-07 keywords 제한 + 배포** - `be9c901` (fix)

## Files Created/Modified
- `src/app/api/mail/sync/core.ts` - 메일 동기화 핵심 로직 (runMailSync export, decrypt 에러 격리 포함)
- `src/app/api/mail/sync/route.ts` - 인증 + runMailSync 래퍼로 경량화
- `src/app/api/cron/auto-press/route.ts` - self-fetch 제거, runMailSync 직접 import + keywords 제한
- `src/app/api/cron/auto-news/route.ts` - OG 재귀 참조 코드 제거

## Decisions Made
- mail/sync 핵심 로직을 core.ts로 분리: Next.js App Router는 route 파일에서 HTTP 메서드/config 외 export를 허용하지 않으므로, 별도 core.ts 모듈로 추출하여 auto-press에서 dynamic import
- OG 재귀 참조 제거: thumbnail 없는 기사에 /api/og?id= URL을 설정하면 OG API가 다시 thumbnail을 참조하여 무한 루프 위험. thumbnail 없이 등록하면 OG API가 기본 사이트 이미지 사용

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Next.js route export 제약으로 core.ts 분리**
- **Found during:** Task 1
- **Issue:** Plan은 runMailSync를 route.ts에서 export하도록 지시했으나, Next.js App Router가 route 파일의 비-HTTP export를 타입 에러로 거부
- **Fix:** 핵심 로직을 `src/app/api/mail/sync/core.ts`로 분리, route.ts는 인증 래퍼로 경량화
- **Files modified:** src/app/api/mail/sync/core.ts (신규), src/app/api/mail/sync/route.ts
- **Verification:** pnpm build 성공
- **Committed in:** bf5913a

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** 파일 구조만 변경, 동일한 기능 달성. 스코프 변경 없음.

## Issues Encountered
- Next.js App Router route.ts에서 비-HTTP 함수 export 시 빌드 타입 에러 발생 -- core.ts 분리로 해결

## Verification Results

1. `pnpm build` -- 성공
2. `grep "fetch.*mail/sync" auto-press/route.ts` -- 결과 없음 (self-fetch 제거 확인)
3. `grep "api/og?id=" auto-news/route.ts` -- 결과 없음 (OG 재귀 참조 제거 확인)
4. decrypt가 try/catch 내부에 있음 확인
5. Vercel 프로덕션 배포 성공: https://culturepeople.co.kr

## Known Stubs

None -- 모든 수정이 완전히 적용됨.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 04 자동화 파이프라인 전체 완료 (Plan 01 CRITICAL + Plan 02 MEDIUM/LOW)
- auto-news, auto-press, mail/sync 3개 시스템 모두 안정화
- 다음 Phase 진행 준비 완료

---
*Phase: 04-automation*
*Completed: 2026-03-26*
