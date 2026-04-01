# Phase 12: Feature Additions — Research

## Research Summary

Phase 12 adds four features: image auto-resize/WebP conversion, automation history visualization, tsvector full-text search, and admin notification system. Research covers existing code patterns, library constraints, and implementation strategies for each.

**Key findings:**
- sharp is already installed (`^0.34.5`) and configured as `serverExternalPackages` in `next.config.ts` — used by `watermark.ts`
- Recharts is NOT installed — must be added as new dependency
- tsvector + pg_trgm infrastructure already exists in production DB (indexes, RPC `search_articles`, `sbSearchArticles` function) — SKILL.md documents the indexes; the schema SQL file does not include them but they are live
- Auto-press/auto-news history is stored in `site_settings` as JSON arrays (`cp-auto-press-history`, `cp-auto-news-history`) with `AutoPressRun[]` and `AutoNewsRun[]` types
- Admin dashboard (`/cam/dashboard`) already loads `DistributeLog[]` — history visualization fits naturally here
- No notifications table exists yet — needs Supabase migration

---

## Feature 1: Image Processing (PERF-03)

### Current Upload Flow

File: `src/app/api/upload/image/route.ts`

1. Auth verification via `verifyAuthToken`
2. Two modes: multipart file upload (5MB max) and URL re-hosting
3. Magic byte validation (`detectImageType`) — supports JPEG, PNG, GIF, WebP
4. Optional watermark application via `applyWatermark` (uses sharp)
5. Upload to Supabase Storage `images` bucket with path `YYYY/MM/{timestamp}_{random}.{ext}`
6. URL re-hosting has weserv.nl proxy fallback

### sharp Usage Patterns (from watermark.ts)

File: `src/lib/watermark.ts`

- `import sharp from "sharp"` with `import "server-only"` guard
- Uses `sharp(buf).metadata()` for dimensions, `.resize()`, `.composite()`, `.toBuffer()`
- Error handling: returns original buffer on failure
- Already proven to work in this project's API routes

### Implementation Strategy

**Resize + WebP conversion point:** Insert BEFORE watermark application, AFTER magic byte validation.

```
validate → resize → convert to WebP → watermark → upload
```

**sharp API for resize + WebP:**
```typescript
const processed = await sharp(buffer)
  .resize({ width: maxWidth, withoutEnlargement: true })  // no upscale
  .webp({ quality })  // WebP conversion
  .toBuffer();
```

**Key decisions for planning:**
- `maxWidth` default: 1920px (standard full-width display)
- `quality` default: 80 (good balance of quality vs size)
- GIF exclusion: GIFs should NOT be converted (animated content) — matches existing watermark GIF skip pattern
- Output extension changes to `.webp` and MIME to `image/webp` after conversion
- `buildStoragePath` needs to use `webp` extension when conversion is active

### Settings Storage

Decision D-02 requires admin-configurable settings. Store in `site_settings` with key `cp-image-settings`:
```typescript
interface ImageUploadSettings {
  enabled: boolean;        // WebP conversion toggle
  maxWidth: number;        // default 1920
  quality: number;         // default 80, range 1-100
}
```

Settings UI goes in `src/app/cam/settings/page.tsx` as a new section (per UI-SPEC).

### Constraints

- **Vercel Hobby**: `images.unoptimized: true` in next.config.ts — server-side sharp processing is the correct approach (no Vercel Image Optimization available)
- **sharp in serverExternalPackages**: Already configured at `next.config.ts:45` — no changes needed
- **Memory**: sharp processes images in native memory. Vercel Hobby has 1024MB function memory. For 5MB input images, sharp typically uses 3-4x memory (15-20MB) — well within limits
- **Timeout**: Current upload has 25s timeout. sharp resize+WebP for a 5MB image takes <2s — no timeout concern

### Risks

- None significant. sharp is already battle-tested in this codebase via watermark.ts

---

## Feature 2: Automation History Dashboard (FEAT-01)

### Data Sources

History data is stored in `site_settings` (not dedicated tables):

| Key | Type | Max entries |
|-----|------|-------------|
| `cp-auto-press-history` | `AutoPressRun[]` | Trimmed to recent (code keeps last N) |
| `cp-auto-news-history` | `AutoNewsRun[]` | Trimmed to recent (code keeps last N) |

**AutoPressRun / AutoNewsRun structure:**
```typescript
{
  id: string;
  startedAt: string;        // ISO timestamp
  completedAt: string;      // ISO timestamp
  source: "cron" | "manual" | "cli";
  articlesPublished: number;
  articlesSkipped: number;
  articlesFailed: number;
  articles: AutoPressArticleResult[];  // per-article detail
}
```

### Existing APIs

- `GET /api/db/auto-press-settings` — returns settings + history
- `GET /api/db/auto-news-settings` — returns settings + history
- `GET /api/db/distribute-logs` — distribute logs (already loaded on dashboard)

The auto-settings APIs already return history data alongside settings. Dashboard can call these endpoints.

### Dashboard Integration

File: `src/app/cam/dashboard/page.tsx`

The dashboard already loads articles, view logs, distribute logs, comments, ads, subscribers via `Promise.allSettled`. Adding auto-press/auto-news history follows the same pattern.

**Chart data transformation:**
- Group `AutoPressRun[]` by date (from `startedAt`)
- Sum `articlesPublished` (success) and `articlesFailed` (failure) per day
- Display last 10 days as stacked bar chart

### Recharts Integration

Recharts is NOT installed. Must add:
```bash
pnpm add recharts
```

Recharts is a React component library — works with client components. The dashboard is already `"use client"`.

**Required components** (from UI-SPEC):
`BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer`

**Bundle size consideration:** Recharts is ~500KB unminified but tree-shakable. Only admin pages load it, so no public page impact.

### UI Pattern

Per UI-SPEC: Two tabs ("보도자료 자동등록" / "자동 뉴스 발행"), bar chart with chart-1 (success) and chart-2 (failure) colors, 240px height, summary row below chart.

Tab implementation: Simple state toggle with inline styles (existing admin pattern, no shadcn Tabs needed).

---

## Feature 3: Full-Text Search (FEAT-02)

### Current State — Already Implemented

The tsvector full-text search infrastructure is already in production:

1. **DB RPC** `search_articles(search_query, max_results)` — documented in SKILL.md section 2.2
2. **DB indexes** on articles table (from SKILL.md):
   - `idx_articles_search_vector` — GIN (tsvector)
   - `idx_articles_title_trgm` — GIN trigram
   - `idx_articles_tags_trgm` — GIN trigram
   - `idx_articles_summary_trgm` — GIN trigram
3. **Client function** `sbSearchArticles(query)` in `supabase-server-db.ts:165` — calls RPC, falls back to ilike
4. **Search page** `src/app/search/page.tsx` — already uses `serverSearchArticles(q)` which delegates to `sbSearchArticles`

### Gap Analysis

The tsvector search is already functional. What D-07 through D-10 describe is largely already done:

- D-07 (title weight A, body weight B): Need to verify the `search_articles` RPC function's weight configuration
- D-08 (pg_trgm for Korean partial matching): Already has trigram indexes
- D-09 (keep existing search UI, switch backend): Backend already uses tsvector
- D-10 (extend existing tsvector code): `sbSearchArticles` already exists

**What may still need work:**
- Verify the `search_articles` RPC function properly weights title (A) vs body (B)
- Verify `search_vector` column and trigger exist (the schema SQL doesn't show them, but SKILL.md documents the indexes — they were likely added via direct migration)
- Ensure the `simple` parser is used for Korean text (not `english` parser which would stem Korean words incorrectly)
- Consider adding `body_trgm` index if Korean body partial matching is needed

### PostgreSQL Korean Search Notes

- Korean is NOT supported by PostgreSQL's built-in `to_tsvector('korean', ...)` — there is no Korean dictionary
- **Correct approach:** `to_tsvector('simple', text)` — splits on whitespace/punctuation without stemming
- **pg_trgm supplement:** Trigram indexes handle partial matching (`LIKE '%검색어%'`) efficiently
- The `search_articles` RPC likely combines both: tsvector for exact token matching + pg_trgm for fuzzy/partial matching + ilike fallback

### Recommendation

This feature may be largely complete already. Planning should:
1. Verify the RPC function's implementation via `mcp__supabase__execute_sql`
2. Confirm weight configuration (A/B)
3. Confirm `simple` parser usage
4. If gaps found, create migration to update the RPC function
5. If no gaps, mark FEAT-02 as already implemented or minimal changes needed

---

## Feature 4: Notification System (FEAT-03)

### Schema Design

New `notifications` table in Supabase:

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,           -- 'cron_failure', 'ai_failure'
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  metadata JSONB DEFAULT '{}',  -- type-specific data (route, article_id, error)
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notifications_read ON notifications(read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_auth_all" ON notifications FOR ALL USING (true);
```

**Why dedicated table (not site_settings):** Notifications need efficient queries (unread count, mark as read, pagination), which JSONB array in site_settings handles poorly. A dedicated table with indexes is correct.

### Notification Types (Initial — D-13)

| Type | Trigger Location | Title Template |
|------|-----------------|----------------|
| `cron_failure` | `auto-press/route.ts`, `auto-news/route.ts` — catch blocks | "[auto-press] 실행 실패: {error}" |
| `ai_failure` | AI edit failure in cron routes | "AI 편집 실패: {title} — {error}" |

### API Design

New route: `src/app/api/db/notifications/route.ts`

```
GET  /api/db/notifications          — list recent (limit 50)
GET  /api/db/notifications?unread=1 — unread count only
POST /api/db/notifications          — create notification (internal use)
PATCH /api/db/notifications         — mark as read { ids: string[] }
DELETE /api/db/notifications        — clear all
```

Auth: All endpoints require `verifyAuthToken` (admin only).

### Notification Creation Points

In cron routes, add notification creation in catch blocks:

**auto-press/route.ts** — around the main try/catch and per-article error handling:
- Route-level failure: creates `cron_failure` notification
- Per-article AI failure: creates `ai_failure` notification

**auto-news/route.ts** — same pattern.

Implementation: Direct Supabase insert using service key (same pattern as other server-side DB operations).

### Polling Implementation

Per D-12 and UI-SPEC: 60-second polling from admin layout.

```typescript
// In layout.tsx or a shared hook
useEffect(() => {
  const poll = async () => {
    const res = await fetch("/api/db/notifications?unread=1");
    const { count } = await res.json();
    setUnreadCount(count);
  };
  poll();
  const interval = setInterval(poll, 60000);
  return () => clearInterval(interval);
}, []);
```

### Header Badge

Per UI-SPEC: Bell emoji "🔔" in layout.tsx header, with red badge showing unread count. Click navigates to `/cam/dashboard`.

The layout (`src/app/cam/layout.tsx`) currently has header with username display and logout — bell icon goes next to these.

### Dashboard Panel

Per UI-SPEC: Notification list panel in dashboard showing last 10 items, with "모두 읽음 처리" button and "이전 알림 더 보기" link.

---

## Cross-Feature Concerns

### Shared Patterns

1. **Settings storage in site_settings:** Image settings (`cp-image-settings`) follow the same pattern as existing settings (`cp-watermark-settings`, `cp-auto-news-settings`, etc.)
2. **API route pattern:** All new APIs use `verifyAuthToken` + `NextResponse.json` — consistent with existing routes
3. **Admin inline styles:** All new UI components use `React.CSSProperties` inline styles, NOT Tailwind classes (admin pattern)
4. **Error handling:** Try/catch with console.error and safe error messages — existing pattern

### Dependencies

| Feature | New Dependencies | Existing Dependencies |
|---------|-----------------|----------------------|
| Image Processing | None | sharp (already installed) |
| History Dashboard | recharts (new) | None |
| Full-Text Search | None (DB migration only) | supabase-server-db.ts |
| Notifications | None (DB migration + API) | cookie-auth.ts |

### Execution Order Recommendation

1. **Image Processing (PERF-03)** — Self-contained, modifies single file + settings page
2. **Full-Text Search (FEAT-02)** — Verify existing implementation, minimal or no code changes
3. **Notification System (FEAT-03)** — DB migration + new API + UI modifications
4. **History Dashboard (FEAT-01)** — New dependency (recharts) + dashboard UI additions

Rationale: Start with lowest-risk (image processing uses existing sharp), verify search early (may already be done), then build notification infrastructure, then dashboard additions.

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Recharts bundle size on admin | Low — admin-only | Dynamic import or separate chunk |
| Notification table migration | Low — new table, no existing data | Standard Supabase migration |
| tsvector already complete | Positive risk — less work | Verify before planning tasks |
| sharp memory on large images | Low — 5MB limit exists | Already proven with watermark |

---

## Validation Architecture

### Feature 1: Image Processing
- Upload a JPEG/PNG > 1920px wide → verify output is WebP, width <= maxWidth
- Upload a GIF → verify it is NOT converted (animation preserved)
- Upload a small image (< maxWidth) → verify no upscaling (`withoutEnlargement: true`)
- Change settings (maxWidth, quality) → verify new uploads respect changed values
- Verify watermark still applies after resize/conversion

### Feature 2: Automation History Dashboard
- Run auto-press/auto-news manually → verify chart updates with new data
- Verify tab switching between press and news history
- Verify empty state when no history exists
- Verify chart shows correct success/failure counts per day

### Feature 3: Full-Text Search
- Search Korean terms → verify results are ranked by relevance
- Search partial Korean words → verify pg_trgm partial matching works
- Search title-weighted terms → verify title matches rank higher
- Verify ilike fallback still works if RPC fails

### Feature 4: Notification System
- Trigger a cron failure → verify notification appears in dashboard
- Verify unread count badge in header updates via polling
- Click "모두 읽음 처리" → verify all notifications marked read, badge disappears
- Verify notifications persist across page reloads (DB-backed)

---

## RESEARCH COMPLETE
