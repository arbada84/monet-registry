# Requirements: CulturePeople v2.0 Stabilization

**Defined:** 2026-03-31
**Last updated:** 2026-05-21
**Core value:** Existing production features must continue to work while technical debt, operational risk, and security exposure are reduced.

## v2.0 Requirements

v2.0 starts after the v1.0 essential feature milestone and focuses on performance, security, cleanup, tests, and operational visibility.

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

These items are candidates for v3.0 or later and are intentionally out of v2.0 scope.

- Split large registry component payloads into a separate repository or artifact pipeline.
- Convert more admin pages to server components with smaller client islands.
- Move SMTP credentials from database settings to Vercel environment variables.
- Continue reducing Vercel CPU usage for long-running auto-press workflows.

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

**Coverage:**

- v2.0 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0

## Consistency Guard

Run `pnpm check:planning` after changing planning files. The guard fails if completed v2.0 requirements are marked pending, completed plan files are unchecked, Phase 12-14 plans are left as `TBD`, or `.planning/STATE.md` has impossible plan counts.
