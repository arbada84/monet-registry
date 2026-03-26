# Phase 7: 기사 전수 검수 - Research

**Researched:** 2026-03-26
**Domain:** 데이터 감사 (Supabase PostgreSQL articles 테이블, ~4,000건)
**Confidence:** HIGH

## Summary

이 페이즈는 코드 변경이 아닌 **DB 데이터 감사 및 수정** 프로젝트이다. Supabase PostgreSQL의 articles 테이블에 저장된 약 4,000건의 기사를 SKILL.md 13장 기사 편집 기준에 따라 전수 점검하고, 저작권 위험 이미지 제거/대체, 중복 기사 삭제, 편집 규칙 위반 사항을 일괄 수정한다.

기존에 `scripts/audit-articles.mjs` (감사 스크립트)와 `scripts/audit-fix.mjs` ~ `audit-fix4.mjs` (수정 스크립트)가 이미 존재하며, 2026-03-15 마지막 실행 결과 0건 문제가 검출되었다(`audit-result.json`). 그러나 이후 약 1,000건 이상의 기사가 추가되었으므로 재검수가 필요하다. 또한 기존 스크립트는 저작권 위험 이미지 도메인 검사, 뉴스와이어 잔재 패턴, 명함/연락처 정보 탐지 등 SKILL.md 13장의 일부 기준을 커버하지 못한다.

**핵심 권고:** 기존 `audit-articles.mjs`를 베이스로 확장하여 SKILL.md 13장의 모든 검사 항목을 커버하는 강화 감사 스크립트를 작성하고, 발견된 문제를 유형별로 자동 수정한 후, 연속 2회 0건 확인(AUD-05)으로 완료를 검증한다.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUD-01 | 저작권 위험 이미지 탐지 및 제거/대체 | 저작권 위험 도메인 목록 + SQL 쿼리 + 대체 전략 제공 |
| AUD-02 | 중복 기사 탐지 및 삭제 | normalizeTitle + source_url 이중 검사 로직, SQL 쿼리 제공 |
| AUD-03 | 바이라인/저작권 문구/뉴스와이어 잔재 탐지 및 제거 | 정규식 패턴 목록 + 기존 스크립트 패턴 통합 |
| AUD-04 | 빈 태그/HTML 엔티티/명함 정보 탐지 및 정리 | 정규식 패턴 + 명함 탐지 패턴 신규 제공 |
| AUD-05 | 검증 2회 연속 0건 확인 | 감사 스크립트 반복 실행 + JSON 결과 비교 프로토콜 |
</phase_requirements>

## Project Constraints (from CLAUDE.md / MEMORY.md)

- 모든 출력 한글 작성
- 코드 변경 시 `vercel deploy --prod` 자동 실행 (단, 이 페이즈는 DB 데이터 수정이므로 배포 불필요)
- Supabase DB 우선, `SUPABASE_SERVICE_KEY` 환경변수 필수
- 기사 번호: `no` 필드 (UNIQUE), 기사 작성자: "박영래 기자" 통일
- 이미지: `unoptimized:true`, 외부 이미지는 Supabase Storage 이관 필수
- "전대통령" 키워드 포함 기사 등록 금지

## Standard Stack

이 페이즈는 코드 라이브러리가 아닌 **스크립트 + SQL 쿼리** 기반이다.

### Core
| 도구 | 용도 | 비고 |
|------|------|------|
| Node.js + `scripts/audit-articles.mjs` | 감사 실행기 | 기존 스크립트 확장 |
| Supabase REST API | 기사 읽기/수정/삭제 | `SUPABASE_SERVICE_KEY` 사용 |
| Supabase Storage API | 이미지 재업로드 | `audit-fix4.mjs`의 `uploadToSupabase()` 재활용 |

### Supporting
| 도구 | 용도 | 비고 |
|------|------|------|
| `scripts/audit-fix.mjs` | 1차 자동 수정 (엔티티/빈태그/저작권/외부링크) | 기존 로직 재활용 |
| `scripts/audit-fix4.mjs` | 외부 이미지 Supabase 이관 | `uploadToSupabase()` + `migrateBodyImages()` |
| `scripts/batch-reedit.mjs` | AI 재편집 (Gemini) | 심각한 품질 문제 기사만 선별 사용 |

## Architecture Patterns

### 감사 작업 흐름

```
1. audit-articles.mjs (강화버전) 실행
   → 전체 기사 로드 (PAGE_SIZE=500, 페이징)
   → 14+ 유형 검사
   → audit-result.json 저장

2. 유형별 자동 수정 스크립트 실행
   → 삭제 대상: 인코딩 깨짐, 본문 0자, 중복
   → 수정 대상: 엔티티/빈태그/저작권/바이라인/명함/뉴스와이어
   → 이미지 이관: 저작권 위험 도메인 → Supabase Storage 또는 제거

3. 검증 감사 재실행 (2회 연속 0건 목표)
```

### 기존 스크립트 구조

```
scripts/
├── audit-articles.mjs      # 감사 메인 (14 유형 검사)
├── audit-result.json        # 감사 결과 JSON
├── audit-fix.mjs            # 1차 자동 수정
├── audit-fix2.mjs           # 2차 정밀 수정 (외부링크/엔티티)
├── audit-fix3.mjs           # 3차 트래킹 링크 + 외부 도메인
├── audit-fix4.mjs           # 4차 외부 이미지 Supabase 이관
├── batch-reedit.mjs         # AI 대량 재편집
└── batch-reedit-all.mjs     # 전체 연속 재편집 래퍼
```

### Anti-Patterns to Avoid
- **전체 기사 한번에 로드**: 500건씩 페이징 필수 (기존 패턴 유지)
- **직접 DELETE**: 소프트 삭제(`status: "삭제"`) 사용 (기존 패턴 유지)
- **이미지 URL 수정**: `src` URL은 절대 수정 금지, 이관 시 새 URL로 교체만 허용
- **AI 재편집 남발**: Gemini 무료 15RPM 제한, 꼭 필요한 기사만 선별

## Don't Hand-Roll

| 문제 | 직접 만들지 말 것 | 대신 사용 | 이유 |
|------|-------------------|-----------|------|
| HTML 엔티티 디코딩 | 자체 맵 확장 | 기존 `ENTITY_MAP` + `EXTRA_ENTITIES` | audit-fix.mjs/fix2.mjs에 이미 검증됨 |
| 이미지 Supabase 이관 | 새 업로드 로직 | `audit-fix4.mjs`의 `uploadToSupabase()` | 타입/크기/경로 검증 포함 |
| 중복 판별 | 새 정규화 함수 | `normalizeTitle()` (auto-press/auto-news) | 유니코드 NFC + 특수문자 제거 검증됨 |
| 제목 정규화 | 직접 구현 | `t.replace(/\s+/g,"").replace(/[^\p{L}\p{N}]/gu,"").toLowerCase().normalize("NFC")` | 프로덕션 검증됨 |

## Common Pitfalls

### Pitfall 1: 이전 감사 결과 0건이라고 안심
**What goes wrong:** 2026-03-15 결과가 0건이지만, 이후 ~1,000건 기사가 추가됨
**Why it happens:** auto-news, auto-press, 수동 등록으로 신규 기사 유입
**How to avoid:** 전체 재감사 필수, 이전 결과 무시
**Warning signs:** audit-result.json 타임스탬프가 오래됨

### Pitfall 2: 정규식 false positive
**What goes wrong:** 본문 맥락에서 정상적인 언론사 언급을 바이라인으로 오탐
**Why it happens:** "연합뉴스에 따르면"은 정상 인용, "연합뉴스 기자 = ..." 은 바이라인
**How to avoid:** 기존 `audit-articles.mjs`처럼 바이라인 형태(`기자 = 매체명`)만 매칭
**Warning signs:** OTHER_MEDIA 유형 건수가 비정상적으로 높음

### Pitfall 3: 저작권 이미지 도메인 판별 누락
**What goes wrong:** 이미지 URL이 CDN을 거쳐서 원본 도메인을 숨김
**Why it happens:** `img.hankyung.com` 대신 `flexible.img.hani.co.kr` 등 CDN 도메인 사용
**How to avoid:** SKILL.md 13.4 목록 외에 CDN 변형까지 포함하는 도메인 리스트 구성
**Warning signs:** 저작권 이미지 건수가 예상보다 적음

### Pitfall 4: Supabase REST API 속도 제한
**What goes wrong:** 수천 건 PATCH 요청 시 429 에러
**Why it happens:** Supabase 무료 플랜 API 호출 제한
**How to avoid:** 건당 딜레이 추가 (100~200ms), 배치 처리
**Warning signs:** HTTP 429 응답

### Pitfall 5: 명함/연락처 정보 오탐
**What goes wrong:** 기사 본문의 정상적인 전화번호 인용을 명함으로 오탐
**Why it happens:** "문의: 02-1234-5678" vs "홍길동 대리 02-1234-5678"
**How to avoid:** 연락처 블록 패턴(이름+직함+전화+이메일 조합)으로 판별
**Warning signs:** 명함 유형 건수 과다

## 감사 체크리스트 (SKILL.md 13장 기반)

### A. 기존 스크립트가 커버하는 항목 (audit-articles.mjs)

| # | 유형 | 정규식/로직 | 조치 |
|---|------|------------|------|
| 1 | 인코딩 깨짐 | `/[\ufffd\ufffc]/` | 삭제 |
| 2 | 본문 부족 | `plainBody.length < 50` | 삭제 |
| 3 | 타 언론사 바이라인 | `기자\s*[=@]\s*\S+(?:뉴스\|일보\|...)` | 수정(제거) |
| 4 | 저작권/무단전재 문구 | `무단\s*전재`, `재배포\s*금지`, `ⓒ\s*\d{4}` 등 | 수정(제거) |
| 5 | HTML 엔티티 잔재 | `&nbsp;`, `&middot;`, `&#\d+;` 등 | 수정(디코딩) |
| 6 | 빈 HTML 태그 | `<p>\s*</p>`, `<strong>\s*</strong>`, `(<br>){3+}` | 수정(제거) |
| 7 | 타 매체 기자명 | `\S{2,4}\s+기자\s*[=@]\s*\S+(?:뉴스\|일보)` | 수정(제거) |
| 8 | 광고/프로모션 잔재 | `관련\s*기사\s*[:·]`, `구독\s*(?:신청\|안내)` | 수정(제거) |
| 9 | 작성자 불일치 | `author !== "박영래 기자"` | 수정 |
| 10 | 제목 내 매체명 | `\[...(뉴스\|일보)...\]` | 수정(제거) |
| 11 | HTML class 잔재 | `class="[^"]*"` (figure 외부) | 수정(제거) |
| 12 | 요약 HTML 엔티티 | summary 내 `&[a-zA-Z]+;` | 수정(디코딩) |
| 13 | 외부 링크 | `<a href="외부URL">` | 수정(텍스트 보존, href 제거) |
| 14 | 제목/본문 누락 | `!body \|\| !title` | 삭제 |

### B. 신규 추가 필요 항목 (SKILL.md 13장 미커버 항목)

| # | 유형 | 탐지 패턴 | 조치 |
|---|------|----------|------|
| 15 | **저작권 위험 이미지** (AUD-01) | 이미지 URL에 위험 도메인 포함 | 이미지 태그 제거 또는 대체 |
| 16 | **중복 기사** (AUD-02) | `normalizeTitle()` + `source_url` 이중 검사 | 중복 중 최신 1건만 보존 |
| 17 | **뉴스와이어 잔재** | `뉴스와이어`, `뉴스 제공`, `배포 서비스` 등 | 수정(제거) |
| 18 | **명함/연락처 블록** | 이름+직함+전화+이메일 조합 패턴 | 수정(제거) |
| 19 | **base64 이미지** | `src="data:image/` | 이미지 태그 제거 |
| 20 | **1x1 추적 픽셀** | `width="1"` 또는 매우 작은 이미지 | 이미지 태그 제거 |
| 21 | **금지 표현** | `~알아보겠습니다`, `~살펴보겠습니다` 등 | AI 재편집 고려 |
| 22 | **개인정보** | 주민등록번호, 계좌번호 패턴 | 수정(제거) |
| 23 | **"전대통령" 키워드** | `전대통령` 포함 기사 | 삭제 |

## 저작권 위험 이미지 도메인 목록 (AUD-01)

SKILL.md 13.4에 명시된 저작권 위험 언론사 기반으로 도메인 매칭 패턴을 구성한다.

### 통신사/에이전시
```
yonhapnews, yna.co.kr        # 연합뉴스
apimages, ap.org              # AP
afp.com, afpforum             # AFP
reuters.com                   # Reuters
gettyimages                   # Getty Images
epa.eu                        # EPA
shutterstock                  # Shutterstock
```

### 종합일간지
```
chosun.com, chosunilbo        # 조선일보
joongang.co.kr, joins.com     # 중앙일보
donga.com                     # 동아일보
hani.co.kr                    # 한겨레
khan.co.kr                    # 경향신문
hankookilbo.com               # 한국일보
kmib.co.kr                    # 국민일보
segye.com                     # 세계일보
seoul.co.kr                   # 서울신문
munhwa.com                    # 문화일보
```

### 경제지
```
mk.co.kr, mkeconoy            # 매일경제
hankyung.com                   # 한국경제
sedaily.com                    # 서울경제
asiae.co.kr                   # 아시아경제
mt.co.kr                      # 머니투데이
fnnews.com                    # 파이낸셜뉴스
heraldcorp.com, heraldbiz     # 헤럴드경제
edaily.co.kr                  # 이데일리
```

### 방송사
```
kbs.co.kr                     # KBS
imbc.com                      # MBC
sbs.co.kr                     # SBS
jtbc.co.kr, jtbc.joins.com    # JTBC
tvchosun.com                  # TV조선
ichannela.com                 # 채널A
mbn.co.kr                     # MBN
ytn.co.kr                     # YTN
yonhapnewstv                  # 연합뉴스TV
```

### 스포츠/연예
```
sportschosun.com              # 스포츠조선
sportsdonga.com               # 스포츠동아
isplus.com                    # 일간스포츠
osen.mt.co.kr, osen.co.kr     # OSEN
starnewskorea.com             # 스타뉴스
news1.kr                      # 뉴스1
newsis.com                    # 뉴시스
xportsnews.com                # 엑스포츠뉴스
```

### 해외
```
nytimes.com                   # NYT
washingtonpost.com            # WP
bbc.co.uk, bbc.com            # BBC
cnn.com                       # CNN
bloomberg.com                 # Bloomberg
nhk.or.jp                     # NHK
```

### SQL 쿼리: 저작권 위험 이미지 포함 기사 찾기

```sql
SELECT id, no, title,
  (regexp_matches(body, 'src="(https?://[^"]+)"', 'g'))[1] AS img_url
FROM articles
WHERE status = '게시'
  AND body ~ 'src="https?://[^"]*(?:yonhapnews|yna\.co\.kr|apimages|ap\.org|afp\.com|reuters\.com|gettyimages|shutterstock|chosun\.com|joongang|joins\.com|donga\.com|hani\.co\.kr|khan\.co\.kr|hankookilbo|kmib\.co\.kr|segye\.com|seoul\.co\.kr|munhwa\.com|mk\.co\.kr|hankyung\.com|sedaily\.com|asiae\.co\.kr|mt\.co\.kr|fnnews\.com|heraldcorp|edaily\.co\.kr|kbs\.co\.kr|imbc\.com|sbs\.co\.kr|jtbc|tvchosun|ichannela|mbn\.co\.kr|ytn\.co\.kr|sportschosun|sportsdonga|isplus\.com|osen|starnewskorea|news1\.kr|newsis\.com|xportsnews|nytimes\.com|washingtonpost|bbc\.co|cnn\.com|bloomberg\.com|nhk\.or\.jp)[^"]*"'
ORDER BY no;
```

## 중복 기사 탐지 (AUD-02)

### 방법 1: source_url 기준 중복

```sql
SELECT source_url, array_agg(no ORDER BY no) AS nos, count(*) AS cnt
FROM articles
WHERE status = '게시' AND source_url IS NOT NULL AND source_url != ''
GROUP BY source_url
HAVING count(*) > 1
ORDER BY cnt DESC;
```

### 방법 2: 정규화 제목 기준 중복

Node.js에서 실행 (DB에서 전체 로드 후 비교):

```javascript
function normalizeTitle(t) {
  return t.replace(/\s+/g, "")
          .replace(/[^\p{L}\p{N}]/gu, "")
          .toLowerCase()
          .normalize("NFC");
}

const titleMap = new Map(); // normalizedTitle -> [articles]
for (const art of articles) {
  const key = normalizeTitle(art.title);
  if (!titleMap.has(key)) titleMap.set(key, []);
  titleMap.get(key).push(art);
}
const duplicates = [...titleMap.entries()]
  .filter(([_, arts]) => arts.length > 1);
```

### 조치 기준
- 같은 `source_url` → 가장 오래된(no가 작은) 1건 보존, 나머지 소프트 삭제
- 같은 정규화 제목 + 같은 날짜 → 가장 오래된 1건 보존, 나머지 소프트 삭제
- 같은 정규화 제목 + 다른 날짜 → 수동 확인 필요 (다른 사건일 수 있음)

## 바이라인/저작권/뉴스와이어 패턴 (AUD-03)

### 기존 패턴 (audit-articles.mjs에서)

```javascript
// 바이라인
/(?:기자|특파원|통신원)\s*[=@]\s*\S+(?:뉴스|일보|신문|...)/i
// 저작권
/무단\s*전재/, /재배포\s*금지/, /저작권자/, /ⓒ\s*\d{4}/
// 이메일 바이라인
/[a-zA-Z0-9._%+-]+@(?!culturepeople)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
```

### 신규 추가 패턴

```javascript
// 뉴스와이어 잔재 (SKILL.md 13.3)
const NEWSWIRE_PATTERNS = [
  /뉴스와이어/,
  /뉴스\s*제공/,
  /배포\s*서비스/,
  /국내\s*최대\s*배포/,
  /--\s*\(뉴스와이어\)\s*--/,        // 발신지 표기
  /\S+--\(뉴스와이어\)/,
  /보도자료\s*배포/,
  /newswire/i,
];

// UI 잔재 (SKILL.md 13.3)
const UI_REMNANT_PATTERNS = [
  /(?:공유|스크랩|인쇄|글씨크기)\s*(?:하기|버튼|조절)/,
  /(?:페이스북|트위터|카카오)\s*공유/,
  /기사\s*(?:입력|수정)\s*\d{4}/,     // 기사 입력 2024-01-01 형태
  /관련\s*보도자료/,
];

// 명함/연락처 블록 (SKILL.md 13.3)
const NAMECARD_PATTERNS = [
  // "담당: 홍길동 / 02-1234-5678 / email@example.com" 형태
  /(?:담당|문의|연락처|홍보|PR)\s*[:：]\s*\S+\s*(?:\/|\|)\s*\d{2,4}[-.]?\d{3,4}[-.]?\d{4}/,
  // 팩스 번호 포함 블록
  /(?:전화|TEL|Tel)\s*[:：]?\s*\d{2,4}[-.]?\d{3,4}[-.]?\d{4}\s*(?:\/|\||\n)\s*(?:팩스|FAX|Fax)\s*[:：]?\s*\d{2,4}[-.]?\d{3,4}[-.]?\d{4}/i,
  // 이메일 + 전화번호 조합 (바이라인이 아닌 명함)
  /\S+@\S+\.\S+\s*(?:\/|\|)\s*\d{2,4}[-.]?\d{3,4}[-.]?\d{4}/,
];

// 개인정보 (SKILL.md 13.3)
const PERSONAL_INFO_PATTERNS = [
  /\d{6}[-]\d{7}/,                    // 주민등록번호
  /\d{3,4}[-]\d{2,4}[-]\d{4,6}/,     // 계좌번호 (은행별 다양)
];
```

## 빈 태그/엔티티/명함 패턴 (AUD-04)

### 빈 태그 제거 정규식

```javascript
const EMPTY_TAG_CLEANUP = [
  /<p>\s*<\/p>/g,
  /<p>\s*&nbsp;\s*<\/p>/g,
  /<strong>\s*<\/strong>/g,
  /<em>\s*<\/em>/g,
  /<span[^>]*>\s*<\/span>/g,
  /<div[^>]*>\s*<\/div>/g,
  /(<br\s*\/?>){3,}/g,                // 3개 이상 br → br br
  /<a\s*>\s*<\/a>/g,                  // 빈 링크
];
```

### HTML 엔티티 디코딩 (기존 검증 맵 통합)

```javascript
const FULL_ENTITY_MAP = {
  // audit-fix.mjs
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
  "&quot;": '"', "&apos;": "'", "&#39;": "'", "&#039;": "'",
  "&lsquo;": "\u2018", "&rsquo;": "\u2019",
  "&ldquo;": "\u201C", "&rdquo;": "\u201D",
  "&middot;": "\u00B7", "&hellip;": "\u2026",
  "&ndash;": "\u2013", "&mdash;": "\u2014",
  "&bull;": "\u2022", "&trade;": "\u2122",
  "&copy;": "\u00A9", "&reg;": "\u00AE",
  "&times;": "\u00D7", "&divide;": "\u00F7", "&shy;": "",
  // audit-fix2.mjs 추가
  "&eacute;": "e", "&uarr;": "^", "&darr;": "v",
  "&larr;": "<-", "&rarr;": "->", "&hearts;": "heart",
};
```

### base64/추적 픽셀 제거

```javascript
// base64 이미지 (SKILL.md 13.4)
/<img[^>]*src="data:image\/[^"]*"[^>]*>/gi

// 1x1 추적 픽셀
/<img[^>]*(?:width="1"|height="1"|width='1'|height='1')[^>]*>/gi
```

## 금지 표현 탐지 (SKILL.md 13.7)

```javascript
const FORBIDDEN_EXPRESSIONS = [
  /에\s*대해\s*알아보겠습니다/,
  /를?\s*살펴보겠습니다/,
  /에\s*대해\s*살펴보겠습니다/,
  /알아보도록\s*하겠습니다/,
  /살펴보도록\s*하겠습니다/,
  /함께\s*알아볼까요/,
];
```

**조치:** 이 패턴은 자동 수정이 어려우므로 (문맥에 따라 대체 표현이 다름), 탐지만 하고 AI 재편집 후보로 플래그한다.

## batch-reedit.mjs 활용 가능성

### 활용 적합한 경우
- 금지 표현이 다수 포함된 기사
- 전체적으로 블로그식 문체인 기사
- 기존 수정으로 해결 불가한 복합 문제 기사

### 활용 부적합한 경우
- 단순 엔티티/빈태그 문제 → 정규식 치환으로 충분
- 저작권 이미지만 있는 경우 → 이미지 태그만 제거/교체
- 바이라인만 있는 경우 → 해당 줄만 제거

### 제한사항
- Gemini 무료 15RPM → 대량 처리 시 시간 소요 (100건 = ~30분)
- AI 편집은 원문 의미 변형 위험 → 최소한으로 사용
- 기존 `--dry-run` 옵션 활용하여 사전 검토 가능

## Code Examples

### 강화 감사 스크립트 핵심 구조

```javascript
// audit-articles-v2.mjs (기존 확장)

// 기존 14 유형 + 신규 9 유형 = 23 유형 검사
function auditArticle(article) {
  const issues = [];
  // ... 기존 14 유형 (audit-articles.mjs 그대로) ...

  // 15. 저작권 위험 이미지
  const imgUrls = body.match(/src="(https?:\/\/[^"]+)"/gi) || [];
  for (const imgTag of imgUrls) {
    const url = imgTag.match(/src="([^"]+)"/)?.[1] || "";
    if (isRiskyDomain(url)) {
      issues.push({ type: "RISKY_IMAGE", detail: `저작권 위험: ${url.substring(0, 80)}` });
    }
  }

  // 16. 뉴스와이어 잔재
  for (const pat of NEWSWIRE_PATTERNS) {
    const match = body.match(pat);
    if (match) {
      issues.push({ type: "NEWSWIRE", detail: `뉴스와이어: "${match[0].substring(0, 40)}"` });
      break;
    }
  }

  // 17. 명함/연락처
  for (const pat of NAMECARD_PATTERNS) {
    const match = plainBody.match(pat);
    if (match) {
      issues.push({ type: "NAMECARD", detail: `명함/연락처: "${match[0].substring(0, 60)}"` });
      break;
    }
  }

  // 18. base64 이미지
  if (/src="data:image\//.test(body)) {
    issues.push({ type: "BASE64_IMG", detail: "base64 이미지 포함" });
  }

  // 19. 추적 픽셀
  if (/<img[^>]*(?:width="1"|height="1")[^>]*>/i.test(body)) {
    issues.push({ type: "TRACKING_PIXEL", detail: "1x1 추적 픽셀 포함" });
  }

  // 20. 금지 표현
  for (const pat of FORBIDDEN_EXPRESSIONS) {
    const match = plainBody.match(pat);
    if (match) {
      issues.push({ type: "FORBIDDEN_EXPR", detail: `금지 표현: "${match[0]}"` });
      break;
    }
  }

  // 21. "전대통령" 금지 키워드
  if (/전대통령/.test(fullText)) {
    issues.push({ type: "BLOCKED_KEYWORD", detail: "전대통령 키워드 포함" });
  }

  return issues;
}
```

### 저작권 위험 도메인 판별 함수

```javascript
const RISKY_DOMAINS = [
  // 통신사
  'yonhapnews', 'yna.co.kr', 'apimages', 'ap.org',
  'afp.com', 'reuters.com', 'gettyimages', 'epa.eu', 'shutterstock',
  // 종합일간지
  'chosun.com', 'joongang', 'joins.com', 'donga.com',
  'hani.co.kr', 'khan.co.kr', 'hankookilbo', 'kmib.co.kr',
  'segye.com', 'seoul.co.kr', 'munhwa.com',
  // 경제지
  'mk.co.kr', 'hankyung.com', 'sedaily.com', 'asiae.co.kr',
  'mt.co.kr', 'fnnews.com', 'heraldcorp', 'edaily.co.kr',
  // 방송사
  'kbs.co.kr', 'imbc.com', 'sbs.co.kr', 'jtbc',
  'tvchosun', 'ichannela', 'mbn.co.kr', 'ytn.co.kr',
  // 스포츠/연예
  'sportschosun', 'sportsdonga', 'isplus.com',
  'osen', 'starnewskorea', 'news1.kr', 'newsis.com', 'xportsnews',
  // 해외
  'nytimes.com', 'washingtonpost', 'bbc.co', 'cnn.com',
  'bloomberg.com', 'nhk.or.jp',
];

function isRiskyDomain(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  // Supabase 자체 이미지는 안전
  if (lower.includes('ifducnfrjarmlpktrjkj.supabase')) return false;
  if (lower.includes('culturepeople.co.kr')) return false;
  return RISKY_DOMAINS.some(d => lower.includes(d));
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | 스크립트 직접 실행 (별도 테스트 프레임워크 불필요) |
| Config file | 없음 (스크립트 기반) |
| Quick run command | `node scripts/audit-articles.mjs` |
| Full suite command | `node scripts/audit-articles.mjs && cat scripts/audit-result.json` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUD-01 | 저작권 위험 이미지 0건 | smoke | `node scripts/audit-articles.mjs` 후 RISKY_IMAGE=0 확인 | 수정 필요 |
| AUD-02 | 중복 기사 0건 | smoke | 중복 탐지 SQL 쿼리 실행 후 0건 확인 | 신규 |
| AUD-03 | 바이라인/저작권/뉴스와이어 0건 | smoke | audit-result.json에서 OTHER_MEDIA+COPYRIGHT+NEWSWIRE=0 | 수정 필요 |
| AUD-04 | 빈태그/엔티티/명함 0건 | smoke | audit-result.json에서 EMPTY_TAGS+HTML_ENTITY+NAMECARD=0 | 수정 필요 |
| AUD-05 | 연속 2회 0건 | manual | 감사 2회 실행, 양쪽 problems=0 확인 | 수동 |

### Sampling Rate
- **Per task commit:** `node scripts/audit-articles.mjs`
- **Per wave merge:** audit-result.json의 problems=0 확인
- **Phase gate:** 연속 2회 실행 모두 problems=0

### Wave 0 Gaps
- [ ] `scripts/audit-articles.mjs` 강화 -- 신규 9개 유형 추가
- [ ] 중복 탐지 스크립트 신규 작성
- [ ] 저작권 위험 이미지 수정 스크립트 신규 작성

## Open Questions

1. **현재 기사 수 정확한 파악**
   - What we know: 약 4,000건 (SKILL.md 기준), 마지막 감사(2026-03-15) 시 2,973건
   - What's unclear: 현재 정확한 "게시" 상태 기사 수
   - Recommendation: 감사 스크립트 실행 시 자동 카운트

2. **저작권 위험 이미지 대체 전략**
   - What we know: SKILL.md에 공공누리, Unsplash, Pexels 등 대안 제시
   - What's unclear: 자동으로 대체 이미지를 찾아 삽입할지, 아니면 이미지를 제거만 할지
   - Recommendation: 이미지 제거(태그 삭제)를 기본으로 하고, thumbnail도 같이 비울 경우 대체 이미지 검토

3. **AI 재편집 범위**
   - What we know: 금지 표현은 자동 정규식 치환이 어려움
   - What's unclear: AI 재편집 대상 기사 수, Gemini API 비용/시간
   - Recommendation: 금지 표현 포함 기사만 카운트 후, 건수가 적으면 AI 재편집, 많으면 수동 보류

## Sources

### Primary (HIGH confidence)
- `scripts/audit-articles.mjs` -- 기존 감사 스크립트 (14 유형 검사)
- `scripts/audit-fix.mjs` ~ `audit-fix4.mjs` -- 기존 수정 스크립트
- `.claude/skills/culturepeople-master/SKILL.md` 13장 -- 기사 편집 기준 (22개 규칙)
- `src/app/api/cron/auto-press/route.ts` -- `normalizeTitle()`, `isDuplicate()` 검증 로직

### Secondary (MEDIUM confidence)
- `scripts/audit-result.json` -- 마지막 감사 결과 (2026-03-15, 0건)
- `scripts/batch-reedit.mjs` -- AI 재편집 스크립트

## Metadata

**Confidence breakdown:**
- 감사 패턴: HIGH -- 기존 스크립트 + SKILL.md에서 직접 도출
- 저작권 도메인: HIGH -- SKILL.md 13.4에 명시적 목록
- 중복 탐지: HIGH -- 프로덕션 코드의 검증된 로직 재활용
- 수정 전략: HIGH -- 기존 4차 수정 스크립트 패턴 검증됨

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (데이터 감사는 일회성이므로 유효기간 긴편)
