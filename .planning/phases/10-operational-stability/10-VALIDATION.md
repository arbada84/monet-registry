---
phase: 10
slug: operational-stability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-01
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest / manual verification |
| **Config file** | none — manual grep/curl verification |
| **Quick run command** | `pnpm build` |
| **Full suite command** | `pnpm build && grep -r "commentRateMap\|cronRateLimitMap\|memAttempts" src/` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm build`
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | PERF-01 | integration | `grep -c "select(" src/lib/articles.ts` | ✅ | ⬜ pending |
| 10-01-02 | 01 | 1 | PERF-02 | integration | `grep "ilike\|.eq(" src/app/api/db/articles/route.ts` | ✅ | ⬜ pending |
| 10-02-01 | 02 | 1 | SEC-01 | grep | `grep -r "commentRateMap\|cronRateLimitMap\|memAttempts" src/` | ✅ | ⬜ pending |
| 10-02-02 | 02 | 1 | SEC-02 | grep | `grep "secure:" src/app/api/auth/login/route.ts` | ✅ | ⬜ pending |
| 10-03-01 | 03 | 2 | CLEAN-01 | manual | `ls *.tmp *.temp 2>/dev/null; grep "tmp\|temp" .gitignore` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 쿠키 secure 동작 | SEC-02 | 브라우저 DevTools 확인 필요 | 로그인 후 Application > Cookies에서 secure 플래그 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
