---
phase: 12
slug: feature-additions
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual verification + CLI commands |
| **Config file** | none |
| **Quick run command** | `npm run build` |
| **Full suite command** | `npm run build && npm run lint` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build`
- **After every plan wave:** Run `npm run build && npm run lint`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | PERF-03 | integration | `curl -X POST /api/upload/image` + verify WebP output | ❌ W0 | ⬜ pending |
| 12-02-01 | 02 | 1 | FEAT-01 | visual | `npm run build` + verify dashboard route renders | ❌ W0 | ⬜ pending |
| 12-03-01 | 03 | 1 | FEAT-02 | integration | SQL: `SELECT * FROM search_articles('테스트')` | ✅ existing | ⬜ pending |
| 12-04-01 | 04 | 2 | FEAT-03 | integration | `curl /api/db/notifications` + verify response | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers most phase requirements
- [ ] Verify sharp is installed and working: `node -e "require('sharp')"`
- [ ] Verify Supabase connection for migration testing

*Existing build/lint infrastructure covers automated verification.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| WebP image quality acceptable | PERF-03 | Visual quality check | Upload image, download WebP, verify visual quality |
| Dashboard chart renders correctly | FEAT-01 | Visual UI check | Navigate to /cam dashboard, verify chart renders with data |
| Korean search accuracy | FEAT-02 | Semantic accuracy | Search for Korean terms, verify relevant results |
| Notification badge appears | FEAT-03 | Visual UI check | Trigger cron failure, verify badge count updates |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
