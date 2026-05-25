---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: Registry payload and API weight reduction
status: In Progress
stopped_at: Phase 21-01 registry payload baseline guard implemented; CI guard order fixed for clean checkouts; dual-OS workflow documented
last_updated: "2026-05-25T05:24:00+09:00"
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 5
  completed_plans: 1
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-25).

**Core value:** Existing production features must continue to work while registry/API payload weight is reduced safely.
**Current focus:** v5.0 registry payload and API weight reduction is active. Phase 21 starts with payload measurement and regression guards before changing runtime read paths.

## Current Position

Phase: Phase 21 in progress.
Plan: 21-01 complete; 21-02 artifact split contract and migration checklist is next.

## Performance Metrics

**Velocity reference:**

- v2.0 plans completed: 15/15.
- v2.0 phases completed: 5/5.
- v3.0 plans completed: 10/10.
- v3.0 phases completed: 5/5.
- v4.0 plans completed: 2/2.
- v4.0 phases completed: 1/1.
- v5.0 plans completed: 1/5.
- v5.0 phases completed: 0/3.
- Linux primary baseline verified on 2026-05-24: Node 20.20.2, pnpm 9.12.2, Linux native `node_modules`, `sharp ok`, no tracked CRLF files, typecheck/unit/lint/audit/build passed.
- Windows remains a fallback development environment. When switching OS, use a clean git state, reinstall OS-native dependencies, regenerate ignored artifacts, and run the same verification commands before pushing.
- Latest verified chain: v4.0 shipped with local checks, GitHub `CI & Deploy`, Vercel production deploy, production `/` HTTP 200, and production `/api/health` `status: ok`.
- Registry payload baseline on 2026-05-25: `public/generated/registry.json` 1,316,916 bytes / 149,764 gzip bytes / 1,014 components; `registry.json` 426,736 bytes; `tag-index.json` 313,531 bytes.

**By Phase:**

| Phase | Plans | Status |
| --- | --- | --- |
| Phase 15 | 1/1 | Complete |
| Phase 16 | 2/2 | Complete |
| Phase 17 | 3/3 | Complete |
| Phase 18 | 2/2 | Complete |
| Phase 19 | 2/2 | Complete |
| Phase 20 | 2/2 | Complete |
| Phase 21 | 1/2 | In Progress |
| Phase 22 | 0/TBD | Planned |
| Phase 23 | 0/TBD | Planned |

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
- Active development is Linux-primary from `/home/arbada/dev/monet-registry-main`, but Windows fallback remains supported. Avoid editing the same uncommitted changes in both working trees; switch via commit/stash/pull and reinstall OS-native dependencies as needed.
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
- v4.0 added an env-first SMTP runtime resolver, safe admin runtime status, env-managed save protection, and an operator runbook for Vercel SMTP migration.
- v4.0 shipped on 2026-05-25 at `ca7e9e8`: GitHub CI and Vercel production deploy passed; production `/` and `/api/health` were healthy.
- v5.0 starts with registry payload measurement and a CI guard because the current generated component registry is 1.3MB and runtime/API paths read the full artifact before any split contract exists.

### Pending Todos

- 21-02: Define summary/detail/search artifact contracts and migration checklist.
- Phase 22: Implement generated artifact split and service/API adoption.
- Phase 23: Run full CI/build/API smoke and production verification before closing v5.0.

### Blockers/Concerns

- The Windows-mounted `/media/.../Users/Documents/...` checkout can be used as a fallback, but its broad dirty status must be cleaned or intentionally reconciled before switching work back there.
- Dependency audit high-severity risk remains covered by `pnpm check:audit`; Linux check on 2026-05-24 passed with one moderate advisory below the configured high threshold.
- Maintenance admin API guard is covered by CI. Do not enable `MAINTENANCE_API_ENABLED=true` in production except for a short, explicit break-glass maintenance window.
- Supabase legacy data should remain untouched unless an explicit migration/export task is active.
- Cloudflare full runtime cutover is not part of v5.0 unless explicitly scoped later.

## Session Continuity

Last updated: 2026-05-25T05:24:00+09:00.
Resume from: Phase 21-02 artifact split contract and migration checklist.
