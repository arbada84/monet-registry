# External Integrations

**Analysis Date:** 2026-03-25

## APIs & External Services

**AI/LLM (Server-side only):**
- Google Gemini - Article AI editing, translation, summarization
  - SDK/Client: Raw `fetch` (no SDK package)
  - Auth: `GEMINI_API_KEY` (env var, also stored in DB settings `cp-ai-settings`)
  - Files: `src/app/api/ai/route.ts`, `src/app/api/ai/bulk-generate/route.ts`, `src/app/api/ai/learn-url/route.ts`, `src/app/api/ai/learn-file/route.ts`, `src/app/api/ai/image-search/route.ts`

- OpenAI - Alternative AI provider for article editing
  - SDK/Client: Raw `fetch` (no SDK package)
  - Auth: `OPENAI_API_KEY` (env var, also stored in DB settings `cp-ai-settings`)
  - Files: `src/app/api/ai/route.ts`

**Coupang Partners (Affiliate):**
- Coupang Open API - Product search for affiliate recommendations
  - SDK/Client: Custom HMAC auth via `crypto` module
  - Auth: Access key + Secret key stored in DB settings (loaded via `serverGetSetting`)
  - Endpoint: `https://api-gateway.coupang.com/v2/providers/affiliate_open_api/apis/openapi/v1/products/search`
  - Files: `src/app/api/coupang/products/route.ts`

**Government Press Release Sources:**
- Netpro (정부 보도자료) - RSS feeds for automated press release collection
  - SDK/Client: Raw `fetch` + HTML parsing (`src/lib/html-extract.ts`)
  - Auth: None (public RSS)
  - Files: `src/app/api/cron/auto-press/route.ts`, `src/app/api/netpro/`

**Google News RSS:**
- Google News - Automated news collection via RSS
  - SDK/Client: Raw `fetch` + RSS XML parsing
  - Auth: None (public RSS)
  - Files: `src/app/api/cron/auto-news/route.ts`

## Data Storage

**Primary Database - Supabase (PostgreSQL):**
- Provider: Supabase hosted PostgreSQL
- Connection: REST API via `@supabase/supabase-js` and direct REST calls
- Client (read): `NEXT_PUBLIC_SUPABASE_ANON_KEY` with RLS `public_read` policies
- Client (write): `SUPABASE_SERVICE_KEY` (service_role, bypasses RLS)
- Server DB layer: `src/lib/supabase-server-db.ts` (direct REST), `src/lib/db-server.ts` (abstraction with fallback chain)
- Client DB layer: `src/lib/db.ts` (calls `/api/db/*` routes)
- Tables: `articles`, `comments`, `settings`, and others with RLS enabled
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`

**Fallback Database - MySQL (Cafe24):**
- Provider: Cafe24 MySQL hosting (local development / legacy)
- Connection: `mysql2/promise` connection pool
- Config: `src/lib/mysql.ts`
- DB layer: `src/lib/mysql-db.ts`
- Env vars: `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`

**Last Resort - File DB:**
- JSON files in `data/` directory
- Implementation: `src/lib/file-db.ts`
- Used when neither Supabase nor MySQL is available

**DB Priority Chain** (in `src/lib/db-server.ts`):
1. Supabase (if `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` set)
2. MySQL (if `MYSQL_DATABASE` set)
3. File DB (JSON fallback)

**File/Image Storage - Supabase Storage:**
- Bucket: `images`
- Upload: `src/lib/server-upload-image.ts` (server-side, with watermark support)
- Upload API: `src/app/api/upload/` routes
- Auth: `SUPABASE_SERVICE_KEY` for uploads

**Caching - Upstash Redis:**
- Provider: Upstash Redis (REST API)
- Purpose: Login rate limiting (IP-based, 5 attempts / 15-min lockout)
- Client: `@upstash/redis` (`Redis` class)
- Fallback: In-memory `Map` when Redis unavailable
- Files: `src/app/api/auth/login/route.ts`
- Env vars: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

## Authentication & Identity

**Auth Provider: Custom (cookie-based)**
- Implementation: HttpOnly cookie (`cp-admin-auth`) with HMAC-signed JWT-like tokens
- Login: `POST /api/auth/login` - validates credentials against DB users or fallback admin
- Session check: `GET /api/auth/me`
- Logout: `DELETE /api/auth/login`
- Cookie TTL: 24 hours
- Files: `src/lib/cookie-auth.ts` (token generation/verification), `src/app/api/auth/login/route.ts`

**Password Security:**
- Hashing: `bcryptjs` (`src/lib/password-hash.ts`)
- Fallback admin: `ADMIN_USERNAME` + `ADMIN_PASSWORD` env vars (emergency only)

**Encryption:**
- AES-256-GCM for sensitive data (IMAP passwords)
- Key derived from `COOKIE_SECRET` via SHA-256
- Files: `src/lib/encrypt.ts`

**Rate Limiting:**
- Login: Upstash Redis (5 attempts, 15-min lockout) with in-memory fallback
- AI API: In-memory rate limit (IP-based, 20/min) in `src/app/api/ai/route.ts`
- Cron endpoints: In-memory rate limit (5/min) in `src/middleware.ts`
- API v1: Basic Auth (`API_BASIC_AUTH_USER` + `API_BASIC_AUTH_PASSWORD`)

**Middleware:**
- File: `src/middleware.ts`
- Protects `/cam/*` (admin) routes - requires valid auth cookie
- Protects `/api/db/*`, `/api/admin/*`, `/api/cron/*` routes
- Role-based access: reporters limited to specific `/cam` paths
- Public paths: `/cam/login`, `/api/health`, `/api/auth/me`, `/api/auth/login`, `/api/v1/badge`, `/api/rss`

## Analytics & Advertising

**Google Analytics:**
- Integration: Google Tag Manager script (`gtag.js`) injected in `src/app/layout.tsx`
- Config: `googleAnalyticsId` stored in DB settings (`cp-seo-settings`)
- No env var needed - configured via admin UI

**Naver Analytics:**
- Integration: Naver Analytics script in `src/app/layout.tsx`
- Config: `naverAnalyticsId` stored in DB settings (`cp-seo-settings`)

**Google AdSense:**
- Integration: Auto ads script in `src/app/layout.tsx`
- Config: `adsensePublisherId` stored in DB settings (`cp-ads-global`)
- Components: `src/components/ui/FloatingAds.tsx`, AdSenseUnit, AdBanner
- CSP headers configured to allow AdSense domains

**Coupang Affiliate Ads:**
- Integration: Product recommendation widgets
- CSP headers allow `*.coupang.com`, `*.coupangcdn.com`

## Email Services

**Outgoing (SMTP - Nodemailer):**
- Purpose: Newsletter sending
- Config: SMTP settings stored in DB (`cp-newsletter-settings`)
- Files: `src/app/api/newsletter/send/route.ts`, `src/lib/newsletter-notify.ts`
- Library: `nodemailer` ^8.0.1

**Incoming (IMAP - ImapFlow):**
- Purpose: Press release ingestion from email
- Config: IMAP accounts stored in DB (`cp-mail-settings`), passwords AES-encrypted
- Default: `imap.daum.net:993`
- Files: `src/app/api/mail/sync/route.ts`, `src/app/api/mail/detail/route.ts`
- Library: `imapflow` ^1.2.14, `mailparser` ^3.9.4

## SEO & Verification

**Search Engine Verification:**
- Google: `google-site-verification` meta tag (from DB `cp-seo-settings`)
- Naver: `naver-site-verification` meta tag
- Bing: `msvalidate.01` meta tag

**Social Media:**
- Twitter/X handle (from DB `cp-sns-settings`)
- Facebook App ID (from DB `cp-sns-settings`)
- Kakao JS Key (from DB `cp-sns-settings`)

**Feeds:**
- RSS: `GET /api/rss` (XML feed)
- Atom: `GET /atom.xml` (route)
- JSON Feed: `GET /feed.json` (route)
- Sitemap: `GET /sitemap.xml` (dynamic)

## Search

**In-App Search Engine:**
- Library: Orama (in-memory full-text search)
- Files: `src/lib/search/index.ts`, `src/lib/search/types.ts`
- Purpose: Component registry search (not article search)
- Article search: Supabase full-text search via DB queries

## CI/CD & Deployment

**Primary Hosting:**
- Vercel (Hobby plan)
- Deployment: `vercel deploy --prod` (CLI, preferred over git push)
- Config: `vercel.json` (cron jobs, cache headers)

**Alternative Hosting:**
- Cafe24 Node.js hosting (PM2)
- Config: `ecosystem.config.js`

**Cron Jobs (Vercel):**
- `GET /api/cron/auto-news` - Daily at 21:00 UTC (automated news collection)
- `GET /api/cron/auto-press` - Daily at 09:00 UTC (automated press release collection)
- Auth: `CRON_SECRET` Bearer token (Vercel-injected)

**CI Pipeline:**
- No GitHub Actions or CI config detected
- Manual CI via `pnpm ci:all` (lint + typecheck + validate + build)
- E2E tests: `pnpm test:e2e` (Vitest, separate from CI)

## Environment Configuration

**Required env vars (production):**
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key (client-safe, RLS-protected)
- `SUPABASE_SERVICE_KEY` - Supabase service role key (server-only, bypasses RLS)
- `COOKIE_SECRET` - 32+ char secret for auth token signing and AES encryption
- `CRON_SECRET` - Vercel cron authentication

**Optional env vars:**
- `OPENAI_API_KEY` - OpenAI API (also configurable via admin UI)
- `GEMINI_API_KEY` - Google Gemini API (also configurable via admin UI)
- `UPSTASH_REDIS_REST_URL` - Upstash Redis URL for rate limiting
- `UPSTASH_REDIS_REST_TOKEN` - Upstash Redis token
- `API_BASIC_AUTH_USER` / `API_BASIC_AUTH_PASSWORD` - API v1 Basic Auth
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` - Emergency admin credentials
- `PASSWORD_SALT` - Extra salt for password hashing
- `AUTH_SECRET` - Additional auth secret
- `NEXT_PUBLIC_SITE_URL` - Public site URL
- `MY_HOST` - Host configuration
- `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE` - MySQL fallback
- `IMAP_HOST` / `IMAP_PORT` - Default IMAP server

**Secrets location:**
- Production: Vercel Dashboard > Settings > Environment Variables
- Local: `.env.local` (gitignored)
- Reference: `.env.example`, `.env.production.local.example`

## Webhooks & Callbacks

**Incoming:**
- Vercel Cron: `GET /api/cron/auto-news`, `GET /api/cron/auto-press` (scheduled by Vercel)
- API v1: `src/app/api/v1/` (articles, badge, categories, components, filters, pages, revalidate, stats) - Basic Auth protected

**Outgoing:**
- ISR Revalidation: `POST /api/v1/revalidate` called by `scripts/postbuild-revalidate.ts` after build
- Cache tag revalidation via `next/cache` `revalidateTag()` throughout API routes

## Security Headers (next.config.ts)

**All routes:**
- `Content-Security-Policy` - Restricts script/style/image/connect sources
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`

**Admin routes (`/cam/*`):**
- `X-Frame-Options: DENY`
- `Cache-Control: no-store, max-age=0`

---

*Integration audit: 2026-03-25*
