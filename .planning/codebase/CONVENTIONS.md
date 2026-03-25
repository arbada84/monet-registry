# Coding Conventions

**Analysis Date:** 2026-03-25

## Naming Patterns

**Files:**
- kebab-case for all source files: `fetch-retry.ts`, `db-server.ts`, `cookie-auth.ts`, `supabase-server-db.ts`
- PascalCase for React component files: `CulturePeopleHeader.tsx`, `ArticleBody.tsx`, `AdBanner.tsx`, `FloatingAds.tsx`
- Route handlers always named `route.ts` (Next.js App Router convention)
- Page files always named `page.tsx`, layouts `layout.tsx`, errors `error.tsx`

**Functions:**
- camelCase for all functions: `serverGetArticles()`, `getArticleById()`, `checkAuth()`, `logActivity()`
- Server-only DB functions prefixed with `server`: `serverGetArticles()`, `serverCreateArticle()`, `serverGetSetting()`
- Supabase-specific functions prefixed with `sb`: `sbGetArticles()`, `sbGetArticleByNo()`, `sbGetArticlesByCategory()`
- Boolean-returning functions prefixed with `is` or `check`: `isSupabaseEnabled()`, `isTokenBlacklisted()`, `checkCronRateLimit()`

**Variables:**
- camelCase for variables and state: `currentPage`, `filterCategory`, `bulkAction`
- SCREAMING_SNAKE_CASE for constants: `CATEGORIES`, `CATEGORY_SLUG_MAP`, `PUBLIC_PATHS`, `BLOCKED_BOTS`
- Private/internal module vars prefixed with underscore: `_isRedirecting`

**Types:**
- PascalCase for all types and interfaces: `Article`, `ArticleStatus`, `AdminAccount`, `AutoNewsSettings`
- Union types for status enums (Korean strings): `type ArticleStatus = "게시" | "임시저장" | "예약" | "상신" | "승인" | "반려"`
- Interfaces preferred over type aliases for object shapes (all interfaces in `src/types/article.ts` use `interface`)
- Response interfaces defined inline or near usage in test/component files

## Code Style

**Formatting:**
- No Prettier config detected; formatting is ad-hoc
- 2-space indentation (consistent across codebase)
- Double quotes for strings (consistent)
- Semicolons always used
- Trailing commas in multiline constructs

**Linting:**
- ESLint 9 flat config in `eslint.config.mjs`
- Extends: `next/core-web-vitals`, `next/typescript`
- Relaxed rules globally:
  - `@typescript-eslint/no-empty-object-type`: off
  - `@typescript-eslint/no-explicit-any`: off
  - `@typescript-eslint/no-unused-vars`: off
- Further relaxations for registry/sections/example components (see `eslint.config.mjs`)

**TypeScript:**
- `strict: true` in `tsconfig.json` BUT `strictNullChecks: false` and `noImplicitAny: false` (effectively weakens strict mode significantly)
- Path alias `@/*` maps to `./src/*`
- Target: ES2017, module: ESNext, moduleResolution: bundler
- `scripts/`, `screenshot-server/`, `mcp-server/` excluded from compilation

## Import Organization

**Order (observed pattern):**
1. React/Next.js framework imports (`import { useState } from "react"`, `import Link from "next/link"`)
2. Third-party library imports (`import { clsx } from "clsx"`)
3. Internal type imports (`import type { Article } from "@/types/article"`)
4. Internal module imports with `@/` alias (`import { serverGetArticles } from "@/lib/db-server"`)
5. Relative imports (`import ArticleShare from "./components/ArticleShare"`)

**Path Aliases:**
- `@/*` -> `./src/*` (sole alias, used universally)
- Relative imports used only for same-directory or child-directory references

**Dynamic Imports:**
- Used for conditional DB backends: `await import("@/lib/supabase-server-db")` in `src/lib/db-server.ts`
- Used for lazy-loading heavy components (e.g., RichEditor via `dynamic()`)

## Component Patterns

**Client vs Server Components:**
- Server Components (default): Page-level data fetching pages like `src/app/page.tsx`, `src/app/article/[id]/page.tsx`
- Client Components (`"use client"`): All admin `/cam` pages, interactive components, DB client layer
- The `"use client"` directive placed at very first line of file
- All `/cam/*` pages are client components (admin panel is fully client-rendered)
- Public-facing pages use Server Components with ISR (`revalidate = 3600`)

**Server-Only Enforcement:**
- `src/lib/db-server.ts` imports `"server-only"` to prevent client bundle inclusion
- `src/lib/supabase-server-db.ts` is server-only (no directive but only imported from server code)

**Client DB Access Pattern:**
- Client components use `src/lib/db.ts` (marked `"use client"`)
- All client DB calls go through `apiFetch()` wrapper that handles 401 redirects
- Server components use `src/lib/db-server.ts` (marked with `import "server-only"`)

**Component Organization:**
- Theme components: `src/components/themes/{theme-name}/` with barrel `index.ts`
- UI primitives: `src/components/ui/` (shadcn-based + custom)
- Page-scoped components: colocated in route directory (e.g., `src/app/article/[id]/components/`)
- Registry components: `src/components/registry/{component-name}/` (scraped landing page sections)

**Props Pattern:**
- Interfaces defined inline above component or in same file
- `initialXxx` prefix for server-to-client data handoff: `initialCategories`, `initialSiteSettings`
- Next.js 15 async params: `params: Promise<{ id: string }>` (awaited inside function)

## Error Handling

**API Route Pattern:**
```typescript
export async function GET(request: NextRequest) {
  try {
    // ... logic
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("[route-name]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "오류" },
      { status: 500 }
    );
  }
}
```

**Client Fetch Pattern:**
```typescript
const res = await apiFetch(url, options);
if (!res.ok) {
  const data = await res.json();
  throw new Error(data.error ?? "기본 에러 메시지");
}
```

**Silent Failures:**
- View count increments: errors caught and silently ignored (`src/lib/db.ts` line 119)
- Activity logging: fire-and-forget with `.catch(() => {})` (`src/lib/log-activity.ts`)
- Newsletter notifications: errors do not block article publishing

**Error Boundaries:**
- `src/app/error.tsx`: Route-level error boundary with retry button and home link
- `src/app/global-error.tsx`: App-level fallback with inline styles (no CSS dependency)
- `src/app/article/[id]/error.tsx`: Article-specific error boundary

**DB Fallback Chain:**
- `src/lib/db-server.ts`: Supabase -> MySQL -> File DB (JSON), with try/catch at each level

## Async Patterns

**Admin Save Pattern (documented rule):**
- Save functions return `Promise<boolean>`: `saveXxx() → Promise<boolean>`
- Handler functions are async: `handleSave = async () => { ... }`

**Data Loading in Client Components:**
```typescript
useEffect(() => {
  Promise.allSettled([
    getArticles(),
    getSetting<T>("key", defaultValue),
    fetch("/api/auth/me", { credentials: "include" }).then(r => r.json()),
  ]).then(([result1, result2, result3]) => {
    if (result1.status === "fulfilled") setData(result1.value);
    setLoading(false);
  });
}, []);
```

**Retry Pattern:**
- `src/lib/fetch-retry.ts`: `fetchWithRetry()` with exponential backoff, retries on 5xx/network errors
- Max 2 retries by default, configurable via options

**ISR Caching:**
- Pages export `revalidate = 3600` (1 hour)
- `unstable_cache` and `revalidateTag` used in server DB layer
- Admin pages use `cache: "no-store"` for all fetches

## Logging

**Framework:** `console.error` / `console.warn` / `console.log` (no external logging library)

**Patterns:**
- Tag-prefixed logs: `console.error("[layout] 설정 로드 실패:", ...)`, `console.warn("[security] cron 인증 실패: ...")`
- Security logs mask sensitive data: `ip.slice(0, 8)***`
- Error boundary logging in `useEffect`: `console.error("[ErrorBoundary] message:", error.message)`
- Activity logs stored in DB via `/api/db/activity-logs` for admin actions

## Comments

**When to Comment:**
- Korean comments for business logic explanations: `/** 소프트 삭제 (휴지통 이동) */`
- Section dividers using comment blocks: `// ── Articles ─────────────────────────────`
- Security-critical comments marked with `[security]` or `[CRITICAL]` tags
- Inline rationale for non-obvious decisions: `// 조회수 증가 실패는 무시 (기사 렌더링에 영향 없음)`

**JSDoc/TSDoc:**
- Minimal JSDoc usage; primarily single-line `/** */` descriptions on exported functions
- No systematic API documentation

## Module Design

**Exports:**
- Default exports for React components: `export default function ComponentName()`
- Named exports for utility functions: `export function fetchWithRetry()`, `export async function serverGetArticles()`
- Barrel files (`index.ts`) used in theme component directories

**Environment Variables:**
- Declared in `src/env.d.ts` (partial - only API auth vars declared)
- Checked at runtime with `Boolean(process.env.X)` pattern
- Public vars use `NEXT_PUBLIC_` prefix (Supabase URL/key)
- Secrets validated with length check and warning in production (`src/lib/cookie-auth.ts`)

---

*Convention analysis: 2026-03-25*
