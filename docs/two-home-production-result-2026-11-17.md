# 두 홈과 AI 모델 목록 운영 반영 결과

## 최종 상태

2026-11-17 23:45 KST 운영 승격 성공. 후보 생성과 실제 운영 연결을 구분하며, 아래 deployment가 culturepeople.co.kr alias에 연결된 것을 API로 재확인했다.

- 운영: https://culturepeople.co.kr
- deployment: `dpl_9UescKCZswG7J4gbD5JtgH2euWNk`
- 고정 소스: `907e47529ee1447529141b8396b607d147ac62c7`
- tree: `4c2e87c8dc6414584a9d1601fc74422528622815`
- 원격 보존: `release/two-home-complete-20261117`
- clean 배포 작업본: `/home/arbada/projects/culturepeople/releases/two-home-final-20261117`
- 롤백 deployment: `dpl_HyWykUJPnBq2dSryQaVgJi4Uzirs`

## 범위와 배포 판단 정정

컬처피플·인사이트코리아 홈, 보안 의존성, GPT 선택 목록과 Responses 라우팅, 관련 테스트·스모크를 반영했다. 기존 대량 dirty main을 배포하지 않았다.

실제 공개 runtime은 D1/R2이며, 관련 dual-write는 모두 false다. 따라서 과거 Supabase 복구와 백업 복원 조건을 이번 비데이터 변경 릴리스의 필수 조건으로 일괄 적용한 판단은 부정확했다. 사용자 진행 승인 후 별도의 읽기 전용 application-update 검증으로 범위를 확인했다. 일반 release gate, 기존 manifest, 배포 스크립트의 조건을 삭제하거나 실패 manifest를 통과로 조작하지 않았다.

GitHub CI run `44101293032`는 재시도까지 next/font Google URL 확장자 파싱으로 빌드 실패했다. **CI 전체 통과가 아니다.** 동일 소스의 600개 단위 테스트와 린트 통과, 별도 로컬 타입 검사 및 운영 빌드 통과, Vercel production 환경 실제 후보 빌드 READY를 각각 근거로 사용했다. CI 폰트 빌드 재현성 문제는 남는다.

검증 스크립트 `scripts/verify-two-home-application-release.mjs`는 이번 고정 릴리스 전용이다. clean HEAD, 파일 허용 목록, package 메타데이터, 후보 production target, 실제 소스 SHA, 예상 운영 alias, D1/R2·중첩 dual-write, 홈·기사·법적 상태 비교·RSS·사이트맵·robots를 읽기 전용 검증했다. 범용 배포 도구나 모든 향후 릴리스의 승인 수단으로 사용하지 않는다.

## 실제 검증

- 전체 단위 테스트: 120파일, 600개 통과.
- 타입 검사·린트: 통과. 의존성 audit: high/critical 0, moderate 14 잔존.
- 후보: production 환경 빌드 READY, 인증된 curl 검증 통과.
- 승격: `vercel@65.17.0 promote <위 deployment> --yes --timeout 3m` 성공. 검증한 동일 산출물을 사용했다.
- 운영 alias API: 위 deployment와 일치.
- 공개 브라우저: 데스크톱·모바일 각각 홈/검색/문화 카테고리/about/contact/advertising/youth-policy/기사, 합계 **16/16 통과**. skipped 0, warning 0.
- 검색 오버레이, 모바일 메뉴, 이미지, 가로 넘침, 주요 콘텐츠 겹침, same-origin 오류 검사 통과.
- portal surface: ads.txt, RSS/feed, sitemap/news-sitemap와 이미지 항목·내부 경로 제외, **11/11 통과**.
- `/api/health`: 200, D1 정상, R2 정상.
- `/alidot`, `/alidot/terms`, `/alidot/privacy`: 직접 200.
- `/article/23`: `/article/275`로 308 유지. `/article/57`: 삭제 기사 404 유지.
- 후보에서 홈이 연결한 게시 기사: 200, 자기 production canonical, NewsArticle, meta noindex 없음.
- 운영 홈: 200, 새 InsightKoreaNewsHome, H1 1개, X-Robots-Tag noindex 없음.
- 375/1440px 실제 스크린샷 확인: H1 1개, 기사 링크 26개, 가로 넘침 없음.
- 현재 선택 타입은 insightkorea 그대로다. CulturePeopleHome은 실제 SSR 회귀 테스트로 검증했으며 운영 타입을 바꿔 라이브 검증하지 않았다.
- 관리자 AI 화면은 로그인 보호 상태다. 선택 목록 코드와 source SHA 배포는 확인했으나 관리자 로그인 후 실제 선택·유료 API 생성은 실행하지 않았다.

## 변경하지 않은 것과 남은 일

- 운영 DB·기사·API 키·저장 AI provider/model·사이트 타입·예산·Worker·DNS·인증 설정은 변경하지 않았다.
- GPT 목록은 추가했지만 기본값은 기존 gpt-5.5 / 자동등록 gpt-4.1-mini를 유지한다. 운영 Worker의 GPT-6 호출 호환을 별도로 확인하기 전 전역 자동등록 모델을 바꾸지 않는다.
- 기존 약관·개인정보·청소년보호 법적 정보 누락 상태는 운영과 후보 비교에서 동일했다. 법적 내용이 완성됐다고 표시하지 않는다. 대표자 확인 후 별도로 수정해야 한다.
- legacy Supabase 접근, 이미지 미확보, 백업 인증·독립 복원과 디스크 문제는 이 릴리스로 해결되지 않았다.
- CI 폰트 다운로드 파싱 실패는 후속으로 원인 재현·수정해야 한다. 단순 재시도 성공을 근본 해결로 간주하지 않는다.

## 증빙과 복구

보호된 로컬 결과는 `~/.local/state/culturepeople/` 아래에 있다.

- `application-release-20261117.json`: application-update 사전 검증, 스크립트 hash·tree·CI 한계 포함.
- `application-promotion-20261117.json`: 승격 실행 결과와 롤백 ID.
- `application-postflight-20261117.json`: 운영 alias와 URL 상태.
- `portal-postflight-20261117.json`: portal 11개 결과.
- `browser-postflight-20261117.json`: 실제 브라우저 16개 결과.
- `home-live-20261117/home-375.png`, `home-1440.png`: 실제 공개 화면.

후속 작업자는 새 변경 여부를 먼저 확인하고 회귀가 있을 때만 보호된 기존 인증을 환경변수로 연결해 다음 명령을 실행한다. 토큰을 argv나 문서에 넣지 않는다.

```sh
npx --yes vercel@65.17.0 promote dpl_HyWykUJPnBq2dSryQaVgJi4Uzirs --yes
```

롤백 후 alias·health·공개 홈을 다시 검사한다. 현재 검사에서는 새 회귀가 없어 롤백하지 않았다.
