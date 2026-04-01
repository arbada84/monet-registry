---
phase: 11
slug: code-cleanup-quality
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-01
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual verification + grep/bash checks |
| **Config file** | none — code cleanup phase, no test framework needed |
| **Quick run command** | `pnpm build` |
| **Full suite command** | `pnpm build && pnpm lint` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm build`
- **After every plan wave:** Run `pnpm build && pnpm lint`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | CLEAN-02 | build | `pnpm build` | ✅ | ⬜ pending |
| 11-01-02 | 01 | 1 | CLEAN-02 | grep | `grep -r "mysql-db\|file-db" src/` | ✅ | ⬜ pending |
| 11-02-01 | 02 | 1 | CLEAN-03 | build | `pnpm build` | ✅ | ⬜ pending |
| 11-02-02 | 02 | 1 | CLEAN-03 | grep | `grep -r "sbHeaders\|isTableMode\|rowToComment" src/app/api/comments/` | ✅ | ⬜ pending |
| 11-03-01 | 03 | 2 | CLEAN-04 | ls | `ls scripts/_archive/` | ✅ | ⬜ pending |
| 11-04-01 | 04 | 2 | QUAL-01 | lint | `pnpm lint` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 프로덕션 사이트 정상 동작 | CLEAN-02 | 레거시 코드 제거 후 런타임 확인 필요 | Vercel 배포 후 주요 페이지 접근 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
