# Google Search Console 알림 점검 결과

- 기준: 2026-10-15 KST, 라이브 감사 생성 시각 22:38 KST.
- 요청: Google 메일 확인 및 컬처피플 사이트 문제 해결.
- 결론: 메일 두 건 확인. 소량 라이브 검사에서 5xx 및 게시 기사 noindex는 재현되지 않았다. Search Console의 실제 실패 URL·최종 크롤링 시각은 미확인이므로 전체 해결 완료로 판정하지 않는다.

## 1. 확인한 메일

연결된 Gmail에서 `after:2026/10/01`과 Google 발신자·culturepeople/색인 조건으로 조회해 두 건을 읽었다. 메일 원문에 개별 실패 URL은 없고 보고서 링크만 있다. 이 문서에는 개인화된 링크와 메일 인증 헤더를 복사하지 않는다.

| 수신 시각 KST | 발신자 | 내용 |
| --- | --- | --- |
| 2026-10-15 21:14:42 | Google Search Console Team, sc-noreply@google.com | 페이지 일부 NOINDEX 제외 |
| 2026-10-15 21:15:05 | 같은 발신자 | 사이트맵에 포함된 페이지 일부 서버 오류(5xx) |

이는 Google이 관측한 문제 알림이며 메일 도착 시각이 실패 요청 발생 시각인 것은 아니다. 메일만으로 현재 전체 사이트 장애·해킹·현재 quota 초과라고 판단하지 않는다.

## 2. 현재 운영 배포

Vercel alias API를 이번에 읽어 확인했다.

- alias: `culturepeople.co.kr`
- deployment: `dpl_HyWykUJPnBq2dSryQaVgJi4Uzirs`
- project: `prj_fN7aCu9wkSUs6FsxLbrFIiEpCawY`
- 기존 연락처 정규화 및 shared setting fallback 수정 배포가 유지 중이다.
- native 저장소 `/home/arbada/culturepeople-d1-hotfix-20261004`는 검사 전후 clean.

## 3. 소량 라이브 결과

| URL | HTTP | robots/판정 |
| --- | --- | --- |
| `/` | 200 | index/follow |
| `/api/health` | 200 | D1 실제 health query ok |
| `/article/4363` | 200 | 자기 canonical, index/follow, NewsArticle |
| `/article/4829` | 200 | 같은 조건, 최근 기사 표본 |
| `/rss.xml` | 200 | XML 반환 |
| `/sitemap.xml` | 200 | loc 4,676개, 이번 감사 시점 |
| `/news-sitemap.xml` | 200 | loc 38개, 이번 감사 시점 |
| `/robots.txt` | 200 | 표본 기사 Googlebot 접근 허용 |
| `/search?q=문화` | 200 | 의도된 noindex/nofollow, 유지 |

일반 브라우저·Googlebot·Google-InspectionTool User-Agent 각각으로 두 기사만 검사했다. 모두 200, noindex meta/header 없음, canonical 정상, 제목/H1/NewsArticle 존재, 일반 sitemap 포함이다. 이는 실제 Google IP에서의 크롤링이나 Search Console URL Inspection 실행을 뜻하지 않는다. 오래된 기사 4363이 news-sitemap에 없는 것은 최근 기사 전용 feed의 정상 동작이다.

서버 전체·모든 기사·실제 Google 실패 URL 전수검사 결과가 아니다. 삭제 기사 복원, 관리자/검색 noindex 해제, sitemap 대량 재제출은 하지 않았다.

## 4. 운영 오류 로그

Vercel CLI 63.1.0으로 해당 프로젝트 production의 최근 24시간 `5xx` 최대 20개를 조회했다. 명령은 exit 0, 반환 오류 항목 0개였다. 토큰은 보호된 프로젝트 환경파일에서 읽고 환경변수로만 주입했다.

```text
vercel logs --project prj_fN7aCu9wkSUs6FsxLbrFIiEpCawY --scope team_r6EedfOTYhrZjdhxlDEFeSBF --environment production --since 24h --status-code 5xx --limit 20 --json
```

이 결과는 제공자가 보관하고 조회 API에서 반환한 범위에 한정된다. 과거 quota 장애, 이전 배포의 실패, 보관 기간 밖 오류, Search Console에 누적된 과거 결과를 부정하지 않는다.

## 5. 코드·회귀 검증

기존 `serverGetSetting`은 `setting-value-v2`로 저장값만 공유 캐시하고 각 caller fallback은 캐시 밖에서 적용한다. 이전 null fallback 혼입으로 기사 렌더가 실패하던 수정이 코드에 있고 운영 배포도 유지됨을 대조했다. 이번 Google 알림의 직접 원인이 그 과거 버그였다는 증거는 아직 없다.

게시 기사는 명시적으로 index/follow를 반환하며 없는/미게시 기사는 notFound를 사용한다. 이 정상 정책을 바꾸지 않았다.

실행:

```bash
pnpm seo:audit:noindex -- --base https://culturepeople.co.kr --url https://culturepeople.co.kr/article/4363 --url https://culturepeople.co.kr/article/4829
pnpm exec vitest run tests/unit/article-metadata-indexing.test.ts tests/unit/article-noindex-audit-script.test.ts tests/unit/robots-txt-route.test.ts tests/unit/public-page-metadata.test.ts tests/unit/db-server-read-adapter.test.ts --maxWorkers=2 --no-file-parallelism
```

- audit: 2개 기사, blocking 0.
- tests: 5 files, 61 tests passed.
- 감사 증빙: `/home/arbada/culturepeople-d1-hotfix-20261004/.seo-audit-runs/noindex-audit-2026-10-15T13-38-01-185Z.json` 및 같은 이름 Markdown.
- 감사기의 `--url` 입력은 현재 일괄 `source=search_console`로 처리돼 정상 응답을 `stale_search_console`로 분류한다. **이번 표본이 실제 Google 알림 대상이었다거나 Search Console이 오래된 결과라는 확정 근거가 아니다.** 본 문서는 원시 status/meta/canonical 결과만 정상 근거로 사용한다. 분류의 출처·시각 근거 개선은 후속 진단 도구 과제다.
- 이번에는 앱 코드 변경이 없어 전체 unit/typecheck/build/production 재배포를 실행하지 않았다.

## 6. 남은 확인과 해결 절차

상태: `PARTIAL_VERIFIED_AFFECTED_URLS_UNKNOWN`.

1. 대표자가 Search Console → 페이지 색인 생성 → 서버 오류(5xx)와 NOINDEX 각각의 예시 URL·최종 크롤링 시각을 CSV로 내보낸다. 인증된 Console 보고서 내용은 이번 도구로 읽지 못했다.
2. 제공된 실제 URL만 소량 확인하고 현재 운영 status·meta/header·canonical·게시/삭제 상태·배포 시각과 비교한다.
3. 공개 게시 기사에서 실제 5xx 또는 noindex가 재현되면 그 공통 원인을 수정하고 회귀 테스트 후 clean release로 배포한다. 장애를 숨기려고 500을 빈 200/404로 바꾸지 않는다.
4. 검색/관리자/미리보기 등 의도된 noindex나 삭제 기사 404면 유지한다. 과거 게시 기록만으로 삭제 기사를 복원하지 않는다.
5. 해당 공개 기사 라이브가 정상이고 과거 실패만 남았을 때 URL Inspection 라이브 테스트, 필요한 기사 색인 요청, 해당 이슈 유효성 검사를 진행한다. 현재 표본 정상만으로 전체 이슈 유효성 검사를 성공했다고 표시하지 않는다.

## 7. 공식 근거

- [Google HTTP 상태 코드 처리](https://developers.google.com/crawling/docs/troubleshooting/http-status-codes): 5xx는 크롤링 감소·장기 지속 시 색인에 영향을 줄 수 있으며 200이 색인을 보장하지 않는다.
- [Google noindex 안내](https://developers.google.com/search/docs/crawling-indexing/block-indexing): meta 또는 HTTP header를 확인해야 한다. robots.txt 차단만으로 noindex를 대체하지 않는다.

## 8. 변경 경계

신규 보고서와 누적 대장만 작성·보완했다. 메일 전송/삭제/라벨 변경, DB 쓰기, 결제, 캐시 강제 비우기, DNS/Auth0/Worker 변경, 기사 복구·삭제, Vercel 배포는 하지 않았다. 문제를 재현하지 못했으므로 임의 수정으로 정상 서비스를 위험에 노출하지 않았다.
