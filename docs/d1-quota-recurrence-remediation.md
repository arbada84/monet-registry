# D1 quota recurrence remediation

## Scope and rollout

- Baseline production: `dpl_wjm7QmNY3AQUWShQRo7oe8zFMj5C`, source `1176c42ec0ff3dd64f466cc06456d09b255d7f54`.
- Free D1: 5,000,000 rows read and 100,000 rows written per UTC day. Reset is 09:00 KST.
- Tag indexing is already deployed. Do not repeat `0007_article_tags.sql` backfill.
- Quota exhaustion is account-wide. Free-tier monitoring aggregates the account, regardless of the configured production database ID.
- D1 analytics use UTC daily periods; Workers/R2 retain their monthly periods. Set `CLOUDFLARE_D1_PLAN=paid` only after a confirmed paid-plan upgrade.
- Warning starts at 60%, critical at 95%. Hourly checks use the existing Cloudflare retry scheduler and only notify on actionable states. An hourly warning is not a hard budget or a guarantee against sudden bot traffic.
- Telegram env credentials must be present for notification during D1 failure. Runtime settings use env fallback and evidence storage failure does not cancel delivery.

## Changes

1. Correct free-tier daily monitoring and wire it to the hourly Worker.
2. Remove sitemap no-store override; cache sitemap data for one hour. Existing article-write invalidation stays in place. The latest-article invariant forces one fresh read if the snapshot is behind.
3. Export backups using discovered primary-key cursors, including composite keys. Stop explicitly for tables without stable primary keys. No OFFSET scans and no deletion of backup/log evidence.
4. Real health query through the indexed settings key; quota errors pause each warm instance for 60 seconds. RSS/news sitemap return retryable 503 on provider failure.
5. Popular-article data cache is five minutes.
6. Add category and active queue/article read indexes (`0008_public_read_indexes.sql`); verify EXPLAIN before applying. The normalized-title full-history check is retained to preserve duplicate prevention; replacing it needs a complete fingerprint backfill and Worker write synchronization.
7. HTTP migration apply records name/checksum and rejects repeat backfills. Raw Wrangler/manual SQL can bypass this guard and should not be used to repeat 0007.
8. Missing legacy `/data/editor/` paths stop before layout/settings reads. No existing public files or rewrites were present under that prefix when audited.

## Follow-up audit (2026-10-07 KST)

- The deferred 0008 migration and portal verification completed successfully at 2026-10-05 09:10 KST; `.deploy-logs/d1-index-recovery.json` records both exit codes as zero. It must not be reapplied.
- The follow-up live checks returned 200 for health, home, article 4363, culture tag, RSS, sitemap and news sitemap. Measured request durations were approximately 278-770 ms for content surfaces (a single request each, not a benchmark).
- Current UTC-day D1 analytics: 635,151 rows read / 5,000,000, 2,139 rows written / 100,000. This is a partial-day observation, not a guarantee about future bot traffic.
- Remaining public feed/recent/reporter reads bypassed the shared data cache. They now use 300-second `articles`-tag caches, including separate keys for category, author, limit and body policy. Existing manual/cron/retry/worker-notify article invalidation is preserved. Search and authenticated write paths remain unchanged.
- Worker analytics for 2026-10-06 UTC showed 9 `exceededResources` errors in 340 auto-press invocations; the hourly retry scheduler had 0 errors in 17 invocations. This identifies a resource-limit outcome, not a proven CPU/memory/root cause. Do not raise resource limits or claim this resolved without invocation logs and profiling.
- The existing hourly usage guard now includes current-UTC-day Worker errors and script/status details. It warns at >=5 errors and >=1% error rate. Historical monthly errors alone do not keep triggering alerts after the UTC reset. It reuses the same GraphQL request, adds no new scheduler and does not change publishing limits.
- HTML response `x-vercel-cache: MISS` is still expected under CSP nonce; it is not evidence that the separate Next.js data cache is bypassed. Nonce/CSP protection is retained.
- Pending external work remains disk capacity, Supabase recovery, and resource-error profiling. No production article data, publication limits, deleted articles or paid plan were changed by this follow-up.

Source for Worker status semantics: https://developers.cloudflare.com/workers/observability/metrics-and-analytics/

## Availability boundary

The circuit breaker is local to a warm Vercel process; it is not a shared account circuit breaker. Next.js article page errors can still return 500 when no cached article is available. A quota-aware 503 on feeds does not make unknown articles available. A paid plan or separately validated stale content snapshot is necessary to guarantee content availability during free-tier exhaustion. Deleted/unpublished articles must never be recovered from a stale backup for public serving.

## Validation and recovery

```sh
pnpm ci:typecheck
pnpm test:unit
pnpm check:local-backup
pnpm backup:local:restore-check -- --root /mnt/win_d/Users/Documents/monet-registry-main/culturepeople-backups
pnpm cloudflare:d1:apply-sql -- --file cloudflare/d1/migrations/0008_public_read_indexes.sql --database culturepeople-prod --http-api --confirm-production
# Apply only after quota recovery and SQLite/EXPLAIN verification:
pnpm cloudflare:d1:apply-sql -- --file cloudflare/d1/migrations/0008_public_read_indexes.sql --database culturepeople-prod --http-api --confirm-production --apply
pnpm verify:portal -- --base https://culturepeople.co.kr
```

Use the configured backup root or UUID-resolved mount on other computers; do not copy the Linux path into Windows. Keyset logic and deployment scripts are Node-based. Python SQLite tests use `python3` on Linux and `python` on Windows.

Do not run full export or repeated live audits while D1 is blocked. After 09:00 KST, check `/api/health`, one uncached article, one tag, RSS and both sitemaps once, then review daily rowsRead and Vercel errors. Preserve existing log retention; archive proposals require a verified restored backup before any deletion.

Rollback: promote the baseline deployment above. The additive indexes can remain; no article rows are changed by the index migration. Restore the saved hourly Worker source if needed, preserving CRON_SECRET and its existing schedule.

## Operational evidence (2026-10-05 KST)

- First rollout: Vercel `dpl_CHKWuobmuyWkxnRtjEWhdy6EQcKu`, source `db961e3224e17c379b444dd4bb503aaf4bf4f7f1`; custom production alias verified through the alias API.
- Hourly retry/usage Worker version: `56cf63c35a27465f8746ef702a11720d`. Existing secret bindings and `0 * * * *` schedule preserved. One real critical Telegram alert returned `sent: true`.
- Local validation: 115 unit test files / 558 tests passed, typecheck and lint passed. Backup restore rehearsal and primary-key uniqueness audit passed for the existing backup; this does not mean a fresh backup was made.
- The initial migration 0008 attempt was blocked before applying statements. Recovery subsequently completed at 2026-10-05 09:10 KST, as confirmed in the follow-up audit above; do not repeat the migration.
- An independent matcher entry for `/data/editor/:path*` is required because the general middleware matcher excludes image extensions. A regression test checks the real Next.js matcher for a JPG path.
- Current backup is about 49.6 hours old. Primary disk is 98.2% used with about 33 GB free; fresh backup is blocked by the existing 95% safety threshold. Do not delete evidence or lower the safety threshold to force a backup.
- Secondary copy lag was 0 hours. Supabase fallback remains stale (about 138.4 days); media remains 4034/8059 with 4025 deferred. Supabase recovery and storage capacity require external action.
- The home backup symlink now resolves to the current `/mnt/win_d` backup directory. Existing backup and image timers remain active.

### Deferred index recovery

The user systemd timer `culturepeople-d1-read-indexes-recovery-20261005.timer` ran successfully at 2026-10-05 09:10 KST after the UTC quota reset. Both migration and portal verification returned exit code zero. No backup export or image backfill was triggered by this recovery job. The commands below are retained for diagnosis/manual recovery, not instructions to repeat the completed migration; its ledger blocks reapplication.

```sh
pnpm ops:d1:recover-read-indexes
pnpm ops:d1:recover-read-indexes -- --apply --not-before=2026-10-05T00:00:00.000Z --checksum=84c13167b41e5660e4b96e31d9473bd1f5359dc7798fae1699861e02a1c08f21
systemctl --user status culturepeople-d1-read-indexes-recovery-20261005.timer
journalctl --user -u culturepeople-d1-read-indexes-recovery-20261005.service --no-pager
```

On Windows run the same Node/pnpm command from the repository after the stated UTC time, or schedule that command with Task Scheduler; systemd is not required by the script. Results are recorded in `.deploy-logs/d1-index-recovery.json` and `.deploy-logs/d1-index-recovery-apply.json`. Pending recovery must not be described as completed until these reports and the live surfaces pass.
