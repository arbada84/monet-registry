# Roadmap: CulturePeople

## Milestones

- [x] **v1.0 Essential features and fixes** - Phases 1-9, shipped 2026-03-27. See [v1.0 archive](milestones/v1.0-ROADMAP.md).
- [x] **v2.0 Operational optimization and code quality** - Phases 10-14, completed 2026-05-21.
- [ ] **v3.0 Portal growth and backup trust** - candidate milestone seeded 2026-06-14 from `docs/next-priority-implementation-plan.md`.

## Phases

<details>
<summary>v1.0 Essential features and fixes - shipped 2026-03-27</summary>

- [x] Phase 1: Authentication and security, 2/2 plans, completed 2026-03-26.
- [x] Phase 2: Public pages, 2/2 plans, completed 2026-03-26.
- [x] Phase 3: Admin CMS, 3/3 plans, completed 2026-03-26.
- [x] Phase 4: Automation pipeline, 2/2 plans, completed 2026-03-26.
- [x] Phase 5: Community and ads, 2/2 plans, completed 2026-03-26.
- [x] Phase 6: SEO, feed, and AI tools, 2/2 plans, completed 2026-03-26.
- [x] Phase 7: Article quality checks, 2/2 plans, completed 2026-03-26.
- [x] Phase 8: Auto-press RSS migration, 2/2 plans, completed 2026-03-27.
- [x] Phase 9: CockroachDB integration, 2/2 plans, completed 2026-03-27.

</details>

### v2.0 Operational Optimization And Code Quality - Complete

**Milestone Goal:** Reduce accumulated technical debt after v1.0, improve operational stability, strengthen security, and preserve all existing production behavior.

- [x] **Phase 10: Operational stability** - query optimization, database filtering, Redis rate limits, secure cookies, and temp-file cleanup. Completed 2026-03-31.
- [x] **Phase 11: Code cleanup and quality** - legacy DB cleanup, duplicate route consolidation, script archival, and ESLint guard restoration. Completed 2026-04-01.
- [x] **Phase 12: Feature additions** - image optimization, automation history dashboard, full-text search, and dashboard alerts. Completed 2026-04-02.
- [x] **Phase 13: Tests and refactoring** - unit tests, E2E coverage, and large admin page splits. Completed 2026-05-21.
- [x] **Phase 14: CSP security hardening** - nonce-based CSP with live production verification. Completed 2026-05-21.

## Phase Details

### v3.0 Portal Growth And Backup Trust - Candidate

**Milestone Goal:** Improve portal/search inflow readiness while keeping local backups trustworthy and low-load.

- [x] **Phase 15: Portal publication surface** - common publication pipeline, IndexNow key route, direct RSS/feed, news sitemap, RSS full-content defaults, and low-request portal verifier.
- [x] **Phase 16: Portal review materials** - `/cam/portal-review`, CSV/JSON export API, and publication/category/author/source metrics.
- [x] **Phase 17: Backup observability** - local status split for DB/SQLite and image backfill, stale Supabase fallback warnings, and next-action guidance.
- [ ] **Phase 18: Live deployment and representative portal tasks** - deploy local changes, verify production URL responses, and complete external portal ownership/affiliation steps.
- [ ] **Phase 19: Admin smoke expansion** - authenticated browser smoke for key save/export flows when stable smoke credentials are available.

### Phase 10: Operational Stability

**Goal:** Improve site response time and operational consistency without changing user-visible behavior.
**Depends on:** Phase 9.
**Requirements:** PERF-01, PERF-02, SEC-01, SEC-02, CLEAN-01.
**Success Criteria:**

1. Public category/admin list pages use purpose-built queries and fetch only needed columns.
2. Admin article list filtering for status, category, and search is handled by the database.
3. In-memory rate limit maps are replaced by Redis-backed shared state.
4. Auth cookies are always created with the secure flag.
5. Root temp files are removed and matching ignore rules are present.

**Plans:** 3 plans

- [x] 10-01-PLAN.md - purpose-built article query helpers for PERF-01.
- [x] 10-02-PLAN.md - Redis rate limits, secure cookie enforcement, and temp cleanup for SEC-01, SEC-02, CLEAN-01.
- [x] 10-03-PLAN.md - admin article list database filtering for PERF-02.

### Phase 11: Code Cleanup And Quality

**Goal:** Remove unused legacy code paths and keep the production data route consistent.
**Depends on:** Phase 10.
**Requirements:** CLEAN-02, CLEAN-03, CLEAN-04, QUAL-01.
**Success Criteria:**

1. Legacy MySQL/File DB production paths are removed or isolated from production.
2. Comment APIs share `supabase-server-db.ts` helpers instead of duplicate logic.
3. One-off migration/test/fix scripts are archived under `scripts/_archive/`.
4. `@typescript-eslint/no-explicit-any` is restored as a warning with scoped exceptions only where justified.

**Plans:** 3 plans

- [x] 11-01-PLAN.md - remove MySQL/File DB legacy production paths for CLEAN-02.
- [x] 11-02-PLAN.md - consolidate comment routes through shared Supabase helpers for CLEAN-03.
- [x] 11-03-PLAN.md - archive one-off scripts and restore `no-explicit-any` guard for CLEAN-04, QUAL-01.

### Phase 12: Feature Additions

**Goal:** Improve admin visibility and public search performance while reducing media weight.
**Depends on:** Phase 11.
**Requirements:** PERF-03, FEAT-01, FEAT-02, FEAT-03.
**Success Criteria:**

1. Image uploads are resized and converted to WebP where supported.
2. Admin dashboard shows auto-press and auto-news execution history.
3. Article search uses database-backed full-text search.
4. Operational alarms and AI/edit/security failures are visible on the dashboard.

**Plans:** 4 plans

- [x] 12-01-PLAN.md - image resize and WebP conversion for PERF-03.
- [x] 12-02-PLAN.md - auto-press/auto-news dashboard history for FEAT-01.
- [x] 12-03-PLAN.md - full-text search integration for FEAT-02.
- [x] 12-04-PLAN.md - admin notification events for FEAT-03.

### Phase 13: Tests And Refactoring

**Goal:** Add automated coverage for critical behavior and split large admin files into maintainable units.
**Depends on:** Phase 12.
**Requirements:** TEST-01, TEST-02, QUAL-02.
**Success Criteria:**

1. Unit tests cover cookie auth token behavior, article CRUD, and cron helpers.
2. E2E tests cover admin article create/edit/delete and settings save flows.
3. Large admin settings/edit files are split into subcomponents with checked files below 300 lines.

**Plans:** 4 plans

- [x] 13-01-PLAN.md - critical business logic unit tests for TEST-01.
- [x] 13-02-PLAN.md - admin flow E2E tests for TEST-02.
- [x] 13-03-PLAN.md - split large admin settings and edit pages for QUAL-02.
- [x] 13-04-PLAN.md - final validation, coverage review, and closure.

### Phase 14: CSP Security Hardening

**Goal:** Strengthen XSS protection by moving production scripts to nonce-based CSP.
**Depends on:** Phase 13.
**Requirements:** SEC-03.
**Success Criteria:**

1. Production CSP no longer depends on broad script `unsafe-inline`.
2. Inline scripts generated by the app receive a request nonce.
3. Ads, analytics, and internal scripts continue to work under nonce CSP.
4. Live production pages verify with the expected CSP header.

**Plans:** 1 plan

- [x] 14-01-PLAN.md - nonce CSP hardening and production verification for SEC-03.

## Progress

**Execution Order:** 10 -> 11 -> 12 -> 13 -> 14.

| Phase | Milestone | Plans Complete | Status | Completed |
| --- | --- | --- | --- | --- |
| 1. Authentication and security | v1.0 | 2/2 | Complete | 2026-03-26 |
| 2. Public pages | v1.0 | 2/2 | Complete | 2026-03-26 |
| 3. Admin CMS | v1.0 | 3/3 | Complete | 2026-03-26 |
| 4. Automation pipeline | v1.0 | 2/2 | Complete | 2026-03-26 |
| 5. Community and ads | v1.0 | 2/2 | Complete | 2026-03-26 |
| 6. SEO, feed, and AI tools | v1.0 | 2/2 | Complete | 2026-03-26 |
| 7. Article quality checks | v1.0 | 2/2 | Complete | 2026-03-26 |
| 8. Auto-press RSS migration | v1.0 | 2/2 | Complete | 2026-03-27 |
| 9. CockroachDB integration | v1.0 | 2/2 | Complete | 2026-03-27 |
| 10. Operational stability | v2.0 | 3/3 | Complete | 2026-03-31 |
| 11. Code cleanup and quality | v2.0 | 3/3 | Complete | 2026-04-01 |
| 12. Feature additions | v2.0 | 4/4 | Complete | 2026-04-02 |
| 13. Tests and refactoring | v2.0 | 4/4 | Complete | 2026-05-21 |
| 14. CSP security hardening | v2.0 | 1/1 | Complete | 2026-05-21 |

## Consistency Guard

Run `pnpm check:planning` whenever `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, or `.planning/STATE.md` changes. This guard prevents completed requirements from drifting back to pending status and catches impossible plan counts before CI passes.
