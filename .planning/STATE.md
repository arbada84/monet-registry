---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Operational optimization and code quality
status: Complete
stopped_at: Phase 14 deployed and live CSP verified; v2.0 planning consistency guard added
last_updated: "2026-05-21T02:05:00+09:00"
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 15
  completed_plans: 15
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-03-31).

**Core value:** Existing production features must continue to work while the codebase becomes safer and easier to operate.
**Current focus:** v2.0 implementation, deployment, live verification, planning consistency closure, and dependency audit remediation are complete.

## Current Position

Phase: v2.0 complete.
Plan: monitor the next operational issue or begin the next milestone.

## Performance Metrics

**Velocity reference:**

- v2.0 plans completed: 15/15.
- v2.0 phases completed: 5/5.
- Latest verified chain: dependency audit, planning consistency guard, automation schedule guard, auto-press agent-loop guard, typecheck, unit tests, lint/build as required by CI.

**By Phase:**

| Phase | Plans | Status |
| --- | --- | --- |
| Phase 10 | 3/3 | Complete |
| Phase 11 | 3/3 | Complete |
| Phase 12 | 4/4 | Complete |
| Phase 13 | 4/4 | Complete |
| Phase 14 | 1/1 | Complete |

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

### Pending Todos

None for v2.0.

### Blockers/Concerns

- Dependency audit risk was rechecked and remediated on 2026-05-21. Keep `pnpm check:audit` in CI to catch future high-severity advisories.
- Supabase legacy data should remain untouched unless an explicit migration/export task is active.

## Session Continuity

Last updated: 2026-05-21T02:05:00+09:00.
Resume from: next production issue, next user-prioritized admin/auto-press task, or a new v3.0 planning cycle.
