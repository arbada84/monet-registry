---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Auto-press operations and queue reliability
status: In Progress
stopped_at: Phase 15 completed; Phase 16 D1 observability model and reconciliation active
last_updated: "2026-05-24T23:25:00+09:00"
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 10
  completed_plans: 1
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-24).

**Core value:** Existing production features must continue to work while auto-press becomes visible, retryable, and operationally safe.
**Current focus:** v3.0 auto-press operations and queue reliability. Linux development baseline and AI settings/key failure hardening are complete; Phase 16 D1 observability model and reconciliation are active.

## Current Position

Phase: Phase 16 active.
Plan: verify D1 migrations/provider helpers for auto-press run, item, event, retry queue, DLQ, source quality, and stuck/orphaned run reconciliation.

## Performance Metrics

**Velocity reference:**

- v2.0 plans completed: 15/15.
- v2.0 phases completed: 5/5.
- v3.0 plans completed: 1/10.
- v3.0 phases completed: 1/5.
- Linux baseline verified on 2026-05-24: Node 20.20.2, pnpm 9.12.2, Linux native `node_modules`, `sharp ok`, no tracked CRLF files, typecheck/unit/lint/audit/build passed.
- Latest verified chain: planning guard, maintenance admin API guard, automation schedule guard, auto-press agent-loop guard, typecheck, unit tests, lint, audit, metadata validation, and build.

**By Phase:**

| Phase | Plans | Status |
| --- | --- | --- |
| Phase 15 | 1/1 | Complete |
| Phase 16 | 0/2 | Active |
| Phase 17 | 0/3 | Planned |
| Phase 18 | 0/2 | Planned |
| Phase 19 | 0/2 | Planned |

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

### Pending Todos

- Phase 16: audit D1 schema/provider coverage for run, item, event, retry queue, DLQ, and source quality paths.
- Phase 16: verify stuck/orphaned queue-only runs become operator-visible failed/dead-letter states.
- Phase 16: identify any migration or provider gap before Phase 17 dashboard verification.

### Blockers/Concerns

- Dependency audit high-severity risk remains covered by `pnpm check:audit`; Linux check on 2026-05-24 passed with one moderate advisory below the configured high threshold.
- Maintenance admin API guard is covered by CI. Do not enable `MAINTENANCE_API_ENABLED=true` in production except for a short, explicit break-glass maintenance window.
- Supabase legacy data should remain untouched unless an explicit migration/export task is active.
- Cloudflare full runtime cutover is not part of v3.0 unless explicitly scoped later; v3.0 validates the auto-press Worker/Queue path only.

## Session Continuity

Last updated: 2026-05-24T23:25:00+09:00.
Resume from: Phase 16 D1 observability model and reconciliation.
