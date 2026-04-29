# Free-Tier First Migration Plan

Created: 2026-04-28
Target migration window: after the Supabase billing reset on 2026-05-18, once API and Storage access are confirmed.

## Goal

Run CulturePeople as long as possible on free tiers while avoiding the current failure mode where Supabase Storage quota blocks DB/API access.

The target architecture should separate:

- Hosting
- Primary article/settings database
- Image and attachment storage
- Logs, analytics, and automation history

## 2026-04-28 Decision Update

The recommended long-term direction is now **Cloudflare-first**:

- Hosting/API: Cloudflare Workers or Pages Functions via the OpenNext Cloudflare adapter
- Primary DB: Cloudflare D1
- Images and attachments: Cloudflare R2 Standard
- Scheduled jobs: Cloudflare Cron Triggers or GitHub Actions calling signed internal endpoints
- Emergency fallback: keep Vercel deployment available until Cloudflare runtime compatibility is proven

Reason for changing the recommendation:

- The existing CockroachDB cluster has already hit its monthly Request Unit limit, so it is not safe to treat CockroachDB Basic as the primary free/near-free production path without strong query throttling.
- D1 and R2 have the simplest long-term cost model for this site: article data in a small SQL database, media in cheap object storage, static delivery at Cloudflare edge.
- Cloudflare Workers Paid is currently a low fixed baseline at about $5/month and removes the most painful daily Free-plan D1/Worker limits, while R2 remains free up to 10 GB-month of Standard storage.
- This requires more development than keeping Vercel + Postgres, but it reduces the chance that one Storage quota overrun blocks the whole site again.

## Current Constraint

Supabase is currently restricted because Storage usage exceeded the Free quota. Existing Storage objects and DB data cannot be safely inventoried or migrated until Supabase access is restored.

Before 2026-05-18, we can prepare the new architecture, schemas, adapters, migration scripts, and dry-run checks. The actual legacy data export and Storage copy must wait until Supabase access is restored.

## Option A - Demoted: Vercel + CockroachDB Basic + Cloudflare R2

Structure:

- Hosting: Vercel Hobby
- Primary DB: CockroachDB Cloud Basic
- Images and attachments: Cloudflare R2 Standard
- Logs/history: keep short retention in CockroachDB first; move to Cloudflare D1 or Turso if logs grow

Why this was originally attractive:

- CockroachDB Basic currently includes 10 GiB storage free per month and 50 million request units per month.
- It is PostgreSQL-wire compatible, so the rewrite can stay closer to SQL/Postgres patterns than SQLite/D1.
- R2 currently includes 10 GB-month Storage, 1 million Class A operations, 10 million Class B operations, and free egress for Standard storage.
- Vercel Hobby keeps current Next.js hosting with 100 GB/month Fast Data Transfer.

Capacity targets:

| Area | Free quota reference | Internal normal target | Warning | Action line |
| --- | ---: | ---: | ---: | ---: |
| Primary DB | 10 GiB | under 3 GiB | 7 GiB | 9 GiB |
| R2 media | 10 GB-month | under 7 GB | 8.5 GB | 9.5 GB |
| Vercel transfer | 100 GB/month | under 60 GB | 80 GB | 95 GB |
| Automation/log rows | included in DB/RU | 90-day raw retention | 180 days | summarize/archive |

Main risks:

- CockroachDB is PostgreSQL-compatible but not identical to Supabase/Postgres. Schema and SQL queries must be tested carefully.
- Request-unit usage can rise if list/search queries are not indexed or cached.
- Supabase REST-specific code must be replaced with a provider/repository layer.
- The current CulturePeople CockroachDB cluster has already shown a monthly RU exhaustion failure, so this option needs throttling, caching, and RU alerts before it can be trusted as primary.

Best fit:

- We want to keep PostgreSQL-wire compatibility and accept possible RU-based lockouts.
- This is better as a fallback or secondary ingestion database than the cheapest long-term primary path.

## Option B - Simpler Long-Free DB: Vercel + Turso + Cloudflare R2

Structure:

- Hosting: Vercel Hobby
- Primary DB: Turso Free
- Images and attachments: Cloudflare R2 Standard
- Logs/history: Turso with strict retention, or D1 if log volume grows

Why consider it:

- Turso Free currently includes 5 GB total storage, 500 million monthly rows read, and 10 million monthly rows written.
- Turso/libSQL is easy to call from Vercel serverless functions over HTTP.
- Query-cost limits are row-based and easier to reason about than some RU models.

Capacity targets:

| Area | Free quota reference | Internal normal target | Warning | Action line |
| --- | ---: | ---: | ---: | ---: |
| Primary DB | 5 GB | under 2 GB | 3.5 GB | 4.5 GB |
| R2 media | 10 GB-month | under 7 GB | 8.5 GB | 9.5 GB |
| Monthly reads | 500M rows | under 200M | 350M | 450M |
| Monthly writes | 10M rows | under 2M | 5M | 8M |

Main risks:

- SQLite/libSQL migration is a bigger data-model shift than CockroachDB.
- Some Postgres-specific assumptions must be rewritten.
- Good indexing and pagination are mandatory to avoid row-scan waste.

Best fit:

- We prefer predictable free quotas and a simpler serverless connection model.
- We accept rewriting DB access more deeply.

## Option C - Recommended: Cloudflare-First Workers/Pages + D1 + R2

Structure:

- Hosting/API: Cloudflare Pages and Workers
- Primary DB: Cloudflare D1
- Images and attachments: Cloudflare R2 Standard

Why this is now the recommended long-term low-cost plan:

- D1 Free currently includes 5 GB total storage, 5 million rows read per day, and 100,000 rows written per day.
- D1 on Workers Paid currently includes 25 billion rows read per month, 50 million rows written per month, and 5 GB storage before overage.
- D1 has no egress charge and is tightly integrated with Workers.
- R2 and D1 are in the same Cloudflare ecosystem.
- R2 Standard currently includes 10 GB-month storage, 1 million Class A operations, 10 million Class B operations, and free egress.
- Workers Paid currently starts at about $5/month, includes 10 million Worker requests/month and 30 million CPU milliseconds/month, and has no egress/bandwidth charge for Workers.

Capacity targets:

| Area | Free quota reference | Internal normal target | Warning | Action line |
| --- | ---: | ---: | ---: | ---: |
| D1 DB | 5 GB | under 2 GB | 3.5 GB | 4.5 GB |
| D1 reads | 5M/day | under 1.5M/day | 3M/day | 4.5M/day |
| D1 writes | 100k/day | under 20k/day | 60k/day | 90k/day |
| R2 media | 10 GB-month | under 7 GB | 8.5 GB | 9.5 GB |
| Workers Paid baseline | about $5/month | under included 10M requests/month | 7M dynamic requests | 9M dynamic requests |

Main risks:

- This is the largest app architecture migration.
- Current Next.js App Router/API routes may need significant adaptation for Cloudflare runtime.
- D1 access is best through Workers bindings; using it directly from Vercel is less clean.
- Node-only dependencies such as native image processing, direct PostgreSQL clients, and filesystem assumptions must be removed from runtime paths or isolated into offline jobs.

Best fit:

- We are willing to restructure hosting and APIs for a Cloudflare-native free stack.
- Long-term lowest predictable cost matters more than minimizing the migration size.

Recommended operating mode:

- Start on Cloudflare Free only for development and staging.
- Use Workers Paid for production if daily D1/Worker limits, commercial reliability, or emergency recovery matter.
- Keep media on R2 Standard, not Infrequent Access, because the free tier applies to Standard storage and news images are read frequently.

## Option D - Conservative Fallback: Vercel + Supabase DB Only + R2

Structure:

- Hosting: Vercel Hobby
- Primary DB: Supabase Free
- Images and attachments: Cloudflare R2 Standard
- Supabase Storage: disabled for new writes

Why consider it:

- Lowest development risk.
- Solves the immediate Storage quota failure by moving media to R2.

Why it is not the long-term primary recommendation:

- Supabase Free DB is still only 500 MB per project.
- A future DB quota issue could again restrict the site.
- The user specifically wants to prepare for a new DB direction.

## Recommended Direction

Use Option C as the target:

Cloudflare Workers/Pages + D1 + R2.

Keep Option D as the shortest emergency recovery path if the May 18 migration window is too tight:

Vercel Hobby + Supabase DB only + Cloudflare R2.

Keep Option A only as a PostgreSQL-compatible fallback after RU monitoring proves safe. Keep Aiven PostgreSQL Developer as the cheapest predictable paid Postgres fallback if D1 migration becomes too risky.

Do not switch live traffic to the new DB before legacy data is exported, unless there is an emergency decision to run a temporary empty site or manually entered delta content.

## Cloudflare-First Migration Phases

Phase 0 - No-risk preparation before Supabase restores:

1. Add repository/provider interfaces for DB and media so the app can run against Supabase, D1, or a test fixture.
2. Add D1 schema migrations for articles, categories, settings, accounts, comments, view logs, Telegram logs, automation history, and media manifest.
3. Add R2 upload provider with deterministic paths, content-hash dedupe, WebP conversion policy, and max byte/dimension limits.
4. Move Node-only image processing to upload-time/offline jobs where possible, and keep Worker runtime paths lightweight.
5. Add Cloudflare deployment proof-of-concept with OpenNext, but do not replace Vercel until smoke tests pass.

Phase 1 - Data migration after Supabase access restores:

1. Export Supabase DB and Storage manifest.
2. Copy referenced media to R2 and rewrite article body/thumbnail URLs.
3. Import rows into D1 with count validation, random article rendering checks, and search result checks.
4. Keep Supabase read-only for rollback.

Phase 2 - Runtime switch:

1. Deploy Cloudflare staging with D1/R2 bindings.
2. Run smoke tests for home, search, article detail, admin login, upload, auto-press, Telegram report, and maintenance mode.
3. Switch DNS only after Cloudflare and Vercel render counts match.
4. Keep Vercel as rollback for 7-14 days.

Phase 3 - Cost hardening:

1. Cache public article/search pages aggressively.
2. Index D1 queries and block full-table admin scans.
3. Summarize logs daily and purge raw logs after 30-90 days.
4. Send Telegram alerts at 70%, 85%, and 95% of D1/R2/Worker targets.
5. Keep automated news/article scraping disabled unless copyright-safe source rules are implemented.

## Before 2026-05-18

Prepare without touching restricted Supabase production data:

1. Create Cloudflare D1 database and R2 bucket.
2. Add environment variables for the target stack.
3. Build a storage provider abstraction with `supabase` and `r2` implementations.
4. Build a DB provider abstraction with `supabase` and target DB implementations.
5. Create target schema migrations for articles, settings, accounts, comments, view logs, telegram logs, automation history, and media manifest.
6. Add migration scripts that can read an exported Supabase JSON/CSV dump and Storage manifest.
7. Add dry-run validators for row counts, article IDs, public URLs, image URL rewrites, and orphan media.
8. Add media controls: WebP conversion, max dimensions, max bytes, GIF policy, URL/hash dedupe.
9. Add quota monitoring and Telegram alerts for D1, R2, Workers, and the temporary Vercel fallback.
10. Keep live provider unchanged until Supabase data can be exported and Cloudflare staging passes smoke tests.

## After Supabase Access Restores

Execute in a controlled migration window:

1. Confirm Supabase REST and Storage APIs no longer return 402.
2. Export all DB tables/settings needed by the app.
3. Generate a Storage object manifest with size, path, content-type, article references, and orphan status.
4. Copy referenced media to R2, preserving a deterministic path.
5. Rewrite article body and thumbnail URLs from Supabase Storage to R2 public URLs.
6. Import DB rows to D1.
7. Verify article count, published/draft/trash counts, category counts, settings keys, search results, and random article rendering.
8. Deploy Cloudflare staging with D1/R2 bindings.
9. Run smoke tests for home, search, article detail, admin login, article edit, upload, auto-press, Telegram report, maintenance mode, and health.
10. Switch DNS only after Cloudflare and Vercel render counts match.
11. Keep Supabase read-only and Vercel available as rollback for 7-14 days.
12. Once verified, clean Supabase Storage below 1 GB or archive it.

## Guardrails

- No blind delete in Supabase Storage.
- No live provider switch before row-count and URL rewrite validation pass.
- No new Supabase Storage uploads after R2 provider is enabled.
- New logs must have retention or daily summary policies.
- Media must be deduplicated by source URL and content hash.
- Large GIFs and attachments must be blocked or stored under a stricter policy.

## Official References

- Supabase billing and quotas: https://supabase.com/docs/guides/platform/billing-on-supabase
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Cloudflare D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare Next.js on Workers: https://developers.cloudflare.com/workers/frameworks/framework-guides/nextjs/
- CockroachDB pricing: https://www.cockroachlabs.com/pricing/
- Aiven Developer Tier: https://aiven.io/developer-tier
- Turso pricing: https://turso.tech/pricing
- Vercel pricing: https://vercel.com/pricing
