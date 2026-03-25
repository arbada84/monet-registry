# Testing Patterns

**Analysis Date:** 2026-03-25

## Test Framework

**Runner:**
- Vitest 4.x (devDependency in `package.json`)
- Config: `vitest.e2e.config.mts` (E2E only; no unit test config exists)

**Assertion Library:**
- Vitest built-in `expect` (compatible with Jest API)

**Run Commands:**
```bash
pnpm test:e2e           # Run all E2E tests (vitest run --config vitest.e2e.config.mts)
pnpm test:e2e:watch     # Watch mode (vitest --config vitest.e2e.config.mts)
```

**CI Commands:**
```bash
pnpm ci:lint            # next lint
pnpm ci:typecheck       # tsc --noEmit
pnpm ci:validate        # metadata validation
pnpm ci:all             # lint + typecheck + validate + build (parallel where possible)
```

## Test File Organization

**Location:**
- All tests in `e2e/` directory at project root (separate from source)
- No colocated unit tests exist anywhere in `src/`

**Naming:**
- Pattern: `e2e/api/{resource-name}.test.ts`
- Helper files in `e2e/helpers/`

**Structure:**
```
e2e/
├── setup.ts                    # Global setup (wait for dev server)
├── helpers/
│   └── api-client.ts           # Shared HTTP client with auth
└── api/
    ├── badge.test.ts
    ├── categories.test.ts
    ├── components.test.ts
    ├── components-code.test.ts
    ├── components-detail.test.ts
    ├── components-search.test.ts
    ├── filters.test.ts
    ├── health.test.ts
    ├── pages.test.ts
    ├── pages-detail.test.ts
    ├── pages-search.test.ts
    ├── pages-sections.test.ts
    ├── pages-stats.test.ts
    └── stats.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect } from "vitest";
import { apiGet } from "../helpers/api-client";

interface ResponseType {
  success: boolean;
  // ... fields
}

describe("GET /api/v1/{resource}", () => {
  describe("Category (e.g., Pagination, Filtering)", () => {
    it("should do something specific", async () => {
      const { status, data } = await apiGet<ResponseType>("/api/v1/resource");
      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });
  });
});
```

**Patterns:**
- Response interfaces defined per test file (not shared across files)
- Nested `describe` blocks for logical grouping (Pagination, Filtering, Response Structure, Error Handling, Cache Control)
- Conditional assertions when data may be empty: `if (data.items.length > 0) { expect(...) }`
- No `beforeEach`/`afterEach` hooks in test files (stateless API tests)

**Global Setup (`e2e/setup.ts`):**
```typescript
import waitOn from "wait-on";

export async function setup() {
  await waitOn({
    resources: [`${baseUrl}/api/health`],
    timeout: 30000,
    interval: 1000,
    validateStatus: (status: number) => status === 200,
  });
}

export async function teardown() {
  // Cleanup if needed
}
```

**Timeouts:**
- Test timeout: 30,000ms (30 seconds)
- Hook timeout: 60,000ms (60 seconds)
- Server wait: 30,000ms before failing

## Test Helper: API Client

**Location:** `e2e/helpers/api-client.ts`

```typescript
export interface ApiResponse<T> {
  status: number;
  data: T;
  headers: Headers;
}

export async function apiGet<T>(
  path: string,
  params?: Record<string, string>
): Promise<ApiResponse<T>> {
  // Uses native fetch with Basic Auth from env vars
}
```

**Auth:**
- Basic Auth credentials from `API_BASIC_AUTH_USER` / `API_BASIC_AUTH_PASSWORD` env vars
- Loaded via Vite `loadEnv` in `vitest.e2e.config.mts`
- Base URL defaults to `http://localhost:4413`

## Mocking

**Framework:** None

**Patterns:**
- No mocking used anywhere in the test suite
- All E2E tests run against a live dev server instance
- Tests are read-only (GET requests only) -- no mutation tests

**What is NOT mocked:**
- Database (Supabase)
- External APIs
- Authentication (uses real Basic Auth)

## Fixtures and Factories

**Test Data:**
- No fixtures or factories exist
- Tests rely on existing data in the development database
- Assertions use conditional checks: `if (data.length > 0) { ... }`

## Coverage

**Requirements:** None enforced

**Coverage Tool:** Not configured (no coverage script in `package.json`)

## Test Types

**Unit Tests:**
- **Do not exist.** No unit test files found in `src/` or anywhere outside `e2e/`.
- No unit test config (no `vitest.config.ts` for unit tests)

**Integration Tests:**
- **Do not exist** as a separate category.

**E2E Tests (API only):**
- 14 test files covering the `/api/v1/*` public API endpoints
- Tests cover: health check, component listing/detail/search/code, page listing/detail/search/sections/stats, categories, filters, badge, stats
- All tests are HTTP GET requests against running dev server
- Tests verify: status codes, response structure, pagination, filtering, sorting, cache headers

**What is NOT E2E tested:**
- No browser/UI E2E tests (no Playwright/Cypress config)
- No tests for `/api/db/*` internal endpoints
- No tests for `/api/cron/*` cron endpoints
- No tests for `/api/auth/*` authentication endpoints
- No tests for `/api/ai/*` AI endpoints
- No tests for `/api/mail/*` mail endpoints
- No tests for admin panel (`/cam/*`) pages
- No tests for public-facing pages (article, category, search, tag)
- No mutation tests (POST, PATCH, DELETE operations)

## What IS Tested vs What is NOT

**Tested (E2E API only):**
| Area | Files | Coverage |
|------|-------|----------|
| Health endpoint | `e2e/api/health.test.ts` | Response fields, content-type |
| Component listing | `e2e/api/components.test.ts` | Pagination, filtering, response structure |
| Component detail | `e2e/api/components-detail.test.ts` | Single component retrieval |
| Component search | `e2e/api/components-search.test.ts` | Search functionality |
| Component code | `e2e/api/components-code.test.ts` | Code retrieval |
| Page listing | `e2e/api/pages.test.ts` | Pagination, filtering, sorting, cache |
| Page detail | `e2e/api/pages-detail.test.ts` | Single page retrieval |
| Page search | `e2e/api/pages-search.test.ts` | Search functionality |
| Page sections | `e2e/api/pages-sections.test.ts` | Section retrieval |
| Page stats | `e2e/api/pages-stats.test.ts` | Statistics endpoint |
| Categories | `e2e/api/categories.test.ts` | Listing, uniqueness, cache |
| Filters | `e2e/api/filters.test.ts` | Filter endpoints |
| Badge | `e2e/api/badge.test.ts` | Badge generation |
| Stats | `e2e/api/stats.test.ts` | Overall stats |

**NOT Tested (significant gaps):**
| Area | Risk Level | Impact |
|------|-----------|--------|
| Article CRUD (`src/lib/db-server.ts`, `src/lib/supabase-server-db.ts`) | **High** | Core business logic; any regression breaks publishing |
| Authentication (`src/lib/cookie-auth.ts`, `src/middleware.ts`) | **High** | Security-critical; token signing, HMAC, rate limiting |
| Auto-news/auto-press cron (`src/app/api/cron/*`) | **Medium** | Automated content pipeline; failures cause content gaps |
| Image upload/watermark (`src/lib/server-upload-image.ts`, `src/lib/watermark.ts`) | **Medium** | Image processing errors break article publishing |
| Newsletter notification (`src/lib/newsletter-notify.ts`) | **Low** | Subscriber notification; failures are non-blocking |
| Admin UI pages (`src/app/cam/*`) | **Medium** | ~28 admin pages, all untested |
| DB fallback chain (Supabase -> MySQL -> File) | **High** | Fallback logic in `src/lib/db-server.ts` never tested |
| Search functionality (`src/lib/search/`) | **Medium** | Orama full-text search |
| Client-side 401 redirect (`src/lib/db.ts` apiFetch) | **Low** | Session expiry handling |

## CI/CD Test Configuration

**CI Pipeline:** No dedicated CI config file (`.github/workflows/`, etc.) detected in project root.

**Available CI Scripts in `package.json`:**
```bash
pnpm ci:lint       # ESLint check (next lint)
pnpm ci:typecheck  # TypeScript type check (tsc --noEmit)
pnpm ci:validate   # Metadata validation
pnpm ci:all        # All checks + build (parallel lint/typecheck/validate, then build)
```

**Note:** `ci:all` does NOT include E2E tests. E2E tests require a running dev server and are not part of the automated build pipeline.

**Deployment:** Uses `vercel deploy --prod` directly (no CI/CD pipeline running tests before deploy).

---

*Testing analysis: 2026-03-25*
