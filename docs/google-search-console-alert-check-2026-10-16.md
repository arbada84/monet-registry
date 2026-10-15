# Google 메일·컬처피플 재점검 결과

- 확인일: 2026-10-16 KST, 라이브 감사 08:07~08:08.
- 결론: 컬피 관련 Search Console 알림2건을 원문으로 다시 확인했다. 현재 소량 라이브 검사에서는 5xx/게시 기사 noindex가 재현되지 않았다. 실제 알림 대상 URL은 메일에 없어 **전체 해결 확정은 보류**한다.
- 이번에 수정한 것은 로컬 SEO 감사 도구의 오진·누락3가지다. 공개 서비스의 robots/metadata/DB/DNS/인증/배포는 변경하지 않았다.

## 1. 확인한 메일

연결된 Gmail에서 최근30일 Google 발신자+컬피/색인 조건과 최근7일 Google 발신자 전체를 검색했다. 개인화된 보고서 링크·메일 인증 헤더·토큰은 문서에 복사하지 않는다.

| 수신 KST | 메일 | 판정 |
| --- | --- | --- |
| 10/15 21:14:42 | Search Console: NOINDEX 제외 | 영향 URL/크롤링 시각은 보고서에서 확인 필요 |
| 10/15 21:15:05 | Search Console: 사이트맵 포함 페이지 서버 오류(5xx) | 호스팅 만료 통지가 아니라 Google 크롤링 실패 알림 |
| 10/13 07:01경 | Google Cloud: AI agent OAuth client 분류를 11/11까지 점검 | Workspace MCP 관련 별도 운영 안내, 현재 컬피 검색 장애와 구분 |

AI Studio 제품 소개와 LinkedIn 연동 안내도 검색됐으나 컬피 서버 장애 메일로 분류하지 않았다. 모든 계정/스팸함/기간을 전수 확인한 결과는 아니다.

## 2. 현재 라이브 응답

기사2개는 Browser/Googlebot/Google-InspectionTool 각각 GET으로 검사했다. Google User-Agent를 보낸 요청은 실제 Google IP의 URL Inspection 실행과 다르다. 나머지 URL은 각1회만 확인했다.

| URL | 현재 결과 |
| --- | --- |
| `/` | 200, indexable, canonical 정상 |
| `/api/health` | 200, D1 health query `ok=true` |
| `/article/4363` | 3종 UA 모두200, meta/header noindex 없음, 자기 canonical·제목·H1·NewsArticle·일반 sitemap 포함 |
| `/article/4864` | 현재 sitemap에서 발견한 기사 표본, 위와 동일 |
| `/sitemap.xml` | 200, 감사 시점 loc4,676개 |
| `/news-sitemap.xml` | 200, 감사 시점 loc38개 |
| `/robots.txt` | 200, 표본 기사 Googlebot 허용 |
| `/rss.xml` | 200, RSS XML |
| `/search?q=문화` | 200, 의도된 noindex 유지 |

loc 수의 정확한 원본은 아래 JSON의 `surface.*.locCount`다. 기사표본은 실제 Google 실패 URL이라고 주장하지 않는다. 삭제/미게시 기사404, 관리자·검색·미리보기의 noindex는 정상 정책이며 해제/복원하지 않았다.

Vercel production 최근24시간 5xx 최대20건 조회는 exit0/반환0건이었다. provider 보관·조회 범위 내 결과이며, 더 오래된 장애나 Google의 과거 관측을 부정하지 않는다. 로그 조회용 토큰은 기존 프로젝트 보호 env 파일에서 읽었으며 값은 출력하지 않았다.

## 3. 실제 수정

대상: `scripts/audit-article-noindex.mjs`, `tests/unit/article-noindex-audit-script.test.ts`.

1. **과거 결과라는 무근거 판정 제거**: 모든 수동 입력을 `search_console`로 간주하던 것을 `explicit_url`로 구분했다. 현재 정상 응답은 `published_indexable`이며, source가 Search Console이라고 해도 crawl history 없이 `stale_search_console`을 확정하지 않는다.
2. **User-Agent 오류 누락 보완**: Googlebot만200이어도 다른 검사 UA에서500/503/네트워크 실패가 나면 감사가 실패한다.
3. **필수 표면 실패 누락 보완**: sitemap/news-sitemap/robots 조회 실패 시 기사표본이 정상이어도 report.ok=false/CLI exit1이다. JSON·Markdown·콘솔에 `surfaceErrors`를 명시한다.

추가 회귀 검증을 먼저 작성해 기존 구현에서6개 assertion/test case 실패를 재현한 뒤 수정했다. 신규 테스트5건, 기존 기대값1건을 교정했다. `.mjs` 로컬 도구 변경이므로 Next/Worker 재배포는 필요하지 않다.

## 4. 검증

```bash
pnpm seo:audit:noindex -- --base https://culturepeople.co.kr --url https://culturepeople.co.kr/article/4363 --sample-sitemap=1 --out-dir "$HOME/.local/state/culturepeople-google-mail-check-20261016"
node scripts/run-vitest-portable.mjs run --config vitest.config.mts tests/unit/article-noindex-audit-script.test.ts tests/unit/article-metadata-indexing.test.ts tests/unit/robots-txt-route.test.ts tests/unit/sitemap-route.test.ts --maxWorkers=2 --no-file-parallelism
pnpm test:unit
pnpm ci:typecheck
```

- 라이브 감사: 2기사, blocking0, surface failures0, published_indexable2.
- 관련 회귀: 4파일/24테스트 통과.
- 전체 단위: 117파일/597테스트 통과.
- 타입 검사: `pnpm ci:typecheck` 통과.
- lint: `pnpm lint` 통과, ESLint 오류/경고0. Next15의 lint 명령 deprecation 안내는 기존 도구 안내이며 검사 실패가 아니다.
- NTFS noexec 때문에 `pnpm exec vitest` 직접 실행은 EACCES였다. 기존 portable runner로 재실행했다. mount 보안 옵션/권한을 완화하지 않았다.
- 전체 build·사이트 재배포는 이번 CLI-only 변경에 대해 재실행하지 않았다. 이전 작업의 build 통과를 이번 실행으로 합산하지 않는다.

증거는 `/home/arbada/.local/state/culturepeople-google-mail-check-20261016`에 보존한다. `noindex-audit-2026-10-15T23-07-58-541Z.json`/`.md`, `public-surfaces.json`, `vercel-5xx-last24h.json`을 사용한다. 보호 폴더는700이며 Git에 넣지 않는다.

## 5. 남은 Search Console 작업

상태: `PARTIAL_VERIFIED_AFFECTED_URLS_UNKNOWN`.

메일에는 실패 URL과 최종 크롤링 시각이 없고, 연결된 Gmail 권한으로 Search Console의 비공개 예시 목록을 읽을 수 없다. 따라서 다음 자료가 있어야 실제 대상별 원인 판정을 완료할 수 있다.

1. Search Console → 페이지 색인 생성 → 서버 오류(5xx) → 예시 URL·최종 크롤링 시각 CSV.
2. 같은 화면의 NOINDEX 제외 → 예시 URL·최종 크롤링 시각 CSV.
3. 실제 공개 게시 기사에 대해 라이브 URL 테스트. 정상이라면 필요한 URL 색인 요청 및 이슈 유효성 검사 시작.

정상 표본을 근거로 모든 페이지를 해결했다고 표시하거나, 현재200이라는 이유만으로 과거 quota/특정 배포가 원인이라고 확정하지 않는다. 실제 대상에서 재현되면 공통 코드 원인을 수정한다. 500을 빈200/404로 숨기는 방식은 사용하지 않는다.

## 6. Google Workspace MCP 별도 안내

메일과 Google 공식 문서가 일치한다. Google Workspace MCP를 호출할 Google OAuth client는 2026-11-11까지 Google Auth Platform → Clients에서 `Use this client for an AI-powered agent` 설정을 점검해야 한다. 11/12부터 기존 client의 agentic 분류 변경이 제한되므로 무조건 활성화하지 않는다.

컬피 저장소의 src/scripts/docs와 운영 env 파일의 Google 관련 키 이름을 대조했으나 해당 메일의 Cloud project 및 Workspace MCP OAuth client를 식별하지 못했다. 이 결과는 그 Cloud project가 다른 프로그램에서도 미사용이라는 뜻이 아니다. 컬피의 자체 MCP/Auth0 인증과 Google Workspace MCP OAuth 설정을 혼동하지 않는다.

대표자 확인 순서:

1. 메일에 명시된 Cloud project 선택 → Google Auth Platform → Clients.
2. 실제 Google Workspace MCP를 호출하는 client와 REST/기타 앱 client를 식별.
3. AI agent용 client만 agentic 분류 검토. 혼합 client면 별도 client 분리를 검토.
4. 11/11 이전 설정·실연동 확인. 기존 REST 전용 일반 앱의 client를 근거 없이 변경하지 않음.

이번에는 Cloud console 설정, OAuth secret, Auth0, redirect URI를 변경하지 않았다.

## 7. 공식 근거

- [Google HTTP 상태 코드 처리](https://developers.google.com/crawling/docs/troubleshooting/http-status-codes): 5xx는 크롤링/색인에 영향을 줄 수 있고200도 색인을 보장하지 않는다.
- [Google noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing): meta/HTTP header와 실제 영향을 받은 URL을 확인해야 한다.
- [Workspace release notes](https://developers.google.com/workspace/release-notes): agentic OAuth client 분류 및11/11·11/12 일정.
- [Workspace MCP 설정](https://developers.google.com/workspace/guides/configure-mcp-servers): Google Auth Platform의 agentic 설정과 전용 client 구성.
