---
phase: 10-operational-stability
plan: 01
subsystem: database
tags: [supabase, rest-api, query-optimization, performance]

requires: []
provides:
  - "5 purpose-specific Supabase query functions (sbGetPublished/Recent/Sitemap/Scheduled/RecentTitles)"
  - "5 db-server.ts wrapper functions with MySQL/file-db fallbacks"
  - "All public page/feed/cron endpoints use minimal data queries"
affects: [10-02, 10-03]

tech-stack:
  added: []
  patterns: ["purpose-specific DB queries instead of full-table scan", "select only needed columns per use case"]

key-files:
  created: []
  modified:
    - src/lib/supabase-server-db.ts
    - src/lib/db-server.ts
    - src/app/page.tsx
    - src/app/sitemap.xml/route.ts
    - src/app/reporter/[name]/page.tsx
    - src/app/api/rss/route.ts
    - src/app/atom.xml/route.ts
    - src/app/feed.json/route.ts
    - src/app/api/db/articles/sidebar/route.ts
    - src/app/api/cron/publish/route.ts
    - src/app/api/cron/auto-news/route.ts
    - src/app/api/cron/auto-press/route.ts
    - src/app/api/v1/articles/route.ts

key-decisions:
  - "sbGetRecentTitles returns {title, sourceUrl}[] instead of string[] to support dedup by both title and sourceUrl"
  - "RSS route uses serverGetPublishedArticles for category/author filtered feeds, serverGetRecentArticles for unfiltered"
  - "Sitemap uses dedicated sbGetArticleSitemapData with only 4 columns (no/date/tags/author)"

patterns-established:
  - "Purpose-specific queries: each endpoint calls a function matching its exact data needs"
  - "Pagination in Supabase functions for datasets over 1000 rows"

requirements-completed: [PERF-01]

duration: 7min
completed: 2026-04-01
---

# Phase 10 Plan 01: serverGetArticles() Purpose-Specific Query Optimization Summary

**5 purpose-specific Supabase query functions replacing full-table scan across 11 call sites, reducing data transfer from 4000+ full rows to minimal column/row subsets**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-31T17:31:35Z
- **Completed:** 2026-03-31T17:39:01Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Added 5 purpose-specific query functions to supabase-server-db.ts with DB-level filtering (status/date/columns)
- Added 5 corresponding wrapper functions in db-server.ts with MySQL/file-db fallbacks
- Converted 11 call sites from serverGetArticles() full-table scan to purpose-specific queries
- Sitemap now queries only 4 columns (no/date/tags/author) instead of 20+ columns
- Feed endpoints (RSS/Atom/JSON) query only latest N articles instead of all 4000+
- Cron dedup (auto-news/auto-press) queries only recent 30-day titles+sourceUrls instead of all articles
- Scheduled publish cron queries only status=reserved articles instead of scanning all

## Task Commits

Each task was committed atomically:

1. **Task 1: supabase-server-db.ts + db-server.ts purpose-specific functions** - `d4b9f21` (feat)
2. **Task 2: 11 call site conversions** - `f1d500b` (feat)

## Files Created/Modified
- `src/lib/supabase-server-db.ts` - Added sbGetPublishedArticles, sbGetRecentArticles, sbGetArticleSitemapData, sbGetScheduledArticles, sbGetRecentTitles
- `src/lib/db-server.ts` - Added serverGetPublished/Recent/Sitemap/Scheduled/RecentTitles wrappers
- `src/app/page.tsx` - serverGetPublishedArticles() (was serverGetArticles)
- `src/app/sitemap.xml/route.ts` - serverGetArticleSitemapData() (4 columns only)
- `src/app/reporter/[name]/page.tsx` - serverGetPublishedArticles() + author filter
- `src/app/api/rss/route.ts` - serverGetRecentArticles/serverGetPublishedArticles (filter-dependent)
- `src/app/atom.xml/route.ts` - serverGetRecentArticles(N)
- `src/app/feed.json/route.ts` - serverGetRecentArticles(N)
- `src/app/api/db/articles/sidebar/route.ts` - serverGetPublishedArticles()
- `src/app/api/cron/publish/route.ts` - serverGetScheduledArticles()
- `src/app/api/cron/auto-news/route.ts` - serverGetRecentTitles(30)
- `src/app/api/cron/auto-press/route.ts` - serverGetRecentTitles(30)
- `src/app/api/v1/articles/route.ts` - serverGetPublishedArticles()

## Decisions Made
- sbGetRecentTitles returns `{title, sourceUrl}[]` instead of `string[]` because auto-news/auto-press need both fields for dedup (Rule 2 deviation)
- RSS route conditionally uses serverGetPublishedArticles (when category/author filter present) vs serverGetRecentArticles (default) to ensure filtered feeds have enough data
- Sidebar uses serverGetPublishedArticles instead of serverGetRecentArticles because it needs all published articles for views-based top10 sorting

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] sbGetRecentTitles returns sourceUrl alongside title**
- **Found during:** Task 1 (function design)
- **Issue:** Plan specified `select=title` returning `string[]`, but auto-news/auto-press dedup requires both title and sourceUrl
- **Fix:** Changed return type to `{title: string; sourceUrl?: string}[]` with `select=title,source_url`
- **Files modified:** src/lib/supabase-server-db.ts, src/lib/db-server.ts
- **Verification:** TypeScript compilation passes, auto-news/auto-press dedup logic works with new type
- **Committed in:** d4b9f21 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for correct dedup functionality. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Purpose-specific query infrastructure is ready for Plan 02 (DB-level filtering) and Plan 03 (admin article list optimization)
- serverGetArticles() still exists for admin/internal use cases
- /api/db/articles/route.ts intentionally preserved for Plan 03

---
*Phase: 10-operational-stability*
*Completed: 2026-04-01*
