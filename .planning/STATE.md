---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Auto-press operations and queue reliability
status: Shipped
stopped_at: v3.0 shipped after GitHub CI, Cloudflare Worker deploy, Vercel deploy, and production health checks
last_updated: "2026-05-25T01:34:31+09:00"
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 10
  completed_plans: 10
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-24).

**Core value:** Existing production features must continue to work while auto-press becomes visible, retryable, and operationally safe.
**Current focus:** v3.0 auto-press operations and queue reliability is shipped, including Linux development baseline, AI settings/key failure hardening, D1 schema/provider coverage, stuck-run reconciliation, manual run API contracts, dashboard UX verification, health readiness, D1 retry queue processor verification, Telegram command/report verification, Worker/Queue rollout validation, final Linux CI closure, GitHub CI, Cloudflare Worker deploy, Vercel production deploy, and production health checks.

## Current Position

Phase: v3.0 shipped.
Plan: ready for v4.0 candidate scoping.

## Performance Metrics

**Velocity reference:**

- v2.0 plans completed: 15/15.
- v2.0 phases completed: 5/5.
- v3.0 plans completed: 10/10.
- v3.0 phases completed: 5/5.
- Linux baseline verified on 2026-05-24: Node 20.20.2, pnpm 9.12.2, Linux native `node_modules`, `sharp ok`, no tracked CRLF files, typecheck/unit/lint/audit/build passed.
- Latest verified chain: local `pnpm ci:all`, GitHub `CI & Deploy`, Cloudflare Auto Press Worker deploy, Vercel production deploy, production `/` HTTP 200, and production `/api/health` `status: ok`.

**By Phase:**

| Phase | Plans | Status |
| --- | --- | --- |
| Phase 15 | 1/1 | Complete |
| Phase 16 | 2/2 | Complete |
| Phase 17 | 3/3 | Complete |
| Phase 18 | 2/2 | Complete |
| Phase 19 | 2/2 | Complete |

## Accumulated Context

### Decisions

- Phase 10 kept existing behavior while introducing purpose-built article queries, Redis-backed rate limits, secure cookies, and DB-backed admin filtering.
- Phase 11 kept `db-server.ts` as a thin compatibility wrapper instead of deleting it abruptly, minimizing call-site churn.
- Phase 11 consolidated comment APIs through shared Supabase helpers and archived one-off scripts under `scripts/_archive/`.
- Phase 12 applied image resize/WebP conversion before watermarking, while preserving GIF animation by excluding GIFs from conversion.
- Phase 12 accepted the existing full-text search implementation as satisfying FEAT-02 without unnecessary rework.
- Phase 13 split large admin files and added test coverage without changing public behavior.
- Phase 14 moved production CSP to nonce-based script execution and live-verified `/`, `/cam/login`, and `/api/health`.
- Planning docs now use `pnpm check:planning` to prevent completed work from being represented as pending.
- Dependency audit remediation upgraded Next.js to 15.5.18 and patched transitive `hono`, `basic-ftp`, `ip-address`, `brace-expansion`, and `ws` via overrides; `pnpm audit --json` reported 0 vulnerabilities on 2026-05-21.
- Maintenance admin APIs (`/api/admin/fix-*`, `/api/admin/migrate-*`) must stay disabled by default and guarded before generic admin auth. `pnpm check:maintenance-admin` enforces the guard order and `MAINTENANCE_API_ENABLED=true` break-glass requirement.
- Active development moved from the Windows-mounted `/media/.../Users/Documents/...` path to `/home/arbada/dev/monet-registry-main` to avoid CRLF churn, `777` permissions, and Windows native package leftovers.
- v3.0 treats the existing auto-press observability/queue code as an implementation baseline that must be audited, verified, and closed against explicit requirements.
- Auto-press operator state must be durable in D1 and visible through admin/Telegram paths; `cp-auto-press-history` remains compatibility data only.
- AI settings failures are now classified as `NO_AI_SETTINGS` when the settings object is absent and `NO_AI_KEY` when settings exist but the selected provider has no usable key.
- Auto-press D1 schema/provider coverage is guarded by `pnpm check:auto-press-agent-loop`, including required migration files, runtime columns, DLQ/source quality routes, and Worker `auto_press_item_id` traceability.
- Stuck queue-only runs are reconciled from D1 item state: missing item runs fail with `QUEUE_ITEMS_MISSING`, expired Worker leases requeue with `WORKER_LEASE_EXPIRED`, and exhausted items become DLQ-visible with `QUEUE_ITEMS_STUCK`.
- Manual run APIs now return stable `runId`/`queueId` values and preserve `executionMode`/`maxCandidates` during continuation so the dashboard can poll and continue runs deterministically.
- `/cam/auto-press` dashboard coverage is now guarded for run summaries, event timeline, item results, retry queue, DLQ, source quality, health controls, operator actions, and client-side secret hygiene.
- `/api/auto-press/health` now reports database, AI, media storage, Worker runtime, retry scheduler, observability/retry queue, and source readiness; enabled sources missing RSS targets become operator-visible health errors.
- AI retry processing is D1 queue driven and now validates retry target type before reading AI settings; malformed or targetless rows become manual-review `AI_RETRY_TARGET_INVALID` entries.
- Telegram commands and daily reports now expose D1 run state, retry queue state, DLQ/source quality summaries, and Korean operator actions. `/auto_press_dlq` is the direct DLQ command.
- Worker/Queue rollout contracts are guarded: dispatch/process bearer auth, rollout disable flag, source scope before AI work, queue `sourceId` preservation, worker notify auth/cache revalidation, and DLQ retry/discard behavior.
- Final v3.0 Linux CI closure passed on 2026-05-25: auto-press agent-loop guard, Worker syntax check, full `pnpm ci:all`, and diff hygiene.
- v3.0 shipped on 2026-05-25 at `d92c892`: GitHub CI passed, Cloudflare Worker deploy passed, Vercel production deploy completed, `https://culturepeople.co.kr` returned HTTP 200, and `/api/health` returned `status: ok`.

### Pending Todos

- Scope the next v4.0 candidate milestone. Known candidates: registry payload split/artifact pipeline, admin server-component conversion, SMTP credential hardening, or Cloudflare-first runtime cutover after staging parity.

### Blockers/Concerns

- Dependency audit high-severity risk remains covered by `pnpm check:audit`; Linux check on 2026-05-24 passed with one moderate advisory below the configured high threshold.
- Maintenance admin API guard is covered by CI. Do not enable `MAINTENANCE_API_ENABLED=true` in production except for a short, explicit break-glass maintenance window.
- Supabase legacy data should remain untouched unless an explicit migration/export task is active.
- Cloudflare full runtime cutover is not part of v3.0 unless explicitly scoped later; v3.0 validates the auto-press Worker/Queue path only.

## Session Continuity

Last updated: 2026-05-25T01:34:31+09:00.
Resume from: v4.0 candidate scoping.
