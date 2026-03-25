# Technology Stack

**Analysis Date:** 2026-03-25

## Languages

**Primary:**
- TypeScript ^5 - All application code (`src/`, `scripts/`, `e2e/`)
- TSX - React components and pages

**Secondary:**
- JavaScript - Config files (`ecosystem.config.js`, `postcss.config.mjs`, `eslint.config.mjs`)
- YAML - Component metadata (`src/components/registry/**/metadata.yaml`)
- CSS - Global styles (`src/app/globals.css`) via Tailwind CSS v4

## Runtime

**Environment:**
- Node.js (no `.nvmrc` or `.node-version` detected; `@types/node` is ^20)
- Next.js runtime: Node.js (not Edge) for API routes; Edge-compatible middleware (`src/middleware.ts`) uses `crypto.subtle`

**Package Manager:**
- pnpm 9.12.2 (pinned via `packageManager` field in `package.json`)
- Lockfile: `pnpm-lock.yaml` present

## Frameworks

**Core:**
- Next.js 15.5.14 - App Router, ISR, API routes (`next.config.ts`)
- React 19.2.1 - UI rendering
- React DOM 19.2.1

**CSS/UI:**
- Tailwind CSS ^4.1.17 - Utility CSS via `@tailwindcss/postcss`
- Tailwind Typography ^0.5.10 - Prose styles for article content
- tailwindcss-animate ^1.0.7 + tw-animate-css ^1.4.0 - Animation utilities
- shadcn (^3.8.5, devDependency) - Component registry/generation
- Radix UI - Headless primitives (accordion, avatar, checkbox, dialog, dropdown-menu, label, navigation-menu, select, separator, slot, toast)
- Lucide React ^0.469.0 - Icons
- class-variance-authority ^0.7.0 + clsx ^2.1.1 + tailwind-merge ^2.5.2 - Conditional class utilities

**Animation:**
- Framer Motion ^11
- Motion ^12.23.24

**Rich Text Editor:**
- Tiptap ^3.19.0 - Rich text editing in admin (`@tiptap/react`, `@tiptap/starter-kit`, extensions: image, link, placeholder, text-align, underline, `@tiptap/pm`)
- Quill ^2.0.3 - Legacy/alternative editor

**Testing:**
- Vitest ^4.0.15 - E2E tests (`vitest.e2e.config.mts`)
- Config: `vitest.e2e.config.mts`, tests in `e2e/` directory
- No unit test runner detected (no `vitest.config.ts` for unit tests)

**Build/Dev:**
- tsx ^4.20.6 - TypeScript script execution (scripts/)
- PostCSS ^8 via `postcss.config.mjs` with `@tailwindcss/postcss` plugin
- ESLint ^9 with `eslint-config-next` 15.1.9 (flat config: `eslint.config.mjs`)
- npm-run-all2 ^8.0.4 - Parallel script execution (`run-p`)
- sharp ^0.34.5 (devDep) - Server-side image processing (watermarks)
- Puppeteer ^24.40.0 (devDep) - Screenshots, scraping

## Key Dependencies

**Critical (Data & DB):**
- `@supabase/supabase-js` ^2.95.3 - Primary database client (Supabase REST API)
- `mysql2` ^3.17.4 - MySQL fallback (local dev, Cafe24 hosting)
- `@upstash/redis` ^1.36.3 - Rate limiting for login (Redis REST API)

**AI/LLM:**
- No SDK dependency in `package.json` - AI calls made via raw `fetch` to OpenAI and Gemini APIs (`src/app/api/ai/route.ts`)

**Content Processing:**
- `marked` ^17.0.3 - Markdown to HTML
- `dompurify` ^3.3.1 - XSS sanitization
- `mammoth` ^1.12.0 - DOCX to HTML conversion
- `pdf-parse` ^2.4.5 - PDF text extraction
- `js-yaml` ^4.1.1 - YAML parsing (component metadata)

**Email:**
- `nodemailer` ^8.0.1 - SMTP sending (newsletters)
- `imapflow` ^1.2.14 - IMAP mail sync (press release ingestion)
- `mailparser` ^3.9.4 - Email parsing

**Search:**
- `@orama/orama` ^3.1.16 - Full-text search engine (in-memory, `src/lib/search/`)

**HTTP/Network:**
- `axios` ^1.7.9 - HTTP client (some API calls)
- `fflate` ^0.8.2 - Compression

**Forms & Validation:**
- `@hookform/resolvers` ^4 - React Hook Form validation
- `zod` ^4.1.12 - Schema validation

**Security:**
- `bcryptjs` ^3.0.3 - Password hashing
- `server-only` 0.0.1 - Prevents server module import in client code

**Theming:**
- `next-themes` ^0.4.3 - Dark/light mode

**Utilities:**
- `es-toolkit` ^1 - Lodash alternative

## Configuration

**TypeScript:**
- Config: `tsconfig.json`
- Target: ES2017, Module: ESNext, Module resolution: Bundler
- `strict: true` but `strictNullChecks: false`, `noImplicitAny: false`
- Path alias: `@/*` maps to `./src/*`
- Excludes: `node_modules`, `screenshot-server`, `mcp-server`, `scripts`

**ESLint:**
- Config: `eslint.config.mjs` (flat config format)
- Extends: `next/core-web-vitals`, `next/typescript`
- Relaxed rules: `no-explicit-any: off`, `no-unused-vars: off`, `no-empty-object-type: off`
- Extra relaxation for `src/components/registry/**/*` and `src/components/sections/**/*`

**PostCSS:**
- Config: `postcss.config.mjs`
- Plugin: `@tailwindcss/postcss` only

**Next.js:**
- Config: `next.config.ts`
- Images: `unoptimized: true` (Vercel Hobby plan limit)
- Server external packages: `mysql2`, `sharp`
- Security headers: CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- Redirects: RSS feed URL aliases

**Environment:**
- `.env.example` and `.env.production.local.example` document required vars
- `.env.local` for local development (not committed)
- Key env vars: see INTEGRATIONS.md

## Build & Scripts

**Core Commands:**
```bash
pnpm dev                  # Next.js dev server (port 3001 local convention)
pnpm build                # prebuild (metadata+registry) → next build
pnpm start                # next start
pnpm lint                 # next lint
```

**Prebuild Pipeline:**
- `pnpm prebuild` runs `pnpm metadata:build && pnpm registry:build`
- `metadata:build` → `tsx scripts/generate-registry.ts`
- `registry:build` → `tsx scripts/generate-shadcn-registry.ts`

**CI Commands:**
```bash
pnpm ci:lint              # next lint
pnpm ci:typecheck         # tsc --noEmit
pnpm ci:validate          # metadata validation
pnpm ci:all               # lint + typecheck + validate (parallel) → build
```

**E2E Tests:**
```bash
pnpm test:e2e             # vitest run (e2e/*.test.ts)
pnpm test:e2e:watch       # vitest watch mode
```

**Deployment:**
```bash
vercel deploy --prod      # Direct deployment (preferred)
pnpm build:vercel         # Build + postbuild revalidation
```

## Platform Requirements

**Development:**
- Node.js 20+
- pnpm 9.12.2+
- Local port 3001 (convention)
- MySQL optional (local Cafe24 dev), Supabase for all environments

**Production:**
- Vercel Hobby plan (primary)
- Vercel Cron: max 1 job/day (2 cron jobs configured in `vercel.json`)
- PM2 config for Cafe24 Node.js hosting fallback (`ecosystem.config.js`)
- Image optimization disabled (Vercel quota)

---

*Stack analysis: 2026-03-25*
