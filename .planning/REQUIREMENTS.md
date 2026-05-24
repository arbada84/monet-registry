# Requirements: CulturePeople v3.0 Auto-Press Operations

**Defined:** 2026-03-31
**Last updated:** 2026-05-25
**Core value:** Existing production features must continue to work while auto-press becomes visible, retryable, and operationally safe.

## v3.0 Requirements

v3.0 starts after the v2.0 stabilization milestone and focuses on 보도자료 자동등록 관측성, 대기열, 재시도, 텔레그램 운영 리포트, 그리고 리눅스 개발 기준선 정착.

### Development Baseline

- [x] **DEV-01**: Move active development to a Linux-native working tree with Node 20, pnpm 9.12.2, Linux native dependencies, and LF line-ending safeguards. Complete in setup commit `8e31340`.

### Auto-Press Failure Handling

- [x] **AUTO-01**: AI settings/key failures must not terminate auto-press with an unhandled 500; they must become structured failure items using `NO_AI_SETTINGS` or `NO_AI_KEY`. Complete in Phase 15.
- [x] **AUTO-02**: Auto-press failure reason codes must be consistent across run snapshots, item rows, retry queue rows, admin UI, and Telegram messages. Complete in Phase 15.

### Observability And Queue State

- [x] **AUTO-03**: D1-backed `auto_press_runs`, `auto_press_items`, `auto_press_events`, and `auto_press_retry_queue` paths must capture every manual/cron/worker run without relying only on `cp-auto-press-history`. Complete in Phase 16-01.
- [x] **AUTO-04**: Run reconciliation must detect stuck or orphaned queue-only runs and convert them into operator-visible failed/dead-letter states. Complete in Phase 16-02.
- [x] **AUTO-05**: Manual execution must support run creation, short batch processing, continuation, cancellation, heartbeat/status polling, and item-level retry. Complete in Phase 17-01.

### Admin And Operator UX

- [x] **AUTO-06**: `/cam/auto-press` must show run summary, current progress, recent events, item results, retry queue, DLQ, and source quality without leaking secrets. Complete in Phase 17-02.
- [x] **AUTO-07**: `/api/auto-press/health` must report AI, D1, R2/media, worker, and source readiness in a form operators can act on. Complete in Phase 17-03.

### Retry, Worker, And Notifications

- [x] **AUTO-08**: AI retry processing must use the D1 retry queue and provider-safe retry target handling instead of direct Supabase-only scans. Complete in Phase 18-01.
- [ ] **AUTO-09**: Cloudflare Worker/Queue dispatch must preserve duplicate guards, source scope controls, worker notification auth, DLQ actions, and cache revalidation.
- [x] **OPS-01**: Telegram commands and daily reports must include auto-press run status, retry queue status, DLQ/source quality summaries, and actionable Korean messages. Complete in Phase 18-02.

### Verification

- [ ] **QA-01**: Unit tests, route tests, worker guard tests, planning guard, lint, typecheck, audit, and build must pass in the Linux working tree before v3.0 closure.

## v2.0 Requirements

v2.0 started after the v1.0 essential feature milestone and focused on performance, security, cleanup, tests, and operational visibility. It remains complete.

### Performance

- [x] **PERF-01**: Replace broad `serverGetArticles()` reads with purpose-built queries such as `serverGetRecentArticles()` and `serverGetArticleIds()` so public pages do not transfer unnecessary data. Complete in Phase 10.
- [x] **PERF-02**: Move `/api/db/articles` filtering for search, status, and category from client-side filtering to database-backed filtering. Complete in Phase 10.
- [x] **PERF-03**: Resize uploaded images and convert supported images to WebP before storage. Complete in Phase 12.

### Security

- [x] **SEC-01**: Replace in-memory rate-limit maps with shared Redis-backed limits so serverless instances behave consistently. Complete in Phase 10.
- [x] **SEC-02**: Force auth cookies to use the `secure` flag independent of `NODE_ENV`. Complete in Phase 10.
- [x] **SEC-03**: Move production CSP to nonce-based script execution and minimize `unsafe-inline` / `unsafe-eval`. Complete in Phase 14 and live-verified on 2026-05-21.

### Cleanup

- [x] **CLEAN-01**: Remove root temp files and add ignore patterns for `temp_*`, `tmp_*`, `cookies.txt`, and `nul`. Complete in Phase 10.
- [x] **CLEAN-02**: Remove production use of legacy MySQL/File DB code paths and keep the Supabase path as the single production route. Complete in Phase 11.
- [x] **CLEAN-03**: Consolidate comment routes through shared `supabase-server-db.ts` helpers. Complete in Phase 11.
- [x] **CLEAN-04**: Move one-off migration/test/fix scripts to `scripts/_archive/` and clean obsolete SQL/Python files. Complete in Phase 11; verified by `11-VERIFICATION.md`.

### Tests

- [x] **TEST-01**: Add unit coverage for critical business logic including cookie auth token generation/verification, article CRUD, and cron helper behavior. Complete in Phase 13.
- [x] **TEST-02**: Add E2E coverage for key admin flows including article create/edit/delete and settings save. Complete in Phase 13.

### Code Quality

- [x] **QUAL-01**: Restore `@typescript-eslint/no-explicit-any` as `warn` and fix primary violations, keeping only justified scoped exceptions. Complete in Phase 11; verified by `11-VERIFICATION.md`.
- [x] **QUAL-02**: Split large admin settings/edit pages into maintainable subcomponents with checked files under 300 lines. Complete in Phase 13.

### Feature Additions

- [x] **FEAT-01**: Show auto-press and auto-news execution history on the admin dashboard, including success/failure charts and recent run statistics. Complete in Phase 12; verified by `12-feature-additions/VERIFICATION.md`.
- [x] **FEAT-02**: Improve article search with database-backed full-text search. Complete in Phase 12.
- [x] **FEAT-03**: Surface alarms, AI edit failures, and security events on the admin dashboard. Complete in Phase 12.

## Future Requirements

These items are candidates for v4.0 or later and are intentionally out of v3.0 scope.

- Split large registry component payloads into a separate repository or artifact pipeline.
- Convert more admin pages to server components with smaller client islands.
- Move SMTP credentials from database settings to Vercel environment variables.
- Full Cloudflare-first runtime cutover for the whole Next.js app after staging smoke parity is proven.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Registry repository split | Larger architecture work than v2.0 stabilization. |
| Full architecture rewrite | v2.0 focuses on safer incremental changes. |
| Vercel Pro requirement | Cost control remains a project constraint. |
| Mobile app | Public responsive/PWA behavior is sufficient for this milestone. |

## Traceability

| Requirement | Phase | Status |
| --- | --- | --- |
| PERF-01 | Phase 10 | Complete |
| PERF-02 | Phase 10 | Complete |
| PERF-03 | Phase 12 | Complete |
| SEC-01 | Phase 10 | Complete |
| SEC-02 | Phase 10 | Complete |
| SEC-03 | Phase 14 | Complete |
| CLEAN-01 | Phase 10 | Complete |
| CLEAN-02 | Phase 11 | Complete |
| CLEAN-03 | Phase 11 | Complete |
| CLEAN-04 | Phase 11 | Complete |
| QUAL-01 | Phase 11 | Complete |
| QUAL-02 | Phase 13 | Complete |
| TEST-01 | Phase 13 | Complete |
| TEST-02 | Phase 13 | Complete |
| FEAT-01 | Phase 12 | Complete |
| FEAT-02 | Phase 12 | Complete |
| FEAT-03 | Phase 12 | Complete |
| DEV-01 | Setup | Complete |
| AUTO-01 | Phase 15 | Complete |
| AUTO-02 | Phase 15 | Complete |
| AUTO-03 | Phase 16 | Complete |
| AUTO-04 | Phase 16 | Complete |
| AUTO-05 | Phase 17 | Complete |
| AUTO-06 | Phase 17 | Complete |
| AUTO-07 | Phase 17 | Complete |
| AUTO-08 | Phase 18 | Complete |
| AUTO-09 | Phase 19 | Pending |
| OPS-01 | Phase 18 | Complete |
| QA-01 | Phase 19 | Pending |

**Coverage:**

- v2.0 requirements: 17 total, complete
- v3.0 requirements: 12 total, 10 complete, 2 pending
- Mapped to phases/setup: 29
- Unmapped: 0

## Consistency Guard

Run `pnpm check:planning` after changing planning files. The guard fails if completed v2.0 requirements are marked pending, completed plan files are unchecked, Phase 12-14 plans are left as `TBD`, v2.0 is represented as active again, or `.planning/STATE.md` has impossible plan counts.
