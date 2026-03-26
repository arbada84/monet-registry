# Phase 4: 자동화 파이프라인 - Research

**Researched:** 2026-03-26
**Domain:** Cron 자동화, RSS 수집, IMAP 동기화, AI 편집, 중복 방지
**Confidence:** HIGH (브라운필드 코드 직접 감사)

## Summary

auto-news, auto-press, mail/sync 세 시스템의 코드를 전수 감사하였다. 전반적으로 잘 구현되어 있으나, **심각한 버그 1건**(AI 5분 대기가 Vercel 60초 타임아웃 내에서 실행되어 반드시 타임아웃 발생), **보안 이슈 1건**(GET secret 파라미터 비교가 `===` 사용 -- timing-safe하지 않음), 그리고 **중복 코드/로직 문제 다수**를 발견하였다.

**Primary recommendation:** AI 재시도의 5분 대기 로직을 제거하고, GET secret 파라미터 비교를 timingSafeEqual로 교체하며, auto-press의 self-fetch 체인콜(mail/sync)을 직접 함수 호출로 변경해야 한다.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUT-01 | auto-news cron이 RSS에서 뉴스를 수집하고 AI 편집 후 등록한다 | BUG-01, BUG-02, BUG-04, BUG-06 발견 -- 수정 필요 |
| AUT-02 | auto-press cron이 보도자료를 수집하고 AI 편집 후 등록한다 | BUG-01, BUG-03, BUG-05, BUG-07 발견 -- 수정 필요 |
| AUT-03 | IMAP 메일 동기화가 보도자료를 파싱하여 등록한다 | BUG-08, BUG-09 발견 -- 수정 필요 |
| AUT-04 | 중복 기사 방지 로직이 정상 작동한다 | BUG-10, BUG-11 발견 -- 모듈 수준 캐시 문제 |
</phase_requirements>

## Bug Inventory

### BUG-01 [CRITICAL]: AI 재시도 5분 대기 -- Vercel 60초 타임아웃 내에서 불가능

**파일:** `src/lib/ai-prompt.ts` (line 195)
**증상:** `aiEditArticle()`에서 1차 3회 실패 후 **5분(300초) 대기** 후 2차 2회 시도. 그러나 Vercel Hobby `maxDuration = 60`이므로 함수 전체가 60초 안에 종료되어야 한다.
**영향:** 1차 3회가 모두 실패하면 (약 6~15초 소모), 5분 sleep에 진입하여 Vercel이 함수를 강제 종료. 이 경우:
  - 이미 DB에 저장된 기사의 이력(history)이 최종 저장되지 않을 수 있음
  - 응답이 502/504로 반환됨
  - auto-news와 auto-press 모두 이 함수를 호출하므로 양쪽 모두 영향

**수정 방안:**
```typescript
// 5분 대기 제거, 1차 3회만 시도 (총 최대 ~15초)
// 또는 Vercel 타임아웃 인식 재시도: 남은 시간이 15초 미만이면 재시도 중단
```

**심각도:** CRITICAL -- 첫 번째 기사에서 AI가 3회 실패하면 전체 cron이 타임아웃으로 사망

---

### BUG-02 [MEDIUM]: auto-news GET secret 파라미터 -- timing-safe하지 않은 비교

**파일:** `src/app/api/cron/auto-news/route.ts` (line 670)
**코드:**
```typescript
if (cronSecret && url.searchParams.get("secret") === cronSecret) {
```
**문제:** Bearer 인증은 `timingSafeEqual()`을 사용하지만, GET `?secret=` 파라미터 비교는 `===` 연산자 사용. 타이밍 공격에 취약.
**영향:** auto-press (line 834), publish (line 108) 크론에서도 동일 패턴 발견.

**수정 방안:** `===`를 `timingSafeEqual()`로 교체.

---

### BUG-03 [MEDIUM]: auto-press가 mail/sync를 self-fetch로 호출

**파일:** `src/app/api/cron/auto-press/route.ts` (line 793)
**코드:**
```typescript
const syncResp = await fetch(`${baseUrl}/api/mail/sync`, {
  method: "POST",
  headers,
  body: JSON.stringify({ days: syncDays }),
  signal: AbortSignal.timeout(55000),
});
```
**문제:** auto-press 자체가 maxDuration=60에서 이미 50초 안전 마진까지 기사 처리를 실행한 뒤, 남은 시간에 mail/sync를 self-fetch한다. 그런데:
  1. 55초 타임아웃을 설정하지만 auto-press 자체가 이미 50초 이상 소모했을 수 있음
  2. Self-fetch는 같은 서버리스 인스턴스가 자기 자신에게 HTTP 요청 -- Vercel에서 동시 커넥션 풀 이슈 가능
  3. 코드 주석에 "self-fetch 제거 (2026-03-25)"라고 auto-news에는 적혀 있으나, auto-press에서는 mail/sync 체인콜이 여전히 남아 있음

**수정 방안:** mail/sync의 핵심 로직을 별도 함수로 추출하여 직접 호출하거나, mail sync를 별도 cron으로 분리.

---

### BUG-04 [LOW]: auto-news 모듈 수준 `_dbArticlesCache` 변수 -- TTL 없음

**파일:** `src/app/api/cron/auto-news/route.ts` (line 271)
**코드:**
```typescript
let _dbArticlesCache: { urls: Set<string>; titles: Set<string> } | null = null;
```
**문제:** auto-press는 `DB_CACHE_TTL = 30 * 60 * 1000` (30분 TTL)을 갖고 있지만, auto-news는 TTL 없이 최초 로드 후 영원히 캐시 유지. Vercel serverless에서는 cold start마다 리셋되므로 실질적 영향은 낮으나, warm 인스턴스가 재사용될 경우 오래된 캐시가 사용될 수 있음.

**수정 방안:** auto-press와 동일하게 TTL 추가.

---

### BUG-05 [LOW]: auto-press `reviewNote` 메시지 불일치

**파일:** `src/app/api/cron/auto-press/route.ts` (line 672)
**코드:**
```typescript
reviewNote: aiFailed ? "AI 편집 실패 -- 수동 검토 필요 (3회 재시도 소진)" : undefined,
```
**문제:** 실제로는 `aiEditArticle()`이 5회까지 재시도하는데, 메시지에는 "3회"라고 적혀 있음. auto-news는 "5회"라고 올바르게 표기.

**수정 방안:** "(5회 재시도 소진)"으로 수정.

---

### BUG-06 [MEDIUM]: auto-news에서 이미지 없는 기사 등록 후 OG API 대체 -- 무한 참조 가능성

**파일:** `src/app/api/cron/auto-news/route.ts` (line 553-555)
**코드:**
```typescript
if (!thumbnail) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.split(/[\s\r\n]+/)[0]?.replace(/\/$/, "") || "https://culturepeople.co.kr";
  await serverUpdateArticle(articleId, { thumbnail: `${siteUrl}/api/og?id=${articleId}` });
}
```
**문제:**
  1. `NEXT_PUBLIC_SITE_URL` 환경변수에 줄바꿈이나 공백이 포함될 수 있어 `.split()`으로 처리하고 있지만, 이것은 환경변수 설정 자체가 잘못된 것을 코드에서 방어하는 안티패턴
  2. OG API(`/api/og?id=`)가 thumbnail을 참조하여 렌더링하는데, thumbnail이 다시 OG API URL을 가리키면 재귀 참조 위험
  3. auto-press에서는 이 패턴이 없음 -- 이미지 없으면 no_image 스킵

**수정 방안:** auto-news도 이미지 없으면 스킵하는 것이 일관적. 또는 OG 이미지 생성 시 재귀 참조 방어 확인 필요.

---

### BUG-07 [LOW]: auto-press keywords GET 파라미터 -- 길이 제한 없음

**파일:** `src/app/api/cron/auto-press/route.ts` (line 753)
**코드:**
```typescript
if (sp.get("keywords")) body.keywords = sp.get("keywords")!.split(",").map((k) => k.trim());
```
**문제:** auto-news는 `.map((k) => k.trim().slice(0, 50)).filter(Boolean).slice(0, 20)`으로 키워드 길이와 개수를 제한하지만, auto-press는 무제한. 악의적으로 매우 긴 키워드를 전송할 수 있음. 실질적 영향은 인증 필수이므로 낮음.

**수정 방안:** auto-news와 동일한 제한 추가.

---

### BUG-08 [MEDIUM]: mail/sync -- IMAP 비밀번호 복호화 실패 시 전체 크래시

**파일:** `src/app/api/mail/sync/route.ts` (line 45)
**코드:**
```typescript
.map((a) => ({ ...a, password: decrypt(a.password) }));
```
**문제:** `decrypt()` 함수가 잘못된 암호문에서 throw하면 `getAccounts()` 전체가 실패하여 모든 계정 동기화가 중단됨. 개별 계정의 복호화 실패가 다른 계정에 영향.

**수정 방안:**
```typescript
.map((a) => {
  try {
    return { ...a, password: decrypt(a.password) };
  } catch {
    console.error(`[mail/sync] 계정 ${a.email} 비밀번호 복호화 실패`);
    return null;
  }
}).filter(Boolean)
```

---

### BUG-09 [LOW]: mail/sync -- 설정(settings) 테이블에 2000개 메일 저장

**파일:** `src/app/api/mail/sync/route.ts` (line 76, 231)
**문제:** 메일 데이터가 settings 테이블의 JSON 컬럼에 최대 2000건 저장됨. settings는 key-value 저장소로 설계되었는데, 메일 목록은 구조적 데이터에 가까움. 2000건의 JSON이 매번 전체 로드/저장되므로:
  1. 성능: 매 동기화마다 전체 JSON 파싱/직렬화
  2. 동시성: 두 요청이 동시에 실행되면 하나의 결과가 덮어쓰기됨 (settings는 upsert)
  3. 원자성: 부분 실패 시 이전 데이터가 손실될 수 있음

**수정 방안:** 장기적으로 별도 테이블 마이그레이션 검토. 단기적으로는 현재 구조 유지하되 동시성 방어 추가.

---

### BUG-10 [MEDIUM]: 중복 체크 -- history 기반 + DB 기반 이중 구조의 비일관성

**파일:** auto-news (line 287-299), auto-press (line 310-322)
**문제:**
  1. `isDuplicate()`가 history(settings JSON)와 DB 양쪽을 체크하지만, history에는 `status === "fail"`인 것도 중복으로 판정 (auto-news line 292). 즉, 한 번 원문 수집에 실패한 기사는 `dedupeWindowHours` 동안 재시도 불가.
  2. 이 설계가 의도적일 수 있으나(반복 실패 방지), 일시적 네트워크 오류로 실패한 기사가 다음 크론에서 재시도되지 않는 문제 발생.

**수정 방안:** `status === "fail"`을 중복 판정에서 제외하거나, fail 횟수 제한(예: 3회 연속 fail이면 제외) 도입.

---

### BUG-11 [LOW]: 중복 체크 -- normalizeTitle이 영문 제거함

**파일:** auto-news (line 266-268), auto-press (line 288-289)
**코드:**
```typescript
function normalizeTitle(t: string): string {
  return t.replace(/\s+/g, "").replace(/[^\w가-힣]/g, "").toLowerCase().normalize("NFC");
}
```
**문제:** `\w`는 `[a-zA-Z0-9_]`이므로 영문은 유지되지만, 일본어/중국어 등 기사 제목은 모두 빈 문자열이 되어 중복 체크가 작동하지 않음. 현재 사이트가 한국어 위주이므로 실질적 영향은 낮으나, 외신 번역 기사에서 원어 제목이 사용될 경우 문제.

---

## Authentication Audit

### CRON_SECRET 인증 패턴

| 엔드포인트 | Bearer 인증 | Cookie 인증 | GET ?secret= | timing-safe |
|-----------|------------|------------|-------------|-------------|
| auto-news POST | O (timingSafeEqual) | O | - | O |
| auto-news GET | O (timingSafeEqual) | - | O (`===`) | **X** |
| auto-press POST | O (timingSafeEqual) | O | - | O |
| auto-press GET | O (timingSafeEqual) | - | O (`===`) | **X** |
| mail/sync POST | O (timingSafeEqual) | O | - | O |
| mail/register POST | O (timingSafeEqual) | O | - | O |

**결론:** POST 인증은 안전. GET `?secret=` 파라미터 비교만 `===`으로 되어 있어 타이밍 공격에 취약. 다만 실질적 위험도는 낮음 (HTTPS 네트워크 지연이 타이밍 차이를 가림).

## Deduplication Architecture

### 3단계 중복 방지 구조

1. **History 기반** (`cp-auto-news-history` / `cp-auto-press-history`)
   - settings JSON에 최근 50건 실행 이력 저장
   - `dedupeWindowHours` (기본 48시간) 내 동일 sourceUrl이면 중복
   - `status === "fail"`도 중복으로 간주 (BUG-10)

2. **DB 기반** (`_dbArticlesCache`)
   - `serverGetArticles()` 전체 로드하여 sourceUrl Set + normalizeTitle Set 구성
   - auto-news: TTL 없음 (BUG-04)
   - auto-press: 30분 TTL

3. **배치 내 중복 방지** (`addToDbCache()`)
   - 같은 실행에서 등록된 기사를 즉시 캐시에 반영
   - 정상 작동 확인

### 크로스 시스템 중복 (auto-news vs auto-press)

auto-news와 auto-press가 서로 다른 history를 사용하지만, **DB 캐시는 전체 기사를 로드**하므로 크로스 시스템 중복은 DB 레벨에서 방지됨. 다만 동일 기사가 RSS와 보도자료 양쪽에 동시에 나타나는 경우, 첫 번째 시스템이 DB에 저장한 후 두 번째 시스템의 캐시가 이미 로드된 상태라면 중복 등록 가능 (확률 낮음 -- cron 실행 시각이 다름).

## Error Handling Audit

| 영역 | 개별 에러 격리 | 전체 크래시 방지 | 이력 저장 |
|-----|--------------|-----------------|---------|
| RSS 수집 | O (try/catch per source) | O | - |
| 원문 수집 | O (try/catch per article) | O | - |
| AI 편집 | O (5회 재시도) | **X** (BUG-01: 5분 대기) | - |
| 기사 저장 | O (try/catch) | O | O (건별 즉시) |
| 이미지 업로드 | O (실패 시 원본 URL) | O | - |
| IMAP 연결 | O (per account) | **X** (BUG-08: decrypt 크래시) | - |

## Architecture Patterns

### 현재 구조
```
vercel.json crons (GET)
  |
  +-- /api/cron/auto-news (21:00 UTC daily)
  |     +-- fetchRssItems() (RSS 파싱)
  |     +-- fetchOrigin() (원문 스크래핑)
  |     +-- aiEditArticle() (AI 편집 -- BUG-01)
  |     +-- serverCreateArticle() (DB 저장)
  |
  +-- /api/cron/auto-press (09:00 UTC daily)
        +-- fetchNetproList() / fetchRssFeed() (목록 수집)
        +-- fetchNetproDetail() / fetchOriginContent() (상세 수집)
        +-- aiEditArticle() (AI 편집 -- BUG-01)
        +-- serverCreateArticle() (DB 저장)
        +-- mail/sync self-fetch chain (BUG-03)
```

### 코드 중복 현황

| 중복 패턴 | auto-news | auto-press | mail/register |
|----------|-----------|------------|---------------|
| authenticate() | 복사 | 복사 | 복사 |
| normalizeTitle() | 복사 | 복사 | - |
| isDuplicate() | 복사 | 복사 | - |
| addToDbCache() | 복사 | 복사 | - |
| _dbArticlesCache | 복사 | 복사 | - |
| 이미지 삽입 로직 | 복사 | 복사 | 복사 |
| GET secret 인증 | 복사 | 복사 | - |

3개 파일에 걸쳐 약 **200줄 이상의 중복 코드**가 존재. 리팩토링하면 유지보수성이 크게 개선되지만, 기능 변경 없이 버그만 수정하는 것이 이 phase의 목표.

## Common Pitfalls

### Pitfall 1: Vercel Hobby 60초 제한
**What goes wrong:** 기사 수가 많거나 AI가 반복 실패하면 60초 초과
**Why it happens:** Vercel Hobby는 maxDuration=60 초과 시 강제 종료
**How to avoid:** 50초 안전 마진은 이미 구현됨. 다만 AI 5분 대기(BUG-01)가 이 보호를 우회함
**Warning signs:** 502/504 응답, 이력 저장 불완전

### Pitfall 2: Settings JSON 동시성
**What goes wrong:** 두 요청이 동시에 settings를 read-modify-write하면 데이터 손실
**Why it happens:** settings 테이블이 key-value upsert이므로 last-write-wins
**How to avoid:** cron 실행 시각이 다르므로 실제 충돌 가능성은 낮음. 수동 실행 시 주의.

### Pitfall 3: serverGetArticles() 전체 로드
**What goes wrong:** 기사가 수천 건이 되면 캐시 구성에 시간 소모
**Why it happens:** 중복 체크를 위해 전체 기사 목록을 로드
**How to avoid:** 장기적으로 DB 쿼리 기반 중복 체크로 전환 검토

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RSS 파싱 | 정규식 파서 (현재) | 현재 구현 유지 | 이미 동작하며 외부 의존성 없음 |
| AI 편집 | 커스텀 재시도 | 5분 대기만 제거 | 기본 3회 재시도는 적절 |
| IMAP | 직접 구현 | imapflow (현재) | 이미 사용 중 |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | 없음 (현재 테스트 프레임워크 미설정) |
| Config file | none -- Wave 0 |
| Quick run command | 수동 cron 실행 (POST) |
| Full suite command | 수동 테스트 |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUT-01 | RSS 수집 + AI 편집 + 등록 | integration | 수동 POST 실행 | N/A |
| AUT-02 | 보도자료 수집 + AI 편집 + 등록 | integration | 수동 POST 실행 | N/A |
| AUT-03 | IMAP 동기화 | integration | 수동 POST 실행 | N/A |
| AUT-04 | 중복 방지 | unit | 수동 확인 | N/A |

### Sampling Rate
- **Per task commit:** 수동 POST 실행 후 응답 확인
- **Per wave merge:** 전체 cron 수동 실행
- **Phase gate:** Vercel deploy 후 cron 대기 또는 수동 트리거

### Wave 0 Gaps
- 현재 자동화된 테스트 없음 -- 코드 변경 후 수동 검증 필요
- 버그 수정은 코드 리뷰 + 배포 후 수동 실행으로 검증

## Fix Priority

| Priority | Bug ID | Severity | Effort | Description |
|----------|--------|----------|--------|-------------|
| 1 | BUG-01 | CRITICAL | 작음 | AI 5분 대기 제거 (ai-prompt.ts 2줄 수정) |
| 2 | BUG-02 | MEDIUM | 작음 | GET secret === 를 timingSafeEqual로 교체 (3곳) |
| 3 | BUG-03 | MEDIUM | 중간 | auto-press mail/sync self-fetch를 직접 호출로 변경 |
| 4 | BUG-08 | MEDIUM | 작음 | mail/sync decrypt 에러 격리 |
| 5 | BUG-10 | MEDIUM | 작음 | fail 상태 기사 재시도 허용 |
| 6 | BUG-04 | LOW | 작음 | auto-news DB 캐시에 TTL 추가 |
| 7 | BUG-05 | LOW | 작음 | reviewNote "3회" -> "5회" 수정 |
| 8 | BUG-06 | MEDIUM | 중간 | OG 이미지 재귀 참조 방어 검토 |
| 9 | BUG-07 | LOW | 작음 | auto-press keywords 길이 제한 |
| 10 | BUG-09 | LOW | 큼 | mail 저장 구조 개선 (향후) |
| 11 | BUG-11 | LOW | 작음 | normalizeTitle 다국어 지원 (향후) |

## Sources

### Primary (HIGH confidence)
- 직접 코드 감사: `src/app/api/cron/auto-news/route.ts` (681줄)
- 직접 코드 감사: `src/app/api/cron/auto-press/route.ts` (845줄)
- 직접 코드 감사: `src/app/api/mail/sync/route.ts` (248줄)
- 직접 코드 감사: `src/app/api/mail/register/route.ts` (207줄)
- 직접 코드 감사: `src/lib/ai-prompt.ts` (211줄)
- 직접 코드 감사: `src/lib/fetch-retry.ts` (29줄)
- 직접 코드 감사: `vercel.json` (cron 설정)

## Metadata

**Confidence breakdown:**
- Bug inventory: HIGH -- 코드 직접 읽고 발견한 문제
- Authentication audit: HIGH -- 모든 인증 패턴 확인
- Deduplication: HIGH -- 전체 흐름 추적 완료
- Error handling: HIGH -- try/catch 패턴 전수 확인

**Research date:** 2026-03-26
**Valid until:** 코드 변경 전까지 유효
