# Phase 14-01 Summary: nonce-based script CSP

## Status

- Implemented and locally verified.

## Changes

- Added `src/lib/security/csp.ts`.
  - Generates a per-request CSP nonce.
  - Builds CSP with `script-src 'nonce-...'`.
  - Removes `'unsafe-inline'` from `script-src`.
  - Keeps `'unsafe-eval'` only outside production.
- Moved CSP ownership from `next.config.ts` to `src/middleware.ts`.
  - Middleware now forwards `x-nonce` and `x-pathname` request headers.
  - Middleware sets `Content-Security-Policy` on normal responses.
  - Matcher now covers public pages as well as admin/API routes while excluding static assets.
- Updated `src/app/layout.tsx`.
  - Reads `x-nonce`.
  - Adds `<meta name="csp-nonce">`.
  - Passes `nonce` to GA, Naver Analytics, AdSense, and Kakao `Script` components.
- Updated `src/components/ui/ScriptUnit.tsx`.
  - Reads the nonce meta tag.
  - Applies nonce to dynamically inserted script tags.
- Added `tests/unit/csp.test.ts`.

## Verification

- `pnpm exec tsc --noEmit --pretty false`: passed.
- `pnpm test:unit tests/unit/csp.test.ts`: 3 tests passed.
- `pnpm test:unit`: 55 files, 304 tests passed.
- `pnpm ci:lint`: passed.
- `pnpm ci:validate`: passed with pre-existing metadata warnings, 0 invalid entries.
- `pnpm check:automation`: passed.
- `node scripts/auto-press-agent-loop-verify.mjs`: passed.
- `pnpm build`: passed.
- Local production header smoke:
  - `GET /`: 200, CSP present, script nonce present, no `script-src 'unsafe-inline'`, no production `script-src 'unsafe-eval'`, nonce meta present, script nonce present.
  - `GET /cam/login`: 200, CSP present, script nonce present, no `script-src 'unsafe-inline'`, nonce meta present, script nonce present.
- Targeted admin E2E after CSP:
  - `E2E_ADMIN_MUTATION_ENABLED=1 pnpm test:e2e -- e2e/admin/article-lifecycle.test.ts e2e/admin/settings.test.ts`
  - 2 files passed, 4 tests passed, 1 publish/public-page test skipped by safety gate.

## Residual Risk

- `style-src 'unsafe-inline'` intentionally remains because the app uses extensive React inline styles.
- Third-party ad scripts can change behavior without code changes; live header and ad rendering should be watched after deployment.
