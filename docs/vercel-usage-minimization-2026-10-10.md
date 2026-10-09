# Vercel 사용 최소화 적용 기록

기준일: 2026-10-10 KST. 이번 범위는 CulturePeople 공개 사이트이며 DonJup/MCP 서버 이전은 포함하지 않는다.

## 확인한 원인

- 배포 전 홈 브라우저 검사는 375px에서 자동 prefetch 21건, 1440px에서 34건을 관측했다. 실제 클릭하지 않아도 기사/카테고리/정책 페이지 요청이 발생했다.
- 공개 설정이 기존 `/api/db/settings` no-store 경로를 사용해 헤더/푸터/공유 버튼에서 반복 조회됐다.
- 홈 카드에 필요하지 않은 기사 내부 메타데이터가 클라이언트에 직렬화됐다.
- HTML은 CSP nonce와 `headers()` 때문에 동적 응답이다. 보안을 약화하거나 nonce가 포함된 HTML을 공용 캐시에 강제로 넣지 않는다.

## 구현

1. `PublicLink`로 공개 기사/카테고리/검색/기자/태그 및 두 Next Link 기반 테마의 자동 prefetch를 비활성화했다. 클릭 이동은 유지하며 관리자 링크는 변경하지 않았다. netpro 홈의 일반 `<a>`는 이미 자동 prefetch가 없다.
2. `/api/public/site-settings`는 공개 표시용 키 5개만 허용하며 익명 JSON을 60초 브라우저/CDN 캐시로 제공한다. 쿠키/권한별 내용이나 요청 fallback 값을 섞지 않는다. 비밀/메일/관리자/광고 전체 설정은 제외하고 장애 응답은 no-store다.
3. 공개 브라우저 설정은 동시 조회를 합치고 60초 동안 재사용한다. 관리자 설정 읽기/쓰기와 strict 읽기는 기존 인증/no-store를 유지한다. 성공 저장 후 같은 브라우저의 메모리 캐시를 비운다. HTTP 캐시 전파는 최대 60초이며 기사 게시 캐시는 이번 작업에서 늘리지 않았다.
4. 기사 공유 버튼도 공통 설정 클라이언트를 사용한다. 홈 데이터는 카드에 필요한 필드와 240자 미리보기만 전달하고 원본 본문/DB를 변경하지 않는다.
5. 캐시용 새 JSON API에만 nonce 없는 제한적 CSP를 적용한다. HTML 및 기존 API의 CSP/인증은 유지한다.
6. `performance:verify:requests`는 공개 홈을 두 화면 크기로 열어 scroll/hover 시 요청 수, prefetch, API, 가로 넘침, 동일 출처 오류를 검사한다. 모든 쓰기와 외부 광고/분석 요청은 차단한다. 전체 광고/관리자 테스트나 CPU 측정의 대체가 아니다.

## 검증 명령

```bash
pnpm ci:typecheck
pnpm test:unit --maxWorkers=2
pnpm performance:verify:requests -- --base https://culturepeople.co.kr --require-optimized --report .ops-audit-runs/vercel-request-budget.json
pnpm verify:portal -- --base https://culturepeople.co.kr
```

Node 기반이므로 Windows/Linux 공통이다. 브라우저는 Puppeteer 설치 브라우저 또는 `PUPPETEER_EXECUTABLE_PATH`로 지정한다.

## 검증 및 반영 상태

- 운영 기준 소스: `cfcbfbfda07f79eefa1941df5b5cd737ca168875`. 기존 production: `dpl_AVoaUoxjqiG4FG77FMqmFM8RzWw9`.
- 격리 릴리스에서 단위 테스트 116파일/574개 통과, 타입 검사 통과. 마지막 공유 버튼/CSP 범위 축소 후 관련 3파일/54개 재통과.
- 후보 빌드/운영 배포/배포 후 요청 비교는 아래 운영 증빙에서 최종 상태를 확인한다. 아직 실행하지 않은 단계는 완료로 보지 않는다.

## 남는 한계

- CPU 사용량 감소율은 배포 후 Vercel 프로젝트별 Usage/Observability의 같은 기간·같은 트래픽 기준으로 확인해야 한다. 요청 수 감소가 CPU 감소율과 같지는 않다.
- 이미 소비한 무료 한도는 코드 수정으로 초기화되지 않는다. 같은 팀의 DonJup/MCP 사용량도 별도 관리가 필요하다.
- 최대 절감을 위한 HTML ISR/정적화는 nonce 보안 방식/광고/관리자 분리와 게시 무효화 설계가 선행돼야 한다. 이번에는 안전한 데이터 캐시를 유지하고 불필요한 렌더 요청부터 없앤다.
- 익명 캐시는 공개 표시값에만 적용한다. 새 공개 설정 키를 추가하기 전 secret 포함 여부를 검토하고 allowlist/테스트를 함께 변경해야 한다.

## 롤백

운영 검증에서 기사 5xx, 메뉴/공유 설정 장애 또는 정상 게시 기사의 noindex가 나타나면 위 기존 production 배포로 롤백한다. 이번 변경은 additive API 및 클라이언트 최적화이며 DB migration/기사 일괄 수정/크롤러 증설은 없다.
