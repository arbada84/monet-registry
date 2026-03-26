---
phase: 05-community-ads
plan: 02
subsystem: comments-schema
tags: [bugfix, comments, schema, deploy]
dependency_graph:
  requires: []
  provides: [cascade-delete, articleId-validation, schema-sync]
  affects: [comments-api, supabase-schema]
tech_stack:
  added: []
  patterns: [cascade-delete-children-first, input-length-validation]
key_files:
  created: []
  modified:
    - src/app/api/db/comments/route.ts
    - supabase-schema.sql
decisions:
  - 부모 삭제 시 자식도 함께 삭제 (ON DELETE SET NULL 대신 명시적 2단계 삭제)
  - articleId UUID 강제 불가 (TEXT 타입, 기존 비UUID 데이터 존재 가능)
metrics:
  duration: 27min
  completed: "2026-03-26T03:07:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 05 Plan 02: 댓글 버그 수정 + 스키마 동기화 Summary

댓글 DELETE 시 자식 답글 연쇄 삭제, POST articleId 검증 강화, supabase-schema.sql을 실제 DB와 동기화

## What Was Done

### Task 1: 댓글 DELETE 연쇄 삭제 + POST articleId 검증 (BUG-C04, BUG-C06)
- **BUG-C04 (MEDIUM):** DELETE 핸들러에서 부모 삭제 전 `parent_id=eq.{id}`로 자식 답글 먼저 삭제. JSON 폴백에서도 `c.parentId !== id` 조건 추가
- **BUG-C06 (LOW):** POST에서 `articleId.trim()` 빈 문자열 및 `articleId.length > 200` 방어 추가
- Commit: `321a0ab`

### Task 2: 스키마 파일 동기화 + 빌드 검증 + 배포 (BUG-C01)
- **BUG-C01 (LOW):** supabase-schema.sql의 comments 테이블을 마이그레이션 스크립트와 일치시킴: `id UUID`, `article_title`, `ip`, `parent_id`, CHECK 제약, 인덱스명
- pnpm build 성공, vercel deploy --prod 완료 (https://culturepeople.co.kr)
- **COM-05/COM-06:** 광고 시스템(AdSense, 쿠팡)은 리서치에서 정상 확인됨. 코드 변경 없음
- Commit: `fa1834b`

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1 | 321a0ab | fix(05-02): 댓글 DELETE 연쇄 삭제 + POST articleId 검증 강화 |
| 2 | fa1834b | fix(05-02): supabase-schema.sql comments 테이블을 실제 DB와 동기화 |

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. **부모 삭제 시 자식 명시적 삭제:** DB의 `ON DELETE SET NULL`에 의존하지 않고 API 레벨에서 자식을 먼저 삭제. 이유: SET NULL 시 자식이 루트 댓글로 표시되어 UX 혼동
2. **articleId UUID 강제 불가:** article_id가 TEXT 타입이고 기존 데이터에 비UUID가 존재할 수 있어 길이 제한(200자)만 적용

## Known Stubs

None.

## Verification Results

- pnpm build: 성공
- DELETE 핸들러에 `parent_id=eq.` 자식 삭제 로직 확인 (grep)
- supabase-schema.sql에 parent_id, article_title, ip 컬럼 존재 확인 (grep)
- vercel deploy --prod 성공

## Self-Check: PASSED
