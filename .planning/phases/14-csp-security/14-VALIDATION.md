---
phase: 14
slug: csp-security
status: passed
nyquist_compliant: true
verified_at: 2026-05-21T01:09:00+09:00
---

# Phase 14 Validation Strategy

## Automated Verification Contract

| Check | Command | Required Result | Status |
|-------|---------|-----------------|--------|
| Type safety | `pnpm exec tsc --noEmit --pretty false` | exit 0 | passed |
| CSP unit tests | `pnpm test:unit tests/unit/csp.test.ts` | CSP builder assertions pass | passed |
| Unit tests | `pnpm test:unit` | all unit tests pass | passed |
| Lint | `pnpm ci:lint` | no ESLint errors/warnings | passed |
| Metadata validation | `pnpm ci:validate` | 0 invalid entries | passed |
| Automation guard | `pnpm check:automation` | cron ownership unchanged | passed |
| Agent loop guard | `node scripts/auto-press-agent-loop-verify.mjs` | success true | passed |
| Production build | `pnpm build` | Next build succeeds | passed |
| Header smoke | local `next start` + `Invoke-WebRequest /` and `/cam/login` | CSP nonce present, script unsafe-inline absent | passed |
| Admin E2E | targeted admin mutation subset | article/settings flows pass | passed |

## Manual Watch Items

- Watch browser console after live deploy for CSP violations from Google AdSense, GA, Naver Analytics, or Kakao.
- Watch ad fill behavior because third-party ad code can change outside this repo.

## Non-Blocking Debt

- `style-src 'unsafe-inline'` remains until inline React styles are migrated.
