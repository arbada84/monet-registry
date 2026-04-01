# Phase 11: 코드 정리 및 품질 - Research

**Researched:** 2026-04-01
**Domain:** 레거시 코드 제거, 코드 통합, ESLint 품질 개선
**Confidence:** HIGH

## Summary

Phase 11은 프로덕션에서 사용하지 않는 MySQL/File DB 폴백 코드를 제거하고, 댓글 API의 중복 Supabase REST 구현을 공통 함수로 통합하며, 일회성 스크립트를 아카이브하고, ESLint no-explicit-any 규칙을 활성화하는 작업이다.

현재 `db-server.ts`(561줄)는 모든 함수에서 `isSupabaseEnabled() -> isMySQLEnabled() -> file-db` 3단 폴백 패턴을 반복한다. 프로덕션(Vercel)에서는 항상 Supabase만 사용되므로 MySQL/File DB 경로는 데드 코드다. 댓글 route(289줄)는 `supabase-server-db.ts`의 공통 함수를 사용하지 않고 자체 Supabase REST 클라이언트(`sbHeaders`, `isTableMode`, `rowToComment`)를 구현하고 있다. 스크립트 디렉토리에는 71개 파일 중 대부분이 일회성 마이그레이션/테스트 스크립트이며, ESLint no-explicit-any 위반은 프로젝트 코드(registry 제외)에서 단 1건이다.

**Primary recommendation:** db-server.ts에서 MySQL/file-db 폴백을 제거하여 Supabase 단일 경로로 단순화하고, 댓글 관련 Supabase 함수를 supabase-server-db.ts에 추가한 뒤 route를 리팩토링하라.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLEAN-02 | MySQL/File DB 폴백 코드 제거 | db-server.ts 3단 폴백 패턴 분석 완료, 영향받는 파일 4개 식별 (db-server.ts, login/route.ts, newsletter/route.ts + 삭제 대상 mysql-db.ts, file-db.ts, mysql.ts, cockroach-db.ts) |
| CLEAN-03 | 댓글 라우트 Supabase REST 중복 구현을 supabase-server-db.ts로 통합 | comments/route.ts 289줄 분석 완료, 자체 sbHeaders/isTableMode/rowToComment 헬퍼 + JSON 폴백 경로 식별 |
| CLEAN-04 | 일회성 스크립트 아카이브 + 레거시 SQL/Python 파일 정리 | scripts/ 71개 파일 + 루트 SQL/Python 5개 파일 목록 작성 완료 |
| QUAL-01 | ESLint no-explicit-any warn 레벨 활성화 + 주요 위반 수정 | 현재 `off` 상태, warn 전환 시 프로젝트 코드 위반 1건 (search/index.ts), registry 컴포넌트는 별도 규칙으로 이미 분리됨 |
</phase_requirements>

## Architecture Patterns

### 현재 db-server.ts 폴백 패턴 (제거 대상)

```typescript
// 현재: 모든 함수에 반복되는 3단 폴백
export async function serverGetArticles(): Promise<Article[]> {
  if (isSupabaseEnabled()) {
    try {
      const { sbGetArticles } = await import("@/lib/supabase-server-db");
      return await sbGetArticles();
    } catch { /* Supabase 실패 시 다음으로 */ }
  }
  if (isMySQLEnabled()) {
    const { dbGetArticles } = await import("@/lib/mysql-db");
    return dbGetArticles();
  }
  const { fileGetArticles } = await import("@/lib/file-db");
  return fileGetArticles();
}
```

### 리팩토링 후 패턴 (Supabase 단일 경로)

```typescript
// 변경 후: Supabase 직접 호출, 폴백 없음
import { sbGetArticles } from "@/lib/supabase-server-db";

export async function serverGetArticles(): Promise<Article[]> {
  return sbGetArticles();
}
```

**주의사항:** db-server.ts는 59개 파일에서 import되므로, export 시그니처를 변경하지 않고 내부 구현만 단순화해야 한다. 기존 `serverGetArticles`, `serverGetSetting` 등의 함수명과 타입은 그대로 유지한다.

### 댓글 통합 패턴

현재 comments/route.ts에서 자체 구현하는 것들:
1. `sbHeaders()` - Supabase REST 헤더 생성
2. `isTableMode()` - comments 테이블 존재 여부 캐시
3. `rowToComment()` - DB row -> Comment 타입 변환
4. 각 HTTP 메서드(GET/POST/PATCH/DELETE)에서 직접 `fetch(SB_URL/rest/v1/comments...)` 호출
5. JSON 폴백 (site_settings의 cp-comments 키 사용)

통합 방향: supabase-server-db.ts에 아래 함수 추가 후 route에서 호출
- `sbGetComments(articleId?, isAdmin?)`
- `sbCreateComment(data)`
- `sbUpdateCommentStatus(id, status)`
- `sbDeleteComment(id)` (자식 연쇄 삭제 포함)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Supabase REST 호출 | 직접 fetch + 헤더 조합 | `@supabase/supabase-js` 클라이언트 (이미 supabase-server-db.ts에서 사용) | 타입 안전성, 에러 핸들링, RLS 자동 처리 |

## Common Pitfalls

### Pitfall 1: Export 시그니처 변경으로 59개 파일 깨짐
**What goes wrong:** db-server.ts 함수명이나 반환 타입을 변경하면 import하는 59개 파일 전체가 깨진다
**Why it happens:** 리팩토링 시 "더 나은" API를 만들려는 욕심
**How to avoid:** 함수 시그니처 100% 유지, 내부 구현만 변경. `serverGetArticles` -> `sbGetArticles` 직접 위임
**Warning signs:** TypeScript 컴파일 에러 다수 발생

### Pitfall 2: login/route.ts와 newsletter/route.ts의 독립 폴백 코드 누락
**What goes wrong:** db-server.ts만 정리하고 login/route.ts(115-126줄)와 newsletter/route.ts(87-90줄)의 직접 mysql-db/file-db import를 놓침
**Why it happens:** db-server.ts에만 집중하여 grep 하지 않음
**How to avoid:** `mysql-db` 와 `file-db` 문자열로 전체 codebase grep 후 모든 참조 제거
**Warning signs:** mysql-db.ts 삭제 후 빌드 실패

### Pitfall 3: cockroach-db.ts도 정리 대상
**What goes wrong:** cockroach-db.ts(186줄)가 3개 파일에서 import되며 (auto-press, press-feed, press-feed/detail), CockroachDB는 Phase 10에서 도입된 활성 코드일 수 있음
**Why it happens:** 레거시로 착각하여 삭제
**How to avoid:** cockroach-db.ts는 press-feed 기능의 활성 코드이므로 건드리지 않는다. CLEAN-02 범위는 MySQL/File DB만 해당
**Warning signs:** press-feed API 500 에러

### Pitfall 4: 댓글 JSON 폴백 제거 시 데이터 유실
**What goes wrong:** comments 테이블이 아직 없는 환경에서 cp-comments 설정 키의 JSON 폴백을 제거하면 댓글이 사라짐
**Why it happens:** 테이블 모드만 남기고 JSON 폴백을 삭제
**How to avoid:** comments 테이블은 이미 생성 완료(2026-03-25), site_settings의 cp-comments JSON 폴백은 안전하게 제거 가능. 단, `isTableMode()` 체크도 제거하고 항상 테이블 모드로 동작하게 변경
**Warning signs:** 없음 (테이블 이미 존재 확인됨)

### Pitfall 5: 활성 스크립트를 아카이브로 이동
**What goes wrong:** package.json에서 참조하는 `download-images-from-urls.ts`나 생성 도구(`generate-registry.ts` 등)를 아카이브로 이동
**Why it happens:** 스크립트 이름만 보고 일회성으로 판단
**How to avoid:** 아래 분류 목록 참조. package.json scripts, 주기적 실행 스크립트, 생성 도구는 유지

## 파일별 상세 분석

### 삭제 대상 파일 (CLEAN-02)

| 파일 | 줄수 | 이유 |
|------|------|------|
| `src/lib/mysql-db.ts` | 237 | MySQL 직접 접속 함수, 프로덕션 미사용 |
| `src/lib/mysql.ts` | 23 | MySQL connection pool, mysql-db.ts 전용 |
| `src/lib/file-db.ts` | 109 | JSON 파일 DB, Vercel 읽기전용 FS에서 동작 불가 |

### 수정 대상 파일 (CLEAN-02)

| 파일 | 변경 내용 |
|------|-----------|
| `src/lib/db-server.ts` (561줄) | 3단 폴백 -> Supabase 단일 경로. `isSupabaseEnabled()`, `isMySQLEnabled()` 제거. 각 함수에서 supabase-server-db.ts 직접 import 위임 |
| `src/app/api/auth/login/route.ts` (103-126줄) | MySQL/file-db 폴백 분기 제거, Supabase만 유지 |
| `src/app/api/db/newsletter/route.ts` (87-90줄) | MySQL/file-db 폴백 분기 제거 |

### 댓글 통합 대상 (CLEAN-03)

| 파일 | 변경 내용 |
|------|-----------|
| `src/lib/supabase-server-db.ts` (600줄) | sbGetComments, sbCreateComment, sbUpdateCommentStatus, sbDeleteComment 함수 추가 |
| `src/app/api/db/comments/route.ts` (289줄) | 자체 Supabase REST 코드 제거, supabase-server-db.ts 함수 사용으로 전환. sanitizeText, checkCommentRateLimit 등 비즈니스 로직은 유지 |

### 스크립트 분류 (CLEAN-04)

**유지 (활성 도구/빌드 스크립트):**
- `generate-registry.ts` - 레지스트리 생성
- `generate-shadcn-registry.ts` - shadcn 레지스트리 생성
- `generate-page-component.ts` - 페이지 컴포넌트 생성
- `download-images.ts` / `download-images-from-urls.ts` - package.json에서 참조
- `nas-backup.sh` / `nas-cron.sh` - 백업 자동화
- `postbuild-revalidate.ts` - 빌드 후처리
- `auto-news.mjs` / `auto-press.mjs` - 자동화 스크립트 (외부 cron에서 호출 가능)

**아카이브 대상 (일회성 마이그레이션/테스트/수정):**
- `add-draft-field.ts`, `add-empty-tags.ts` - DB 필드 추가 (완료)
- `audit-*.mjs`, `audit-*.json` - 기사 전수검수 (완료)
- `batch-reedit*.mjs` - 기사 일괄 재편집 (완료)
- `blog-migrate*.mjs`, `blog-test-*.mjs` - 블로그 v3 마이그레이션 (완료)
- `capture-*`, `recapture-*`, `manual-section-capture.ts`, `final-section-capture.ts` - 섹션 캡처 (완료)
- `crawl-newswire.mjs` - 뉴스와이어 크롤링 테스트
- `create-ssg-article.mjs` - SSG 기사 생성 (레거시)
- `fill-gap-press.mjs` - 공백기 기사 수집 (완료)
- `fix-*.mjs` - 각종 수정 스크립트 (완료)
- `migrate-*.ts` - 마이그레이션 스크립트 (완료)
- `publish-selected.mjs` - 선택 발행 (완료)
- `query-metadata.ts`, `search-metadata.ts`, `stats-metadata.ts`, `validate-metadata.ts` - 메타데이터 유틸
- `restore-source-urls*.mjs` - URL 복구 (완료)
- `set-draft-by-page.ts` - 드래프트 설정 (완료)
- `test-*.mjs` - 각종 테스트 스크립트
- `update-hero-category.mjs`, `update-testimonial-category.mjs` - 카테고리 업데이트 (완료)
- `upload-blog-mapping.mjs` - 블로그 매핑 업로드 (완료)

**루트 디렉토리 레거시 파일 (삭제 또는 아카이브):**

| 파일 | 처리 |
|------|------|
| `migration.sql` | scripts/_archive/로 이동 |
| `mysql-schema.sql` | 삭제 (MySQL 제거 후 불필요) |
| `supabase-schema.sql` | 유지 (현재 DB 스키마 참조용) |
| `migrate_db.py` | scripts/_archive/로 이동 |
| `migrate_import.py` | scripts/_archive/로 이동 |
| `scripts/create-registry-component.py` | 유지 (레지스트리 생성 도구) |

### ESLint 현황 (QUAL-01)

| 항목 | 현재 상태 |
|------|-----------|
| `no-explicit-any` 설정 | `off` |
| 프로젝트 코드 위반 수 (registry 제외) | **1건** (`src/lib/search/index.ts:13` - `Orama<any>`) |
| Registry 컴포넌트 위반 | ESLint config에서 별도 규칙으로 이미 분리됨 |
| 변경 범위 | eslint.config.mjs에서 `off` -> `warn` 변경 + 1건 수정 |

해당 1건 수정:
```typescript
// 현재: let db: Orama<any> | null = null;
// 수정: Orama 스키마 타입을 정의하거나 OramaSearchIndex 같은 적절한 타입 사용
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | 없음 (테스트 프레임워크 미설치) |
| Config file | 없음 |
| Quick run command | `pnpm build` (타입 체크 + 빌드) |
| Full suite command | `pnpm build && pnpm lint` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLEAN-02 | MySQL/File DB 코드 제거 후 빌드 성공 | build | `pnpm build` | N/A (빌드 자체가 검증) |
| CLEAN-02 | mysql-db/file-db import 0건 | grep | `grep -rn "mysql-db\|file-db" src/` | N/A |
| CLEAN-03 | 댓글 route가 supabase-server-db 함수 사용 | code review | `grep "supabase-server-db" src/app/api/db/comments/route.ts` | N/A |
| CLEAN-04 | scripts/_archive/ 디렉토리 존재 + 파일 이동 | ls | `ls scripts/_archive/` | N/A |
| QUAL-01 | ESLint no-explicit-any warn 활성 | lint | `pnpm lint` | N/A |

### Sampling Rate
- **Per task commit:** `pnpm build` (타입 체크 포함)
- **Per wave merge:** `pnpm build && pnpm lint`
- **Phase gate:** 빌드 성공 + lint 경고만 (에러 0)

### Wave 0 Gaps
None -- 테스트 프레임워크 없이 빌드/린트로 검증 가능. 이 페이즈는 코드 삭제/이동/통합이므로 빌드 성공이 가장 중요한 검증이다.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 3단 DB 폴백 (Supabase->MySQL->File) | Supabase 단일 | v1.0 이후 MySQL/File 미사용 | 561줄 -> ~200줄 예상 |
| 댓글 raw fetch | supabase-js 클라이언트 | comments 테이블 생성 (2026-03-25) | 중복 코드 제거 |

## Open Questions

1. **db-server.ts를 thin wrapper로 유지 vs supabase-server-db.ts 직접 import로 전환**
   - What we know: 59개 파일이 db-server.ts를 import. 시그니처 유지가 안전.
   - What's unclear: 향후 DB 전환 가능성이 있는지
   - Recommendation: db-server.ts를 thin wrapper로 유지하되 내부를 supabase-server-db.ts 직접 위임으로 단순화. 59개 파일의 import를 변경하지 않아 안전.

## Sources

### Primary (HIGH confidence)
- 프로젝트 소스코드 직접 분석: db-server.ts, mysql-db.ts, file-db.ts, comments/route.ts, supabase-server-db.ts, eslint.config.mjs
- `grep` 기반 import 참조 분석: mysql-db (1파일 + db-server.ts 내부 import), file-db (동일), db-server.ts (59파일)
- ESLint 실행 결과: no-explicit-any warn 시 1건 위반

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - 기존 프로젝트 코드 직접 분석
- Architecture: HIGH - 현재 패턴과 변경 방향이 명확
- Pitfalls: HIGH - 파일 의존성 grep으로 확인 완료

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (안정적 코드 정리 작업)
