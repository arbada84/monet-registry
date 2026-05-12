# Cloudflare D1

This directory stores the CulturePeople D1 schema and migration notes.

## Databases

- Staging: `culturepeople-staging`
- Production: `culturepeople-prod`

## Bootstrap

Check Cloudflare API access without creating resources:

```bash
pnpm cloudflare:bootstrap
```

Create missing D1 and R2 resources after the token validates:

```bash
pnpm cloudflare:bootstrap -- --apply
```

## Apply Schema

After D1 databases exist, apply the initial schema with Wrangler:

```bash
pnpm cloudflare:d1:apply-sql -- --kind schema --database culturepeople-staging --remote
pnpm cloudflare:d1:apply-sql -- --kind schema --database culturepeople-staging --remote --apply
```

Use staging first. Production requires an explicit confirmation flag:

```bash
pnpm cloudflare:d1:apply-sql -- --kind schema --database culturepeople-prod --remote --apply --confirm-production
```

## Prepare Supabase JSON Export For D1

After Supabase access is restored, export these tables as JSON into `exports/supabase/`:

```bash
pnpm supabase:export-for-d1
```

`exports/supabase/` is intentionally git-ignored because the files can contain private drafts and settings. The export command also writes `export-manifest.json` with row counts and warnings.

- `articles.json`
- `site_settings.json`
- `comments.json`
- `notifications.json`
- `export-manifest.json`

Useful recovery options:

```bash
pnpm supabase:export-for-d1 -- --dry-run
pnpm supabase:export-for-d1 -- --max-rows 20
pnpm supabase:export-for-d1 -- --allow-missing
```

Run a preflight validation before import:

```bash
pnpm supabase:validate-export
pnpm supabase:validate-export -- --fail-on-warning
```

Run the full local rehearsal in one command:

```bash
pnpm cloudflare:d1:rehearse-migration -- --media-base-url https://media.culturepeople.co.kr
```

This command runs:

- export validation
- D1 import SQL generation
- R2 media manifest validation

It also writes `cloudflare/d1/import/rehearsal-summary.json` so we have one artifact showing exactly where a rehearsal stopped.

Before the real migration window, run a readiness report:

```bash
pnpm cloudflare:migration:readiness
pnpm cloudflare:migration:readiness -- --markdown
```

This checks env completeness, export/rehearsal artifacts, a live Supabase dry-run export probe, and Cloudflare token/bootstrap access in one report.

Notification migration flags remain off by default. After D1 import verification, enable `D1_NOTIFICATIONS_DUAL_WRITE_ENABLED=true` to mirror new admin notifications, then enable `D1_NOTIFICATIONS_READ_ADAPTER_ENABLED=true` only after the admin notification list/count smoke test passes.

Operational `site_settings` access is centralized through `src/lib/site-settings-store.ts`. Admin settings, image upload settings, watermark settings, and Telegram delivery logs can read from D1 when `D1_READ_ADAPTER_ENABLED=true`; before cutover, keep Supabase as primary and use `D1_SETTINGS_DUAL_WRITE_ENABLED=true` to mirror setting changes.

Then generate D1 import SQL and a media copy manifest. Pass the R2 public media domain so Supabase image URLs are rewritten before import:

```bash
pnpm cloudflare:d1:prepare-import -- --input exports/supabase --media-base-url https://media.culturepeople.co.kr
```

Outputs:

- `cloudflare/d1/import/generated-import.sql`
- `cloudflare/d1/import/media-manifest.json`

Validate the media manifest before copying or importing:

```bash
pnpm cloudflare:r2:validate-manifest
```

Dry-run the R2 copy plan:

```bash
pnpm cloudflare:r2:copy-media
```

Copy media to R2 after `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` are set:

```bash
pnpm cloudflare:r2:copy-media -- --apply
```

Verify copied media through the same public URLs that articles will render:

```bash
pnpm cloudflare:r2:verify-media
pnpm cloudflare:r2:verify-media -- --limit 20
```

Useful safe limits:

```bash
pnpm cloudflare:r2:copy-media -- --apply --limit 20
pnpm cloudflare:r2:copy-media -- --apply --max-bytes 10485760
```

Keep runtime uploads on Supabase until staging is verified:

```env
MEDIA_STORAGE_PROVIDER=supabase
```

Switch staging uploads to R2 only after copy and smoke checks pass:

```env
MEDIA_STORAGE_PROVIDER=r2
CLOUDFLARE_R2_PUBLIC_BASE_URL=https://media.culturepeople.co.kr
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

Dry-run without writing files:

```bash
pnpm cloudflare:d1:prepare-import -- --input exports/supabase --dry-run
```

Apply generated SQL to staging only after reviewing the summary:

```bash
pnpm cloudflare:d1:apply-sql -- --kind import --database culturepeople-staging --remote
pnpm cloudflare:d1:apply-sql -- --kind import --database culturepeople-staging --remote --apply
```

Verify staging counts after the import:

```bash
pnpm cloudflare:d1:verify-import -- --database culturepeople-staging --remote
```

Run a lightweight smoke check against the migrated deployment:

```bash
pnpm cloudflare:migration:smoke -- --base-url https://staging.example.com
pnpm cloudflare:migration:smoke -- --base-url https://staging.example.com --expect-database-provider d1 --expect-media-provider r2
```

Run the final cutover gate:

```bash
pnpm cloudflare:migration:gate -- --base-url https://staging.example.com --database culturepeople-staging --remote --expect-database-provider d1 --expect-media-provider r2
```

Monitor after cutover:

```bash
pnpm cloudflare:migration:monitor -- --base-url https://culturepeople.co.kr --expect-database-provider d1 --expect-media-provider r2
```

Enable the Telegram usage guard after the Cloudflare token works:

```bash
CLOUDFLARE_USAGE_REPORT_ENABLED=true
CLOUDFLARE_BILLING_CYCLE_DAY=28
```

The existing `/api/cron/telegram-daily-report` will include Workers, D1, and R2 usage. Authorized Telegram chats can also request it with `/cf_usage`.

For a focused manual check, call `/api/cron/cloudflare-usage-report?sql=1` as an admin or cron-authenticated request. It returns the report plus an idempotent SQL upsert for `cloudflare_usage_snapshots`.

Use `/api/cron/d1-health` after `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, and `CLOUDFLARE_API_TOKEN` are valid. It executes `SELECT 1 AS ok` through Cloudflare's D1 query API without exposing secrets.

Read-only app adapter status:

- `src/lib/d1-http-client.ts` provides the D1 HTTP query client.
- `src/lib/d1-server-db.ts` provides read-only article/settings access for staged verification.
- `src/lib/site-settings-store.ts` provides shared `site_settings` access for admin settings, image processing, and Telegram delivery logs.
- `/api/cron/d1-read-compare` compares Supabase and D1 reads before any live routing switch. Use `checks=recent,feed,top,sitemap,scheduled,recent-titles,deleted,maintenance` to focus the comparison during rehearsal.
- `D1_READ_ADAPTER_ENABLED=true` can canary supported article/settings reads through D1 after import verification, including public home/category/tag/feed/sitemap/top paths plus scheduled, recent-title, deleted, and maintenance article reads; writes still stay on Supabase unless their own dual-write flags are enabled.
- `D1_SETTINGS_DUAL_WRITE_ENABLED=true` can mirror `site_settings` writes to D1; `D1_SETTINGS_DUAL_WRITE_STRICT=true` makes D1 mirror failures block the save during controlled verification.
- `D1_ARTICLES_DUAL_WRITE_ENABLED=true` can mirror article create/update/delete/purge writes and view-count increments to D1 after import verification; keep strict mode off in production until staging proves D1 availability. Keep `DATABASE_PROVIDER=supabase` during canary; after `DATABASE_PROVIDER=d1`, article writes and article number allocation become D1-primary.
- `D1_COMMENTS_READ_ADAPTER_ENABLED=true` and `D1_COMMENTS_DUAL_WRITE_ENABLED=true` can canary/mirror comments after import verification; comment IDs are generated by the app so Supabase and D1 stay aligned.
- `D1_LOGS_READ_ADAPTER_ENABLED=true` and `D1_LOGS_DUAL_WRITE_ENABLED=true` can canary/mirror view logs and distribution logs into the dedicated D1 log tables after import verification. Keep `DATABASE_PROVIDER=supabase` during canary; after `DATABASE_PROVIDER=d1`, log writes become D1-primary.
- `pnpm predeploy:safety` reports `d1ReadReady` and blocks incomplete D1 read-canary env configuration.
- Keep `D1_RUNTIME_ADAPTER_READY=false` until D1 write paths are implemented and verified.

## Design Notes

- `site_settings` stores existing `cp-*` JSON settings so the app can migrate incrementally.
- `media_objects` is the R2 manifest. It lets us track dedupe, orphan media, and storage usage.
- `cloudflare_usage_snapshots` is reserved for future persisted daily usage history; the first guard reads Cloudflare Analytics live and reports through Telegram.
- `migration_runs` and `migration_row_checksums` make the Supabase-to-D1 import auditable after the Supabase restriction lifts.
- `article_search_index` is a lightweight search table. Full-text search can be added later after D1 compatibility testing.
- Existing `cp-view-logs` and `cp-distribute-logs` setting arrays are expanded into dedicated D1 tables by `scripts/prepare-d1-import.mjs`.
- When `--media-base-url` is provided, Supabase Storage URLs are rewritten to deterministic R2 URLs and matching rows are inserted into `media_objects`.
