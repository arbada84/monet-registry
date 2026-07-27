# 기사 발행 포털 자동 등록/색인 강화 기획서

작성일: 2026-06-13

## 목표

컬처피플 기사 발행 직후 검색/포털 크롤러가 새 URL을 더 빨리 발견하도록 만들어 유입을 늘린다. 단, 네이버뉴스/다음뉴스 같은 포털 뉴스 영역 입점은 기술 자동 등록만으로 해결되지 않고 별도 심사와 서류가 필요하므로, 즉시 개발 가능한 "검색 색인 자동화"와 대표자가 진행해야 하는 "포털 제휴/계정 등록"을 분리한다.

2026-06-27 현재 개발 범위에서는 네이버뉴스·다음뉴스 심사, 제휴 신청 준비, 자동 송고 기능을 제외한다. 이미 구축된 자동화는 검색 색인, RSS, sitemap, news-sitemap, IndexNow, 운영 리포트에 한정하며, `/cam/portal-review`도 내부 운영 품질/검색 유입 리포트로 사용한다.

## 핵심 요구사항: 기사 등록 시 포털 게재까지 자동 연결

최종 목표는 관리자가 컬처피플에 기사를 등록하거나 게시 상태로 전환하는 순간, 등록 가능한 모든 포털/검색 채널에 자동으로 게재 또는 색인 요청이 수행되는 구조다. 수동 등록이 필요한 포털도 "기사마다 수동 등록"하는 방식이 아니라, 최초 1회 계정 등록/소유 확인/제휴 승인만 수동으로 처리하고 이후 기사 등록부터는 자동 게재 파이프라인으로 흘러가야 한다.

포털별 실행 기준은 다음처럼 정의한다.

- 뉴스 제휴/API/송고 피드를 제공하는 포털: 기사 등록 시 포털 요구 포맷으로 자동 송고하고, 포털 게재 성공/실패 상태를 기록한다.
- RSS/사이트맵 기반 수집 포털: 기사 등록 시 RSS, sitemap, news sitemap에 즉시 반영하고 포털이 제출받은 피드를 자동 재수집할 수 있게 한다.
- IndexNow 지원 검색엔진: 기사 등록/수정/삭제 시 URL을 즉시 제출한다.
- 계정/심사/서류가 필요한 포털: 최초 등록과 승인은 대표자가 처리하되, 승인 이후에는 기사 등록 시 자동 송고/피드 반영/색인 요청이 되도록 개발한다.

따라서 이 기획의 성공 기준은 "포털 계정 또는 제휴가 준비된 채널에서는 기사 등록 이후 별도 사람 손을 거치지 않고 포털 게재 또는 검색 노출 후보 등록까지 진행되는 것"이다. 다만 포털 내부 심사, 편집, 검색 랭킹, 색인 반영 여부는 외부 플랫폼의 판단이므로 시스템은 제출/송고/피드 반영과 그 결과 추적까지 보장한다.

적용 범위는 다음 등록 경로 전체다.

- 관리자 화면에서 직접 작성한 일반 기사 등록.
- 보도자료 자동등록(`auto-press`)으로 생성되어 `게시` 상태가 된 기사.
- 자동 뉴스 수집(`auto-news`)으로 생성되어 `게시` 상태가 된 기사.
- 메일/보도자료 가져오기 등 외부 입력 경로에서 등록되어 `게시` 상태가 된 기사.
- 예약 발행이 시간이 되어 `게시` 상태로 전환된 기사.
- 임시저장/상신/승인 상태의 기사가 나중에 `게시` 상태로 전환되는 경우.

즉, 출발점이 수동 기사 작성이든 자동 보도자료 등록이든 상관없이 최종 상태가 `게시`가 되는 순간 포털 게재 파이프라인을 자동 실행해야 한다. 임시저장, 상신, 반려 상태에서는 포털에 게재하지 않고, 실제 공개 가능한 `게시` 상태에서만 송고/색인/RSS 반영을 수행한다.

## 결론

지금 당장 개발로 효과를 낼 수 있는 1순위는 IndexNow 완성이다. IndexNow는 Bing, Naver, Seznam.cz, Yandex, Yep이 지원하며, 기사 추가/수정/삭제 시 URL 변경 사실을 즉시 알릴 수 있다. 현재 코드에는 발행 시 IndexNow 호출과 관리자 토글이 이미 있지만, IndexNow 키 파일을 사이트 루트에서 제공하는 라우트와 제출 결과 로깅/재시도 큐가 부족하다.

2순위는 네이버 서치어드바이저/Google Search Console/Daum 검색등록에 제출할 RSS, sitemap, robots 상태를 포털 요구사항에 맞게 다듬는 것이다. 라이브 확인 결과 `robots.txt`, `sitemap.xml`, `rss.xml`, `atom.xml`, `feed.json`은 응답하고 있다. 다만 네이버 RSS는 본문 포함을 권장하므로 RSS 기본값과 포털 제출용 피드 정책을 점검해야 한다.

3순위는 Google 쪽 정리다. 기존 코드의 Google sitemap ping은 Google이 공식적으로 종료한 방식이므로 더 이상 유입 개선 수단으로 기대하면 안 된다. 일반 기사에는 Google Indexing API도 맞지 않는다. Google은 Search Console 사이트맵 제출, 뉴스 사이트맵, 구조화 데이터, 내부 링크 품질 쪽으로 가야 한다.

4순위는 포털 게재 상태 관리다. 지금은 "기사 등록 후 알림을 보내는 코드"는 있지만, 포털별 게재/제출 성공 여부를 운영자가 확인하고 재시도하는 관리 체계가 약하다. 기사 등록 이후 자동으로 포털 게재 흐름이 실행되었는지 추적하려면 포털 제출 로그, 재시도 큐, 실패 원인 표시, 수동 재제출 버튼이 필요하다.

## 공식 문서 기반 포털/검색 채널 분류

### 1. 네이버 검색

- 등록 방식: 네이버 서치어드바이저에서 사이트 소유 확인 후 RSS와 사이트맵 제출.
- 기사 등록 시 자동 게재 방식: 새 기사가 등록되면 RSS/sitemap/news sitemap에 자동 포함하고, IndexNow로 URL 변경을 즉시 알린다.
- 개발 가능: `robots.txt`에 sitemap 유지, RSS 본문 포함 옵션 강화, sitemap의 `lastmod` 정확도 개선, IndexNow 제출, 제출 로그 저장.
- 대표자 작업: 네이버 계정으로 `culturepeople.co.kr` 소유 확인, 서치어드바이저에서 `/sitemap.xml`, `/rss.xml` 제출, 수집 현황 확인.
- 주의: 네이버뉴스 검색 제휴/콘텐츠 제휴는 별도 뉴스제휴 심사 영역이다. 사이트맵 제출과 다르다.

### 2. 네이버뉴스

- 등록 방식: 네이버 뉴스 제휴 신청/심사.
- 기사 등록 시 자동 게재 방식: 네이버뉴스 제휴 승인 후 네이버가 요구하는 송고 XML/RSS/API 규격이 확정되면, 컬처피플 기사 등록 시 해당 규격으로 자동 송고하고 송고 상태를 저장한다.
- 개발 가능: 제휴 심사 대비용 기사 품질/출처/작성자/정정정책/청소년보호/회사정보/기자정보 페이지 정비, 기사 XML/RSS 공급 요구가 생기면 별도 피드 구현, 송고 성공/실패 로그 구현.
- 대표자 작업: 네이버 뉴스 제휴 신청 기간 확인, 언론사 등록증/사업자등록증/윤리강령/기자 현황/자체기사 자료 준비.
- 주의: 자동 코드 배포만으로 네이버뉴스 탭에 들어가는 구조는 아니다.

### 3. 다음/카카오 검색

- 등록 방식: Daum 검색등록에서 사이트 검색 등록 신청, 심사 후 반영.
- 기사 등록 시 자동 게재 방식: Daum 검색등록은 사이트 단위 등록이므로 최초 등록 이후 새 기사는 sitemap/RSS/news sitemap 반영과 검색 크롤링 친화 구조로 자동 노출 후보에 들어가게 한다.
- 개발 가능: 사이트명/설명/대표 URL/canonical/robots/sitemap/RSS 정합성 정리, 기사 등록 시 피드 반영 검증.
- 대표자 작업: Daum 검색등록 신청, 신청자 이메일 관리, 사이트 설명/카테고리 입력.
- 주의: Daum 검색등록은 검색 결과 사이트 등록이고, 다음뉴스 입점과 다르다.

### 4. 다음뉴스/다음채널

- 등록 방식: 다음채널 스튜디오/카카오 공지의 언론사 채널 입점 신청.
- 기사 등록 시 자동 게재 방식: 다음뉴스/다음채널 입점 승인 후 카카오가 요구하는 콘텐츠 공급 방식에 맞춰 기사 등록 시 자동 송고하고 송고 상태를 저장한다.
- 개발 가능: 입점 심사 대비용 자체기사/전문기사 집계 리포트, 카테고리별 기사 리스트 다운로드, 기사 공급 포맷 준비, 승인 후 자동 송고 어댑터 구현.
- 대표자 작업: 카카오계정/다음채널 스튜디오 가입, 입점 신청 기간 확인, 언론/기자 유관 단체 가입 증빙, 사업자/언론사 등록 서류 준비.
- 주의: 뉴스 입점은 기술 제출 API보다 심사/자격 요건이 우선이다.

### 5. Bing/IndexNow

- 등록 방식: IndexNow API 키를 만들고 `{key}.txt`를 사이트 루트에 노출한 뒤 기사 URL을 제출.
- 기사 등록 시 자동 게재 방식: 기사 등록/수정/삭제/예약발행 완료 시 IndexNow에 즉시 자동 제출한다.
- 개발 가능: 즉시 가능. 발행/수정/삭제/예약발행 완료 시 자동 제출, 대량 재제출은 큐와 rate limit로 처리.
- 대표자 작업: Bing Webmaster Tools 계정 연결은 권장. 단, IndexNow 키 생성/호스팅은 개발로 처리 가능하다.

### 6. Google 검색/Google News

- 등록 방식: Google Search Console 사이트 소유 확인 후 sitemap 제출. 뉴스 매체라면 Google News Publisher Center와 뉴스 사이트맵 검토.
- 기사 등록 시 자동 게재 방식: Google Search Console과 Publisher Center 등록 후 새 기사가 sitemap/news sitemap에 자동 반영되게 한다. Google 일반 기사 URL은 직접 게재 API가 없으므로 피드/사이트맵/구조화 데이터로 자동 노출 후보 등록을 보장한다.
- 개발 가능: 일반 sitemap 개선, 별도 `/news-sitemap.xml` 구현, Article/NewsArticle 구조화 데이터 점검, Google ping 제거.
- 대표자 작업: Google Search Console 소유 확인, Publisher Center 등록 여부 결정.
- 주의: Google Indexing API는 일반 기사 URL용이 아니라 JobPosting 또는 라이브스트림 동영상 페이지용으로 제한되어 있다.

## 현재 코드/운영 상태

### 이미 있는 것

- 발행 API: `src/app/api/db/articles/route.ts`에서 게시 상태가 되면 `notifyIndexNow()` 호출. **단, HTTP로 해당 라우트를 경유하는 경우에만 해당한다(아래 누락 경로 참고).**
- 예약 발행: `src/app/api/cron/publish/route.ts`에서 예약 기사를 게시로 바꾼 뒤 `notifyIndexNow()` 호출.
- 자동 보도자료/자동 뉴스: **코드 검토 결과 둘 다 현재 포털 게재 파이프라인을 완전히 우회하고 있음(아래 누락 경로 참고).**
- 수동 배포 화면: `src/app/cam/distribute/page.tsx`에서 기사별 IndexNow 수동 제출 가능.
- SEO 설정 화면: `src/app/cam/seo/page.tsx`에서 IndexNow API 키 입력 가능.
- 피드/사이트맵:
  - `src/app/sitemap.xml/route.ts`
  - `src/app/robots.txt/route.ts`
  - `src/app/api/rss/route.ts`
  - `src/app/atom.xml/route.ts`
  - `src/app/feed.json/route.ts`
- 라이브 HEAD 확인: 2026-06-13 02:15 KST 기준 `robots.txt`, `sitemap.xml`, `rss.xml`, `atom.xml`, `feed.json` 응답 확인.

### 포털 게재 파이프라인 연결 현황 (2026-06-16 재검토)

초기 검토 때는 auto-news, auto-press, Cloudflare worker 경로가 `/api/db/articles`를 우회해 IndexNow 호출이 누락되어 있었다. 현재 코드는 공통 `portal-publication` 파이프라인으로 정리되어, `게시` 상태가 되는 경우에만 검색 색인 제출을 수행한다.

| 등록 경로 | 현재 상태 |
|---|---|
| 관리자 수동 등록/수정/삭제 (`/api/db/articles`) | ✅ 연결됨. DELETE는 UUID가 아니라 실제 기사 `no` 기준 URL로 `URL_DELETED` 제출 |
| 예약발행 cron (`/api/cron/publish`) | ✅ 연결됨 |
| auto-news cron (`/api/cron/auto-news`) | ✅ 연결됨. 단, 기사 자동등록 기능 자체는 운영 설정에 따라 멈춘 상태를 유지 |
| auto-press Next.js cron (`/api/cron/auto-press`) | ✅ 연결됨. 보도자료 자동등록이 `게시` 상태로 저장될 때 실행 |
| auto-press Cloudflare worker notify (`/api/auto-press/worker-notify`) | ✅ 연결됨. worker 저장 후 notify 콜백에서 발행 상태 확인 |
| 메일 등록/AI bulk/기타 게시 전환 경로 | ✅ 게시 상태 전환 시 공통 파이프라인 사용 |

### 구현 완료 및 운영 주의

- DELETE 핸들러의 IndexNow URL 오류는 수정 완료: 실제 기사 번호 `no` 기준 `/article/{no}`로 삭제 신호를 보낸다.
- auto-news, auto-press Next.js cron, Cloudflare `worker-notify` 모두 게시 상태에서 공통 포털 게재 파이프라인을 호출한다.
- 임시저장/상신/반려/AI 실패 임시저장 기사는 포털 제출 대상이 아니다.
- `/{indexNowKey}.txt` 루트 라우트가 추가되어 관리자 SEO 설정의 key와 일치할 때 key 본문만 반환한다.
- IndexNow 제출은 5분 디바운스, timeout, 로그, 실패 재시도 기반을 갖는다.
- Google sitemap ping은 공식 종료된 방식이므로 제거하고 Search Console 사이트맵 제출 안내로 대체했다.
- RSS `fullContent` 기본값은 현재 코드 기준 `true`다. 운영 DB에 예전 `false` 저장값이 남아 있으면 `/cam/rss` 경고와 "전문 제공 켜기" 버튼으로 복구한다.
- `sitemap.xml`의 `lastmod`는 `updatedAt` 우선으로 동작하며, D1/Supabase sitemap 조회 타입도 `updatedAt`을 포함한다.
- `/rss.xml`, `/feed.xml` 직접 route와 `/news-sitemap.xml`이 추가되어 포털 제출 표면은 `pnpm verify:portal -- --base https://culturepeople.co.kr`로 확인한다.
- 네이버뉴스/다음뉴스 뉴스탭 자동 송고는 심사/제휴 승인 전에는 구현 대상이 아니다. 현재 자동화 범위는 검색 색인, RSS/sitemap, 심사 준비 리포트다.

## 개발 계획

### Phase 1. 즉시 색인 자동화 안정화

작업:
- **[버그 수정] DELETE 핸들러의 IndexNow URL 오류 수정.** `src/app/api/db/articles/route.ts` soft delete 전에 `serverGetArticleById(id)`로 `no`를 조회한 뒤 `notifyIndexNow(no ?? id, "URL_DELETED")`로 변경한다.
- **auto-news 파이프라인 연결.** `src/app/api/cron/auto-news/route.ts`에서 `serverCreateArticle()` 완료 후 실제 `article.status === "게시"`인 경우에만 `notifyIndexNow(savedNo)`를 직접 추가한다.
- **auto-press Next.js cron 파이프라인 연결.** `src/app/api/cron/auto-press/route.ts`에서 `serverCreateArticle()` 완료 후 실제 `articleStatus === "게시"`인 경우에만 `notifyIndexNow(savedNo)`를 직접 추가한다.
- **auto-press Cloudflare worker 파이프라인 연결.** `src/app/api/auto-press/worker-notify/route.ts`에서 기사 등록 확인(`notifiedItem.status === "ok"`)과 공개 발행 상태(`run.options.publishStatus === "게시"` 또는 DB 조회 결과 `status === "게시"`)가 모두 맞을 때 `notifyIndexNow(notifiedItem.articleNo ?? notifiedItem.articleId)`를 추가한다.
- 관리자 수동 등록, 보도자료 자동등록, 자동 뉴스, 메일 등록, 예약발행 완료 이벤트를 `portal publication pipeline`으로 묶고, 포털별 어댑터가 자동 실행되게 한다.
- `/{indexNowKey}.txt` 루트 라우트 추가. `cp-seo-settings.indexNowApiKey`와 일치하는 파일명일 때 키만 반환하고, 불일치하면 404.
- `notify-search.ts`의 `notifyIndexNow`에 `AbortSignal.timeout(5000)` 5초 타임아웃을 추가한다.
- Google ping 함수(`submitGooglePing`)와 관련 토글/UI를 제거하거나 "Search Console sitemap 등록 안내"로 대체한다.
- `portal_distribution_logs` 또는 기존 설정 저장소에 IndexNow 제출 로그를 기록한다.
- 같은 URL 반복 제출은 5분 디바운스한다.

완료 기준:
- 관리자 수동 등록, 보도자료 자동등록, 자동 뉴스 모두에서 `게시` 상태 기사 생성 시 포털 게재 파이프라인이 자동 실행되고, 포털별 처리 결과가 남는다.
- 기사 삭제 시 IndexNow에 올바른 URL(`/article/{no}`)로 삭제 신호가 전송된다.
- `https://culturepeople.co.kr/{key}.txt`가 키만 반환한다.
- 새 기사 게시 시 IndexNow 응답 코드 200 또는 202가 로그에 남는다.
- 키 미설정/403/422/429가 관리자 화면에서 구분된다.

### Phase 2. 포털 제출용 피드/사이트맵 정비

작업:
- `robots.txt`에 `Sitemap: https://culturepeople.co.kr/sitemap.xml` 유지 확인.
- `/rss.xml`이 `/api/rss`로만 308 이동하지 않고 포털 제출 친화적인 200 응답을 줄 수 있는지 검토한다.
- RSS의 포털 제출 모드에서는 본문 포함을 기본값으로 한다.
- `sitemap.xml`의 `lastmod`를 작성일이 아니라 실제 수정일 `updatedAt` 우선으로 개선한다.
- `/news-sitemap.xml` 추가: 최근 48시간 기사, 최대 1,000건, `news:publication`, `news:publication_date`, `news:title` 포함.
- 기사 등록 직후 해당 URL이 RSS, sitemap, news sitemap에 반영되는지 자동 검증한다.

완료 기준:
- 기사 등록 후 별도 수동 작업 없이 포털 제출용 피드에 새 기사 URL과 본문이 포함된다.
- 네이버 서치어드바이저에 `/sitemap.xml`과 `/rss.xml`을 제출해도 도메인/용량/응답속도 기준에 걸리지 않는다.
- Google Search Console에서 일반 sitemap과 news sitemap을 분리 추적할 수 있다.

### Phase 3. 포털 온보딩 체크리스트와 관리자 UX

작업:
- `/cam/seo`에 포털별 상태 체크 카드 추가:
  - 네이버 서치어드바이저: 소유 확인, sitemap 제출, RSS 제출
  - Daum 검색등록: 등록 신청/심사
  - Google Search Console: 소유 확인, sitemap 제출
  - Bing Webmaster Tools: IndexNow 수신 확인
- `/cam/distribute`를 "포털 게재 현황" 화면으로 확장해 기사별 자동 제출 성공/실패/재시도 상태를 보여준다.
- verification meta tag는 이미 layout metadata에 일부 반영되어 있으므로 입력 UX와 검증 링크를 정리한다.
- 포털 제휴 신청용 "기사 리스트 CSV/JSON 다운로드"를 추가한다.

완료 기준:
- 대표자가 어떤 포털에서 무엇을 해야 하는지 관리자 화면에서 바로 볼 수 있다.
- 기사 등록 후 포털별 자동 게재/색인 요청 상태를 관리자 화면에서 확인할 수 있다.
- 포털 심사 자료용 기사 리스트를 관리자에서 바로 추출할 수 있다.

### Phase 4. 뉴스 제휴 심사 대비

작업:
- 자체기사/전문기사 비율 리포트.
- 기자별 기사 수, 카테고리별 기사 수, 최근 6개월 발행량 리포트.
- 기사 상세 페이지의 작성자, 발행일, 수정일, canonical, `NewsArticle` JSON-LD 점검.
- 회사소개, 편집규약, 윤리강령, 청소년보호정책, 정정/반론보도 안내 페이지 점검.

완료 기준:
- 네이버뉴스/다음뉴스 신청 시 필요한 운영 지표와 URL 목록을 즉시 제출할 수 있다.

## 대표자가 해줘야 할 일

1. 네이버 서치어드바이저 계정에서 `culturepeople.co.kr` 사이트 소유 확인.
2. 네이버 서치어드바이저에 `/sitemap.xml`, `/rss.xml` 제출.
3. Daum 검색등록에서 사이트 검색 등록 신청.
4. Google Search Console에서 도메인 소유 확인 후 sitemap 제출.
5. Bing Webmaster Tools 연결 후 IndexNow 수신 여부 확인.
6. 네이버뉴스/다음뉴스 입점을 원하면 언론사 등록증, 사업자등록증, 윤리강령, 기자 현황, 자체기사 증빙, 대표 연락처, 편집 책임자 정보를 준비.
7. 공식 매체명, 회사명, 주소, 대표 이메일, 청소년보호책임자, 편집책임자 표기를 확정.
8. 네이버뉴스/다음뉴스 등 승인형 포털에서 송고 규격, 계정, API 키, FTP/SFTP 정보, XML 샘플 등을 제공받으면 개발 설정에 전달한다.

## 우선 착수 순서

1. **[버그 수정] DELETE 핸들러 IndexNow URL 오류 수정** — 현재 삭제 시 잘못된 URL이 제출되고 있음.
2. **auto-news 파이프라인 연결** — `auto-news/route.ts`에서 `notifyIndexNow` 직접 추가.
3. **auto-press Next.js cron 파이프라인 연결** — `auto-press/route.ts`에서 공개 발행 시 `notifyIndexNow` 직접 추가.
4. **auto-press Cloudflare worker 파이프라인 연결** — `worker-notify/route.ts` 기사 등록 확인 및 공개 상태 확인 시점에 `notifyIndexNow` 추가.
5. `notify-search.ts`에 5초 타임아웃 추가.
6. IndexNow 키 파일 라우트 구현.
7. Google ping 제거/문구 수정.
8. IndexNow 제출 로그와 5분 디바운스 최소 구현.
9. `sitemap.xml` `lastmod`를 `updatedAt` 우선으로 수정하고 Supabase/D1 sitemap 조회 컬럼을 함께 보강.
10. RSS 본문 포함 기본 정책과 `/rss.xml` 직접 응답 여부 점검.
11. `/news-sitemap.xml` 추가.
12. `/cam/seo` 포털 온보딩 체크리스트 추가.
13. `/cam/distribute`에 기사별 포털 게재 상태와 재시도 버튼 추가.

## 2026-06-13 구현 반영 메모

- 공통 `portal publication pipeline`을 두어 관리자 수동 등록, 예약 발행, auto-news, auto-press, auto-press worker-notify, 메일 등록, AI 일괄 게시 전환이 모두 같은 제출/로그/디바운스 규칙을 사용하도록 한다.
- `게시` 상태가 아닌 임시저장/상신/반려/AI 실패 건은 공통 파이프라인에서 IndexNow 제출을 생략한다. 삭제 이벤트는 예외적으로 `URL_DELETED`를 허용한다.
- DELETE는 soft delete 전 기사 조회로 실제 기사 `no`를 확보해 `/article/{no}` 기준으로 `URL_DELETED`를 제출한다.
- IndexNow 키는 `/{key}.txt` 루트 라우트에서 `cp-seo-settings.indexNowApiKey`와 일치할 때만 응답한다.
- Google sitemap ping은 제거 대상이다. 운영 UI에서는 Search Console에 `/sitemap.xml`, `/news-sitemap.xml`을 제출하라는 안내와 확인 필요 상태로 처리한다.
- `/rss.xml`은 redirect 대신 직접 RSS 200 응답을 제공하고, 기본적으로 본문을 `description`과 `content:encoded`에 포함한다.
- `sitemap.xml`은 `updatedAt`을 `lastmod` 우선값으로 사용하며, D1/Supabase/db-server sitemap 조회 타입도 `updatedAt`을 반환해야 한다.
- `/news-sitemap.xml`은 최근 48시간 기사만 대상으로 Google News sitemap 형식의 `news:publication`, `news:publication_date`, `news:title`을 제공한다.

## 2026-06-14 추가 구현/재검토 메모

- 위의 "누락된 포털 게재 파이프라인 경로" 표는 최초 검토 당시의 히스토리다. 현재 코드 기준으로는 관리자 수동 등록/수정/삭제, 예약 발행, auto-news, auto-press cron, auto-press worker-notify, 메일 등록, auto-press retry queue, AI 일괄 게시 전환이 `publishArticleToPortals` 경로로 연결되어 있다.
- `/rss.xml`, `/feed.xml`은 App Router route로 직접 200 RSS XML을 반환한다. `/rss`, `/feed` legacy 경로만 redirect로 유지한다.
- RSS 본문 포함은 코드 기본값 `true`이며, 운영 DB 설정이 `false`로 저장된 경우 `/cam/rss`에서 경고와 "전문 제공 켜기" 버튼으로 바로 복구할 수 있다.
- 포털 제출 표면 검증은 `pnpm verify:portal -- --base https://culturepeople.co.kr --key {indexNowKey}`로 수행한다. 이 스크립트는 `/ads.txt`, `/rss.xml`, `/feed.xml`, `/rss`, `/feed`, `/sitemap.xml`, `/news-sitemap.xml`, `/{key}.txt`를 소량 요청으로 확인한다.
- 포털 제휴 심사용 기사 리스트와 운영 리포트는 `/cam/portal-review`에서 확인하고, `/api/cam/portal-review?format=csv` 또는 `format=json`으로 다운로드한다.
- 기사 상세 페이지 `NewsArticle` JSON-LD는 canonical 설정값을 기준으로 URL을 생성하고, 대표 이미지 절대 URL, `thumbnailUrl`, `isAccessibleForFree`, publisher 정보를 포함한다.

## 리스크

- IndexNow 제출은 색인 보장을 뜻하지 않는다. 포털이 URL 변경 사실을 빨리 알게 하는 장치다.
- 뉴스 제휴 포털은 승인 전에는 실제 포털 뉴스 영역 자동 게재가 불가능하다. 이 경우 시스템은 승인 준비, 피드 반영, 검색 색인 요청까지 먼저 자동화한다.
- 네이버뉴스/다음뉴스 유입은 뉴스 제휴 심사 통과 여부가 결정적이다.
- 기사 본문 품질, 원본성, 중복 기사 비율이 낮으면 자동 제출을 해도 유입 개선이 제한된다.
- 과도한 재제출은 크롤링 할당량을 소모하거나 rate limit를 유발할 수 있으므로 큐/디바운스가 필요하다.

## 참고 자료

- Naver Search Advisor RSS 및 sitemap 제출: https://searchadvisor.naver.com/guide/request-feed
- IndexNow 한국어 소개/FAQ: https://www.indexnow.org/ko_kr/index, https://www.indexnow.org/ko_kr/faq
- IndexNow 프로토콜 문서: https://www.indexnow.org/documentation
- Bing IndexNow 시작 가이드: https://www.bing.com/indexnow/getstarted
- Google sitemap ping 종료 공지: https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping
- Google Indexing API Quickstart: https://developers.google.com/search/apis/indexing-api/v3/quickstart
- Google News sitemap 문서: https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap
- Daum 검색등록: https://register.search.daum.net/
- Naver 뉴스 제휴 안내: https://help.naver.com/service/5603/category/4601?lang=ko
- Kakao 다음뉴스 신규 언론사 입점 공고: https://www.kakaocorp.com/page/detail/11356
