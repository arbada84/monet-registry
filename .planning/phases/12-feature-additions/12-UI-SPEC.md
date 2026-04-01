---
phase: 12
slug: feature-additions
status: approved
reviewed_at: 2026-04-02
shadcn_initialized: true
preset: neutral
created: 2026-04-02
---

# Phase 12 — UI Design Contract

> Visual and interaction contract for Phase 12 frontend components. Admin panel additions follow existing inline-style patterns.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (public site only) |
| Preset | neutral |
| Component library | Radix (via shadcn) |
| Icon library | Emoji icons (existing admin pattern) |
| Font | System font stack (existing) |

**Note:** Admin panel (`/cam/`) uses `React.CSSProperties` inline styles — NOT Tailwind/shadcn classes. All Phase 12 admin UI must follow this pattern for consistency with existing pages.

---

## Spacing Scale

Declared values (multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon-text gaps |
| sm | 8px | Label margins, compact spacing |
| md | 12px | Grid gaps, stat card spacing |
| lg | 16px | Card internal padding, tab padding |
| xl | 24px | Section margins |
| 2xl | 32px | Major section breaks |
| 3xl | 48px | Empty state vertical padding |

Exceptions: none — Phase 12 new components use strict 4px grid. Existing admin code (admin-styles.ts) uses some non-grid values (6px, 10px) which are not changed.

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Small / Caption | 12px | 400 | 1.3 |
| Body / Label | 14px | 400 | 1.5 |
| Section heading | 16px | 700 | 1.3 |
| Page heading / Stat | 22px | 700 | 1.2 |

Weights: 400 (regular) + 700 (bold) only. Existing admin uses 13px labels and 500 weight in some places — Phase 12 new components standardize to 12px/14px and 400/700.

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#FFFFFF` | Page background, card backgrounds |
| Secondary (30%) | `#F5F5F5` / `#EEE` border | Loading skeletons, borders, muted backgrounds |
| Accent (10%) | `#E8192C` | Primary CTA buttons, brand-red actions |
| Destructive | `#C62828` on `#FFF3F3` | Error banners, destructive confirmations |

### Chart Colors (from CSS vars)

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| chart-1 | `hsl(12, 76%, 61%)` | `hsl(220, 70%, 50%)` | 성공 건수 (success bar) |
| chart-2 | `hsl(173, 58%, 39%)` | `hsl(160, 60%, 45%)` | 실패 건수 (failure bar) |
| chart-3 | `hsl(197, 37%, 24%)` | `hsl(30, 80%, 55%)` | Reserved |
| chart-4 | `hsl(43, 74%, 66%)` | `hsl(280, 65%, 60%)` | Reserved |
| chart-5 | `hsl(27, 87%, 67%)` | `hsl(340, 75%, 55%)` | Reserved |

### Semantic Admin Colors (from dashboard)

| Purpose | Color | Element |
|---------|-------|---------|
| 기사/총 | `#E8192C` | Stat card value |
| 오늘 작성 | `#2196F3` | Stat card value |
| 총 조회수 | `#4CAF50` | Stat card value |
| 오늘 조회 | `#FF9800` | Stat card value |
| 주간 조회 | `#9C27B0` | Stat card value |
| 구독자 | `#3F51B5` | Stat card value |

Accent reserved for: Primary CTA buttons (기사 작성), notification badge count, chart success bars

---

## Component Inventory — Phase 12 UI Elements

### 1. 이미지 설정 패널 (Settings Page Addition)

**Location:** `src/app/cam/settings/page.tsx` — 새 섹션 추가

| Element | Spec |
|---------|------|
| Section heading | `fontSize: 16, fontWeight: 700, color: "#111"` |
| Max width input | Existing `inputStyle` from admin-styles.ts, `type="number"` |
| Quality slider/input | `inputStyle` + range 1-100, default 80 |
| WebP toggle | Checkbox + label, `labelStyle` from admin-styles.ts |
| Help text | `fontSize: 12, color: "#999"` |

**States:**
- Default: inputs show current saved values
- Changed: save button enabled
- Saved: toast notification "설정이 저장되었습니다"

### 2. 자동화 이력 차트 패널 (Dashboard Addition)

**Location:** `src/app/cam/dashboard/page.tsx` — 새 섹션 추가

| Element | Spec |
|---------|------|
| Panel container | `background: "#FFF", border: "1px solid #EEE", borderRadius: 8, padding: "16px"` |
| Panel heading | `fontSize: 16, fontWeight: 700, color: "#111", marginBottom: 16` |
| Tab bar | Two tabs: "보도자료 자동등록" / "자동 뉴스 발행" |
| Active tab | `borderBottom: "2px solid #E8192C", color: "#E8192C", fontWeight: 700` |
| Inactive tab | `color: "#999", fontWeight: 400` |
| Tab padding | `padding: "8px 16px", cursor: "pointer"` |
| Bar chart | Recharts `<BarChart>` — 일별 성공(chart-1)/실패(chart-2) stacked bar |
| Chart height | 240px |
| Chart period | 최근 10일 (x축: 날짜, y축: 건수) |
| Legend | Recharts default legend, bottom position |
| Summary row | `fontSize: 12, color: "#666"` — "최근 10회: 성공 8건 / 실패 2건" |

**States:**
- Loading: Skeleton box 240px height with pulse animation (existing pattern)
- Empty: "실행 이력이 없습니다. 자동 수집이 실행되면 여기에 표시됩니다." (`fontSize: 14, color: "#999", textAlign: "center", padding: "48px 0"`)
- Error: Red error banner (existing pattern from dashboard loadError)
- Data: Recharts bar chart with tooltip on hover

### 3. 알림 패널 (Dashboard Addition)

**Location:** `src/app/cam/dashboard/page.tsx` — 새 섹션 추가

| Element | Spec |
|---------|------|
| Panel container | Same as 이력 차트 패널 (`border: "1px solid #EEE", borderRadius: 8`) |
| Panel heading | `fontSize: 16, fontWeight: 700` + 읽지 않은 건수 배지 |
| Badge | `background: "#E8192C", color: "#FFF", borderRadius: "50%", fontSize: 12, fontWeight: 700, minWidth: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", marginLeft: 8` |
| Notification item | `padding: "12px 0", borderBottom: "1px solid #F0F0F0"` |
| Item — unread | `background: "#FAFBFF"` (subtle blue tint) |
| Item — read | `background: "transparent"` |
| Item type icon | Emoji: 크론 실패 → "⚠️", AI 실패 → "🤖", 보안 → "🔒" |
| Item title | `fontSize: 14, fontWeight: 700, color: "#111"` |
| Item timestamp | `fontSize: 12, color: "#999"` |
| Item message | `fontSize: 14, color: "#555"` |
| "모두 읽음" button | `fontSize: 12, color: "#2196F3", cursor: "pointer", border: "none", background: "none"` |
| Max items shown | 10 (with "더 보기" link if more exist) |

**States:**
- No notifications: "새로운 알림이 없습니다." (`fontSize: 14, color: "#999", textAlign: "center", padding: "24px 0"`)
- Has unread: Badge with count on panel heading + header icon
- All read: No badge, items with transparent background

### 4. 헤더 알림 아이콘 (Layout Addition)

**Location:** `src/app/cam/layout.tsx` — 헤더에 알림 아이콘 추가

| Element | Spec |
|---------|------|
| Bell icon | "🔔" emoji, `fontSize: 18, cursor: "pointer"` |
| Badge (on bell) | `position: "absolute", top: -4, right: -4, background: "#E8192C", color: "#FFF", borderRadius: "50%", fontSize: 12, fontWeight: 700, minWidth: 16, height: 16` |
| Container | `position: "relative", display: "inline-block"` |
| Click action | Navigate to `/cam/dashboard` (scroll to 알림 패널) |
| Polling interval | 60초 (1분) |

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| 이력 차트 heading | "자동화 실행 이력" |
| 이력 탭 1 | "보도자료 자동등록" |
| 이력 탭 2 | "자동 뉴스 발행" |
| 이력 empty state heading | "실행 이력이 없습니다" |
| 이력 empty state body | "자동 수집이 실행되면 여기에 표시됩니다." |
| 알림 패널 heading | "알림" |
| 알림 empty state | "새로운 알림이 없습니다." |
| 알림 "모두 읽음" | "모두 읽음 처리" |
| 알림 "더 보기" | "이전 알림 더 보기" |
| 이미지 설정 heading | "이미지 업로드 설정" |
| 이미지 최대크기 label | "최대 가로 크기 (px)" |
| 이미지 품질 label | "WebP 변환 품질 (1-100)" |
| 이미지 WebP label | "업로드 시 자동 WebP 변환" |
| 이미지 help text | "새로 업로드하는 이미지에만 적용됩니다. 기존 이미지는 변환되지 않습니다." |
| Error — 크론 실패 | "[auto-press/auto-news] 실행 실패: {error_message}" |
| Error — AI 편집 실패 | "AI 편집 실패: {article_title} — {error_message}" |
| Destructive — 알림 전체 삭제 | "모든 알림을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다." |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | None (admin uses inline styles) | not required |
| recharts (npm) | BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer | npm package — not a shadcn registry |

**Note:** Recharts is a standard npm package, not a shadcn registry. No registry vetting needed.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: FLAG — no explicit focal point for dashboard panels (non-blocking)
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-04-02
