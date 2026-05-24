# Phase 16-01 Summary: D1 observability schema and provider audit

## Completed

- Audited the active D1 auto-press observation model against Next.js helpers, admin routes, retry/DLQ routes, source quality routes, and the Cloudflare Worker.
- Added additive migration `0005_auto_press_observability_indexes.sql` with:
  - `articles.auto_press_item_id`
  - unique article-to-observed-item trace index
  - reconciliation, DLQ, source quality, and retry-due indexes
- Updated the Cloudflare Worker article insert to persist the originating `auto_press_items.id` into `articles.auto_press_item_id`.
- Updated Worker documentation to require D1 migrations `0001` through `0005`.
- Extended `pnpm check:auto-press-agent-loop` so it now fails if:
  - required auto-press D1 migration files are missing
  - required run/item/event/retry/source usage columns are missing
  - DLQ/source quality routes stop using D1 observability helpers
  - Worker article writes stop preserving `auto_press_item_id`

## Verification

- `node --check scripts/auto-press-agent-loop-verify.mjs`
- `node --check cloudflare/auto-press-worker/src/index.js`
- `pnpm check:auto-press-agent-loop`
- `pnpm test:unit -- auto-press-observability` - 55 files, 306 tests passed
- `pnpm ci:typecheck`

## Follow-Up

Continue with Phase 16-02:

- Verify stuck queue-only runs with stale queued/running items become operator-visible terminal states.
- Preserve run/item/event evidence when reconciliation marks a run failed or dead-lettered.
- Keep `cp-auto-press-history` as compatibility history only.
