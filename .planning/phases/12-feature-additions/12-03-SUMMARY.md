---
phase: 12-feature-additions
plan: 03
subsystem: ui, api, automation
tags: [notifications, supabase, cron, dashboard, polling]

requires:
  - phase: 10-operational-stability
    provides: cron routes (auto-press, auto-news), supabase-server-db helpers
provides:
  - notifications table schema and CRUD API
  - createNotification server-side helper
  - cron failure/AI failure notification generation
  - admin header badge with polling
  - dashboard notification panel
affects: [auto-press, auto-news, admin-dashboard, admin-layout]

tech-stack:
  added: []
  patterns:
    - "fire-and-forget notification pattern (createNotification helper)"
    - "60-second polling for notification badges"

key-files:
  created:
    - src/app/api/db/notifications/route.ts
  modified:
    - supabase-schema.sql
    - src/lib/supabase-server-db.ts
    - src/app/api/cron/auto-press/route.ts
    - src/app/api/cron/auto-news/route.ts
    - src/app/cam/layout.tsx
    - src/app/cam/dashboard/page.tsx

key-decisions:
  - "Supabase MCP 미인증으로 테이블 수동 생성 필요 (스키마 SQL만 업데이트)"
  - "fire-and-forget 패턴으로 알림 생성 실패가 크론 작업 방해하지 않음"

patterns-established:
  - "createNotification: 서버사이드 알림 생성 공통 헬퍼"

requirements-completed: [FEAT-03]

duration: 7min
completed: 2026-04-02
---

# Phase 12 Plan 03: 어드민 알림 시스템 구축 Summary

**Supabase notifications 테이블 스키마 + CRUD API + 크론 실패/AI 편집 실패 알림 생성 + 헤더 배지 + 대시보드 알림 패널**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-01T16:57:17Z
- **Completed:** 2026-04-01T17:05:06Z
- **Tasks:** 6
- **Files modified:** 7

## Accomplishments
- notifications 테이블 스키마 정의 및 supabase-schema.sql 업데이트
- GET/POST/PATCH/DELETE 알림 CRUD API (인증 포함)
- createNotification 서버사이드 헬퍼 (fire-and-forget)
- auto-press, auto-news 크론 라우트에 실패 알림 자동 생성 삽입
- 어드민 헤더 벨 아이콘 + 읽지않은 알림 배지 (60초 폴링)
- 대시보드 알림 패널 (목록, 타입 아이콘, 모두 읽음 처리)

## Task Commits

Each task was committed atomically:

1. **Task 1: notifications 테이블 생성** - `0dcf4d0` (feat)
2. **Task 2: 알림 CRUD API 라우트 생성** - `30201a3` (feat)
3. **Task 3: 알림 생성 헬퍼 함수 추가** - `13537e0` (feat)
4. **Task 4: 크론 라우트에 실패 알림 생성 삽입** - `399d953` (feat)
5. **Task 5: 헤더 알림 배지 추가** - `3a2c83e` (feat)
6. **Task 6: 대시보드 알림 패널 추가** - `af93ee8` (feat)

## Files Created/Modified
- `supabase-schema.sql` - notifications 테이블 + 인덱스 + RLS 정책 추가
- `src/app/api/db/notifications/route.ts` - 알림 CRUD API (GET/POST/PATCH/DELETE)
- `src/lib/supabase-server-db.ts` - createNotification 서버사이드 헬퍼
- `src/app/api/cron/auto-press/route.ts` - cron_failure, ai_failure 알림 생성
- `src/app/api/cron/auto-news/route.ts` - cron_failure, ai_failure 알림 생성
- `src/app/cam/layout.tsx` - 벨 아이콘 + unread 배지 (60초 폴링)
- `src/app/cam/dashboard/page.tsx` - 알림 패널 UI + 모두 읽음 처리

## Decisions Made
- Supabase MCP 인증 미설정으로 테이블은 수동 생성 필요 (schema SQL만 제공)
- fire-and-forget 패턴 채택: 알림 생성 실패가 크론 작업 흐름을 방해하지 않음

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Supabase MCP 인증 미설정**
- **Found during:** Task 1 (notifications 테이블 생성)
- **Issue:** mcp__supabase__apply_migration 호출 시 Unauthorized 에러
- **Fix:** supabase-schema.sql에 테이블 정의를 추가하고 사용자가 Supabase SQL 에디터에서 직접 실행하도록 함
- **Files modified:** supabase-schema.sql
- **Verification:** 스키마 파일에 CREATE TABLE IF NOT EXISTS notifications 포함 확인
- **Committed in:** 0dcf4d0

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** 테이블 생성만 수동 필요. 나머지 코드는 모두 테이블 존재 전제로 정상 동작.

## Issues Encountered
- Supabase MCP 미인증: SUPABASE_ACCESS_TOKEN이 MCP 서버에 설정되지 않아 apply_migration 사용 불가. 사용자가 Supabase 대시보드 SQL 에디터에서 마이그레이션 SQL을 직접 실행해야 함.

## User Setup Required

**Supabase 테이블 수동 생성이 필요합니다.** Supabase SQL 에디터에서 아래 SQL을 실행하세요:

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  metadata JSONB DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_service_all" ON notifications
  FOR ALL USING (true) WITH CHECK (true);
```

## Next Phase Readiness
- 알림 시스템 코드 완성, 테이블 생성 후 즉시 사용 가능
- Plan 12-04 실행 준비 완료

---
*Phase: 12-feature-additions*
*Completed: 2026-04-02*
