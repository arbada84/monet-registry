# Phase 6: SEO, 피드, AI 도구 - Research

**Researched:** 2026-03-26
**Domain:** RSS/Sitemap/OG metadata, API v1, AI editing, image upload, Coupang API
**Confidence:** HIGH

## Summary

Phase 6은 기존 코드의 브라운필드 점검으로, 8개 요구사항(FED-01~04, TOL-01~04) 영역의 소스코드를 전수 분석했다. 코드 전반적으로 잘 구성되어 있으나, RSS XML 유효성, API v1 이중 인증 구조의 복잡성, 이미지 업로드 인증 부재, ZIP 업로드 인증 부재 등 **실질적 버그와 보안 허점**이 다수 발견되었다.

**Primary recommendation:** RSS `<author>` 태그 형식 수정, 이미지/ZIP 업로드 API 인증 추가, AI API 입력 길이 제한 추가, sitemap lastmod 일관성 확보를 우선 처리한다.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FED-01 | RSS 피드가 올바른 XML을 반환한다 | RSS route 분석 완료 - `<author>` 태그 형식 오류 등 4건 발견 |
| FED-02 | sitemap.xml이 모든 기사를 포함한다 | sitemap route 분석 완료 - 정적 페이지 누락, lastmod 미지정 등 3건 발견 |
| FED-03 | OG 메타태그가 기사별로 정확히 생성된다 | generateMetadata + OG API 분석 완료 - 양호, 경미한 개선점 1건 |
| FED-04 | API v1 엔드포인트들이 정상 응답한다 | articles CRUD + registry endpoints 분석 완료 - 이중 인증 구조 주의점 2건 |
| TOL-01 | AI 기사 편집이 정상 작동한다 | AI route 분석 완료 - 입력 길이 미제한 등 3건 발견 |
| TOL-02 | 이미지 업로드가 정상 저장된다 | upload/image route 분석 완료 - 인증 미적용 등 2건 발견 |
| TOL-03 | OG 이미지 자동추출이 정상 작동한다 | server-upload-image.ts 분석 완료 - 양호 |
| TOL-04 | 쿠팡 API 상품 검색이 정상 작동한다 | coupang/products route 분석 완료 - 인증 부재 1건 |
</phase_requirements>

## Common Pitfalls (Bugs Found)

### BUG-01: RSS `<author>` 태그가 RSS 2.0 스펙 위반 [FED-01]
**What goes wrong:** RSS 2.0 스펙에서 `<author>`는 반드시 이메일 주소 형식이어야 한다 (예: `noreply@example.com (기자명)`). 현재 코드는 기자명 텍스트만 출력한다.
**파일:** `src/app/api/rss/route.ts:108`
**현재:** `<author>${escapeXml(a.author)}</author>` -> `<author>홍길동</author>`
**올바른 형식:** `<author>noreply@culturepeople.co.kr (홍길동)</author>` 또는 `<dc:creator>` 사용
**심각도:** MEDIUM - 일부 RSS 리더에서 파싱 오류 가능

### BUG-02: RSS 피드에 `dynamic` export 미설정 [FED-01]
**What goes wrong:** RSS route에 `export const dynamic = "force-dynamic"` 또는 캐시 설정이 없다. Next.js가 빌드 시 정적으로 생성하거나 예기치 않게 캐싱할 수 있다. 현재 `Cache-Control` 헤더로 CDN 캐싱은 제어하지만, Next.js 내부 빌드 캐싱은 별도이다.
**파일:** `src/app/api/rss/route.ts`
**심각도:** LOW - 현재 s-maxage=600으로 CDN은 제어되지만, ISR 관련 동작이 불확실할 수 있음

### BUG-03: RSS `<enclosure>` length 항상 0 [FED-01]
**What goes wrong:** `<enclosure url="..." type="image/jpeg" length="0" />`에서 length가 항상 0이다. RSS 2.0 스펙에서 length는 필수 속성이며 바이트 크기를 명시해야 한다. 0은 유효하지만 일부 리더에서 다운로드를 건너뛸 수 있다.
**파일:** `src/app/api/rss/route.ts:109`
**심각도:** LOW - 대부분의 리더는 0을 허용하지만 비표준

### BUG-04: RSS 피드 기사 정렬이 date 문자열 비교 [FED-01]
**What goes wrong:** `.sort((a, b) => b.date.localeCompare(a.date))`로 정렬한다. date가 "YYYY-MM-DD" 형식이면 문자열 비교로 정렬이 올바르지만, ISO 8601 full datetime이면 시간대 차이로 미묘한 정렬 오류 가능.
**파일:** `src/app/api/rss/route.ts:85`
**심각도:** LOW - 현재 대부분 YYYY-MM-DD 형식이므로 실질적 문제 없음

### BUG-05: Sitemap에 정적 페이지 누락 [FED-02]
**What goes wrong:** `/about`, `/terms`, `/privacy` 같은 정적 페이지가 sitemap에 포함되지 않는다. 현재 홈, 검색, 카테고리, 기사, 태그, 기자 페이지만 포함된다.
**파일:** `src/app/sitemap.xml/route.ts:27-29`
**심각도:** MEDIUM - SEO에 직접적 영향

### BUG-06: Sitemap 정적 페이지에 lastmod 없음 [FED-02]
**What goes wrong:** 홈(`/`), 검색(`/search`) 등 정적 페이지 URL에 `<lastmod>`가 없다. 검색엔진이 크롤링 우선순위를 결정할 때 lastmod를 참고한다.
**파일:** `src/app/sitemap.xml/route.ts:28-29`
**심각도:** LOW

### BUG-07: Sitemap에 news sitemap 확장 미적용 [FED-02]
**What goes wrong:** Google News에 최적화하려면 `<news:news>` 확장을 사용해야 한다. 뉴스 사이트임에도 기본 sitemap만 생성한다.
**파일:** `src/app/sitemap.xml/route.ts`
**심각도:** LOW - 기본 sitemap만으로도 Google News 인덱싱은 가능하지만 최적은 아님

### BUG-08: 이미지 업로드 API에 인증 없음 [TOL-02] **CRITICAL**
**What goes wrong:** `POST /api/upload/image`에 인증이 전혀 없다. 누구나 파일을 업로드하거나 URL을 제출하여 Supabase Storage를 채울 수 있다. `noWatermark` 파라미터만 admin 권한 체크를 하지만, 업로드 자체는 제한 없음.
**파일:** `src/app/api/upload/image/route.ts`
**심각도:** CRITICAL - 스토리지 남용, 비용 폭탄 가능

### BUG-09: ZIP 업로드 API에 인증 없음 [TOL-02] **CRITICAL**
**What goes wrong:** `POST /api/upload/zip-articles`에 인증이 없다. 누구나 ZIP 파일을 업로드하여 기사를 생성할 수 있다.
**파일:** `src/app/api/upload/zip-articles/route.ts`
**심각도:** CRITICAL - 무단 기사 등록 가능

### BUG-10: AI API에 content 길이 제한 없음 [TOL-01]
**What goes wrong:** `POST /api/ai`에서 `content` 필드의 길이를 검증하지 않는다. 매우 큰 텍스트를 전송하면 OpenAI/Gemini API 호출 비용이 급증하거나 타임아웃이 발생할 수 있다. Rate limit (분당 20회)은 있지만 단일 요청의 크기 제한이 없다.
**파일:** `src/app/api/ai/route.ts`
**심각도:** MEDIUM - 비용 남용 가능

### BUG-11: AI API에서 Gemini 시스템 프롬프트 처리 비표준 [TOL-01]
**What goes wrong:** OpenAI는 system/user 메시지를 분리하지만, Gemini는 system prompt와 content를 하나의 text로 합친다 (`${systemPrompt}\n\n---\n\n${content}`). Gemini API는 `systemInstruction` 필드를 지원하는데 이를 사용하지 않는다. 이로 인해 프롬프트 주입 공격에 취약할 수 있다.
**파일:** `src/app/api/ai/route.ts:118-119`
**심각도:** MEDIUM - Gemini의 systemInstruction 필드 미사용

### BUG-12: 쿠팡 API에 인증/Rate Limit 없음 [TOL-04]
**What goes wrong:** `GET /api/coupang/products`에 인증도 Rate Limit도 없다. 누구나 쿠팡 API를 프록시로 남용할 수 있다.
**파일:** `src/app/api/coupang/products/route.ts`
**심각도:** MEDIUM - 쿠팡 API 쿼터 소진 위험

### BUG-13: API v1 이중 인증 구조 혼란 [FED-04]
**What goes wrong:** API v1 articles 엔드포인트는 미들웨어 레벨에서 Basic Auth가 적용되고, 라우트 핸들러 안에서 다시 Bearer Token/Cookie 인증을 한다. 즉, 외부 호출 시 Basic Auth + Bearer Token 두 가지가 모두 필요하다. 이는 의도된 설계일 수 있으나, API 문서에 명시되어 있지 않아 혼란을 야기한다.
**파일:** middleware.ts:196 + `src/app/api/v1/articles/route.ts:14-20`
**심각도:** LOW - 보안상 문제는 아니지만 사용성 저하

### BUG-14: API v1 registry 엔드포인트는 articles와 별개 시스템 [FED-04]
**What goes wrong:** `/api/v1/` 하위에 두 가지 별개 시스템이 공존한다:
1. **뉴스 기사 API** (`/api/v1/articles/*`) - Supabase 기반, Bearer+Cookie 인증
2. **컴포넌트 레지스트리 API** (`/api/v1/components/*`, `/api/v1/pages/*`, etc.) - registryService 기반, 읽기 전용

둘 다 미들웨어의 Basic Auth가 적용된다 (badge 제외). 이 이중 구조가 명확하지 않다.
**심각도:** LOW - 아키텍처 정리 필요하지만 기능상 문제 없음

### BUG-15: OG 이미지 API에서 Edge Runtime 제한 [FED-03]
**What goes wrong:** `/api/og` route는 `runtime = "edge"`로 설정되어 있으며, 기사 데이터를 내부 API (`/api/db/articles`)로 fetch한다. Edge에서 같은 서버의 API를 호출하면 Vercel에서 cold start 지연이나 순환 호출 문제가 발생할 수 있다. 그러나 현재 대부분의 경우 쿼리 파라미터로 직접 데이터를 전달하므로 실제 문제 발생 빈도는 낮다.
**파일:** `src/app/api/og/route.tsx:33`
**심각도:** LOW

### BUG-16: RSS disabled 상태에서 빈 피드 XML 형식 [FED-01]
**What goes wrong:** RSS 비활성화 시 `<channel></channel>`만 반환한다. `<channel>` 안에 `<title>`, `<link>`, `<description>`은 RSS 2.0 필수 요소이므로 엄격한 XML 파서에서 유효하지 않다.
**파일:** `src/app/api/rss/route.ts:45`
**심각도:** LOW - 비활성화 상태이므로 실질적 영향 적음

### BUG-17: API v1 PUT에서 '상신' status 누락 [FED-04]
**What goes wrong:** PUT 엔드포인트의 VALID 배열이 `["게시", "임시저장", "예약"]`이지만, POST 엔드포인트는 `["임시저장", "상신", "예약"]`이다. 상신(review) 상태가 PUT에서는 유효하지 않아 이미 상신 상태인 기사를 수정할 때 상태 변경이 거부된다.
**파일:** `src/app/api/v1/articles/[id]/route.ts:64`
**심각도:** MEDIUM - 워크플로우 버그

## Architecture Patterns

### 현재 구조 (문제 없는 영역)
```
src/app/
  api/
    rss/route.ts          -- RSS 2.0 피드 (GET)
    sitemap.xml/route.ts  -- XML Sitemap (GET)
    og/route.tsx          -- 동적 OG 이미지 (Edge, GET)
    ai/route.ts           -- AI 편집 (POST, rate-limited)
    upload/
      image/route.ts      -- 이미지 업로드 (POST, **인증 없음**)
      zip-articles/route.ts -- ZIP 기사 업로드 (POST, **인증 없음**)
    coupang/products/route.ts -- 쿠팡 API (GET, **인증 없음**)
    v1/
      articles/           -- 기사 CRUD (Bearer Token + Basic Auth)
      articles/markdown/  -- 마크다운 기사 등록
      components/         -- 레지스트리 (Basic Auth, 읽기전용)
      pages/              -- 레지스트리 (Basic Auth, 읽기전용)
      ...
  article/[id]/page.tsx   -- 기사 상세 (OG metadata 생성)
```

### OG 이미지 생성 흐름 (양호)
1. `generateMetadata`에서 `article.ogImage || article.thumbnail` 우선 사용
2. 없으면 `/api/og?title=...&category=...` 동적 생성 URL 사용
3. Edge runtime에서 ImageResponse로 1200x630 OG 이미지 생성

### 이미지 업로드 파이프라인 (양호)
1. 파일 업로드 또는 URL 제출
2. 매직 바이트 검증 (MIME spoofing 방어)
3. SSRF 방지 (내부 IP 차단)
4. 워터마크 적용 (GIF 제외)
5. Supabase Storage 업로드
6. og:image 자동 추출 (HTML 응답 시)
7. weserv.nl 프록시 폴백

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RSS XML 생성 | 문자열 템플릿 (현재 방식) | 현재 방식 유지하되 스펙 준수 | 의존성 최소화 원칙, 단 escapeXml은 철저히 |
| Sitemap 생성 | 커스텀 XML builder | 현재 방식 유지 | 단순한 구조이므로 라이브러리 불필요 |
| OG 이미지 | Canvas/Puppeteer | next/og ImageResponse | 이미 올바르게 사용 중 |
| Rate Limit | 인메모리 구현만 | Redis + 인메모리 폴백 | 이미 올바르게 사용 중 (AI route) |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | 수동 검증 (자동 테스트 프레임워크 없음) |
| Config file | 없음 |
| Quick run command | `curl` 기반 수동 검증 |
| Full suite command | 없음 |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FED-01 | RSS XML 유효성 | manual | `curl -s https://culturepeople.co.kr/api/rss \| xmllint --noout -` | N/A |
| FED-02 | Sitemap 완전성 | manual | `curl -s https://culturepeople.co.kr/sitemap.xml \| xmllint --noout -` | N/A |
| FED-03 | OG 메타태그 정확성 | manual | `curl -s https://culturepeople.co.kr/article/1 \| grep 'og:'` | N/A |
| FED-04 | API v1 정상 응답 | manual | `curl -u user:pass https://culturepeople.co.kr/api/v1/articles` | N/A |
| TOL-01 | AI 편집 작동 | manual | POST /api/ai 호출 | N/A |
| TOL-02 | 이미지 업로드 작동 | manual | POST /api/upload/image 호출 | N/A |
| TOL-03 | OG 이미지 추출 작동 | manual | POST /api/upload/image + URL 모드 | N/A |
| TOL-04 | 쿠팡 API 작동 | manual | GET /api/coupang/products?keyword=test | N/A |

### Wave 0 Gaps
- 자동 테스트 프레임워크 자체가 없음 -- 이 페이즈는 수동 코드 수정+배포 검증 방식

## Code Examples

### BUG-01 수정: RSS `<author>` 형식
```typescript
// 현재 (비표준)
${a.author ? `<category>${escapeXml(a.author)}</category>` : ""}

// 수정안 1: dc:creator 사용 (xmlns:dc 추가 필요)
${a.author ? `<dc:creator>${escapeXml(a.author)}</dc:creator>` : ""}

// 수정안 2: RSS 2.0 표준 형식
${a.author ? `<author>noreply@culturepeople.co.kr (${escapeXml(a.author)})</author>` : ""}
```

### BUG-08 수정: 이미지 업로드 인증 추가
```typescript
// upload/image/route.ts 상단에 인증 추가
import { verifyAuthToken } from "@/lib/cookie-auth";

export async function POST(request: NextRequest) {
  // 관리자 인증 필수
  const cookie = request.cookies.get("cp-admin-auth");
  const auth = await verifyAuthToken(cookie?.value ?? "");
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }
  // ... 기존 코드
}
```

### BUG-17 수정: PUT status 배열 통일
```typescript
// 현재
const VALID = ["게시", "임시저장", "예약"];
// 수정
const VALID = ["게시", "임시저장", "예약", "상신"];
```

## Open Questions

1. **이미지 업로드 인증이 의도적 미적용인가?**
   - What we know: noWatermark만 admin 체크하고 업로드 자체는 무인증
   - What's unclear: 외부 서비스(auto-press, mail-sync 등)에서 쿠키 없이 호출하는 케이스가 있는지
   - Recommendation: API key 인증 또는 admin cookie 인증 추가, 단 내부 서버 호출 경로 확인 필요

2. **API v1 이중 인증 (Basic Auth + Bearer) 의도 확인**
   - What we know: 미들웨어에서 Basic Auth, 핸들러에서 Bearer Token
   - What's unclear: 두 단계 모두 통과해야 하는 것이 의도인지
   - Recommendation: 현재 동작 유지하되 API 문서화 필요

## Metadata

**Confidence breakdown:**
- RSS/Sitemap 분석: HIGH - 소스코드 직접 확인
- OG 메타태그: HIGH - generateMetadata 코드 직접 확인
- API v1: HIGH - 라우트 핸들러 + 미들웨어 모두 확인
- AI/Upload/Coupang: HIGH - 소스코드 직접 확인
- 보안 이슈: HIGH - 인증 코드 부재 직접 확인

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (안정적인 코드 분석 기반)

## Sources

### Primary (HIGH confidence)
- 소스코드 직접 분석: `src/app/api/rss/route.ts`, `src/app/sitemap.xml/route.ts`, `src/app/article/[id]/page.tsx`, `src/app/api/og/route.tsx`
- 소스코드 직접 분석: `src/app/api/v1/articles/route.ts`, `src/app/api/v1/articles/[id]/route.ts`, `src/app/api/v1/articles/markdown/route.ts`
- 소스코드 직접 분석: `src/app/api/ai/route.ts`, `src/app/api/upload/image/route.ts`, `src/app/api/upload/zip-articles/route.ts`
- 소스코드 직접 분석: `src/app/api/coupang/products/route.ts`, `src/lib/server-upload-image.ts`, `src/lib/api-key.ts`
- 소스코드 직접 분석: `src/middleware.ts` (인증 흐름)
- RSS 2.0 Specification: `<author>` must be email address format
