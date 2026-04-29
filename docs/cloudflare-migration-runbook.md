# Cloudflare Migration Runbook

Created: 2026-04-28

## Target

Move CulturePeople toward a low-cost Cloudflare-first architecture:

- Runtime: Cloudflare Workers or Pages Functions
- Database: Cloudflare D1
- Media: Cloudflare R2 Standard
- Monitoring: daily Telegram usage report and quota warnings
- Rollback: keep the current Vercel deployment until Cloudflare staging is verified

## Current Status

As of 2026-04-30 KST:

- Cloudflare Workers Paid is active.
- Production D1 database `culturepeople-prod` exists and the initial schema has been applied.
- Staging D1 database `culturepeople-staging` exists and the initial schema has been applied.
- Live `https://culturepeople.co.kr` is configured with `DATABASE_PROVIDER=d1`.
- Live media uploads/storage still use Supabase Storage because R2 is not enabled in the Cloudflare dashboard yet.
- Supabase REST export is currently blocked by HTTP 402 quota restriction. The user-reported billing reset date is 2026-05-18, so full historical data migration should wait until access reopens unless a temporary upgrade/support unlock is used.

The Cloudflare account token may return this from `/user/tokens/verify`:

```text
Token self-verify skipped (401): Invalid API Token
```

For this account-scoped token, treat that endpoint as best-effort only. The real permission proof is whether account, D1, Workers, and later R2 checks pass.

## Required Environment Variables

Set these in `.env.local` only:

```env
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
```

Do not add `Bearer ` before the token value.

## Recommended Token Scope

Create a Custom API Token scoped only to the CulturePeople account and zone.

Required account permissions:

- `Workers Scripts: Edit`
- `D1: Edit`
- `Workers R2 Storage: Edit`
- `Workers Tail: Read`

Required zone permissions for `culturepeople.co.kr`:

- `Zone: Read`
- `DNS: Edit`
- `Workers Routes: Edit`

Avoid these permissions:

- `API Tokens: Edit`
- `Billing: Edit`
- `Memberships: Edit`
- `User Details: Edit`
- All-zone or all-account broad access unless temporarily unavoidable

## Bootstrap Command

Dry-run:

```bash
pnpm cloudflare:bootstrap
```

Create missing D1/R2 resources:

```bash
pnpm cloudflare:bootstrap -- --apply
```

Default resources:

- D1 staging: `culturepeople-staging`
- D1 production: `culturepeople-prod`
- R2 staging: `culturepeople-media-staging`
- R2 production: `culturepeople-media-prod`

## D1 Initial Schema

The initial D1 schema is ready at:

```text
cloudflare/d1/migrations/0001_initial_schema.sql
```

It includes:

- `articles`
- `article_search_index`
- `site_settings`
- `comments`
- `view_logs`
- `distribute_logs`
- `notifications`
- `media_objects`
- `cloudflare_usage_snapshots`
- `migration_runs`
- `migration_row_checksums`

After the API token validates and D1 databases are created, apply the schema to staging first:

```bash
pnpm cloudflare:d1:apply-sql -- --kind schema --database culturepeople-staging --remote
pnpm cloudflare:d1:apply-sql -- --kind schema --database culturepeople-staging --remote --apply
```

If the local machine does not have an interactive Wrangler session, use the Cloudflare HTTP API path with the account token in `.env.local`:

```bash
pnpm cloudflare:d1:apply-sql -- --kind schema --database culturepeople-staging --http-api
pnpm cloudflare:d1:apply-sql -- --kind schema --database culturepeople-staging --http-api --apply
```

Apply to production only after staging import and smoke checks pass:

```bash
pnpm cloudflare:d1:apply-sql -- --kind schema --database culturepeople-prod --remote --apply --confirm-production
pnpm cloudflare:d1:apply-sql -- --kind schema --database culturepeople-prod --http-api --apply --confirm-production
```

The schema was syntax-checked locally with SQLite before committing to this plan.

## Supabase JSON Export To D1 Import

After Supabase REST access is restored, export the minimum runtime tables to JSON:

```bash
pnpm supabase:export-for-d1
```

The export script reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from `.env.local`, paginates every table, and writes into `exports/supabase/`. This directory is git-ignored because it can contain drafts, settings, and other private operational data.

```text
exports/supabase/articles.json
exports/supabase/site_settings.json
exports/supabase/comments.json
exports/supabase/notifications.json
exports/supabase/export-manifest.json
```

Useful recovery options:

```bash
pnpm supabase:export-for-d1 -- --dry-run
pnpm supabase:export-for-d1 -- --max-rows 20
pnpm supabase:export-for-d1 -- --allow-missing
```

If Supabase still returns HTTP 402, the script will stop with a quota-restriction message. That means we still need the 2026-05-18 billing reset, a temporary upgrade, or a support-side access reopen before export can proceed.

Before D1 import, validate the export shape:

```bash
pnpm supabase:validate-export
pnpm supabase:validate-export -- --fail-on-warning
```

The validator checks missing files, invalid JSON shape, duplicate article IDs, duplicate setting keys, and obvious missing fields before the import step.

For a single-command rehearsal after export:

```bash
pnpm cloudflare:d1:rehearse-migration -- --media-base-url https://media.culturepeople.co.kr
```

This rehearsal runs validation first, then prepares D1 SQL, then validates the generated R2 manifest. It also writes `cloudflare/d1/import/rehearsal-summary.json` so the result is auditable even if someone closes the terminal.

Before cutover day, run a readiness report:

```bash
pnpm cloudflare:migration:readiness
pnpm cloudflare:migration:readiness -- --markdown
pnpm cloudflare:migration:readiness -- --expect-live-database-provider d1 --expect-live-media-provider supabase --markdown
```

This report combines local env checks, artifact presence, a live Supabase export probe, a live Cloudflare bootstrap probe, and live site smoke checks. It prints a `phase` plus `nextActions` so we can answer "can we migrate right now?" without manually checking several dashboards.

Expected status before Supabase access reopens:

- `Ready now: no`
- `Supabase access: blocked`
- `Cloudflare access: ok`
- `Live smoke: ok`
- `Phase: waiting_for_supabase_access`

Generate D1 import SQL and a media manifest. Pass the R2 public domain so Supabase Storage URLs are rewritten before the D1 import:

```bash
pnpm cloudflare:d1:prepare-import -- --input exports/supabase --media-base-url https://media.culturepeople.co.kr
```

Generated files:

- `cloudflare/d1/import/generated-import.sql`
- `cloudflare/d1/import/media-manifest.json`

The generated import SQL includes `media_objects` rows when `--media-base-url` is supplied. This gives us a DB-side audit trail for every R2 object that should exist after media copy.

Validate the manifest before media copy or D1 import:

```bash
pnpm cloudflare:r2:validate-manifest
```

Use strict mode when preparing production cutover:

```bash
pnpm cloudflare:r2:validate-manifest -- --fail-on-warning
```

Dry-run the R2 media copy plan:

```bash
pnpm cloudflare:r2:copy-media
```

Actually copy media to R2 only after these are set in `.env.local`:

```env
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

Then run:

```bash
pnpm cloudflare:r2:copy-media -- --apply
```

For the first production rehearsal, copy a small batch first:

```bash
pnpm cloudflare:r2:copy-media -- --apply --limit 20
```

After copy, verify public render URLs:

```bash
pnpm cloudflare:r2:verify-media
pnpm cloudflare:r2:verify-media -- --limit 20
```

This checks the generated `public_url` values that article HTML will use after D1 import. It writes `cloudflare/d1/import/r2-verify-report.json`.

The copy script is sequential by design so the recovery migration does not create a sudden R2 Class A operation spike.

## Runtime Upload Provider Switch

The app now supports a guarded media storage switch:

```env
MEDIA_STORAGE_PROVIDER=supabase
```

Keep the default as `supabase` until all R2 copy and staging smoke tests pass.

Switch staging to R2 only after R2 credentials and the public media domain are ready:

```env
MEDIA_STORAGE_PROVIDER=r2
CLOUDFLARE_R2_PROD_BUCKET=culturepeople-media-prod
CLOUDFLARE_R2_PUBLIC_BASE_URL=https://media.culturepeople.co.kr
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_UPLOAD_PREFIX=images
```

Do not set `MEDIA_STORAGE_PROVIDER=r2` in production until:

- `pnpm cloudflare:r2:validate-manifest -- --fail-on-warning` passes
- a limited `pnpm cloudflare:r2:copy-media -- --apply --limit 20` rehearsal passes
- Cloudflare staging can upload, render, and reuse a new article image
- old Supabase image URLs have working R2 replacements in D1 staging

Predeploy safety now checks the active media provider:

```bash
pnpm predeploy:safety -- --allow-dirty --no-fetch
```

Expected behavior:

- `MEDIA_STORAGE_PROVIDER=supabase` requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.
- `MEDIA_STORAGE_PROVIDER=r2` requires account ID, R2 access key ID, R2 secret access key, R2 bucket, and public media base URL.
- `/api/health` reports `mediaStorage.provider` and `mediaStorage.configured`.

## Runtime Database Provider Guard

The app also has a guarded database provider switch:

```env
DATABASE_PROVIDER=supabase
D1_READ_ADAPTER_ENABLED=false
D1_SETTINGS_DUAL_WRITE_ENABLED=false
D1_SETTINGS_DUAL_WRITE_STRICT=false
D1_ARTICLES_DUAL_WRITE_ENABLED=false
D1_ARTICLES_DUAL_WRITE_STRICT=false
D1_COMMENTS_READ_ADAPTER_ENABLED=false
D1_COMMENTS_DUAL_WRITE_ENABLED=false
D1_COMMENTS_DUAL_WRITE_STRICT=false
D1_LOGS_READ_ADAPTER_ENABLED=false
D1_LOGS_DUAL_WRITE_ENABLED=false
D1_LOGS_DUAL_WRITE_STRICT=false
```

The original safe path was to keep production on Supabase until the D1 CRUD adapter and staging verification were complete. Because Supabase is currently quota-restricted, production has been switched to D1 earlier with an empty D1 dataset and live smoke checks. Do not treat the empty D1 state as a completed migration; historical article data still needs to be exported and imported after Supabase access reopens.

The D1 migration schema/import tools can be prepared independently, but runtime traffic must not be switched with only the schema in place. If someone sets `DATABASE_PROVIDER=d1` too early, predeploy and `/api/health` will report the provider as not runtime-ready.

There is also a read-only canary switch:

```env
D1_READ_ADAPTER_ENABLED=true
```

This switch is still off by default. It routes the currently supported article/settings read paths (published/recent/detail/search/filter/category/tag/home/feed/sitemap/top/scheduled/recent-title/deleted/maintenance/settings) to D1 when the Cloudflare account ID, D1 database ID, and API token are configured. Writes remain on Supabase unless the separate dual-write flags are enabled. Use it only after D1 import verification and `/api/cron/d1-read-compare` are green, because new Supabase writes will not appear in D1 unless a sync/import or dual-write path has run.

`pnpm predeploy:safety` reports `d1ReadReady` and fails if `D1_READ_ADAPTER_ENABLED=true` is set without the required Cloudflare D1 HTTP API environment variables.

Settings can be kept closer to D1 during the staging window with a separate dual-write switch:

```env
D1_SETTINGS_DUAL_WRITE_ENABLED=true
D1_SETTINGS_DUAL_WRITE_STRICT=false
```

With this enabled, `serverSaveSetting` still writes Supabase first, then mirrors the same JSON payload into D1 `site_settings`. The default is best-effort so a temporary D1 API problem does not block the current production source of truth. During a controlled staging verification, set `D1_SETTINGS_DUAL_WRITE_STRICT=true` to fail loudly if the D1 mirror write fails.

Admin settings, image processing settings, and Telegram delivery logs now use the shared `site_settings` store too. That means `cp-*` admin settings, `cp-watermark-settings`, `cp-image-settings`, and `cp-telegram-delivery-log` can read from D1 when `D1_READ_ADAPTER_ENABLED=true`. In that mode setting writes go to D1; before cutover, keep `D1_READ_ADAPTER_ENABLED=false` and use `D1_SETTINGS_DUAL_WRITE_ENABLED=true` if Supabase should remain primary while D1 is mirrored.

Article create/update/delete/purge and public view-count increments can also be mirrored after D1 import verification:

```env
D1_ARTICLES_DUAL_WRITE_ENABLED=true
D1_ARTICLES_DUAL_WRITE_STRICT=false
```

With this enabled, Supabase remains the primary write target and D1 is updated after the Supabase write succeeds. This reduces post-import drift before cutover, including frequently changing article view counts. Keep it off until the import is fresh, `/api/cron/d1-health` works, and article admin/detail smoke tests pass. Use `D1_ARTICLES_DUAL_WRITE_STRICT=true` only in controlled staging because it can block article saves or view increments if D1 is unavailable.

During canary, keep `DATABASE_PROVIDER=supabase` so article create/update/delete/purge and view-count increments still write Supabase first and mirror to D1 only when the dual-write flag is enabled. After final cutover to `DATABASE_PROVIDER=d1`, article writes become D1-primary, including article number allocation via D1 `MAX(no)` plus the `cp-article-counter` site setting.

Comments have their own read canary and dual-write switches:

```env
D1_COMMENTS_READ_ADAPTER_ENABLED=true
D1_COMMENTS_DUAL_WRITE_ENABLED=true
D1_COMMENTS_DUAL_WRITE_STRICT=false
```

Comment creation now uses an application-generated UUID so Supabase and D1 can keep the same comment ID during dual-write. Keep comment D1 reads off until comment import counts match and moderation create/approve/delete smoke tests pass. Use `D1_COMMENTS_DUAL_WRITE_STRICT=true` only in controlled staging, because it can block comment moderation if D1 is unavailable.

View logs and distribution logs can also be canaried separately:

```env
D1_LOGS_READ_ADAPTER_ENABLED=true
D1_LOGS_DUAL_WRITE_ENABLED=true
D1_LOGS_DUAL_WRITE_STRICT=false
```

This mirrors `cp-view-logs` and `cp-distribute-logs` activity into the dedicated D1 `view_logs` and `distribute_logs` tables. Keep D1 log reads off until the expanded import tables match the Supabase setting-backed logs and the Telegram/reporting screens have been smoke-tested.

During canary, `D1_LOGS_READ_ADAPTER_ENABLED=true` should be paired with `D1_LOGS_DUAL_WRITE_ENABLED=true` while `DATABASE_PROVIDER=supabase` remains primary. After final cutover to `DATABASE_PROVIDER=d1`, log writes become D1-primary and no longer update the old Supabase setting-backed log arrays.

Admin notifications have their own switches so alert history can be staged without forcing the whole app onto D1:

```env
D1_NOTIFICATIONS_READ_ADAPTER_ENABLED=true
D1_NOTIFICATIONS_DUAL_WRITE_ENABLED=true
D1_NOTIFICATIONS_DUAL_WRITE_STRICT=false
```

With this enabled, notification list/count reads can be canaried against D1 and notification create/read/delete operations are mirrored after the Supabase write succeeds. Keep D1 notification reads off until imported notification counts match and the admin notification panel has been smoke-tested.

Production/staging D1 runtime uses these required switches:

```env
DATABASE_PROVIDER=d1
D1_DATABASE_BINDING=DB
CLOUDFLARE_D1_PROD_DB=culturepeople-prod
D1_RUNTIME_ADAPTER_READY=true
```

Before setting `D1_RUNTIME_ADAPTER_READY=true`, verify:

- D1 schema has been applied.
- Supabase export has been imported into D1 staging.
- Article list/detail/search/admin smoke tests pass against D1.
- View logs, comments, settings, and article publish/update/delete paths pass against D1.
- Vercel/Supabase remains available as rollback.

Current live exception: `D1_RUNTIME_ADAPTER_READY=true` is already active so the site can keep serving while Supabase is 402-restricted. Until the export/import is done, expect old articles/search/feed content to be missing from D1.

The script also expands setting-backed logs into D1 tables:

- `cp-view-logs` -> `view_logs`
- `cp-distribute-logs` -> `distribute_logs`

Run a dry-run first if the export shape is uncertain:

```bash
pnpm cloudflare:d1:prepare-import -- --input exports/supabase --dry-run
```

Apply only to staging first:

```bash
pnpm cloudflare:d1:apply-sql -- --kind import --database culturepeople-staging --remote
pnpm cloudflare:d1:apply-sql -- --kind import --database culturepeople-staging --remote --apply
pnpm cloudflare:d1:apply-sql -- --kind import --database culturepeople-staging --http-api
pnpm cloudflare:d1:apply-sql -- --kind import --database culturepeople-staging --http-api --apply
```

After applying the import SQL, verify row counts against the rehearsal summary:

```bash
pnpm cloudflare:d1:verify-import -- --database culturepeople-staging --remote
```

The verifier compares D1 row counts for articles, settings, comments, notifications, log tables, and media metadata against the counts produced by `pnpm cloudflare:d1:rehearse-migration`.

Run a lightweight site smoke against Cloudflare staging before DNS cutover:

```bash
pnpm cloudflare:migration:smoke -- --base-url https://staging.example.com
pnpm cloudflare:migration:smoke -- --base-url https://staging.example.com --expect-database-provider d1 --expect-media-provider r2
```

This checks `/api/health`, home, search, sitemap, robots, RSS, and JSON feed routes. RSS and JSON feed are warning-level by default because they can be disabled by site settings.

For the final pre-cutover decision, run the gate:

```bash
pnpm cloudflare:migration:gate -- --base-url https://staging.example.com --database culturepeople-staging --remote --expect-database-provider d1 --expect-media-provider r2
```

The gate combines readiness, D1 row-count verification, R2 public URL verification, and site smoke into one `GO` / `NO_GO` report at `cloudflare/d1/import/cutover-gate-report.json`.

After the Cloudflare token and D1 database ID are valid, run the focused D1 HTTP health check from an authenticated admin session or cron-authenticated request:

```bash
GET /api/cron/d1-health
```

This calls Cloudflare's D1 query API with `SELECT 1 AS ok` and returns only safe configuration flags and the query result.

The first D1 app adapter is intentionally read-only:

- `src/lib/d1-http-client.ts` calls Cloudflare's D1 query API.
- `src/lib/d1-server-db.ts` maps D1 article/settings rows into the existing app shapes.
- `src/lib/site-settings-store.ts` centralizes `site_settings` reads/writes for admin settings, image processing, and Telegram delivery logs so those operational settings are not hard-wired to Supabase REST.
- `src/lib/d1-read-compare.ts` compares Supabase reads against D1 reads without routing live traffic to D1.
- `D1_READ_ADAPTER_ENABLED=true` can canary supported reads through D1 after import verification.
- `D1_SETTINGS_DUAL_WRITE_ENABLED=true` can mirror setting writes to D1 after D1 health/import verification.
- `D1_ARTICLES_DUAL_WRITE_ENABLED=true` can mirror article create/update/delete/purge operations and view-count increments to D1 after D1 health/import verification. With `DATABASE_PROVIDER=d1`, those article writes become D1-primary.
- `D1_COMMENTS_READ_ADAPTER_ENABLED=true` and `D1_COMMENTS_DUAL_WRITE_ENABLED=true` can canary/mirror comments after D1 health/import verification.
- `D1_LOGS_READ_ADAPTER_ENABLED=true` and `D1_LOGS_DUAL_WRITE_ENABLED=true` can canary/mirror view and distribution logs after D1 health/import verification. With `DATABASE_PROVIDER=d1`, those log writes become D1-primary.
- `D1_NOTIFICATIONS_READ_ADAPTER_ENABLED=true` and `D1_NOTIFICATIONS_DUAL_WRITE_ENABLED=true` can canary/mirror admin notifications after D1 health/import verification.
- Published/recent/detail/search/filter/category/tag/home/feed/sitemap/top/scheduled/recent-title/deleted/maintenance/settings reads are covered by unit tests.
- Uploads and any not-yet-mapped admin-only maintenance reads must remain on Supabase until their D1/R2 paths are implemented and staged.

Use the shadow compare endpoint after Supabase export/import and D1 health are both available:

```bash
GET /api/cron/d1-read-compare
GET /api/cron/d1-read-compare?limit=50&q=%EB%89%B4%EC%8A%A4
GET /api/cron/d1-read-compare?settings=cp-auto-press-settings,cp-auto-news-settings
GET /api/cron/d1-read-compare?checks=recent,feed,top,sitemap,scheduled,recent-titles,deleted,maintenance&days=14
```

The endpoint compares recent/feed/top/scheduled/deleted/maintenance article reads, sitemap rows, recent-title duplicate-check rows, optional search results, and selected settings. It returns `503` when the providers cannot be compared or mismatches are detected, but it does not change live routing. Use `checks=` to narrow a slow or noisy comparison during rehearsal.

Do not set `D1_RUNTIME_ADAPTER_READY=true` until the remaining write paths are implemented and the staging smoke passes.

Immediately after cutover, monitor the live route and keep rollback criteria explicit:

```bash
pnpm cloudflare:migration:monitor -- --base-url https://culturepeople.co.kr --expect-database-provider d1 --expect-media-provider r2
pnpm cloudflare:migration:monitor -- --base-url https://culturepeople.co.kr --iterations 12 --interval-ms 300000 --failure-threshold 2
```

The monitor repeatedly runs the lightweight site smoke and writes `cloudflare/d1/import/post-cutover-monitor-report.json`. If failures meet the threshold, it returns `ROLLBACK_RECOMMENDED` and lists rollback actions to take manually.

## Daily Usage Report Plan

The daily Telegram report now includes a Cloudflare Usage Guard section when `CLOUDFLARE_USAGE_REPORT_ENABLED=true`.

Configure the billing cycle and thresholds before enabling it:

```bash
CLOUDFLARE_USAGE_REPORT_ENABLED=true
CLOUDFLARE_BILLING_CYCLE_DAY=28
CLOUDFLARE_WORKER_SCRIPT_NAME=<workers-script-name>
CLOUDFLARE_USAGE_WARNING_RATIO=0.8
CLOUDFLARE_USAGE_CRITICAL_RATIO=0.95
```

The report is sent by the existing daily Telegram cron route:

```bash
GET /api/cron/telegram-daily-report
```

Usage Guard can also be checked without the full daily report:

```bash
GET /api/cron/cloudflare-usage-report
GET /api/cron/cloudflare-usage-report?send=1
GET /api/cron/cloudflare-usage-report?sql=1
```

The `sql=1` mode returns an idempotent D1 upsert for `cloudflare_usage_snapshots`, so the same daily snapshot can be rehearsed safely before D1 runtime writes are enabled.

It can also be queried on demand from an authorized Telegram chat:

```text
/cf_usage
```

Report fields:

- Workers requests and CPU milliseconds
- D1 rows read, rows written, and storage bytes
- R2 storage bytes, Class A operations, and Class B operations
- Warning level against configured included usage: ok, warning, or critical

Warning behavior:

- Warning threshold: notify Telegram in the daily report.
- Critical threshold: daily report marks the risk as critical. Auto-pausing expensive jobs remains a future safety step.

The usage guard still depends on a valid Cloudflare API token. If the token is invalid, the Telegram report stays alive and includes the analytics failure as a note instead of breaking the whole daily report.

## Token Troubleshooting

If the bootstrap command returns `401 Invalid API Token`:

1. Revoke the old token.
2. Create a new Custom API Token.
3. Copy the token value shown immediately after creation, not the token name or token ID.
4. Replace only `CLOUDFLARE_API_TOKEN=` in `.env.local`.
5. Run `pnpm cloudflare:bootstrap` again.

The bootstrap script prints safe token diagnostics such as length, whitespace, and UUID shape. It never prints the token value itself.

If the bootstrap command returns `403` or a named permission error:

1. Keep the same token.
2. Add the missing D1/R2/Workers/DNS permission.
3. Keep account and zone scope restricted to CulturePeople.
4. Run the dry-run again before `--apply`.

## Migration Guardrails

- Do not switch DNS until Cloudflare staging and Vercel live render counts match.
- Do not delete Supabase Storage during migration.
- Do not write new media to Supabase Storage after R2 upload is enabled.
- Keep Supabase read-only and Vercel available for 7-14 days after cutover.
- Keep the previous production target available until post-cutover monitoring stays green.
- Add Telegram alerts before production cutover for Workers, D1, and R2 usage.
