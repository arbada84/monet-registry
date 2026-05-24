# Roadmap: CulturePeople

## Milestones

- [x] **v1.0 Essential features and fixes** - Phases 1-9, shipped 2026-03-27. See [v1.0 archive](milestones/v1.0-ROADMAP.md).
- [x] **v2.0 Operational optimization and code quality** - Phases 10-14, completed 2026-05-21.
- [x] **v3.0 Auto-press operations and queue reliability** - Phases 15-19, shipped 2026-05-25.
- [x] **v4.0 SMTP credential hardening** - Phase 20, completed 2026-05-25.
- [ ] **v5.0 Registry payload and API weight reduction** - Phases 21-23, started 2026-05-25.

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

### v3.0 Auto-Press Operations And Queue Reliability - Shipped

**Milestone Goal:** Make auto-press execution visible, retryable, and safe for operators while preserving the current live Vercel/Cloudflare hybrid architecture.

- [x] **Phase 15: Baseline audit and failure hardening** - align current implementation with v3.0 requirements, verify Linux baseline, and close AI settings/key failure handling. Completed 2026-05-24.
- [x] **Phase 16: D1 observability model and reconciliation** - verify/add D1 run, item, event, retry queue, source quality, and stuck-run reconciliation behavior. Completed 2026-05-24.
- [x] **Phase 17: Manual run dashboard and batch processor** - validate run creation, continuation, cancellation, item retry, health, and `/cam/auto-press` operator UX. Completed 2026-05-25.
- [x] **Phase 18: AI retry queue and Telegram operations** - verify D1-backed retry processing, Telegram commands, daily report, and Korean operational messages. Completed 2026-05-25.
- [x] **Phase 19: Worker queue rollout validation** - verify Cloudflare Worker dispatch, duplicate guards, DLQ actions, worker notify auth, cache revalidation, and full Linux CI closure. Completed 2026-05-25.

**Ship Verification:** Pushed to `origin/main` at `d92c892`, GitHub `CI & Deploy` passed, Cloudflare Worker deploy passed, Vercel production deploy aliased `https://culturepeople.co.kr`, and `/api/health` returned `status: ok` on 2026-05-25.

### v4.0 SMTP Credential Hardening - Complete

**Milestone Goal:** Move SMTP/newsletter sending credentials to Vercel environment variables first, keep DB settings as a safe compatibility path, and prevent admins from exposing or overwriting secret values.

- [x] **Phase 20: SMTP credential hardening** - add env-first SMTP resolver, update send/test paths, harden admin UX, add tests, and document deployment. Completed 2026-05-25.

Deferred candidate tracks:

- Admin server-component conversion with smaller client islands.
- Cloudflare-first runtime cutover only after staging smoke parity is proven.

### v5.0 Registry Payload And API Weight Reduction - In Progress

**Milestone Goal:** Reduce generated registry/API payload weight by establishing a measurable baseline, splitting summary/detail/search artifacts, and moving runtime reads to the smallest safe artifact for each path.

- [ ] **Phase 21: Registry payload baseline and contract** - measure generated payloads, add CI guard, and define split contracts. In progress.
- [ ] **Phase 22: Registry artifact split and service adoption** - generate summary/detail/search artifacts and move list/search/detail services to the lighter reads. Planned.
- [ ] **Phase 23: Registry rollout validation** - verify API compatibility, build/cache behavior, and production smoke after deploy. Planned.

## Phase Details

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

### Phase 15: Baseline Audit And Failure Hardening

**Goal:** Establish the v3.0 auto-press baseline, preserve the verified Linux development environment, and make AI configuration failures operator-visible instead of unhandled crashes.
**Depends on:** Phase 14.
**Requirements:** DEV-01, AUTO-01, AUTO-02.
**Success Criteria:**

1. Active development runs from the Linux-native working tree with Node 20, pnpm 9.12.2, LF line endings, and Linux native dependencies.
2. Existing auto-press observability, retry, DLQ, worker, and Telegram paths are mapped against the v3.0 requirements.
3. AI settings/key failures produce `NO_AI_SETTINGS` or `NO_AI_KEY` state consistently in logs, rows, admin responses, and Telegram summaries.
4. Targeted tests cover the failure mapping and current route surface.

**Plans:** 1 plan

- [x] 15-01-PLAN.md - baseline audit, AI failure hardening, and verification closure for DEV-01, AUTO-01, AUTO-02.

### Phase 16: D1 Observability Model And Reconciliation

**Goal:** Ensure every auto-press run has durable D1-backed run, item, event, retry queue, source quality, and reconciliation state.
**Depends on:** Phase 15.
**Requirements:** AUTO-03, AUTO-04.
**Success Criteria:**

1. D1 migrations and provider helpers cover all auto-press observation tables used by runtime code.
2. Stuck, orphaned, or queue-only runs become visible failed/dead-letter states.
3. Legacy `cp-auto-press-history` remains a compatibility path, not the only source of truth.

**Plans:** 2 plans

- [x] 16-01-PLAN.md - schema/provider audit and missing migration closure for AUTO-03. Completed 2026-05-24.
- [x] 16-02-PLAN.md - reconciliation and stuck-run behavior verification for AUTO-04. Completed 2026-05-24.

### Phase 17: Manual Run Dashboard And Batch Processor

**Goal:** Make manual execution observable and controllable from `/cam/auto-press`.
**Depends on:** Phase 16.
**Requirements:** AUTO-05, AUTO-06, AUTO-07.
**Success Criteria:**

1. Manual run creation returns a run ID and supports polling, continuation, cancellation, and item-level retry.
2. `/cam/auto-press` shows summaries, events, item results, retry queue, DLQ, source quality, and health without exposing secrets.
3. Health responses distinguish AI, D1, R2/media, worker, and source readiness.

**Plans:** 3 plans

- [x] 17-01-PLAN.md - manual run processor and continuation verification for AUTO-05. Completed 2026-05-24.
- [x] 17-02-PLAN.md - auto-press admin dashboard UX verification for AUTO-06. Completed 2026-05-25.
- [x] 17-03-PLAN.md - health endpoint and preflight readiness verification for AUTO-07. Completed 2026-05-25.

### Phase 18: AI Retry Queue And Telegram Operations

**Goal:** Make AI retry and operator notifications use the same D1-backed operational state.
**Depends on:** Phase 17.
**Requirements:** AUTO-08, OPS-01.
**Success Criteria:**

1. Retry processing reads and updates `auto_press_retry_queue` rather than relying on Supabase-only scans.
2. Retry target handling safely distinguishes unpublished queued items, published articles, and manual-review cases.
3. Telegram commands and daily reports surface run status, retry queue, DLQ/source quality, and actionable Korean messages.

**Plans:** 2 plans

- [x] 18-01-PLAN.md - D1 retry queue processor verification for AUTO-08. Completed 2026-05-25.
- [x] 18-02-PLAN.md - Telegram command/report verification for OPS-01. Completed 2026-05-25.

### Phase 19: Worker Queue Rollout Validation

**Goal:** Verify the Cloudflare Worker/Queue path can safely process auto-press work without regressing Vercel/admin behavior.
**Depends on:** Phase 18.
**Requirements:** AUTO-09, QA-01.
**Success Criteria:**

1. Worker dispatch preserves duplicate guards, source scope controls, runtime controls, and DLQ recovery actions.
2. Worker notification auth and cache revalidation are verified.
3. Unit tests, route tests, worker guard tests, planning guard, lint, typecheck, audit, and build pass in the Linux working tree.

**Plans:** 2 plans

- [x] 19-01-PLAN.md - Worker/Queue dispatch and DLQ rollout verification for AUTO-09. Completed 2026-05-25.
- [x] 19-02-PLAN.md - final v3.0 Linux CI closure for QA-01. Completed 2026-05-25.

### Phase 20: SMTP Credential Hardening

**Goal:** Make SMTP/newsletter credentials environment-managed by default while preserving existing newsletter behavior.
**Depends on:** Phase 19.
**Requirements:** SMTP-01, SMTP-02, SMTP-03, SMTP-04.
**Success Criteria:**

1. SMTP sending paths resolve credentials from one server-only helper with Vercel environment variables first.
2. Manual newsletter send, publish notification, auto-news failure alert, and SMTP test use the shared helper.
3. Admin UI surfaces environment-managed/fallback status without exposing or overwriting SMTP secrets.
4. Tests, planning guard, and runbook document env setup and fallback handling.

**Plans:** 2 plans

- [x] 20-01-PLAN.md - env-first SMTP resolver and send/test path adoption for SMTP-01, SMTP-02. Completed 2026-05-25.
- [x] 20-02-PLAN.md - admin UX, runbook, tests, and final validation for SMTP-03, SMTP-04. Completed 2026-05-25.

### Phase 21: Registry Payload Baseline And Contract

**Goal:** Establish a measurable generated registry payload baseline and prevent accidental growth before deeper artifact changes.
**Depends on:** Phase 20.
**Requirements:** REG-01, REG-04, REG-03.
**Success Criteria:**

1. Generated registry, shadcn registry, tag/search payload, and component entry sizes are measured in a checked baseline.
2. `pnpm check:registry-payload` fails when generated registry size thresholds are exceeded.
3. `pnpm ci:all` includes the registry payload guard.
4. The next split contract identifies summary/detail/search artifact responsibilities before service migration.

**Plans:** 2 plans

- [x] 21-01-PLAN.md - registry payload baseline report and CI guard for REG-01, REG-04. Completed 2026-05-25.
- [ ] 21-02-PLAN.md - summary/detail/search artifact contract and migration checklist for REG-03.

### Phase 22: Registry Artifact Split And Service Adoption

**Goal:** Generate lighter registry artifacts and move API/service paths to the smallest safe read model.
**Depends on:** Phase 21.
**Requirements:** REG-02, REG-03.
**Success Criteria:**

1. Generated artifacts separate list summary, detail data, and search index fields.
2. Component list/search/detail routes preserve response compatibility while avoiding full registry reads where unnecessary.
3. Page registry paths keep existing behavior or explicitly document any artifact dependency.
4. Tests cover representative list, search, detail, and fallback paths.

**Plans:** TBD

### Phase 23: Registry Rollout Validation

**Goal:** Close v5.0 with build/cache/API verification and production smoke after deploy.
**Depends on:** Phase 22.
**Requirements:** REG-02, REG-03.
**Success Criteria:**

1. `pnpm ci:all` passes in the Linux-native working tree.
2. Build output and registry payload reports show no unexpected regression.
3. `/api/v1/components`, component search, component detail, and public site health smoke pass locally and after deploy.
4. Planning state and operator notes document the new artifact contract.

**Plans:** TBD

## Progress

**Execution Order:** 10 -> 11 -> 12 -> 13 -> 14 -> 15 -> 16 -> 17 -> 18 -> 19 -> 20 -> 21 -> 22 -> 23.

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
| 15. Baseline audit and failure hardening | v3.0 | 1/1 | Complete | 2026-05-24 |
| 16. D1 observability model and reconciliation | v3.0 | 2/2 | Complete | 2026-05-24 |
| 17. Manual run dashboard and batch processor | v3.0 | 3/3 | Complete | 2026-05-25 |
| 18. AI retry queue and Telegram operations | v3.0 | 2/2 | Complete | 2026-05-25 |
| 19. Worker queue rollout validation | v3.0 | 2/2 | Complete | 2026-05-25 |
| 20. SMTP credential hardening | v4.0 | 2/2 | Complete | 2026-05-25 |
| 21. Registry payload baseline and contract | v5.0 | 1/2 | In Progress | - |
| 22. Registry artifact split and service adoption | v5.0 | 0/TBD | Planned | - |
| 23. Registry rollout validation | v5.0 | 0/TBD | Planned | - |

## Consistency Guard

Run `pnpm check:planning` whenever `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, or `.planning/STATE.md` changes. This guard prevents completed requirements from drifting back to pending status and catches impossible plan counts before CI passes.
