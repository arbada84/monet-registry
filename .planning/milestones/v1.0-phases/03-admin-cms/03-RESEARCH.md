# Phase 3: Admin CMS - Research (Brownfield Audit)

**Researched:** 2026-03-26
**Domain:** Next.js "use client" admin pages, Supabase REST API, brownfield bug audit
**Confidence:** HIGH

## Summary

32개 어드민 페이지(`src/app/cam/`)를 전수 조사했다. 모든 페이지가 "use client" CSR 컴포넌트로, `src/lib/db.ts` 클라이언트 레이어를 통해 `/api/db/*` 라우트와 통신한다. 인증은 쿠키 기반(`cp-admin-auth`)이며, 미들웨어 + `apiFetch()` 401 핸들러가 세션 만료를 처리한다.

핵심 문제는 **거대 단일 파일**(settings 1167줄, edit 934줄, ai-settings 876줄), **SMTP 비밀번호 덮어쓰기 버그**, **편집 페이지 로딩 상태 미표시**, **휴지통 카운트 미갱신**, **`accounts` 페이지의 `passwordHash` 클라이언트 노출** 등이다. 기능적으로는 대시보드, 기사 CRUD, 삭제(soft delete), 상신/승인, 카테고리, AI 설정, 사이트 설정이 모두 작동하지만 곳곳에 UX 결함과 데이터 손실 위험이 있다.

**Primary recommendation:** SMTP 비밀번호 덮어쓰기 버그를 최우선 수정하고, 편집 페이지 로딩 상태와 에러 핸들링을 보강한다.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADM-01 | 대시보드 | 작동 확인. 전체 기사 로드(limit 5000) 성능 이슈, 유지보수용 버튼 과다 |
| ADM-02 | 기사 목록 | 작동 확인. 필터/페이지네이션/검색/정렬/벌크 액션 모두 작동. 휴지통 카운트 버그 발견 |
| ADM-03 | 기사 작성 | 작동 확인. 초안 복구, 작성자 자동선택, 보도자료 import 작동. 기자 권한 제한 정상 |
| ADM-04 | 기사 수정 | 작동 확인. 로딩 상태 미표시 버그, 저장 타임아웃 UX 양호. 이미지 재이관 기능 포함 |
| ADM-05 | 기사 삭제 | soft delete(deletedAt) 작동. 목록+편집 페이지 양쪽에서 삭제 가능. 휴지통 복원/영구삭제 정상 |
| ADM-06 | 사이트 설정 | 작동 확인. SMTP 비밀번호 마스킹 값 덮어쓰기 버그 발견 (데이터 손실 위험) |
| ADM-07 | AI 설정 | 작동 확인. API 키 마스킹 로직 양호(ref 기반). 스킬 관리 포함 |
| ADM-08 | 사용자 관리 | `/cam/accounts` (not `/cam/users`). 작동 확인. passwordHash 클라이언트 노출 완화됨(API에서 제거) |
| ADM-09 | 카테고리 관리 | 작동 확인. CRUD + 순서 변경 + 상위 카테고리 + 기본값 초기화 |
| ADM-10 | 상신/승인 워크플로우 | 작동 확인. 기자 상신->관리자 승인/반려, audit trail, reviewNote, 권한 분리 정상 |
</phase_requirements>

## Bugs and Issues Found

### CRITICAL (데이터 손실 / 보안)

#### BUG-01: SMTP 비밀번호 마스킹 값 저장 위험
**위치:** `src/app/cam/settings/page.tsx` (SMTP 설정 섹션)
**상세:** Settings GET API가 `smtpPass`를 `"••••••••"`로 마스킹해서 반환한다. 사용자가 비밀번호를 변경하지 않고 SMTP 설정을 저장하면, 마스킹 문자열이 그대로 DB에 저장될 수 있다.
**완화 상태:** PUT API(`/api/db/settings`)에서 `smtpPass === "••••••••"` 체크 로직이 있어 기존 값을 유지하지만, settings 페이지에서 SMTP 테스트 시 `smtp.smtpPass === "••••••••" ? "__KEEP__" : smtp.smtpPass` 분기가 있다 -- 이 `__KEEP__` 값은 테스트 API에만 해당하며, **일반 저장 시에는 settings 페이지 자체가 마스킹 값을 그대로 전송**한다. PUT API 보호 로직이 이를 잡아주지만, settings 페이지의 워터마크/댓글 저장 등 다른 저장 버튼과 혼용되므로 취약점이 남아있다.
**위험도:** 중간 (PUT API에서 방어하고 있지만, settings 페이지 코드가 이 방어에 의존하는 것은 불안정)

#### BUG-02: accounts 페이지 passwordHash 처리
**위치:** `src/app/cam/accounts/page.tsx`
**상세:** GET API에서 `passwordHash`를 제거하지만, accounts 페이지가 `getSetting("cp-admin-accounts")`로 직접 조회한다. API 레벨에서 이미 `{ password, passwordHash, ...safe }` 필터링이 적용되어 있으므로 실제 노출은 없다.
**상태:** 이미 수정됨 (보안 감사에서 처리)

### HIGH (기능 결함)

#### BUG-03: 기사 수정 페이지 로딩 상태 미표시
**위치:** `src/app/cam/articles/[id]/edit/page.tsx`
**상세:** `getArticleById()` 호출 중 로딩 인디케이터가 없다. 기사 데이터 로드 완료 전에 빈 폼이 표시되어, 사용자가 "데이터 없음"으로 오해하거나 빈 내용으로 저장할 위험이 있다. `notFound` 상태만 체크하며 `loading` 상태가 아예 없다.
**재현:** 편집 페이지 진입 -> 0.5~2초간 모든 필드가 빈 상태 -> 데이터 로드 후 채워짐
**영향:** 느린 네트워크에서 사용자가 빈 폼으로 저장할 위험

#### BUG-04: 휴지통 카운트 초기 미표시
**위치:** `src/app/cam/articles/page.tsx` (line 359)
**상세:** 휴지통 버튼이 `trashArticles.length`를 표시하지만, 초기에는 `trashArticles`가 빈 배열이다. `loadTrash()`는 휴지통 모드 진입 시에만 호출되므로, 휴지통에 기사가 있어도 버튼에 `(0)` 또는 빈 문자열이 표시된다.
**영향:** 사용자가 휴지통에 기사가 있는지 모름

#### BUG-05: 대시보드 전체 기사 메모리 로드
**위치:** `src/app/cam/dashboard/page.tsx` (line 38)
**상세:** `getArticles()` 호출 시 limit 파라미터 없이 호출하여 기본값 5000개를 모두 클라이언트로 가져온다. 기사가 약 3000건이므로 매 대시보드 로드마다 전체 기사 데이터(본문 포함)를 전송한다.
**영향:** 느린 로딩, 불필요한 대역폭 사용, 모바일에서 메모리 이슈 가능

#### BUG-06: 기사 목록 전체 로드
**위치:** `src/app/cam/articles/page.tsx` (line 59)
**상세:** BUG-05와 동일. `getArticles()` 전체 로드 후 클라이언트에서 필터/정렬/페이지네이션. 서버사이드 페이지네이션 미사용.
**영향:** BUG-05와 동일

### MEDIUM (UX 결함)

#### BUG-07: 편집 페이지 isDirty 항상 true
**위치:** `src/app/cam/articles/[id]/edit/page.tsx` (line 166-168)
**상세:** `useEffect` 의존성이 `[title, body]`이며, 기사 데이터 로드 시 `setTitle/setBody`가 호출되면서 `isDirtyRef.current = true`가 된다. 즉, 기사를 열기만 해도 변경 없이 페이지를 떠날 때 "미저장 변경사항" 경고가 표시된다.
**영향:** 사용자 혼란 -- 변경 없이 뒤로가기 시 불필요한 경고

#### BUG-08: 새 기사 작성 - 작성자 select 동기화 문제
**위치:** `src/app/cam/articles/new/page.tsx` (line 438-449)
**상세:** 작성자 select의 value가 `authors.find((a) => a.name === author)?.id || ""`인데, 로그인 계정이 자동 설정된 후 authors 목록이 아직 로드되지 않으면 select가 빈 값으로 표시된다. 편집 페이지에서는 `__unlisted__` 폴백이 있지만 새 기사 페이지에는 없다.
**영향:** 작성자가 자동 선택되었는데 select에는 "-- 작성자 선택 --"이 표시될 수 있음

#### BUG-09: 카테고리 삭제 시 해당 카테고리 기사 미처리
**위치:** `src/app/cam/categories/page.tsx` (line 87-89)
**상세:** 카테고리를 삭제할 때 해당 카테고리에 속한 기사들의 카테고리 값을 업데이트하지 않는다. 기사가 존재하지 않는 카테고리를 가리키게 됨.
**영향:** 삭제된 카테고리의 기사가 필터/메뉴에서 접근 불가

#### BUG-10: settings 페이지 SMTP 비밀번호 저장 후 재로드 시 마스킹 문제
**위치:** `src/app/cam/settings/page.tsx`
**상세:** SMTP 비밀번호 필드가 `"••••••••"` 마스킹 값을 표시한다. 사용자가 저장 버튼을 누르면 이 마스킹 값이 전송되지만, PUT API에서 `"••••••••"`를 감지하여 기존 값 유지한다. 그러나 사용자가 비밀번호를 지우고 다시 마스킹 문자를 입력하면 실제 비밀번호가 `"••••••••"` 문자열로 교체될 수 있다.
**영향:** 엣지 케이스지만 비밀번호 손실 가능

#### BUG-11: 대시보드 유지보수 버튼 과다 노출
**위치:** `src/app/cam/dashboard/page.tsx` (lines 202-272)
**상세:** "기사 일련번호 일괄 할당", "썸네일 중복 이미지 제거", "외부 이미지 Supabase 재업로드" 같은 일회성 유지보수 버튼이 대시보드에 상시 노출된다. 일반 운영에서는 사용하지 않는 위험한 작업들.
**영향:** 실수로 클릭 시 대량 데이터 변경. 관리자 혼란

#### BUG-12: 기사 복제 시 createdAt 미설정
**위치:** `src/app/cam/articles/page.tsx` (line 154-165)
**상세:** `handleDuplicate`에서 새 기사 복제 시 `createdAt`을 설정하지 않는다. `id`도 `crypto.randomUUID()`로 클라이언트에서 생성하는데, `createArticle` API에서 서버 할당 `no`를 반환하지만 로컬 상태에는 반영되지 않는다.
**영향:** 복제된 기사의 등록일이 빈 값, 목록에서 번호 표시 안됨 (새로고침 전까지)

#### BUG-13: 저장 버튼 비활성화 조건 불일치
**위치:** `src/app/cam/articles/[id]/edit/page.tsx` (line 786-789)
**상세:** "저장" 버튼이 `status === "게시"` 일 때 비활성화된다. 이는 "게시" 전용 버튼과 "저장" 버튼을 분리하기 위한 것이지만, status가 "게시"인 기사를 편집하고 저장할 수 없다 (게시 버튼으로만 가능).
**영향:** 게시 상태 기사 수정 시 반드시 "게시" 버튼을 눌러야 함 -- 의도된 동작일 수 있으나 혼란 가능

### LOW (코드 품질 / 유지보수)

#### ISSUE-01: 거대 단일 파일
| 파일 | 줄 수 |
|------|-------|
| settings/page.tsx | 1,167 |
| articles/[id]/edit/page.tsx | 934 |
| ai-settings/page.tsx | 876 |
| articles/new/page.tsx | 810 |
| articles/page.tsx | 702 |

모든 로직(상태관리, 폼 처리, API 호출, UI)이 단일 컴포넌트에 집중.

#### ISSUE-02: 인라인 스타일 남용
모든 admin 페이지가 Tailwind 대신 인라인 `style={{}}` 사용. 일관성 없는 색상값, 반복 패턴.

#### ISSUE-03: new/edit 페이지 코드 중복
`articles/new/page.tsx`와 `articles/[id]/edit/page.tsx`가 90% 이상 동일한 폼 코드를 복사. 썸네일 업로드, 작성자 선택, SEO 설정, 본문 에디터 등이 완전 중복.

#### ISSUE-04: localStorage 직접 접근
`localStorage.getItem("cp-admin-user")`를 여러 곳에서 직접 호출. 인증 컨텍스트나 훅 없이 분산.

#### ISSUE-05: 상태 코드 문자열 하드코딩
`"게시"`, `"임시저장"`, `"예약"`, `"상신"` 등 한글 상태 문자열이 곳곳에 하드코딩. `ArticleStatus` 타입은 정의되어 있으나 상수로 관리되지 않음.

## Architecture Patterns (현재 코드)

### 현재 데이터 흐름
```
Client Page ("use client")
  -> src/lib/db.ts (apiFetch wrapper)
    -> /api/db/* (Next.js Route Handler)
      -> src/lib/db-server.ts (facade)
        -> src/lib/supabase-server-db.ts (Supabase REST)
          -> Supabase PostgreSQL
```

### 인증 흐름
```
Layout (useEffect -> checkAuth)
  -> /api/auth/me (쿠키 검증)
  -> authedRef.current = true (이후 재검증 스킵)
  -> apiFetch()에서 401 -> /cam/login 리디렉트
```

### 설정 저장 패턴
```
getSetting<T>("cp-key", default) -> /api/db/settings?key=cp-key
saveSetting("cp-key", value) -> PUT /api/db/settings { key, value }
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 상태 관리 | 개별 useState 15개+ | 커스텀 훅 추출 (useArticleForm) | new/edit 중복 제거 |
| 인증 컨텍스트 | localStorage 직접 접근 | React Context + 훅 | 일관된 사용자/역할 접근 |
| 폼 검증 | 수동 if문 체인 | Zod + 공통 validator | 타입 안전 + 재사용 |

## Common Pitfalls

### Pitfall 1: Supabase REST API 열 누락
**What goes wrong:** `deleted_at` 컬럼이 없는 환경에서 쿼리 실패
**Why it happens:** Supabase REST API는 존재하지 않는 열 조회 시 에러 반환
**How to avoid:** 코드에 이미 폴백 로직 있음 (`hasDeletedAt` 플래그). 새 열 추가 시 동일 패턴 필요
**Warning signs:** 500 에러, 빈 목록 반환

### Pitfall 2: 마스킹 값 저장
**What goes wrong:** API 키나 비밀번호의 마스킹 문자열(`"••••••••"`, `"sk-****key"`)이 실제 값으로 DB에 저장
**Why it happens:** GET에서 마스킹, PUT에서 마스킹 감지 누락
**How to avoid:** AI 설정의 ref 기반 패턴이 모범 사례. 설정 페이지에서도 동일 적용 필요

### Pitfall 3: 전체 기사 클라이언트 로드
**What goes wrong:** 기사 수 증가에 따라 대시보드/목록 페이지 점점 느려짐
**Why it happens:** 서버사이드 페이지네이션/집계 미사용
**How to avoid:** API에서 필요한 필드만 select, 서버 집계, 페이지네이션

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.15 |
| Config file | vitest.config.ts (확인 필요) |
| Quick run command | `pnpm vitest run --reporter verbose` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADM-01 | 대시보드 로드 | manual-only | N/A (CSR 컴포넌트, Playwright 필요) | N/A |
| ADM-02 | 기사 목록 필터/페이지네이션 | manual-only | N/A | N/A |
| ADM-03 | 기사 작성 + 저장 | manual-only | N/A | N/A |
| ADM-04 | 기사 수정 + 저장 | manual-only | N/A | N/A |
| ADM-05 | soft delete + 복원 + 영구삭제 | unit | API route 테스트 가능 | TBD |
| ADM-06 | 설정 저장/로드 | unit | API route 테스트 가능 | TBD |
| ADM-07 | AI 설정 마스킹/저장 | unit | API + 마스킹 로직 테스트 | TBD |
| ADM-08 | 계정 CRUD | manual-only | N/A | N/A |
| ADM-09 | 카테고리 CRUD | manual-only | N/A | N/A |
| ADM-10 | 상신/승인/반려 | unit | API 권한 검증 테스트 가능 | TBD |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --reporter verbose`
- **Per wave merge:** `pnpm vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- 대부분의 어드민 페이지가 "use client" CSR이므로 단위 테스트보다 Playwright E2E가 적합
- API route handler 테스트는 vitest로 가능 (mocking 필요)

## Sources

### Primary (HIGH confidence)
- 소스 코드 직접 감사 -- 모든 admin 페이지 및 API 라우트 전수 조사
- `src/app/cam/` 하위 32개 페이지 디렉토리
- `src/lib/db.ts`, `src/lib/db-server.ts`, `src/lib/supabase-server-db.ts`
- `src/app/api/db/articles/route.ts`, `src/app/api/db/settings/route.ts`

## Metadata

**Confidence breakdown:**
- Bug inventory: HIGH - 소스 코드 직접 감사
- Architecture: HIGH - 전체 데이터 흐름 추적 완료
- Pitfalls: HIGH - 실제 코드에서 발견된 패턴

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (안정적인 기존 코드 감사)
