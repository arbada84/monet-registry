---
phase: 11-code-cleanup-quality
plan: 01
subsystem: database
tags: [supabase, dead-code-removal, refactoring]

# Dependency graph
requires:
  - phase: 10-operational-stability
    provides: supabase-server-db.ts 목적별 쿼리 함수
provides:
  - db-server.ts Supabase 단일 경로 thin wrapper (3단 폴백 제거)
  - mysql-db.ts, mysql.ts, file-db.ts 삭제
affects: [12-기능-추가, 13-테스트-및-리팩토링]

# Tech tracking
tech-stack:
  added: []
  patterns: [Supabase 단일 DB 경로, static import 패턴]

key-files:
  created: []
  modified: [src/lib/db-server.ts, src/app/api/auth/login/route.ts, src/app/api/db/newsletter/route.ts]

key-decisions:
  - "db-server.ts를 삭제하지 않고 thin wrapper로 유지 — 기존 호출처 변경 최소화"
  - "serverGetSetting의 unstable_cache 래핑 유지 — supabase-server-db.ts에는 캐시가 없으므로"

patterns-established:
  - "Supabase 단일 경로: 모든 DB 접근은 supabase-server-db.ts → db-server.ts wrapper 경유"

requirements-completed: [CLEAN-02]

# Metrics
duration: 16min
completed: 2026-04-01
---

# Phase 11 Plan 01: MySQL/File DB 폴백 코드 제거 + Supabase 단일 경로 전환 Summary

**db-server.ts를 560줄에서 260줄로 축소, mysql-db/mysql/file-db 3파일(369줄) 삭제하여 Supabase 단일 경로 전환 완료**

## Performance

- **Duration:** 16 min
- **Started:** 2026-04-01T08:02:14Z
- **Completed:** 2026-04-01T08:19:00Z
- **Tasks:** 2
- **Files modified:** 3 (+ 3 deleted)

## Accomplishments
- db-server.ts를 3단 폴백(Supabase/MySQL/FileDB)에서 Supabase 단일 경로 thin wrapper로 리팩토링 (-54% 코드)
- login/route.ts, newsletter/route.ts의 MySQL/FileDB 폴백 코드 제거
- mysql-db.ts(237줄), mysql.ts(23줄), file-db.ts(109줄) 삭제 — 총 369줄 데드 코드 제거
- src/ 전체에서 mysql-db, file-db 문자열 참조 0건 확인
- pnpm build(next build) 성공 확인

## Task Commits

Each task was committed atomically:

1. **Task 1: db-server.ts를 Supabase 단일 경로 thin wrapper로 리팩토링** - `ba42354` (refactor)
2. **Task 2: login/newsletter 폴백 제거 + mysql-db/mysql/file-db 파일 삭제** - `ccbd7c4` (refactor)

## Files Created/Modified
- `src/lib/db-server.ts` - Supabase 단일 경로 thin wrapper (560줄 -> 260줄)
- `src/app/api/auth/login/route.ts` - 3단 폴백을 Supabase 단일 경로로 변경
- `src/app/api/db/newsletter/route.ts` - getDB() 함수 Supabase 단일 경로로 단순화
- `src/lib/mysql-db.ts` - 삭제 (237줄)
- `src/lib/mysql.ts` - 삭제 (23줄)
- `src/lib/file-db.ts` - 삭제 (109줄)

## Decisions Made
- db-server.ts를 삭제하지 않고 thin wrapper로 유지 — 기존 27개 export 함수의 호출처 변경을 최소화
- serverGetSetting의 unstable_cache 래핑 유지 — supabase-server-db.ts에는 캐시가 없으므로 db-server.ts의 캐시 wrapper 필요
- parseTags import 제거 — 폴백 코드에서만 사용하던 의존성 정리

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] parseTags 미사용 import 제거**
- **Found during:** Task 1 (db-server.ts 리팩토링)
- **Issue:** parseTags는 폴백 코드에서만 사용되어 리팩토링 후 미사용 import가 됨
- **Fix:** import { parseTags } from "./html-utils" 제거
- **Files modified:** src/lib/db-server.ts
- **Verification:** 빌드 성공
- **Committed in:** ba42354 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** 미사용 import 정리 — 필수 수정. No scope creep.

## Issues Encountered
- worktree에 node_modules 미설치로 빌드 실패 — pnpm install 후 해결

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Supabase 단일 경로 전환 완료, 댓글 route 통합(11-02) 준비 완료
- db-server.ts가 clean thin wrapper로 되어 향후 테스트(Phase 13) 용이

---
*Phase: 11-code-cleanup-quality*
*Completed: 2026-04-01*
