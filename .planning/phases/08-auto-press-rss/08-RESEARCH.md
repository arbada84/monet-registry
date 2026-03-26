# Phase 8: auto-press 뉴스와이어 RSS 직접 수집 전환 - Research

**조사일:** 2026-03-26
**도메인:** RSS 파싱, HTML 스크래핑, 뉴스와이어 API
**신뢰도:** HIGH

## 요약

현재 auto-press 시스템은 **이미 뉴스와이어 RSS 직접 수집 인프라를 갖추고 있다**. `auto-defaults.ts`에 뉴스와이어 RSS 소스가 10+개 등록되어 있고, `route.ts`의 `fetchRssFeed()` + `fetchOriginContent()`가 RSS 직접 수집 경로를 처리한다. 넷프로 경유는 `fetchNetproList()` + `fetchNetproDetail()`로 별도 경로가 존재한다.

따라서 이 페이즈의 핵심은 **(1) 뉴스와이어 기사 본문 추출 최적화**, **(2) 넷프로 경유 소스의 뉴스와이어 RSS 직접 전환**, **(3) 넷프로 API 코드 제거**이다.

**주요 권고:** 뉴스와이어 기사 페이지(`newsRead.php`)에 특화된 본문 추출 함수를 만들고, 기존 `html-extract.ts`의 범용 추출기는 뉴스와이어 구조를 제대로 못 잡으므로 `section.article_column` 셀렉터 기반 전용 파서가 필요하다.

## 현재 아키텍처 분석

### 수집 흐름 (2개 경로)

```
경로 1: netpro 경유 (제거 대상)
  activeSources[fetchType !== "rss"]
  → fetchNetproList(baseUrl, boTable, sca)    // self-fetch: /api/netpro/list
  → fetchNetproDetail(baseUrl, boTable, wrId)  // self-fetch: /api/netpro/detail
  → netpro/detail이 www.netpro.kr 스크래핑     // 2단계 프록시

경로 2: RSS 직접 수집 (유지/강화 대상)
  activeSources[fetchType === "rss" && rssUrl]
  → fetchRssFeed(rssUrl, maxItems)             // RSS XML 직접 파싱
  → fetchOriginContent(baseUrl, rssLink)       // 원문 페이지 직접 fetch
  → html-extract.ts로 본문/이미지/날짜 추출
```

### 핵심 함수 위치

| 함수 | 파일 | 역할 | 변경 필요 |
|------|------|------|----------|
| `parseRssXml()` | route.ts:124 | RSS XML → RssItem[] 파싱 | 유지 (이미 동작) |
| `fetchRssFeed()` | route.ts:156 | RSS URL fetch + 파싱 | 유지 |
| `fetchOriginContent()` | route.ts:174 | 원문 HTML fetch + 추출 | **뉴스와이어 전용 로직 추가** |
| `fetchNetproList()` | route.ts:216 | netpro 목록 수집 | **제거** |
| `fetchNetproDetail()` | route.ts:249 | netpro 상세 수집 | **제거** |
| `extractBodyHtml()` | html-extract.ts:64 | 범용 본문 추출 | 뉴스와이어에서 부정확 |

### 넷프로 API 파일 (제거 대상)

| 파일 | 역할 |
|------|------|
| `src/app/api/netpro/list/route.ts` | netpro.kr 게시판 HTML 파싱 → JSON |
| `src/app/api/netpro/detail/route.ts` | netpro.kr 상세페이지 HTML 파싱 |
| `src/app/api/netpro/origin/route.ts` | 원문 URL → HTML 추출 (html-extract.ts 사용) |
| `src/app/api/netpro/image/route.ts` | 이미지 프록시 |

## 뉴스와이어 RSS 구조 분석 (실제 테스트 완료)

### RSS 피드 URL 패턴

```
전체:     https://api.newswire.co.kr/rss/all
카테고리: https://api.newswire.co.kr/rss/industry/{catId}
테마:     https://api.newswire.co.kr/rss/theme/{themeId}
```

**신뢰도: HIGH** — 실제 fetch 테스트 완료 (2026-03-26)

### RSS XML 구조

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
  <title>문화 보도자료 - 뉴스와이어</title>
  <link>https://www.newswire.co.kr/?md=A01&amp;cat=1200</link>
  <lastBuildDate>Thu, 26 Mar 2026 15:38:07 +0900</lastBuildDate>
  <item>
    <title><![CDATA[제목 텍스트]]></title>
    <link>https://www.newswire.co.kr/newsRead.php?no=1031104&amp;sourceType=rss</link>
    <category></category>   <!-- 항상 비어있음 -->
    <description><![CDATA[
      <table>...<img src="https://file.newswire.co.kr/data/datafile2/thumb/..." /></table>
      본문 요약 텍스트...
    ]]></description>
    <pubDate>Thu, 26 Mar 2026 11:26:26 +0900</pubDate>
  </item>
</channel>
</rss>
```

**주요 포인트:**
- `<title>`: CDATA로 감싸져 있음 → 기존 `parseRssXml()`이 이미 처리
- `<link>`: `newsRead.php?no={번호}&sourceType=rss` 형태, `&amp;` 인코딩됨
- `<category>`: 항상 빈 문자열 (사용 불가)
- `<description>`: 썸네일 HTML + 요약 텍스트 포함
- `<pubDate>`: RFC 2822 형식 (예: `Thu, 26 Mar 2026 11:26:26 +0900`)
- 피드당 약 15~20개 항목 제공

### description에서 썸네일 추출 가능

```
<img src="https://file.newswire.co.kr/data/datafile2/thumb/2026/03/{hash}.jpg" width="80" />
```

이 썸네일은 80px 크기이므로 대표이미지로는 부적합. 기사 페이지에서 고해상도 이미지를 가져와야 함.

## 뉴스와이어 기사 페이지 HTML 구조 분석 (실제 테스트 완료)

### URL 형태
```
https://www.newswire.co.kr/newsRead.php?no={번호}
https://www.newswire.co.kr/newsRead.php?no={번호}&sourceType=rss
```

### HTML 메타 태그 (신뢰도: HIGH)

```html
<title>기사 제목 - 뉴스와이어</title>
<meta property="og:title" content="기사 제목 - 뉴스와이어">
<meta property="og:image" content="https://file.newswire.co.kr/data/datafile2/thumb_480/{path}.jpg">
<meta property="og:description" content="요약 텍스트">
<meta property="article:published_time" content="2026-03-26T11:26:26+09:00">
<meta name="author" content="작성자">
<meta name="news_keywords" content="키워드1, 키워드2">
```

- `og:title`에 " - 뉴스와이어" 접미사 있음 → 제거 필요
- `og:image`는 thumb_480 크기 → 대표이미지로 사용 가능
- `article:published_time` → 기존 `extractDate()`가 이미 처리

### 본문 영역 구조 (핵심)

```html
<main role="main" id="content" class="news">
  ...
  <div class="release-body2 fs-md">
    <section class="article_column">
      <!-- 본문 텍스트 (br 태그로 구분) -->
      부산--(<a href="...">뉴스와이어</a>)--본문 시작...
      <br><br>

      <!-- 이미지 블록 -->
      <div class="images_column vertical" id="lightbox-image-gallery">
        <div class="column_image vertical"
             data-src="https://file.newswire.co.kr/data/datafile2/data/{path}.jpg">
          <a href="javascript:void(0);" class="image-wrap photoaction">
            <img src="https://file.newswire.co.kr/data/datafile2/thumb_640/{path}.jpg"
                 class="pic_{id}" alt="캡션">
          </a>
          <div class="column_desc">
            <span>캡션 텍스트</span>
          </div>
        </div>
      </div>

      <!-- 본문 계속 -->
      본문 텍스트...
      <br><br>

      <!-- 연락처 영역 (제거 필요) -->
      <div class="release-contact">
        <h6>연락처</h6>
        <p>회사명<br>담당자<br>...</p>
      </div>

      <!-- 소스 정보 (제거 필요) -->
      <div class="release-source-news">
        <div class="release-source">
          <p class="notice">이 보도자료는 ... 뉴스와이어 서비스를 통해 배포한 뉴스입니다.</p>
        </div>
      </div>
    </section>
  </div>
</main>
```

### 날짜 위치
```html
<div class="release-time">2026-03-26 11:26</div>
```

### 이미지 패턴

| 용도 | URL 패턴 | 크기 |
|------|----------|------|
| RSS 썸네일 | `file.newswire.co.kr/data/datafile2/thumb/{path}` | 80px |
| OG 이미지 | `file.newswire.co.kr/data/datafile2/thumb_480/{path}` | 480px |
| 기사 내 표시 | `file.newswire.co.kr/data/datafile2/thumb_640/{path}` | 640px |
| 원본 (고해상도) | `file.newswire.co.kr/data/datafile2/data/{path}` | 원본 |

**권고:** 본문 이미지는 `data-src` 속성에서 원본 URL 추출, 또는 `thumb_640` URL의 `thumb_640` → `data`로 치환하여 고해상도 확보.

## 뉴스와이어 전용 본문 추출기 설계

### 왜 기존 html-extract.ts가 부족한가

1. `extractBodyHtml()`은 `<article>` → `<main>` → `role=main` → 클래스 휴리스틱 순서로 시도
2. 뉴스와이어는 `<main id="content">` 안에 네비게이션, 사이드바 등이 모두 포함
3. 실제 본문은 `section.article_column` 안에만 있음
4. `release-contact`, `release-source-news` 같은 영역은 본문이 아님
5. 이미지가 `<div class="images_column">` 안의 복잡한 구조에 있어 단순 `<img>` 추출이 불완전

### 전용 추출 함수 패턴

```typescript
// 뉴스와이어 기사 전용 본문 추출
function extractNewswireArticle(html: string): {
  title: string;
  bodyHtml: string;
  bodyText: string;
  date: string;
  images: string[];
  sourceUrl: string;
  author: string;
  keywords: string[];
} | null {
  // 1. 제목: og:title에서 " - 뉴스와이어" 제거
  const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
  const title = ogTitle
    ? ogTitle[1].replace(/\s*-\s*뉴스와이어$/, "").trim()
    : "";

  // 2. 날짜: article:published_time 또는 release-time
  const pubTime = html.match(/<meta[^>]+property="article:published_time"[^>]+content="([^"]+)"/i);
  const date = pubTime ? pubTime[1].trim() : "";

  // 3. 본문: section.article_column 추출
  const articleMatch = html.match(
    /<section\s+class="article_column">([\s\S]*?)<\/section>/i
  );
  if (!articleMatch) return null;

  let body = articleMatch[1];

  // 4. 불필요 영역 제거
  body = body
    .replace(/<div\s+class="release-contact">[\s\S]*?<\/div>\s*(?=<div|$)/gi, "")
    .replace(/<div\s+class="release-source-news">[\s\S]*$/gi, "")
    .replace(/<div\s+class="release-source">[\s\S]*?<\/div>/gi, "");

  // 5. 뉴스와이어 바이라인 제거: "XXX--(뉴스와이어)--"
  body = body.replace(/[^<]*--\(<a[^>]*>뉴스와이어<\/a>\)--/g, "");

  // 6. 이미지 추출: data-src(원본) 또는 img src(thumb_640)
  const images: string[] = [];
  const imgBlocks = body.matchAll(
    /data-src="(https:\/\/file\.newswire\.co\.kr[^"]+)"/gi
  );
  for (const m of imgBlocks) {
    images.push(m[1]); // 원본 고해상도
  }
  // fallback: img src에서 추출
  if (images.length === 0) {
    const imgSrcs = body.matchAll(
      /<img[^>]+src="(https:\/\/file\.newswire\.co\.kr[^"]+)"[^>]*>/gi
    );
    for (const m of imgSrcs) {
      if (!m[1].includes("/thumb/")) images.push(m[1]);
    }
  }

  // 7. OG 이미지도 포함 (fallback)
  const ogImg = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
  if (ogImg && !images.includes(ogImg[1])) {
    // thumb_480 → data로 변환해서 고해상도 확보
    const hiRes = ogImg[1].replace("/thumb_480/", "/data/");
    if (!images.includes(hiRes)) images.unshift(hiRes);
  }

  // 8. 본문 HTML 정리: images_column 구조를 단순 img 태그로 변환
  body = body.replace(
    /<div\s+class="images_column[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi,
    (match) => {
      const src = match.match(/data-src="([^"]+)"/);
      const alt = match.match(/alt="([^"]*)"/);
      if (src) {
        return `<figure><img src="${src[1]}" alt="${alt?.[1] || ""}" style="max-width:100%;" /></figure>`;
      }
      return "";
    }
  );

  return { title, bodyHtml: body.trim(), bodyText: toPlainText(body), date, images, sourceUrl: "", author: "", keywords: [] };
}
```

### 뉴스와이어 URL 감지

```typescript
function isNewswireUrl(url: string): boolean {
  return url.includes("newswire.co.kr/newsRead.php");
}
```

## html-extract.ts 재활용 가능 함수

| 함수 | 재활용 | 비고 |
|------|--------|------|
| `extractTitle()` | 부분적 | og:title에서 " - 뉴스와이어" 접미사 제거 필요 |
| `extractDate()` | 완전 | article:published_time을 이미 처리 |
| `extractThumbnail()` | 완전 | og:image 추출 |
| `extractBodyHtml()` | 불가 | 뉴스와이어 구조에 맞지 않음 |
| `toPlainText()` | 완전 | HTML → 텍스트 변환 |
| `extractImages()` | 부분적 | img src만 추출, data-src 미지원 |

## 넷프로 경유 소스 → 뉴스와이어 RSS 직접 전환 매핑

### 현재 넷프로 경유 소스 (auto-defaults.ts)

| ID | 이름 | boTable | sca | 전환 대상 RSS |
|----|------|---------|-----|-------------|
| `nw_all` | 뉴스와이어 전체 | newswire | "" | `https://api.newswire.co.kr/rss/all` (이미 `nwrss_all`로 존재) |
| `nw_economy` | 뉴스와이어 경제 | newswire | "100" | `https://api.newswire.co.kr/rss/industry/100` (이미 `nwrss_econ`으로 존재) |
| `nw_culture` | 뉴스와이어 문화 | newswire | "1200" | `https://api.newswire.co.kr/rss/industry/1200` (이미 `nwrss_cult`로 존재) |

**결론:** 넷프로 경유 뉴스와이어 소스는 이미 RSS 직접 수집 소스가 중복 등록되어 있다. 넷프로 경유 소스(`nw_all`, `nw_economy`, `nw_culture`)를 제거하고 RSS 직접 소스만 유지하면 된다.

### 뉴스와이어 카테고리 ID 매핑 (RSS 피드 확인 완료)

| 카테고리 | ID | RSS URL |
|----------|-----|---------|
| 전체 | all | `api.newswire.co.kr/rss/all` |
| IT | 600 | `api.newswire.co.kr/rss/industry/600` |
| 경제 | 100 | `api.newswire.co.kr/rss/industry/100` |
| 금융 | 200 | `api.newswire.co.kr/rss/industry/200` |
| 산업 | 400 | `api.newswire.co.kr/rss/industry/400` |
| 문화 | 1200 | `api.newswire.co.kr/rss/industry/1200` |
| 생활 | 900 | `api.newswire.co.kr/rss/industry/900` |
| 건강 | 1000 | `api.newswire.co.kr/rss/industry/1000` |
| 교육 | 1100 | `api.newswire.co.kr/rss/industry/1100` |
| 레저 | 1300 | `api.newswire.co.kr/rss/industry/1300` |
| 정부 | 1400 | `api.newswire.co.kr/rss/industry/1400` |
| 환경 | 1500 | `api.newswire.co.kr/rss/industry/1500` |
| 운송 | 1800 | `api.newswire.co.kr/rss/industry/1800` |
| 사회 | 1900 | `api.newswire.co.kr/rss/industry/1900` |

서브카테고리 (테마):
- 공연예술 1201, 미술 1202, 음악 1205, 영화 1206, 출판 1208, 문화유산 1211
- 전시 120 (theme)

## 변경 지점 상세

### 1. fetchOriginContent() 개선 (route.ts:174)

현재 `fetchOriginContent()`는 범용 `html-extract.ts` 함수를 사용한다. 뉴스와이어 URL 감지 시 전용 파서로 분기해야 한다.

```typescript
async function fetchOriginContent(baseUrl: string, articleUrl: string) {
  // ... fetch 부분 동일 ...

  // 뉴스와이어 전용 처리
  if (articleUrl.includes("newswire.co.kr/newsRead.php")) {
    return extractNewswireArticle(html, finalUrl);
  }

  // 기존 범용 처리
  return extractGenericArticle(html, finalUrl);
}
```

### 2. auto-defaults.ts 소스 목록 정리

- 넷프로 경유 소스 (`fetchType: "netpro"` 또는 미지정) 중 뉴스와이어 관련 3개 제거
  - `nw_all`, `nw_economy`, `nw_culture`
- 정부 넷프로 소스 (`gov_policy`, `gov_press`)는 이미 `kr_press`, `kr_policy` RSS 소스로 대체됨 → 제거

### 3. route.ts에서 넷프로 관련 코드 제거

- `NetproListItem` 인터페이스 (207행)
- `fetchNetproList()` 함수 (216행)
- `NetproDetail` 인터페이스 (239행)
- `fetchNetproDetail()` 함수 (249행)
- `runAutoPress()` 내 넷프로 분기 코드 (415~425행)
- `PressTarget` 인터페이스에서 netpro 관련 필드

### 4. netpro API 라우트 제거

- `src/app/api/netpro/list/route.ts` — 삭제
- `src/app/api/netpro/detail/route.ts` — 삭제
- `src/app/api/netpro/origin/route.ts` — 유지 고려 (범용 원문 추출 기능)
- `src/app/api/netpro/image/route.ts` — 삭제 여부 확인 필요

### 5. AutoPressSource 타입 정리

```typescript
// 현재
export interface AutoPressSource {
  id: string;
  name: string;
  boTable: "rss" | "newswire";    // netpro 의존
  sca: string;                     // netpro 카테고리
  enabled: boolean;
  fetchType?: "netpro" | "rss";   // netpro 옵션 제거
  rssUrl?: string;
}

// 전환 후
export interface AutoPressSource {
  id: string;
  name: string;
  enabled: boolean;
  rssUrl: string;                  // 필수로 변경
  // boTable, sca, fetchType 제거 또는 deprecated
}
```

**주의:** 기존 사용자 설정(DB에 저장된 `cp-auto-press-settings`)과의 호환성 필요. 갑자기 타입을 바꾸면 기존 설정을 읽지 못할 수 있다. 마이그레이션 로직 또는 fallback 처리 필요.

## Don't Hand-Roll

| 문제 | 직접 구현 금지 | 이미 있는 것 사용 |
|------|--------------|-----------------|
| RSS XML 파싱 | 새 XML 파서 | 기존 `parseRssXml()` (route.ts:124) — 이미 CDATA, 네임스페이스 처리 |
| HTML 엔티티 디코딩 | 수동 변환 | `@/lib/html-utils` → `decodeHtmlEntities()` |
| 이미지 Supabase 업로드 | 직접 구현 | `serverUploadImageUrl()` |
| 중복 체크 | 새 로직 | 기존 `isDuplicate()` + `getDbArticlesCache()` |
| AI 편집 | 새 프롬프트 | 기존 `aiEditArticle()` |

## Common Pitfalls

### Pitfall 1: release-contact 영역이 본문에 포함
**문제:** `section.article_column` 안에 `div.release-contact`(연락처)와 `div.release-source-news`(뉴스와이어 고지)가 포함됨
**원인:** 뉴스와이어가 본문과 메타 정보를 같은 section에 넣음
**방지:** 본문 추출 후 반드시 `.release-contact`, `.release-source-news`, `.release-source` 영역 제거
**징후:** AI 편집 결과에 "연락처", "이메일 보내기", "뉴스와이어 서비스를 통해 배포" 등의 문구 포함

### Pitfall 2: 뉴스와이어 바이라인 패턴
**문제:** 본문 첫줄에 `서울--(뉴스와이어)--` 형태의 바이라인이 있음
**원인:** 뉴스와이어 보도자료 표준 형식
**방지:** 정규식으로 제거: `/[^<]*--\(<a[^>]*>뉴스와이어<\/a>\)--/g` 또는 텍스트 버전 `/.*?--\(뉴스와이어\)--/g`
**징후:** 기사 본문이 "서울--(뉴스와이어)--"로 시작

### Pitfall 3: 이미지가 images_column div 안의 복잡 구조
**문제:** 이미지가 `<img src>` 외에 `data-src` 속성에 원본 URL이 있고, lightbox 갤러리 구조
**원인:** 뉴스와이어의 이미지 갤러리 JS 라이브러리
**방지:** `data-src` 속성 우선 추출, `thumb_640` URL에서 `thumb_640` → `data`로 치환하면 원본
**징후:** 추출 이미지가 80px 또는 640px 저해상도

### Pitfall 4: og:title에 " - 뉴스와이어" 접미사
**문제:** `extractTitle()`의 og:title 결과에 사이트명이 포함
**원인:** 뉴스와이어 SEO 설정
**방지:** `.replace(/\s*-\s*뉴스와이어$/, "")`

### Pitfall 5: 기존 사용자 설정 호환성
**문제:** DB에 저장된 `cp-auto-press-settings`가 `fetchType: "netpro"` 소스를 포함
**원인:** 기존 설정이 netpro 경유 소스를 사용 중
**방지:** 설정 로드 시 `fetchType: "netpro"` 소스를 자동으로 대응하는 RSS 소스로 매핑하는 마이그레이션 로직 추가
**징후:** 배포 후 보도자료 수집이 0건

### Pitfall 6: &amp; 인코딩된 RSS link
**문제:** RSS `<link>` 태그의 URL에 `&amp;`가 있어 fetch 시 오류
**원인:** RSS XML에서 `&`가 `&amp;`로 인코딩
**방지:** `decodeHtmlEntities()`로 link URL 디코딩 — 기존 `parseRssXml()`이 이미 처리하지만 확인 필요

## 코드 예시 (검증된 패턴)

### 뉴스와이어 기사 본문 추출 (article_column)

```typescript
// Source: 실제 뉴스와이어 HTML 분석 (2026-03-26)
function extractNewswireBody(html: string): string {
  // section.article_column 추출
  const match = html.match(
    /<section\s+class="article_column">([\s\S]*?)<\/section>/i
  );
  if (!match) return "";

  let body = match[1];

  // 불필요 영역 제거 (release-contact부터 끝까지)
  const contactIdx = body.indexOf('<div class="release-contact">');
  if (contactIdx > -1) body = body.slice(0, contactIdx);

  // 뉴스와이어 바이라인 제거
  body = body.replace(/^[^<]*--\(<a[^>]*>뉴스와이어<\/a>\)--/m, "");

  // images_column 구조 → 단순 img 태그로 변환
  body = body.replace(
    /<div\s+class="(?:images_column|column_image)[^"]*"[^>]*data-src="([^"]+)"[^>]*>[\s\S]*?<img[^>]*alt="([^"]*)"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi,
    '<figure><img src="$1" alt="$2" style="max-width:100%;height:auto;" /></figure>'
  );

  // 스크립트/스타일 제거
  body = body
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  return body.trim();
}
```

### 뉴스와이어 이미지 URL 고해상도 변환

```typescript
// Source: 실제 URL 패턴 분석
function toHighResNewswireImage(url: string): string {
  // thumb/thumb_480/thumb_640 → data (원본)
  return url
    .replace("/thumb_640/", "/data/")
    .replace("/thumb_480/", "/data/")
    .replace("/thumb/", "/data/");
}
```

## Validation Architecture

### 테스트 프레임워크

| 속성 | 값 |
|------|-----|
| 프레임워크 | 수동 테스트 (기존 프레임워크 없음) |
| 빠른 실행 | `pnpm build` (타입 체크) |
| 전체 실행 | Playwright로 라이브 API 호출 |

### 페이즈 요구사항 → 테스트 매핑

| 요구 | 동작 | 테스트 유형 | 자동 명령 |
|------|------|-----------|---------|
| RSS 파싱 | 뉴스와이어 RSS XML → 기사 목록 | 수동 | `curl https://api.newswire.co.kr/rss/industry/1200` |
| 본문 추출 | newsRead.php 페이지 → 본문 HTML | 수동 | `curl https://www.newswire.co.kr/newsRead.php?no=1031104` |
| 넷프로 제거 | netpro API 경로 404 | 수동 | `pnpm build` (import 에러 확인) |
| 전체 흐름 | auto-press API → 기사 등록 | 수동 | Playwright로 `/api/cron/auto-press?preview=true` |

### Wave 0 갭
- [ ] `scripts/test-newswire-extract.mjs` — 뉴스와이어 본문 추출 단위 테스트
- [ ] 빌드 성공 확인: `pnpm build`

## Sources

### Primary (HIGH)
- 뉴스와이어 RSS 실제 fetch 테스트: `https://api.newswire.co.kr/rss/industry/1200` — 2026-03-26 확인
- 뉴스와이어 기사 HTML 실제 분석: `https://www.newswire.co.kr/newsRead.php?no=1031104` — 2026-03-26 확인
- 프로젝트 소스 코드 직접 분석: route.ts, html-extract.ts, auto-defaults.ts, article.ts

### Secondary (MEDIUM)
- 기존 테스트 스크립트: `scripts/test-newswire.mjs`, `scripts/test-newswire2.mjs`

## Metadata

**신뢰도 상세:**
- RSS 구조: HIGH — 실제 fetch 테스트 완료
- HTML 구조: HIGH — 실제 페이지 분석 완료
- 코드 변경 지점: HIGH — 소스 코드 직접 분석
- 본문 추출 정규식: MEDIUM — 여러 기사에서 추가 검증 필요

**조사일:** 2026-03-26
**유효 기간:** 30일 (뉴스와이어 페이지 구조 변경 가능성 낮음)
