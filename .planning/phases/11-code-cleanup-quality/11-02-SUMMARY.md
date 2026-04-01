---
phase: 11-code-cleanup-quality
plan: 02
subsystem: comments-api
tags: [refactor, code-cleanup, supabase, comments]
dependency_graph:
  requires: []
  provides: [shared-comment-crud-functions]
  affects: [comments-api, supabase-server-db]
tech_stack:
  added: []
  patterns: [shared-db-functions, REST-API-consolidation]
key_files:
  created: []
  modified:
    - src/lib/supabase-server-db.ts
    - src/app/api/db/comments/route.ts
decisions:
  - Follow existing REST fetch pattern (not Supabase JS client) for consistency
  - Keep serverGetSetting for cp-comment-settings and cp-blocked-ips (non-fallback usage)
  - Remove JSON fallback entirely (comments table confirmed to exist)
metrics:
  duration: 18min
  completed: "2026-04-01"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 11 Plan 02: Comments Route Supabase Integration Summary

Comments API route inline Supabase REST code consolidated into supabase-server-db.ts shared functions, removing 119 lines of duplicate code and JSON fallback path.

## What Was Done

### Task 1: Add comment CRUD functions to supabase-server-db.ts
- Added 4 exported functions: `sbGetComments`, `sbCreateComment`, `sbUpdateCommentStatus`, `sbDeleteComment`
- Added private `rowToComment` helper for DB row to Comment type conversion
- Added `Comment` type import from `@/types/article`
- Followed existing REST API fetch pattern with `getHeaders()` and `BASE_URL`
- `sbDeleteComment` includes child comment cascade deletion
- **Commit:** 3c1b61f

### Task 2: Replace inline code in comments/route.ts
- Removed self-contained helpers: `sbHeaders`, `isTableMode`, `rowToComment`, `SB_URL/SB_ANON/SB_SERVICE` constants
- Removed entire JSON fallback code path (`cp-comments` in site_settings)
- Removed `serverSaveSetting` import (only used for JSON fallback)
- Replaced all 4 HTTP handlers (GET/POST/PATCH/DELETE) to use shared functions
- Retained all business logic: `sanitizeText`, rate limiting, auth verification, CSRF defense, input validation, IP blocking
- File reduced from 321 to 202 lines (37% reduction, 119 lines removed)
- **Commit:** 0e3b472

## Verification Results

| Check | Result |
|-------|--------|
| `sbHeaders` in route.ts | 0 occurrences |
| `isTableMode` in route.ts | 0 occurrences |
| `rowToComment` in route.ts | 0 occurrences |
| `rest/v1/comments` in route.ts | 0 occurrences |
| `cp-comments` in route.ts | 0 occurrences |
| `supabase-server-db` import in route.ts | Present |
| `sanitizeText` in route.ts | Present (3 occurrences) |
| 4 exported functions in supabase-server-db.ts | Present |
| TypeScript compilation (route.ts) | No errors |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.
