# 컬처피플 프런트 인터페이스/공개 구성 점검 및 개선 기획서

작성일: 2026-07-18 KST  
대상: `https://culturepeople.co.kr` 운영 사이트  
범위: 공개 프런트 화면, SEO/색인 표면, 푸터/메뉴 구성, 광고/검색/기사 UI, 운영 검증 흐름

## 1. 목적

컬처피플 공개 사이트가 독자, 검색엔진, 광고 심사, 운영자 관점에서 정상적으로 보이고 동작하는지 점검하고, 실제 수정이 필요한 프런트/구성 과제를 우선순위화한다.

이 문서는 점검 기준과 실제 구현·검증·배포 상태를 함께 기록하는 운영 문서다. 서비스 중단, 운영 DB 대량 쓰기, 라이브 URL 대량 호출 없이 수정 가능한 항목부터 처리한다.

## 1-1. 적용 현황 (2026-07-19, monet-registry-main 코드 반영)

아래 항목은 문서 작성 이후 실제 코드와 운영에 반영한 결과다. 2026-07-19 기준 `pnpm ci:typecheck`, `pnpm test:unit`(82개 파일, 379개 테스트), production build, portal verify, 운영 공개 브라우저 스모크가 통과했다. 수정본은 Vercel production 배포 `dpl_2FY1fDkWeWbp86HYn94N8V7M566L`로 배포해 `https://culturepeople.co.kr` alias까지 적용했다.

| 과제 | 상태 |
| --- | --- |
| P0-001 푸터 링크 404 | 적용됨 — `/contact`, `/advertising`, `/youth-policy` 신규 페이지 생성, RSS를 `/rss.xml`로 통일 |
| P0-002 뉴스레터 설정 API 403 | 제외됨 — 뉴스레터 기능 자체를 쓰지 않기로 해 API를 고치는 대신 공개 기사 페이지의 `NewsletterWidget` 호출을 제거 |
| P0-003 푸터 회사 정보 누락 | 적용됨 — `cp-site-settings` 비었을 때 `cp-about` fallback, 필드명 매핑, 빈 구분자 제거 |
| P0-004 운영용 아닌 공개 경로 노출 | 적용됨 — 6개 내부 경로에 noindex 레이아웃 추가, `robots.txt` Disallow 반영 |
| P0-005 게시 기사 NOINDEX 재발 방지 | 운영 반영 완료 — 게시 기사는 indexable, 미게시/삭제 기사는 실제 404, UUID 및 확인된 과거 중복 번호는 영구 리다이렉트. 배포 후 라이브 감사 blocking 0건 |
| P1-001 모바일 홈 광고 배치 | 적용됨 — 광고를 뉴스 2행(카테고리 4개) 뒤로 이동, 광고 고지 문구 줄 분리 |
| P1-002 최종편집 시간 의미 정정 | 적용됨(축소 버전) — 실제 데이터 연동 대신 라벨을 `현재시각`으로 정정 |
| P1-003 색상 체계 일관화 | 부분 적용됨 — `getSiteAccentColor()` 헬퍼 추가, 검색/기사 공유·댓글/about/privacy/terms/reporter/에러 페이지까지 정리. 단, 쿠팡 가격색·netpro 폴백·관리자/편집기 전용 빨간색은 잔여 |
| P1-004 캐시/성능 정책 재검토 | 부분 적용 — 홈 60초, 기사·카테고리 300초 정책과 DB read `unstable_cache`/`articles` 태그를 적용. 루트 요청별 CSP nonce 때문에 페이지 응답은 동적이며 보안 정책은 유지 |
| P1-005 검색 페이지 정책 명확화 | 미착수 — Search Console 확인은 대표자 몫 |
| P2-001 브라우저 스모크 기준 보정 | 코드·운영 검증 완료 — `--public-site-only`, 데스크톱/모바일, 검색 오버레이, 모바일 메뉴, 외부 광고 warning 분리, 동일 출처 오류 실패 기준 반영 |
| P2-002 카테고리 정규화 | 코드·dry-run 완료, DB 미적용 — 7개 표준 분류, auto-press/Worker/재시도 매핑, 원분류 태그 보존, 감사·계획·rollback 산출물 구현. 3,808건 중 후보 332건 |
| P2-003 정적 정책 페이지 canonical/메타 점검 | 적용됨 — about/privacy/terms/contact/advertising/youth-policy 6개 페이지 모두 canonical 누락을 발견해 추가 |

## 1-2. 재검토 결론과 상태 정의

전반적인 방향은 맞다. 2026-07-19 운영 배포 이후에는 `운영 반영 완료`로 명시한 항목만 실제 사용자 기준 검증까지 끝난 것으로 본다. `부분 적용`, `대표자 확인 필요`, `DB 미적용` 항목은 배포 여부와 관계없이 계속 남은 과제다.

상태 정의:

- `코드 반영`: 로컬 코드에 수정이 들어감.
- `테스트 통과`: 로컬 타입체크/단위 테스트 통과.
- `배포 확인 필요`: Vercel 운영 배포 후 `curl`/브라우저로 운영 URL 확인 필요.
- `대표자 확인 필요`: 법적 정보, 콘솔 affected URL, 광고 정책처럼 코드만으로 확정할 수 없는 항목.
- `미착수`: 다음 개발 작업으로 남은 항목.

현재 문서에서 보정해야 할 점:

- P0-001, P0-003, P0-004, P1-001, P1-002, P2-003은 코드 반영 기준으로 맞다. 운영 반영 여부는 별도 검증해야 한다.
- P0-002는 “뉴스레터 API를 고쳤다”가 아니라 “공개 화면에서 위젯 호출을 제거해 403 발생 경로를 없앴다”가 정확하다. 뉴스레터를 다시 쓰려면 공개 subset API를 신규 구현해야 한다.
- P1-003은 운영 주요 화면 기준으로는 대부분 반영됐지만, `CoupangAutoAd.tsx` 가격색과 `netpro` 폴백 카테고리 컴포넌트에는 빨간색 상수가 남아 있다. 현재 운영 `siteType=culturepeople` 기준으로는 치명적이지 않지만, “완전 일괄 제거”라고 쓰면 과장이다.
- P1-004는 DB 조회 캐시와 페이지 응답 캐시를 구분해야 한다. `serverGetSetting()`은 `unstable_cache`를 쓰지만, 홈은 `force-dynamic`이라 페이지 응답은 매번 동적 렌더링된다.
- P2-001은 단순 테스트 수정이 아니라 “운영 smoke”와 “개발/레지스트리 smoke”를 분리해야 한다.
- P0-005는 `scripts/audit-article-noindex.mjs`, `tmp/noindex-urls.txt`, `src/lib/article-legacy-redirects.ts` 및 관련 테스트까지 로컬에 반영된 상태다. 확인된 과거 중복 번호 `23→275`, `25→187`, `27→229`, `33→180`, `34→197`만 영구 리다이렉트하며, 그 밖의 삭제·미게시·위험 가능 기사는 복원하지 않고 404로 유지한다.
- 실제 체크아웃은 디스크 UUID 마운트 이름 변동으로 `/media/arbada/96B82074B82055511/Users/Documents/monet-registry-main`에 있다. 문서와 명령은 홈 경로 하드코딩보다 저장소 현재 경로 또는 UUID 기반 탐색을 우선한다.

## 2. 점검 대상과 검증 근거

### 확인한 운영 페이지

- 홈: `/`
- 기사 상세: `/article/3993`
- 카테고리: `/category/문화`
- 검색: `/search?q=치유`
- 회사소개: `/about`
- 포털 표면: `/ads.txt`, `/rss.xml`, `/feed.xml`, `/sitemap.xml`, `/news-sitemap.xml`, `/robots.txt`

### 실행한 주요 검증

- 브라우저 렌더링 점검: 데스크톱 `1365~1440px`, 모바일 `390px`
- 스크린샷 리포트: `/tmp/culturepeople-ui-audit-20260718/report.json`
- 공개 표면 검증:
  - `pnpm verify:portal -- --base https://culturepeople.co.kr`
  - 결과: 통과
- 기존 브라우저 스모크:
  - `pnpm smoke:browser -- --base-url=https://culturepeople.co.kr --no-auto-start --no-admin-auth --no-article-fixture --json`
  - 결과: 실패
  - 해석: 일부는 테스트 기준 문제지만, 일부는 실제 수정 대상이다.

## 3. 현재 정상 항목

- 홈, 기사 상세, 카테고리, 검색, 회사소개가 모두 `200`으로 열림.
- 데스크톱/모바일에서 명확한 가로 스크롤 깨짐은 확인되지 않음.
- 홈/기사/카테고리 이미지는 스크롤 후 재검증 시 모두 정상 로딩됨.
- 홈, 기사, 카테고리, 회사소개는 `index, follow` 상태.
- 검색 페이지는 `noindex, nofollow` 상태이며, 검색결과 페이지 정책으로는 정상으로 볼 수 있음.
- `/ads.txt`, `/rss.xml`, `/feed.xml`, `/sitemap.xml`, `/news-sitemap.xml` 표면 검증은 통과.
- `/robots.txt`는 `/cam`, `/api` 차단 및 sitemap 선언이 들어가 있음.

## 4. 핵심 문제 요약

### P0-001 푸터 링크 404

**적용 상태: 적용됨 (2026-07-18)** — `src/app/contact/page.tsx`, `src/app/advertising/page.tsx`, `src/app/youth-policy/page.tsx` 신규 생성. `CulturePeopleFooter.tsx`/`InsightKoreaFooter.tsx`의 RSS 링크를 `/rss.xml`로 변경.

실제 완료 단계:

- 코드 반영: 완료
- 로컬 테스트: 완료
- 운영 배포 확인: 완료 (`/contact`, `/advertising`, `/youth-policy` 200)
- 대표자 문구 확인: 필요

목적: 공개 사이트에서 사용자가 누르는 푸터 링크가 404로 떨어지지 않게 한다.

현재 상태:

- 운영 설정 `cp-menus`에 아래 푸터 링크가 존재한다.
  - `/youth-policy`
  - `/advertising`
- 기본 푸터 컴포넌트에도 `/contact` 링크가 포함되어 있다.
- 실제 운영 응답:
  - `/contact`: 404
  - `/advertising`: 404
  - `/youth-policy`: 404
  - `/terms`: 200
  - `/privacy`: 200

개발 범위:

- `/contact`, `/advertising`, `/youth-policy` 중 실제 공개해야 할 페이지를 구현하거나 기존 `/terms` 탭/섹션으로 연결한다.
- 푸터 메뉴 기본값과 운영 DB 메뉴가 없는 경로를 만들지 않도록 방어한다.
- RSS 링크는 `/api/rss`보다 공개 표준 경로인 `/rss.xml`로 정리한다.

제외 범위:

- 네이버/다음 뉴스 제휴 신청 페이지 구현.
- 대량 메뉴 DB 재작성.

검증 명령:

```bash
curl -sIL https://culturepeople.co.kr/contact
curl -sIL https://culturepeople.co.kr/advertising
curl -sIL https://culturepeople.co.kr/youth-policy
curl -sIL https://culturepeople.co.kr/rss.xml
```

완료 기준:

- 푸터에서 노출되는 모든 내부 링크가 `200` 또는 의도된 `3xx`로 응답.
- 브라우저 콘솔에서 푸터 프리패치 404가 사라짐.

리스크:

- 법적 고지 성격의 페이지 내용은 대표자 확인이 필요하다.
- 특히 `/youth-policy` 기본값에 임시 인명/연락처가 남아 있으면 운영 신뢰도 문제가 되므로 배포 전후 반드시 실제 정보로 확인해야 한다.

### P0-002 뉴스레터 설정 API 403

**적용 상태: 제외됨 (2026-07-18)** — 뉴스레터 기능을 쓰지 않기로 결정해 API를 공개 subset으로 고치는 대신, `article/[id]/page.tsx`·`CulturePeopleArticlePage.tsx`·`InsightKoreaArticlePage.tsx`·`ArticleSidebar.tsx`에서 `NewsletterWidget` 호출 자체를 제거했다. `NewsletterWidget.tsx` 파일과 뉴스레터 API/관리자 설정 화면은 그대로 남아 있다(삭제하지 않음).

실제 완료 단계:

- 공개 기사 화면에서 403 발생 경로 제거: 코드 반영 완료
- 뉴스레터 기능 복구용 공개 설정 API: 미구현
- 운영 배포 확인: 완료 (운영 공개 기사 smoke 통과)

향후 뉴스레터를 다시 켤 때의 구현 방식:

- `cp-newsletter-settings` 전체를 공개키로 추가하지 않는다.
- 새 API 예시: `GET /api/newsletter/public-settings`
- 응답 예시: `{ "success": true, "enabled": true }`
- 금지 필드: `smtpHost`, `smtpUser`, `smtpPass`, `senderEmail`, `replyToEmail`, API key류
- `NewsletterWidget`은 `getSetting("cp-newsletter-settings")` 대신 이 공개 API만 호출한다.

목적: 공개 기사 페이지에서 불필요한 403 콘솔 오류를 없애고, 민감 정보는 노출하지 않는다.

현재 상태:

- 기사 상세에서 `NewsletterWidget`이 `getSetting("cp-newsletter-settings")`를 호출한다.
- `/api/db/settings?key=cp-newsletter-settings&fallback={}`는 비인증 공개 요청에서 `403`.
- `cp-newsletter-settings`에는 SMTP 비밀번호 같은 민감 정보가 있을 수 있어 전체 공개 허용은 부적절하다.

개발 범위:

- 공개용 뉴스레터 설정 endpoint 또는 safe subset 응답을 추가한다.
- 공개 응답에는 `enabled` 등 화면 렌더링에 필요한 값만 포함한다.
- 기존 관리자 설정 화면의 민감값 마스킹 정책은 유지한다.

제외 범위:

- SMTP 설정 변경.
- 뉴스레터 발송 로직 변경.

검증 명령:

```bash
curl -sI https://culturepeople.co.kr/article/3993
pnpm smoke:browser -- --base-url=https://culturepeople.co.kr --no-auto-start --no-admin-auth --no-article-fixture --json
```

완료 기준:

- 기사 상세에서 `/api/db/settings?key=cp-newsletter-settings...` 403이 발생하지 않음.
- 공개 응답에 SMTP host/user/pass 등 민감값이 노출되지 않음.

리스크:

- `cp-newsletter-settings` 자체를 공개키로 추가하면 민감값 노출 위험이 있다. 반드시 공개 subset으로 처리해야 한다.
- 현재는 `NewsletterWidget`이 파일로 남아 있으므로, 나중에 실수로 import를 되살리면 403이 재발할 수 있다. 이를 막으려면 “뉴스레터 위젯은 공개 subset API가 생기기 전까지 public article에서 import 금지” 테스트를 추가하는 것이 좋다.

### P0-003 푸터 회사 정보 누락

**적용 상태: 적용됨 (2026-07-18)** — `CulturePeopleFooter.tsx`/`InsightKoreaFooter.tsx`에 `mergeSiteWithAbout()` fallback과 `FooterInfoRow` 동적 렌더링(빈 값 뒤 구분자 제거)을 추가.

실제 완료 단계:

- 코드 반영: 완료
- 로컬 테스트: 완료
- 운영 배포 확인: 완료 (운영 푸터 렌더링 확인)
- 법적 정보 정확성 확인: 대표자 필요

목적: 푸터 하단의 매체/회사 정보가 빈 줄 또는 `|`만 남는 상태를 없앤다.

현재 상태:

- `/about` 페이지는 `cp-about`에서 회사 정보를 읽고 정상 표시한다.
- 운영 `cp-about`에는 회사명, 대표자, 사업자번호, 주소, 이메일 등이 있다.
- 운영 `cp-site-settings`는 `{}`이다.
- `CulturePeopleFooter`는 `cp-site-settings`를 읽어 푸터 정보를 구성하므로 대부분 비어 보인다.

개발 범위:

- 푸터가 `cp-site-settings` 값이 비어 있으면 `cp-about` 값을 fallback으로 사용하게 한다.
- 필드명 차이를 정리한다.
  - `bizNumber` ↔ `registerNo` 또는 `businessNumber`
  - `companyName` ↔ `siteName`
  - `ceo`, `publisher`, `editor`, `address`, `email`
- 빈 값 뒤에 구분자 `|`가 남지 않도록 렌더링을 정리한다.

제외 범위:

- 대표자/발행인 실명 변경. 법적 정보는 대표자가 최종 확인한다.

검증 명령:

```bash
curl -sL 'https://culturepeople.co.kr/api/db/settings?key=cp-about&fallback={}'
curl -sL 'https://culturepeople.co.kr/api/db/settings?key=cp-site-settings&fallback={}'
```

완료 기준:

- 푸터에 회사명, 대표자/발행인/편집인, 사업자번호, 주소, 이메일 중 보유한 값이 표시됨.
- 값이 없는 필드 때문에 빈 줄이나 남는 구분자가 보이지 않음.

리스크:

- `cp-about`와 `cp-site-settings` 양쪽에 서로 다른 값이 있을 경우 우선순위 규칙이 필요하다.
- 현재 구현 우선순위는 `cp-site-settings` 값 우선, 비어 있으면 `cp-about` fallback이다. 운영자가 관리자 설정에서 둘 중 하나만 수정하면 푸터/회사소개가 달라질 수 있으므로 장기적으로는 저장 시 동기화 또는 관리자 화면 안내가 필요하다.

### P0-004 운영용이 아닌 공개 경로 노출

**적용 상태: 적용됨 (2026-07-18)** — `example`, `live-preview`, `page-live-preview`, `live-preview-render`, `page-live-preview-render`, `smoke` 6개 경로에 `noindex` `layout.tsx` 추가. `src/lib/seo-robots.ts`의 `buildDefaultRobotsTxt()`에 해당 경로 `Disallow` 규칙 반영(기존 `robots-txt-route.test.ts` 갱신).

목적: 검색엔진과 일반 사용자에게 컴포넌트 레지스트리/프리뷰/스모크 페이지가 공개 뉴스 사이트처럼 노출되지 않게 한다.

현재 상태:

- 기존 스모크가 `/example/registry`를 운영 사이트에서 열었고 `200` 응답을 받았다.
- 이 경로는 컬처피플 뉴스 독자용 페이지가 아니라 내부 컴포넌트/프리뷰 성격이다.
- sitemap 검증에서는 `/smoke`, `/api`, `/cam` 제외가 확인됐지만, 레지스트리/프리뷰 경로 전체가 색인 차단되어 있는지는 별도 확인이 필요하다.

개발 범위:

- 운영 환경에서 `/example/registry`, `/live-preview/*`, `/page-live-preview/*`, `/smoke/*`를 `noindex` 처리하거나 관리자/개발 전용으로 제한한다.
- 최소한 `robots.txt`와 페이지 메타에 색인 방지 정책을 일관되게 반영한다.
- 공개 스모크 테스트는 운영 페이지 중심으로 분리한다.

제외 범위:

- 레지스트리 개발 기능 삭제.

검증 명령:

```bash
curl -sL https://culturepeople.co.kr/example/registry | grep -i robots
curl -sI https://culturepeople.co.kr/smoke/article-embed
curl -sL https://culturepeople.co.kr/robots.txt
```

완료 기준:

- 운영용이 아닌 경로가 검색 색인 대상에서 제외된다.
- 공개 sitemap에 내부 개발/프리뷰 경로가 포함되지 않는다.

리스크:

- 개발자가 운영 URL에서 프리뷰를 확인하던 흐름이 있으면 대체 경로가 필요하다.

## 5. P1 개선 과제

### P1-001 모바일 홈 광고 배치 조정

**적용 상태: 적용됨 (2026-07-18)** — `CulturePeopleLanding.tsx`에서 `home-mid-1` 광고를 카테고리 2행(4개) 뒤로 이동. `CoupangAutoAd.tsx`의 "추천 상품" 제목과 광고 고지 문구를 flex 한 줄에서 세로 2줄로 분리.

현재 상태:

- 모바일 홈에서 뉴스보다 쿠팡 추천 상품이 너무 빨리 노출된다.
- `추천 상품` 제목과 광고 고지 문구가 좁은 폭에서 어색하게 줄바꿈된다.

개발 범위:

- 모바일에서는 최소 2~3개 뉴스 섹션 이후 광고를 노출한다.
- 광고 고지 문구는 제목 옆이 아니라 별도 작은 줄로 분리한다.
- 광고 영역 높이와 카드 폭을 모바일 기준으로 재조정한다.

완료 기준:

- 모바일 첫 화면과 두 번째 화면에서 뉴스 사이트라는 인상이 먼저 보인다.
- 광고 고지 문구가 겹치거나 어색하게 분리되지 않는다.

### P1-002 최종편집 시간 의미 정정

**적용 상태: 적용됨(축소 버전) (2026-07-18)** — 실제 최신 기사 시각 연동은 여러 페이지에 데이터를 새로 꿰어야 해서 리스크 대비 이득이 낮다고 판단, 문서가 제시한 대안대로 `CulturePeopleHeader.tsx`/`InsightKoreaHeader.tsx`의 라벨을 "최종편집"→"현재시각"으로만 정정.

현재 상태:

- 헤더의 `최종편집`은 실제 최신 기사 수정 시각이 아니라 클라이언트 현재 시간을 표시한다.
- 독자에게 실제 편집 시각처럼 보일 수 있어 신뢰도 문제가 생긴다.

개발 범위:

- 최신 게시 기사 `updatedAt` 또는 `date` 기준으로 서버에서 계산한다.
- 실제 계산이 어려우면 라벨을 `현재시각` 등으로 바꾼다.

완료 기준:

- `최종편집` 라벨이 실제 데이터 의미와 일치한다.

### P1-003 색상 체계 일관화

**적용 상태: 부분 적용됨 (2026-07-18)** — `src/lib/site-type.ts`에 `getSiteAccentColor()` 추가. 검색(`SearchContent.tsx`), 기사 공유/댓글(`ArticleShare.tsx`, `CommentSection.tsx`), `about`/`privacy`/`terms`/`reporter`/`tag`, 에러·404 페이지까지 정리. 실제 범위는 문서 작성 시점 예상("검색 페이지 버튼/카테고리 뱃지/일부 기사 위젯")보다 넓어서 `reporter` 페이지 등도 포함해 처리함. 다만 `CoupangAutoAd.tsx` 상품 가격색, `category/[slug]`의 `netpro` 폴백 컴포넌트, 일부 관리자/편집기 전용 컴포넌트에는 빨간색 상수가 남아 있다. 현재 운영 siteType(`culturepeople`) 주요 공개 경로에서는 낮은 리스크다.

추가 정리 방식:

- 공개 공유 컴포넌트에는 `accent?: string` prop을 추가한다.
- `CoupangAutoAd`는 가격색을 브랜드 컬러로 바꿀지, 상품/커머스 강조색으로 유지할지 운영 정책을 먼저 정한다.
- `category/[slug]` 폴백과 `ArticleSidebar`는 `netpro` 테마 유지가 목적이면 빨간색 유지 가능, 컬처피플 전용이라면 `getSiteAccentColor()`를 주입한다.
- 관리자/편집기 전용 빨간색은 공개 프런트 범위 밖이므로 별도 관리자 UI 정리 과제로 분리한다.

현재 상태:

- 컬처피플 메인 테마는 보라색 계열이다.
- 검색 페이지 버튼/카테고리 뱃지/일부 기사 위젯은 빨간색 `#E8192C`를 사용한다.

개발 범위:

- 검색, 뉴스레터, 기사 상세 보조 UI의 포인트 컬러를 컬처피플 브랜드 컬러로 맞춘다.
- InsightKorea 등 다른 테마와 공유 중인 컴포넌트는 siteType별 색상 토큰을 사용한다.

완료 기준:

- 공개 사이트 주요 화면의 브랜드 컬러가 일관된다.

### P1-004 캐시/성능 정책 재검토

**적용 상태: 부분 적용·운영 확인 완료 (2026-07-19)** — 홈 `force-dynamic`을 제거하고 `revalidate=60`, 기사·카테고리를 `revalidate=300`으로 조정했다. `src/lib/db-server.ts` 공개 조회에 60/300초 `unstable_cache`와 `articles` 태그를 적용했고 생성·수정·삭제·예약게시·worker-notify의 기존 `revalidateTag("articles")` 연결을 확인했다. 운영 배포 후에도 루트 `headers()`와 요청별 CSP nonce 때문에 페이지 응답은 `private, no-cache, no-store`, `x-vercel-cache: MISS`로 유지된다. 보안을 약화시키는 페이지 정적 캐시는 적용하지 않았다.

현재 상태:

- 홈/기사/카테고리/검색 응답이 `private, no-cache, no-store`로 확인됐다.
- `x-vercel-cache: MISS`가 반복된다.
- 2026-07-19 새 운영 배포에서도 `/`, `/article/3993`, `/category/문화`, `/search?q=치유`는 `private, no-cache, no-store`, `x-vercel-cache: MISS`다.
- 로컬 코드는 데이터 조회 캐시를 적용했지만 루트 CSP nonce 때문에 페이지 응답 자체는 동적이다.

개발 범위:

- 홈/카테고리/기사 페이지가 짧은 `revalidate` 또는 태그 기반 캐시를 쓸 수 있는지 점검한다.
- 게시/수정/삭제 시 캐시 무효화가 이미 연결되어 있는지 확인한다.
- 검색 페이지는 동적 유지 가능.

구체 구현안:

1. 현황 측정
   - 운영 배포 전후 `curl -sIL`로 `cache-control`, `x-vercel-cache`, 응답 시간을 기록한다.
   - 대상은 `/`, `/article/3993`, `/category/문화`, `/search?q=치유`로 제한한다.
2. 홈 페이지 분리
   - `src/app/page.tsx`의 `force-dynamic` 제거 가능 여부를 먼저 검토한다.
   - `serverGetHomeArticles(HOME_ARTICLE_LIMIT)`가 D1/Supabase adapter에서 이미 필요한 최신 기사만 가져오는지 확인한다.
   - 홈은 `export const revalidate = 60` 또는 `300`부터 시작한다.
3. 기사/카테고리 페이지
   - 이미 `revalidate = 3600`이 있으므로 실제 헤더가 `no-store`가 되는 원인을 확인한다.
   - middleware/CSP nonce, `headers()` 사용, 동적 fetch 옵션이 페이지 캐시를 깨는지 점검한다.
4. 캐시 무효화
   - 기사 생성/수정/삭제, auto-press worker notify, publish cron에서 `revalidateTag("articles")`가 호출되는지 유지한다.
   - 필요 시 홈/카테고리/기사 경로별 `revalidatePath()`를 최소 추가한다.
5. 안전 장치
   - 기사 게시 직후 홈 노출이 5분 이상 늦어지면 캐시 정책을 되돌린다.

수정 후보 파일:

- `src/app/page.tsx`
- `src/app/article/[id]/page.tsx`
- `src/app/category/[slug]/page.tsx`
- `src/lib/db-server.ts`
- `src/app/api/db/articles/route.ts`
- `src/app/api/auto-press/worker-notify/route.ts`
- `scripts/verify-portal-surface.mjs` 또는 신규 성능 점검 스크립트

dry-run 검증 명령:

```bash
curl -sIL https://culturepeople.co.kr/ | grep -iE 'cache-control|x-vercel-cache|date'
curl -sIL https://culturepeople.co.kr/article/3993 | grep -iE 'cache-control|x-vercel-cache|date'
curl -sIL https://culturepeople.co.kr/category/%EB%AC%B8%ED%99%94 | grep -iE 'cache-control|x-vercel-cache|date'
```

완료 기준:

- 공개 뉴스 페이지의 불필요한 매 요청 서버 렌더링을 줄인다.
- 기사 게시 직후 반영성은 유지한다.

리스크:

- 캐시를 과하게 적용하면 최신 기사 반영이 늦어질 수 있다.
- CSP nonce나 사용자별 헤더 의존성이 있으면 페이지 캐시가 기대처럼 동작하지 않을 수 있다.
- 운영 DB 장애 시 캐시가 완충 역할을 할 수도 있지만, 오래된 기사를 오래 노출할 수 있다.

### P1-005 검색 페이지 정책 명확화

**적용 상태: 미착수** — Search Console affected URL 확인은 대표자 콘솔 작업이라 코드로 처리 불가.

현재 상태:

- `/search`는 `noindex, nofollow`이다.
- 검색결과 페이지라면 정상 정책이지만, Search Console의 `NOINDEX` 경고가 어떤 URL을 가리키는지 확인해야 한다.

개발 범위:

- Search Console에서 affected URL 목록을 수동 확인한다.
- 검색/관리자/프리뷰 URL이면 유지한다.
- 기사/카테고리/홈 URL이면 원인 조사한다.

구체 처리 기준:

- `/search`, `/cam/*`, `/api/*`, `/example/*`, `/live-preview/*`, `/page-live-preview/*`, `/smoke/*`가 affected URL이면 정상 또는 의도된 차단으로 기록한다.
- `/article/*`, `/category/*`, `/tag/*`, `/reporter/*`, `/about`, `/privacy`, `/terms`, `/contact`, `/advertising`, `/youth-policy`가 affected URL이면 의도치 않은 문제로 본다.
- affected URL이 `?page=`, `?items=`, 검색 파라미터 등 중복/필터 URL이면 canonical 정책과 함께 판단한다.

대표자 확인 절차:

1. Google Search Console 접속
2. 색인 생성 > 페이지 > `NOINDEX 태그에 의해 제외되었습니다`
3. affected URL 예시 10개를 복사
4. 각 URL을 아래 명령으로 확인

```bash
curl -sL '<URL>' | grep -iE 'robots|canonical|<title>'
curl -sIL '<URL>' | grep -iE 'HTTP/|x-robots-tag|cache-control'
```

완료 기준:

- 의도된 `noindex`와 의도치 않은 `noindex`가 구분된다.

## 6. P2 정리 과제

### P2-001 브라우저 스모크 기준 보정

**적용 상태: 코드 반영·운영 통과 (2026-07-19)** — `--public-site-only`를 구현했고 운영 홈·검색·문화 카테고리·about·contact·advertising·youth-policy·자동 발견 기사 `/article/3993`를 데스크톱/모바일에서 통과했다. Google/Coupang 광고 iframe과 광고 스크립트 오류는 warning으로 분리하고 동일 출처 오류는 실패로 유지한다.

현재 상태:

- 기존 `pnpm smoke:browser`는 외부 Google 광고 스크립트 오류 `Y`와 광고 품질 프레임을 사이트 장애로 오판했으나 판정 기준을 보완해 운영 smoke가 통과한다.
- 홈 검색 입력창은 기본 노출이 아니라 오버레이 버튼 클릭 후 노출되는 구조이므로 기존 기준이 부정확하다.
- 광고 iframe은 테스트상 `unsafeFrames`로 잡히지만, 외부 광고 특성상 별도 allowlist 또는 운영용 smoke 기준이 필요하다.

개발 범위:

- 공개 운영 smoke와 개발 fixture smoke를 분리한다.
- 홈 검색은 버튼 클릭 후 input을 확인한다.
- Google/Coupang 광고 iframe은 별도 allowlist 또는 경고 수준으로 낮춘다.
- `/example/registry` 검증은 운영 smoke에서 제외하거나 내부 경로 보호 검증으로 바꾼다.

구체 구현안:

- `scripts/browser-smoke.mjs`에 `--public-site-only` 옵션을 추가한다.
- `--public-site-only`에서는 다음만 확인한다.
  - `/`
  - `/search?q=뉴스`
  - 자동 발견된 `/article/{no}`
  - `/category/문화`
  - `/about`
  - `/contact`
  - `/advertising`
  - `/youth-policy`
- `--public-site-only`에서는 `/example/registry`, `/cam/articles/new`, `/cam/popups`를 제외한다.
- 홈 검색은 `button[aria-label="검색"]` 클릭 후 `input[name="q"]`가 생기는지 확인한다.
- 광고 iframe은 다음 기준으로 처리한다.
  - `googlesyndication`, `doubleclick`, `google.com/recaptcha`, `ads-partners.coupang.com`은 실패가 아니라 `warnings`로 기록한다.
  - 동일 출처 4xx/5xx는 실패 유지.
- 내부 경로 색인 차단은 별도 `--internal-noindex` 옵션 또는 `verify:portal` 확장으로 확인한다.

수정 후보 파일:

- `scripts/browser-smoke.mjs`
- `tests/unit` 신규 또는 기존 smoke 스크립트 테스트
- 필요 시 `scripts/verify-portal-surface.mjs`

검증 명령:

```bash
pnpm smoke:browser -- --base-url=http://127.0.0.1:3000 --public-site-only --no-admin-auth --json
pnpm smoke:browser -- --base-url=https://culturepeople.co.kr --public-site-only --no-auto-start --no-admin-auth --json
```

완료 기준:

- 실제 장애와 테스트 기준 문제를 분리해서 볼 수 있다.
- 운영 smoke가 내부 개발 경로 때문에 실패하지 않는다.
- 공개 화면의 동일 출처 4xx/5xx, 검색 오버레이, 기사/카테고리 링크는 계속 검증한다.

### P2-002 카테고리 정규화

**적용 상태: 코드·dry-run 완료, 운영 DB 미적용 (2026-07-19)** — 7개 표준 카테고리 정책, 신규 auto-press/재시도/Cloudflare Worker 저장 경로 정규화, 원분류 태그 보존, 검색 필터, 감사·dry-run·rollback 산출물을 구현했다. 실제 일괄 변경은 실행하지 않았다.

현재 상태:

- 검색 필터에 `news`, `공연`, `공연 예술`, `공연예술` 등 유사/혼합 카테고리가 보인다.

개발 범위:

- 운영 카테고리 taxonomy 기준을 정한다.
- 보도자료 자동등록 시 카테고리 매핑을 정규화한다.
- 기존 기사 카테고리 일괄 정리 작업은 dry-run부터 시작한다.

구체 구현안:

1. 표준 카테고리 정의
   - 운영 1차안: `문화`, `엔터`, `스포츠`, `라이프`, `테크·모빌리티`, `비즈`, `공공`
   - `공연`, `공연 예술`, `공연예술`, `출판`, `문학`은 세부 태그 또는 문화 하위 분류로 흡수할지 결정한다.
2. 자동등록 매핑
   - auto-press source/category 추론 결과를 표준 카테고리로 매핑한다.
   - 원본 분류는 `tags` 또는 `sourceCategory` 필드에 보존한다.
3. 기존 기사 dry-run
   - 기존 기사 전체를 읽어 현재 카테고리 분포와 변경 후보 수를 CSV/JSON으로 출력한다.
   - 기본은 dry-run, `--apply`가 있을 때만 DB 수정한다.
4. UI 반영
   - 검색 필터에는 표준 카테고리만 노출한다.
   - 세부 분류는 태그 또는 별도 필터로 분리한다.

수정 후보 파일/스크립트:

- 신규: `scripts/audit-culturepeople-categories.mjs`
- 신규: `scripts/normalize-culturepeople-categories.mjs`
- `src/lib/auto-press-source-selection.ts`
- `src/lib/auto-defaults.ts`
- `src/app/search/page.tsx`
- `src/app/search/components/SearchContent.tsx`

dry-run 명령:

```bash
pnpm category:audit -- --root "$HOME/culturepeople-backups"
pnpm category:normalize -- --dry-run
```

두 명령은 구현 완료됐다. `category:normalize`은 기본 dry-run이고 실제 쓰기는 provider, 확인문구, 최대 변경 건수와 `--apply`를 모두 요구한다.

완료 기준:

- 검색/카테고리 화면의 필터가 독자에게 이해 가능한 수준으로 정리된다.
- 자동 보도자료 등록 시 표준 카테고리 밖 값이 새로 증가하지 않는다.
- 기존 기사 변경은 dry-run 보고서와 대표자 승인 후 적용한다.

### P2-003 정적 정책 페이지 canonical/메타 점검

**적용 상태: 적용됨 (2026-07-18)** — `/about`, `/privacy`, `/terms`, `/contact`, `/advertising`, `/youth-policy` 6개 페이지 전부 canonical 태그가 아예 없던 것을 확인해 `metadata.alternates.canonical`을 추가. `/tag`, `/reporter`는 이미 정상.

현재 상태:

- 홈/기사/카테고리/검색은 canonical 확인됨.
- `/about`은 별도 canonical 출력 여부를 추가 확인할 필요가 있다.

개발 범위:

- `/about`, `/privacy`, `/terms`, 신규 `/contact`, `/advertising`, `/youth-policy`의 title/description/canonical/robots를 정리한다.

완료 기준:

- 공개 정책 페이지가 검색엔진에 일관된 메타 정보를 제공한다.

## 7. 대표자가 직접 확인할 항목

- Search Console에서 `NOINDEX` affected URL 목록 확인.
- 푸터/회사소개에 표시할 법적 정보 최종 확인.
  - 회사명
  - 대표자
  - 발행인
  - 편집인
  - 사업자등록번호
  - 인터넷신문 등록번호가 있다면 등록번호/등록일
  - 청소년보호책임자
  - 주소
  - 연락 이메일
- 광고안내/기사제보/정정·반론보도 요청 페이지에 공개할 연락처 확인.
- 쿠팡/AdSense 광고를 홈 상단에 어느 정도 노출할지 운영 정책 결정.

## 8. 개발 우선순위

현재 코드 반영 이후 실제 우선순위는 아래처럼 재정렬한다.

1. `pnpm deploy:culturepeople -- --check-token`으로 프로젝트 보안 파일 자동 로딩을 확인한 뒤 production 배포와 alias 확인
2. 배포 후 신규 페이지, legacy redirect 5건, 삭제 기사 404 8건, canonical/NOINDEX 재감사
3. Search Console에서 정상 게시 기사 11건의 라이브 URL 테스트·색인 요청·유효성 검사
4. `/youth-policy`의 임시 인명 `홍길동`과 법적 연락처를 대표자 확인값으로 교체
5. Supabase 복구 후 공개 기사 포함 브라우저 스모크와 카테고리 dry-run 재생성
6. 카테고리 실제 적용은 별도 대표자 승인 후 provider 단위 소량 batch로 진행

배포 전 최소 확인:

```bash
pnpm ci:typecheck
pnpm test:unit
```

배포 후 최소 확인:

```bash
pnpm verify:portal -- --base https://culturepeople.co.kr
curl -sIL https://culturepeople.co.kr/contact
curl -sIL https://culturepeople.co.kr/advertising
curl -sIL https://culturepeople.co.kr/youth-policy
curl -sL https://culturepeople.co.kr/example/registry | grep -i robots
```

대표자 확인 후 진행:

- `/youth-policy` 실제 청소년보호책임자/연락처
- `/contact`, `/advertising` 실제 연락처
- Search Console affected URL 목록
- 카테고리 표준안

## 9. 배포 재개 프롬프트

```text
docs/culturepeople-frontend-interface-audit-plan.md 10절의 로컬 구현·검증 완료 상태에서 production 배포와 운영 확인만 재개해줘.

- 기존 변경사항을 되돌리거나 카테고리 DB apply를 실행하지 마.
- `CULTUREPEOPLE_VERCEL_TOKEN`을 원문 출력 없이 set/missing/empty로만 확인해.
- token이 set이면 `pnpm deploy:culturepeople`을 실행하고 production alias를 확인해.
- 배포 후 portal verify, 24개 NOINDEX audit, public-site-only 브라우저 smoke를 각각 1회만 실행해.
- 과거 번호 23/25/27/33/34의 영구 리다이렉트와 제거 기사 7/43/49/57/64/67/75/598의 실제 404를 확인해.
- `/contact`, `/advertising`, `/youth-policy` 200과 `/rss.xml`, `/sitemap.xml`, `/news-sitemap.xml`, `/robots.txt`를 소량 확인해.
- Search Console 수동 작업과 `/youth-policy` 법적 정보 확인은 대표자 작업으로 남겨.
```

## 10. 완료 보고 (2026-07-19)

### 구현·보완 결과

- NOINDEX: 게시 기사는 200/indexable/self canonical/NewsArticle, 없는·미게시 기사는 `notFound()` 404, UUID와 확인된 과거 번호 5건은 기사 no 기준 영구 리다이렉트로 코드 반영했다.
- 성능: 홈 60초, 기사·카테고리 300초 정책과 공개 기사 조회 데이터 캐시를 적용했다. 요청별 CSP nonce는 보안을 위해 유지하므로 build 결과는 dynamic이다.
- 장애 저하: Supabase를 읽지 못해도 컬처피플 브랜드와 7개 기본 카테고리를 유지하고, 검색·카테고리·RSS·푸터가 500으로 무너지지 않게 했다.
- 공개 smoke: `--public-site-only`에서 데스크톱/모바일 검색 오버레이, 모바일 메뉴, 이미지, 겹침, 가로 넘침, 동일 출처 오류를 확인한다.
- 카테고리: auto-press·재시도·Worker 저장을 7개 표준 분류로 정규화하고 원분류를 태그에 보존한다. 기존 데이터는 감사·계획·rollback만 생성했다.
- 뉴스레터는 계속 중지 상태이며 공개 기사에 위젯을 다시 연결하지 않았다. auto-news 및 네이버·다음 자동 송고도 이번 범위에서 변경하지 않았다.

### 검증 결과

- `pnpm ci:typecheck`: 통과
- `pnpm test:unit`: 82개 파일, 379개 테스트 통과
- `pnpm exec next build`: 통과, 134개 경로 생성 확인
- 운영 공개 브라우저 smoke: 데스크톱/모바일 공개 경로와 자동 발견 기사 `/article/3993` 모두 통과. 사이트 자체 console/page error, 동일 출처 실패 응답, 깨진 이미지, 가로 넘침, 주요 영역 겹침 0건
- `pnpm verify:portal -- --base https://culturepeople.co.kr`: 통과
- 배포 후 라이브 NOINDEX 감사 24건: blocking 0, 현재 정상 게시/legacy redirect 16건은 `stale_search_console`, 실제 삭제 기사 8건은 `not_found_or_unpublished` 404
- 카테고리 감사: 기사 3,808건, 변경 후보 332건, provider mapping 373건. 실제 DB 적용 0건

### 라이브/배포 상태

- `CULTUREPEOPLE_VERCEL_TOKEN`: `~/.config/culturepeople/vercel.env`에서 set 상태를 확인했고 권한을 `600`으로 보정했다. Vercel API 인증도 HTTP 200으로 유효성을 확인했다. 이전 Codex 프로세스에는 `.bashrc` 환경이 상속되지 않아 처음에는 missing으로 오판했다.
- 배포 스크립트가 Linux/macOS의 프로젝트 보안 파일과 Windows의 `%APPDATA%/CulturePeople/vercel.env`를 직접 읽도록 보완했으며, 토큰은 CLI 인자가 아닌 `VERCEL_TOKEN` 자식 환경변수로 전달해 프로세스 목록 노출을 막았다.
- production 배포 `dpl_2FY1fDkWeWbp86HYn94N8V7M566L`이 `READY`이며 배포 URL은 `https://monet-registry-main-4qpg4rukk-arbadas-projects-fdc12d41.vercel.app`, 운영 alias는 `https://culturepeople.co.kr`이다.
- `/contact`, `/advertising`, `/youth-policy`를 포함한 공개 smoke 경로가 운영에서 200으로 확인됐다. portal verify의 ads/RSS/feed/sitemap/news-sitemap 검사도 전부 통과했다.
- 운영 홈·기사·카테고리·검색 헤더는 요청별 CSP nonce 때문에 `private, no-cache, no-store`, `x-vercel-cache: MISS`다. DB read 단기 캐시와 게시 후 태그 무효화는 유지한다.
- 과거 번호 `23`, `25`, `27`, `33`, `34`는 각각 `275`, `187`, `229`, `180`, `197`로 308 영구 리다이렉트된다.
- 제거 기사 `7`, `43`, `49`, `57`, `64`, `67`, `75`, `598`은 모두 실제 HTTP 404다.

### 산출물

- NOINDEX: `.seo-audit-runs/noindex-audit-2026-07-18T18-20-39-990Z.json`, 같은 이름의 Markdown
- 배포 로그: `.deploy-logs/culturepeople-vercel-2026-07-18T18-03-33-410Z.log`
- 카테고리 감사: `.category-audit-runs/category-audit-2026-07-18T16-41-24-010Z.json`, 같은 이름의 CSV
- 카테고리 dry-run: `.category-audit-runs/category-normalize-plan-2026-07-18T16-41-26-271Z.json`
- rollback: `.category-audit-runs/category-normalize-rollback-2026-07-18T16-41-26-271Z.json`

### 대표자 확인 필요

- `/youth-policy`의 `홍길동`, 청소년보호책임자 직위·연락처를 실제 값으로 확정한다.
- 회사명, 대표자, 발행인, 편집인, 사업자·인터넷신문 등록정보와 공개 연락처를 최종 확인한다.
- Search Console에서 현재 정상인 게시 기사와 legacy redirect를 라이브 테스트한 뒤 색인 요청하고 NOINDEX 보고서 유효성 검사를 시작한다. 삭제 기사 8건은 색인 요청하지 않는다.
- 아래 명령은 다음 배포 때 동일 검증을 반복하는 운영 절차다.

```bash
pnpm deploy:culturepeople -- --check-token
pnpm deploy:culturepeople
pnpm verify:portal -- --base https://culturepeople.co.kr
pnpm seo:audit:noindex -- --base https://culturepeople.co.kr --urls-file tmp/noindex-urls.txt
pnpm smoke:browser -- --base-url=https://culturepeople.co.kr --public-site-only --no-auto-start --no-admin-auth --json
```
