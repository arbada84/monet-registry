# Phase 14 Research: CSP security hardening

## Current State

- CSP is currently defined as a static header in `next.config.ts`.
- `script-src` allows both `'unsafe-inline'` and `'unsafe-eval'`.
- The app uses several inline `next/script` blocks in `src/app/layout.tsx` for GA, Naver Analytics, AdSense auto ads, and Kakao SDK init.
- The app uses many React inline `style={...}` attributes, so removing `style-src 'unsafe-inline'` is not currently safe.
- `ScriptUnit` dynamically creates script elements for admin-managed ad snippets and needs a nonce bridge.

## Phase 14 Scope Decision

The safe first production step is:

- Move CSP generation from `next.config.ts` to middleware so every HTML request gets a per-request nonce.
- Add `x-nonce` to the request headers forwarded to server components.
- Read the nonce in `RootLayout` and apply it to all `next/script` tags.
- Expose the nonce in a `<meta name="csp-nonce">` tag for client-side dynamic script insertion.
- Update `ScriptUnit` to set the nonce on dynamically inserted script elements.
- Remove `'unsafe-inline'` from `script-src`.
- Remove `'unsafe-eval'` from `script-src` in production, but keep it only in development because Next dev tooling can require eval.
- Keep `style-src 'unsafe-inline'` until the large inline-style admin/public UI is migrated to class-based styles.

## Important Constraints

- Do not use `strict-dynamic` in the first pass; it can change allowlist behavior and may break older ad/analytics integrations.
- Keep the existing third-party script allowlist and add missing known hosts such as `*.kakaocdn.net`.
- Do not apply nonce changes only to admin pages. Public pages load GA, Naver, AdSense, Kakao, and article scripts, so CSP must cover public pages too.
- Avoid report-only-only implementation; the roadmap requires actual CSP hardening. Tests must prove `script-src` no longer includes `'unsafe-inline'`.

## Verification Plan

- Unit-test CSP builder output.
- Type-check, unit-test, lint, automation guard, and production build.
- Smoke-test live headers after deployment:
  - `Content-Security-Policy` exists.
  - `script-src` contains a `nonce-...` token.
  - `script-src` does not contain `'unsafe-inline'`.
  - Production `script-src` does not contain `'unsafe-eval'`.
