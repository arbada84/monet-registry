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
