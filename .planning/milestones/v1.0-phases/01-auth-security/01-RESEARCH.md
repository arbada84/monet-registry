# Phase 1: 인증 및 보안 - Research

**Researched:** 2026-03-26
**Domain:** Serverless authentication, token blacklisting, rate limiting (Upstash Redis)
**Confidence:** HIGH

## Summary

이 프로젝트는 Next.js 15.5.14 App Router + Vercel Hobby 환경에서 쿠키 기반 HMAC 인증을 사용한다. 핵심 문제는 토큰 블랙리스트(cookie-auth.ts의 `Set`), cron Rate Limiting(middleware.ts의 `Map`), 댓글 Rate Limiting(comments/route.ts의 `Map`), 뉴스레터/AI/해시 API Rate Limiting 등 5곳에서 인메모리 상태를 사용하고 있어 Vercel 서버리스 콜드스타트마다 초기화된다는 점이다.

`@upstash/redis`가 이미 설치되어 있으며(v1.36.3), 로그인 Rate Limiting에서 Redis를 사용하는 기존 패턴이 login/route.ts에 구현되어 있다. 이 패턴을 나머지 인메모리 상태 의존 부분에 확장 적용하면 된다. `@upstash/ratelimit` SDK(v2.0.8)는 더 고수준의 Rate Limiting 추상화를 제공하지만, 현재 코드가 이미 `redis.incr()` + `redis.expire()` 패턴을 사용 중이므로 일관성을 위해 동일한 저수준 패턴을 유지하는 것이 권장된다.

**Primary recommendation:** 기존 login/route.ts의 Redis 초기화 + incr/expire 패턴을 공통 유틸로 추출하여 5개 인메모리 상태를 모두 Redis로 전환하고, Redis 연결 실패 시 인메모리 폴백을 유지한다.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-01 | 로그인/로그아웃이 정상 작동한다 | cookie-auth.ts HMAC 토큰 + 쿠키 설정/삭제 정상. 로그아웃 시 블랙리스트가 Redis로 전환되어야 함 |
| SEC-02 | 세션 만료 시 자동 리다이렉트가 작동한다 | middleware.ts의 getAuthState() + verifyAuthToken() 24h 만료 + /cam/login 리다이렉트 정상 구현됨 |
| SEC-03 | Rate Limiting이 실제로 작동한다 (서버리스 환경 포함) | 5곳 인메모리 Map을 Redis로 전환 필요. Redis incr+expire 패턴 사용 |
| SEC-04 | RBAC가 역할별 접근 제한을 정확히 수행한다 | middleware.ts의 REPORTER_ALLOWED_PATHS 로직 정상. 토큰에 role 포함됨 |
| SEC-05 | 토큰 블랙리스트가 서버리스에서도 유효하다 | cookie-auth.ts의 `Set<string>`을 Redis `SET` + TTL 24h로 전환 필요 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- 모든 출력을 한글로 작성
- 코드 변경 시 `vercel deploy --prod`까지 자동 실행
- DB 우선순위: Supabase > MySQL > File DB
- Vercel Hobby: cron 1일1회, 이미지 최적화 제한
- pnpm 9.12.2 사용
- 로컬 포트 3001

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @upstash/redis | 1.36.3 (installed), 1.37.0 (latest) | Redis 클라이언트 (HTTP 기반, Edge 호환) | 이미 프로젝트에 설치됨. login/route.ts에서 사용 중 |
| next | 15.5.14 | App Router + Middleware (Edge Runtime) | 기존 프로젝트 스택 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw redis.incr/expire | @upstash/ratelimit v2.0.8 | 고수준 SDK지만 현재 코드 패턴과 불일치. 새 의존성 추가 불필요. login/route.ts와 일관성 유지가 더 중요 |
| Upstash Redis SET for blacklist | Upstash Redis SADD/SISMEMBER | SET 타입은 TTL을 키 단위로 걸 수 없음. 개별 키(cp:blacklist:{token_hash})가 TTL 관리에 적합 |

**Installation:**
```bash
# 이미 설치됨, 추가 설치 불필요
# 업그레이드하려면: pnpm update @upstash/redis
```

## Architecture Patterns

### 현재 인메모리 상태 목록 (전환 대상)

| 위치 | 변수 | 용도 | Redis Key 패턴 | TTL |
|------|------|------|----------------|-----|
| `src/lib/cookie-auth.ts` | `tokenBlacklist: Set<string>` | 로그아웃 토큰 무효화 | `cp:blacklist:{sha256_prefix}` | 86400s (24h, 토큰 만료와 동일) |
| `src/middleware.ts` | `cronRateLimitMap: Map` | Cron API Rate Limit (분당 5회) | `cp:cron:rate:{ip}` | 60s |
| `src/app/api/db/comments/route.ts` | `commentRateMap: Map` | 댓글 Rate Limit (10분에 5개) | `cp:comment:rate:{ip}` | 600s |
| `src/app/api/newsletter/unsubscribe/route.ts` | `rateLimitMap: Map` | 뉴스레터 구독 해제 (분당 10회) | `cp:newsletter:rate:{ip}` | 60s |
| `src/app/api/ai/route.ts` | `rateLimitMap: Map` | AI API (분당 20회) | `cp:ai:rate:{ip}` | 60s |
| `src/app/api/auth/hash/route.ts` | `rateLimitMap: Map` | 해시 API (분당 10회) | `cp:hash:rate:{ip}` | 60s |

### Pattern 1: Redis 초기화 (기존 login/route.ts 패턴)
**What:** 모듈 최상위에서 Redis 인스턴스를 초기화하고, 실패 시 null로 폴백
**When to use:** 모든 Redis 사용 파일에서 동일 패턴 적용

```typescript
// Source: src/app/api/auth/login/route.ts (기존 코드)
import { Redis } from "@upstash/redis";

let redis: InstanceType<typeof Redis> | null = null;
try {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (url && token) {
    redis = new Redis({ url, token });
  }
} catch (e) {
  console.error("[module] Redis 초기화 실패:", e);
}
```

### Pattern 2: Redis Rate Limiting (incr + expire)
**What:** IP 기반 고정 윈도우 Rate Limiting
**When to use:** 모든 Rate Limiting 전환에 사용

```typescript
async function checkRateLimit(ip: string, prefix: string, maxPerWindow: number, windowSeconds: number): Promise<boolean> {
  if (redis) {
    try {
      const key = `${prefix}${ip}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }
      return count <= maxPerWindow;
    } catch (e) {
      console.error(`[${prefix}] Redis Rate Limit 실패:`, e);
      return true; // Redis 장애 시 통과 (가용성 우선)
    }
  }
  // 인메모리 폴백 (개발환경용)
  // ... 기존 Map 로직 유지 ...
}
```

### Pattern 3: Redis 토큰 블랙리스트 (SET + TTL)
**What:** 로그아웃된 토큰을 Redis에 저장하여 서버리스 인스턴스 간 공유
**When to use:** cookie-auth.ts의 invalidateToken/isTokenBlacklisted 전환

```typescript
// 토큰의 SHA-256 해시 앞 16자를 키로 사용 (전체 토큰 저장 불필요)
async function getTokenKey(token: string): Promise<string> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(token));
  const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  return `cp:blacklist:${hex.slice(0, 16)}`;
}

export async function invalidateToken(token: string): Promise<void> {
  if (redis) {
    try {
      const key = await getTokenKey(token);
      await redis.set(key, "1", { ex: 86400 }); // 24h TTL (토큰 만료와 동일)
      return;
    } catch (e) {
      console.error("[auth] Redis 블랙리스트 등록 실패:", e);
    }
  }
  // 인메모리 폴백
  tokenBlacklist.add(token);
}

export async function isTokenBlacklisted(token: string): Promise<boolean> {
  if (redis) {
    try {
      const key = await getTokenKey(token);
      const exists = await redis.exists(key);
      return exists === 1;
    } catch (e) {
      console.error("[auth] Redis 블랙리스트 조회 실패:", e);
    }
  }
  return tokenBlacklist.has(token);
}
```

### Anti-Patterns to Avoid
- **인메모리 상태를 서버리스에서 사용:** Vercel은 요청마다 다른 인스턴스에서 실행될 수 있으므로 `Map`/`Set`은 신뢰할 수 없음
- **@upstash/ratelimit SDK를 기존 incr/expire 코드와 혼용:** 일관성 없는 패턴은 유지보수 부담 증가
- **Redis 실패 시 요청 차단:** 가용성(availability)이 보안보다 우선. Redis 장애 시 통과시키고 로그 남기기
- **토큰 전체를 Redis 키로 사용:** 토큰이 길어질 수 있으므로 해시 접두어 사용

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP 기반 Redis 클라이언트 | 직접 fetch로 Upstash REST API 호출 | `@upstash/redis` | Edge Runtime 호환, 자동 재시도, 타입 안전 |
| 슬라이딩 윈도우 Rate Limiting | 직접 타임스탬프 배열 관리 | `redis.incr()` + `redis.expire()` (고정 윈도우) | 서버리스에서 충분히 효과적. 정밀한 슬라이딩 윈도우가 필요하면 `@upstash/ratelimit` 사용 |
| HMAC 토큰 서명 | 직접 crypto 구현 | 기존 `crypto.subtle` 기반 구현 유지 | 이미 잘 구현되어 있음 (timing-safe 비교 포함) |

**Key insight:** 이 프로젝트에서 고정 윈도우(incr+expire)가 슬라이딩 윈도우보다 적합한 이유 - 트래픽이 적은 뉴스 사이트에서 윈도우 경계 스파이크는 실질적 위협이 아니며, 코드 일관성과 단순성이 더 중요하다.

## Common Pitfalls

### Pitfall 1: cookie-auth.ts의 동기 함수가 비동기로 변경됨
**What goes wrong:** `invalidateToken`과 `isTokenBlacklisted`가 Redis 전환 후 async가 되면, 이를 호출하는 모든 곳에서 await가 필요
**Why it happens:** 기존 함수가 `void`/`boolean` 반환이었는데 `Promise<void>`/`Promise<boolean>`으로 변경
**How to avoid:** 호출부를 모두 검색하여 await 추가. 특히 `isAuthenticated()` 함수 내부의 `isTokenBlacklisted` 호출
**Warning signs:** TypeScript 컴파일 에러가 발생하지 않을 수 있음 (Promise는 truthy이므로)

### Pitfall 2: middleware.ts에서 Redis 호출 시 지연(latency)
**What goes wrong:** 미들웨어는 모든 매칭 요청에 실행되므로 Redis 호출이 응답 시간에 영향
**Why it happens:** Upstash Redis REST API는 ~1-5ms 지연 (같은 리전일 때)
**How to avoid:** Upstash Redis를 Vercel 배포 리전과 같은 리전에 생성. cron Rate Limit은 cron 경로에서만 발생하므로 일반 페이지 로딩에는 영향 없음
**Warning signs:** TTFB(Time to First Byte)가 눈에 띄게 증가

### Pitfall 3: Redis 키 네임스페이스 충돌
**What goes wrong:** 다른 용도의 키가 같은 접두어를 사용하면 데이터 오염
**Why it happens:** 체계적인 키 네이밍 없이 개발
**How to avoid:** 모든 키에 `cp:` 접두어 + 기능별 세그먼트 사용. 예: `cp:blacklist:`, `cp:cron:rate:`, `cp:comment:rate:`
**Warning signs:** 예상치 못한 TTL이나 카운트 값

### Pitfall 4: `checkCronRateLimit`이 async로 변경 시 호출부 누락
**What goes wrong:** middleware.ts에서 `checkCronRateLimit`이 3곳에서 호출되는데, 일부만 await 추가하면 나머지는 항상 통과
**Why it happens:** Promise 객체는 JavaScript에서 truthy이므로 `!checkCronRateLimit(ip)`은 항상 false
**How to avoid:** 호출부 3곳 모두에 await 추가. `if (!await checkCronRateLimit(...))`
**Warning signs:** Rate Limiting이 작동하지 않는 것처럼 보임

### Pitfall 5: 토큰 블랙리스트 TTL과 토큰 만료 시간 불일치
**What goes wrong:** 블랙리스트 TTL이 토큰 만료보다 짧으면 로그아웃한 토큰이 다시 유효해짐
**Why it happens:** 토큰 만료는 24h인데 블랙리스트 TTL을 더 짧게 설정
**How to avoid:** 블랙리스트 TTL = 86400s (24h)로 토큰 만료와 동일하게 설정
**Warning signs:** 로그아웃 후 시간이 지나면 같은 토큰으로 다시 접근 가능

## Code Examples

### 공통 Redis 유틸 (새로 추출 권장)

```typescript
// src/lib/redis.ts (신규 파일)
import { Redis } from "@upstash/redis";

let redis: InstanceType<typeof Redis> | null = null;
try {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (url && token) {
    redis = new Redis({ url, token });
  }
} catch (e) {
  console.error("[redis] 초기화 실패:", e);
}

export { redis };
```

**주의:** middleware.ts는 Edge Runtime이고 route handler는 Node.js Runtime이다. `@upstash/redis`는 HTTP 기반이므로 양쪽 모두 호환된다. 하지만 공통 모듈을 Edge에서 import하려면 Node.js 전용 API를 사용하지 않아야 한다. `@upstash/redis`는 Edge 호환이므로 문제 없음.

### 토큰 블랙리스트 전환 (cookie-auth.ts)

```typescript
// 기존: 동기 함수
export function invalidateToken(token: string): void { ... }
export function isTokenBlacklisted(token: string): boolean { ... }

// 변경: 비동기 함수 (Redis 우선, 인메모리 폴백)
export async function invalidateToken(token: string): Promise<void> { ... }
export async function isTokenBlacklisted(token: string): Promise<boolean> { ... }
```

호출부 변경 필요:
1. `src/app/api/auth/login/route.ts` DELETE 핸들러 (line 268): `if (token) invalidateToken(token)` -> `if (token) await invalidateToken(token)`
2. `src/lib/cookie-auth.ts` `isAuthenticated()` (line 161): `if (tokenValue && isTokenBlacklisted(tokenValue))` -> `if (tokenValue && await isTokenBlacklisted(tokenValue))`

### Rate Limiting 전환 예시 (댓글)

```typescript
// src/app/api/db/comments/route.ts
import { redis } from "@/lib/redis"; // 또는 직접 초기화

const COMMENT_LIMIT = 5;
const COMMENT_WINDOW_S = 600; // 10분

async function checkCommentRateLimit(ip: string): Promise<boolean> {
  if (redis) {
    try {
      const key = `cp:comment:rate:${ip}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, COMMENT_WINDOW_S);
      if (count > COMMENT_LIMIT) {
        console.warn(`[security] 댓글 Rate Limit 초과: ip=${ip.slice(0, 8)}***, count=${count}`);
        return false;
      }
      return true;
    } catch (e) {
      console.error("[comments] Redis Rate Limit 실패:", e);
      return true; // 가용성 우선
    }
  }
  // 인메모리 폴백 (기존 로직)
  // ...
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 인메모리 Map Rate Limiting | Redis 기반 Rate Limiting | login/route.ts에서 이미 전환됨 | 서버리스에서 Rate Limiting 실제 작동 |
| 인메모리 Set 토큰 블랙리스트 | Redis 기반 토큰 블랙리스트 | 이번 Phase에서 전환 필요 | 로그아웃 토큰이 모든 인스턴스에서 무효화 |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Upstash Redis | 토큰 블랙리스트, Rate Limiting | Yes (환경변수 설정됨) | REST API | 인메모리 폴백 (개발환경) |
| @upstash/redis npm | Redis 클라이언트 | Yes | 1.36.3 | -- |
| crypto.subtle | 토큰 해시 (블랙리스트 키) | Yes | Web Crypto API | Edge+Node 모두 지원 |
| Vercel Edge Runtime | middleware.ts | Yes | -- | -- |

**Missing dependencies with no fallback:** 없음
**Missing dependencies with fallback:** 없음

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.0.15 |
| Config file | vitest.e2e.config.mts (e2e 전용, 유닛 테스트 설정 없음) |
| Quick run command | `pnpm test:e2e` |
| Full suite command | `pnpm test:e2e` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-01 | 로그인/로그아웃 정상 작동 | manual + build | `pnpm build` (빌드 성공 확인) | -- (수동 테스트) |
| SEC-02 | 세션 만료 시 리다이렉트 | manual | 브라우저에서 만료 토큰으로 /cam 접근 | -- (수동 테스트) |
| SEC-03 | Rate Limiting 서버리스 작동 | manual + integration | 배포 후 동일 IP에서 제한 초과 요청 | -- (수동 테스트) |
| SEC-04 | RBAC 역할별 접근 제한 | code-review | middleware.ts REPORTER_ALLOWED_PATHS 검증 | -- (코드 리뷰) |
| SEC-05 | 토큰 블랙리스트 서버리스 유효 | manual + build | 배포 후 로그아웃 -> 같은 토큰으로 API 호출 | -- (수동 테스트) |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit` + `pnpm build`
- **Per wave merge:** `pnpm build` + 배포 후 수동 검증
- **Phase gate:** 빌드 성공 + 배포 후 인증/Rate Limiting 수동 확인

### Wave 0 Gaps
- 이 Phase는 주로 인프라 변경(인메모리 -> Redis)이므로 자동화된 유닛 테스트보다 빌드 성공과 배포 후 통합 테스트가 적합
- 기존 e2e 테스트는 API v1 badge/health 등에 집중되어 있어 인증 관련 테스트 없음

## Sources

### Primary (HIGH confidence)
- 프로젝트 소스 코드 직접 분석: `cookie-auth.ts`, `middleware.ts`, `login/route.ts`, `comments/route.ts`, `newsletter/unsubscribe/route.ts`, `ai/route.ts`, `hash/route.ts`
- [@upstash/ratelimit GitHub](https://github.com/upstash/ratelimit-js) - v2.0.8, 알고리즘 API 확인
- [Upstash Ratelimit 공식 문서](https://upstash.com/docs/redis/sdks/ratelimit-ts/overview) - 설정 옵션
- [Upstash Ratelimit Algorithms](https://upstash.com/docs/redis/sdks/ratelimit-ts/algorithms) - slidingWindow, fixedWindow, tokenBucket 파라미터

### Secondary (MEDIUM confidence)
- [Upstash Redis Next.js Tutorial](https://upstash.com/docs/redis/tutorials/nextjs_with_redis) - 서버리스 패턴
- [Rate Limiting Next.js API Routes](https://upstash.com/blog/nextjs-ratelimiting) - 미들웨어 패턴
- [Edge Rate Limiting](https://upstash.com/blog/edge-rate-limiting) - Edge Runtime 호환성

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - `@upstash/redis` 이미 설치/사용 중, 패턴 검증됨
- Architecture: HIGH - 기존 login/route.ts 패턴을 확장하는 것이므로 위험도 낮음
- Pitfalls: HIGH - 인메모리->Redis 전환 시 async 변경 영향을 코드 분석으로 확인함

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (안정적 스택, 30일)
