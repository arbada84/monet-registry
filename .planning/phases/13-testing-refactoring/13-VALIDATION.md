---
phase: 13
slug: testing-refactoring
status: passed
nyquist_compliant: true
verified_at: 2026-05-21T00:58:00+09:00
---

# Phase 13 Validation Strategy

## Scope

Phase 13 covers TEST-01, TEST-02, and QUAL-02:

- Core logic unit coverage for auth, article DB adapter behavior, and cron publishing.
- Admin E2E coverage for article lifecycle and settings save/restore flows.
- Settings and article edit page refactoring into maintainable files under the 300-line target.

## Automated Verification Contract

| Check | Command | Required Result | Status |
|-------|---------|-----------------|--------|
| Type safety | `pnpm exec tsc --noEmit --pretty false` | exit 0 | passed |
| Unit tests | `pnpm test:unit` | all unit tests pass | passed |
| Lint | `pnpm ci:lint` | no ESLint errors/warnings | passed |
| Metadata validation | `pnpm ci:validate` | 0 invalid entries | passed |
| Automation ownership guard | `pnpm check:automation` | no cron ownership conflicts | passed |
| Auto-press agent loop guard | `node scripts/auto-press-agent-loop-verify.mjs` | success true | passed |
| Production build | `pnpm build` | Next build succeeds | passed |
| Admin E2E mutation subset | `E2E_ADMIN_MUTATION_ENABLED=1 pnpm test:e2e -- e2e/admin/article-lifecycle.test.ts e2e/admin/settings.test.ts` | article/settings tests pass, publish remains gated | passed |

## Sampling Rule

- Run `tsc` after every refactor extraction.
- Run unit tests and lint after behavior-affecting or import-affecting changes.
- Run targeted admin E2E whenever settings or article edit save flows are touched.
- Run production build before commit/deploy.

## Manual Verification Notes

- Admin E2E mutation is guarded by `E2E_ADMIN_MUTATION_ENABLED=1`.
- Publishing/public page checks remain behind `E2E_ADMIN_ALLOW_PUBLISH=1` to avoid accidental production-like side effects.
- Test-created articles use `[E2E]` prefixes and cleanup through the existing test helper path.

## Residual Risks

- The metadata validator still reports pre-existing warnings and duplicate names, but invalid count remains 0.
- Full live browser mutation testing was not run against production to avoid unintended admin data changes.
