# Vercel 사용 최소화 적용 기록

기준일: 2026-10-10 KST. 이번 범위는 CulturePeople 공개 사이트이며 DonJup/MCP 서버 이전은 포함하지 않는다.

## 확인한 원인

- 배포 전 홈 브라우저 검사는 375px에서 자동 prefetch 21건, 1440px에서 34건을 관측했다. 실제 클릭하지 않아도 기사/카테고리/정책 페이지 요청이 발생했다.
- 공개 설정이 기존 `/api/db/settings` no-store 경로를 사용해 헤더/푸터/공유 버튼에서 반복 조회됐다.
- 홈/카테고리/태그/검색 목록에 필요하지 않은 전체 본문과 기사 내부 메타데이터가 클라이언트에 직렬화됐다.
- HTML은 CSP nonce와 `headers()` 때문에 동적 응답이다. 보안을 약화하거나 nonce가 포함된 HTML을 공용 캐시에 강제로 넣지 않는다.

## 구현

1. `PublicLink`로 공개 기사/카테고리/검색/기자/태그 및 두 Next Link 기반 테마의 자동 prefetch를 비활성화했다. 클릭 이동은 유지하며 관리자 링크는 변경하지 않았다. netpro 홈의 일반 `<a>`는 이미 자동 prefetch가 없다.
2. `/api/public/site-settings`는 공개 표시용 키 6개만 허용하며 익명 JSON을 60초 브라우저/CDN 캐시로 제공한다. 쿠키/권한별 내용이나 요청 fallback 값을 섞지 않는다. 비밀/메일/관리자/광고 전체 설정은 제외하고 장애 응답은 no-store다.
3. 공개 브라우저 설정은 동시 조회를 합치고 60초 동안 재사용한다. 관리자 설정 읽기/쓰기와 strict 읽기는 기존 인증/no-store를 유지한다. 성공 저장 후 같은 브라우저의 메모리 캐시를 비운다. HTTP/메모리 캐시 각각 60초이며 계층 합산 약 120초의 설정 전파 지연이 가능하다. 기사 게시 캐시는 이번 작업에서 늘리지 않았다.
4. 기사 공유 버튼과 공개 팝업도 공통 설정 클라이언트를 사용한다. 홈/카테고리/태그/검색 목록은 카드에 필요한 필드와 240자 미리보기만 전달하고 원본 본문/DB를 변경하지 않는다. 검색 매칭/필터/정렬은 기존 전체 데이터에서 먼저 처리한다. 기자 페이지의 서버 렌더링은 유지한다.
5. 캐시용 새 JSON API에만 nonce 없는 제한적 CSP를 적용한다. HTML 및 기존 API의 CSP/인증은 유지한다.
6. `performance:verify:requests`는 공개 홈을 두 화면 크기로 열어 scroll/hover 시 요청 수, prefetch, API, 가로 넘침, 동일 출처 오류를 검사한다. 모든 쓰기와 외부 광고/분석 요청은 차단한다. 전체 광고/관리자 테스트나 CPU 측정의 대체가 아니다.

## 검증 명령

```bash
pnpm ci:typecheck
pnpm test:unit --maxWorkers=2 --testTimeout=15000
pnpm performance:verify:requests -- --base https://culturepeople.co.kr --require-optimized --report .ops-audit-runs/vercel-request-budget.json
pnpm verify:portal -- --base https://culturepeople.co.kr
```

Node 기반이므로 Windows/Linux 공통이다. 브라우저는 Puppeteer 설치 브라우저 또는 `PUPPETEER_EXECUTABLE_PATH`로 지정한다.

## 검증 및 반영 상태

- 운영 반영 완료: 2026-10-10 04:25 KST. production alias `https://culturepeople.co.kr`가 Vercel API에서 새 배포를 가리키는 것을 확인했다.
- 배포 ID: `dpl_AXzv7ErjzBuyWU5cjnHex4WH4agj`. 최종 소스: `f5ef7c844b4b0a14661e32527254d4e0d0059af6`.
- 운영 기준 소스 `cfcbfbfda07f79eefa1941df5b5cd737ca168875` 위에 이번 범위의 35개 파일만 세 커밋 `ff2c43c`, `503c8b6`, `f5ef7c8`으로 반영했다. main 폴더의 기존 대량 미커밋 변경은 보존하고 그대로 배포하지 않았다.
- clean 격리 릴리스의 release manifest는 `cp-f5ef7c844b4b-4dcbbdab8ce7`, dirty=false, gate=true다. production 환경 후보의 원격 빌드 성공 후 검증하고 추가 빌드 없이 promote했다.
- 단위 테스트 116파일/575개 통과, `pnpm ci:typecheck`와 수정 범위 lint 통과, 원격 production build의 lint/type 검사 통과.
- 로컬 다른 작업의 부하로 기본 5초 테스트 제한에서 import timeout이 발생했다. 2 worker/15초 제한으로 전체를 재실행했다. 목록 DTO 변경으로 달라진 source guard fixture는 수정했고 575개를 모두 다시 통과시켰다. 실패 리포트를 숨기지 않고 보존했다.
- 후보 공개 브라우저 smoke: 모바일/데스크톱 총 16화면 통과. 홈 검색, 메뉴, 기사/카테고리, 정책 페이지, 이미지 표시, 가로 넘침을 확인했다. 390/1440px 실제 이미지 포함 스크린샷도 확인했다. 조회수 전송과 모든 쓰기를 검증 환경에서 대체했으므로 조회수 API와 관리자 흐름의 종단 검증을 의미하지 않는다. 외부 광고 warning은 별도 위험으로 남긴다.
- 운영 `/api/health`, `/`, `/article/4363`, `/category/문화`, `/search?q=문화` 200. 기사 canonical과 NewsArticle 유지, 게시 기사 meta/header noindex 없음. 검색의 의도된 noindex는 유지.
- 운영 `verify:portal`: ads.txt, rss.xml, feed.xml, sitemap.xml, news-sitemap.xml 검증 통과. `/rss`, `/feed`는 기존 308이며 XML 직접 경로는 200이다.
- 공개 메뉴 설정은 200과 두 번째 요청 `x-vercel-cache: HIT`, 비밀 키 `cp-api-keys`는 예상된 400/no-store를 확인했다. 본문/secret 값을 로그에 출력하지 않았다.
- 운영 request-budget: 375/1440px 모두 prefetch=0, 기존 no-store 설정 경로 호출=0, 동일 출처 오류/가로 넘침=0.

### 전후 비교

| 항목 | 변경 전 | 변경 후 운영 | 해석 |
| --- | ---: | ---: | --- |
| 모바일 자동 prefetch | 21건 | 0건 | 홈 열기/scroll/기사 hover 기준 |
| 데스크톱 자동 prefetch | 34건 | 0건 | 같은 검사 기준 |
| 모바일 동일 출처 GET | 88건 | 67건 | 외부 광고/분석과 쓰기를 차단한 검사 |
| 데스크톱 동일 출처 GET | 87건 | 53건 | 요청 수이며 과금 invocation 수와 다름 |
| 홈 응답 크기 | 551,634 bytes | 324,880 bytes | 비압축 응답 약 41% 감소 |
| 공개 설정 | no-store/MISS | 60초 public 캐시/HIT | 허용된 표시용 설정만 |

카테고리 응답은 DTO 변경 전 중간 후보 1,111,646 bytes에서 운영 629,757 bytes로, 검색은 중간 후보 371,231 bytes에서 운영 136,512 bytes로 감소했다. 두 값의 비교 기준은 최초 운영이 아닌 중간 후보이며 CPU/전송 과금의 절감률로 해석하지 않는다. 기사 본문 페이지는 동일한 83,866 bytes를 유지했다.

### 운영 증빙

- `.release-manifests/vercel-minimization-gate.json`, `vercel-minimization-release.json`, `vercel-minimization-promotion.json`
- `.ops-audit-runs/vercel-minimization-unit.json`, `vercel-minimization-unit-first.json`
- `.ops-audit-runs/vercel-minimization-candidate-surface-final.json`, `vercel-minimization-production-surface.json`
- `.ops-audit-runs/vercel-request-budget-before.json`, `vercel-request-budget-candidate-final.json`, `vercel-request-budget-production.json`
- `.ops-audit-runs/vercel-public-smoke-candidate-final.json`, `vercel-public-visual-final/`
- `.deploy-logs/culturepeople-vercel-2026-10-09T19-06-40-741Z.log`, `vercel-minimization-promotion.log`
- `.ops-audit-runs/vercel-superseded-candidate-cleanup.json`: 이번 작업에서 생성한 중간 후보만 정리하며 새 production/이전 정상 production/사용자의 다른 배포는 제외한다.

## 남는 한계

- CPU 사용량 감소율은 배포 후 Vercel 프로젝트별 Usage/Observability의 같은 기간·같은 트래픽 기준으로 확인해야 한다. 요청 수 감소가 CPU 감소율과 같지는 않다.
- 이미 소비한 무료 한도는 코드 수정으로 초기화되지 않는다. 같은 팀의 DonJup/MCP 사용량도 별도 관리가 필요하다.
- 최대 절감을 위한 HTML ISR/정적화는 nonce 보안 방식/광고/관리자 분리와 게시 무효화 설계가 선행돼야 한다. 이번에는 안전한 데이터 캐시를 유지하고 불필요한 렌더 요청부터 없앤다.
- 익명 캐시는 공개 표시값에만 적용한다. 새 공개 설정 키를 추가하기 전 secret 포함 여부를 검토하고 allowlist/테스트를 함께 변경해야 한다.
- auto-news 중지, auto-press 운영, 기존 기사 게시 무효화 및 IndexNow 흐름을 변경하지 않았다. Supabase 복구/백업/Worker 상태는 이번 작업에서 새로 운영 검증하지 않았으므로 정상 완료로 판단하지 않는다.

## 다음 절감 단계

1. 동일 기간 프로젝트별 CPU/호출/Origin Transfer를 비교한다. Usage 확인은 이 문서에 기록한 요청 수와 분리한다. 이번 요청에는 정기 모니터링 자동화를 새로 만들지 않았다.
2. 공개 HTML을 ISR/정적화하려면 nonce 없는 공개 전용 CSP 또는 안전한 hash 기반 CSP, 광고/관리자 분리, 생성·수정·삭제·예약/Worker 게시 무효화를 먼저 별도 설계하고 테스트한다. 검증 없이 현재 nonce를 제거하거나 보안 헤더를 약화하지 않는다.
3. MCP 이전과 DonJup 최적화는 각 저장소에서 별도로 진행한다. PC/Fold3가 꺼져도 웹 서비스가 작동해야 하므로 웹 요청을 개인 장치에 무조건 의존시키지 않는다.

## 롤백

운영 검증에서 기사 5xx, 메뉴/공유 설정 장애 또는 정상 게시 기사의 noindex가 나타나면 기존 production `dpl_AVoaUoxjqiG4FG77FMqmFM8RzWw9`로 롤백한다. 해당 배포를 정리 대상으로 삼지 않는다. 검증된 credential loader로 `VERCEL_TOKEN`을 주입한 뒤 Vercel CLI의 promote/rollback 절차를 실행하고 실제 custom alias를 다시 확인한다. token을 명령행 인자나 로그에 넣지 않는다.

이번 변경은 additive API 및 클라이언트 최적화이며 DB migration/운영 기사 일괄 수정/크롤러 증설/도메인 DNS 변경/플랜 결제가 없다. 기본 HTML CSP nonce를 유지하며 운영 설정 전파에 약 120초가 걸릴 수 있지만 기사 게시 캐시 지연 기준은 늘리지 않았다.
