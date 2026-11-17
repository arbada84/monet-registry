# 두 홈 모드 통합 릴리스 준비

> 최신 상태: 2026-11-17 23:45 KST 운영 반영 완료. 아래 미반영·차단 기록은 이전 시도의 이력이다. 최종 소스·deployment·16개 공개 브라우저 검사·11개 portal 검증은 [최종 운영 결과](two-home-production-result-2026-11-17.md)를 따른다. Supabase 복구를 이번 비데이터 변경 배포의 일괄 선행조건으로 삼았던 판단도 해당 결과서에서 정정했다.

기준일: 2026-11-17 KST.

## 범위

사용자는 이전에 개발한 두 화면의 적용을 요청했다. 대상은 culturepeople과 insightkorea 홈이다. netpro, 기사 본문, DB, Worker, cron, provider, 백업 예약은 변경 대상이 아니다.

- 개발 정본: /home/arbada/projects/culturepeople/monet-registry-main
- 통합 릴리스: /home/arbada/projects/culturepeople/releases/two-home-modes-20261117
- 기존 insight 전용 정본: 32a086c6b8e7b52c08cdf62c2444501bcfdd600b
- 브랜치: release/two-home-modes-20261117
- 작업 전 실제 운영 alias: dpl_HyWykUJPnBq2dSryQaVgJi4Uzirs
- 작업 전 공개 cp-site-type: insightkorea. 운영 설정은 변경하지 않았다.

기존 insight 전용 clean 릴리스에 culturepeople 홈 4개 파일과 theme export를 추가했다. 공개 홈 SEO 테스트가 예전 CulturePeopleLanding 대신 실제 CulturePeopleHome을 검사하도록 수정했다. 두 홈을 실제 React SSR로 렌더링하는 회귀 테스트 6개를 추가했다. 스타일의 letter-spacing은 0으로 정리했으며 기존 선택 디자인은 유지했다.

별도 릴리스는 기존 운영 소스에서 이어진 insight 전용 커밋을 기반으로 한다. main의 AI·Worker·cron·의존성·백업 변경을 통째로 포함하지 않았다. 두 작업본에 신규 테스트와 SEO 테스트 보완을 동일하게 보존했다.

## 검증

통합 릴리스에서 실행했다.

- 관련 테스트 5파일 28개 통과.
- 두 모드 실제 렌더링 6개 통과. 빈 기사 목록, 하나의 H1, 기사 no 링크, 법적 링크, 광고 4슬롯을 확인했다.
- 전체 Vitest 119파일 595개 통과.
- ci:typecheck 통과.
- ci:lint 통과.
- git diff --check 통과.

실제 UI를 고친 통합 릴리스 기준 결과다. main의 별도 안전장치 테스트 수와 혼동하지 않는다. 이번 작업에서 신규 모바일 스크린샷 검증은 아직 수행하지 않았다. 기존 각 홈의 검증은 각각의 이전 handoff에 기록돼 있다.

## 운영 적용 조건

두 코드는 배포 후 관리자 사이트 타입 선택에 따라 제공된다. 한 홈페이지에서 두 타입을 동시에 표시하거나 공개 쿼리로 강제 전환하는 기능은 추가하지 않는다. 운영 DB 타입을 확인 목적으로 변경하지 않는다.

기존 production 배포 스크립트는 통과한 release manifest를 요구한다. 이전 gate의 백업 복원 증거, 동일 SHA GitHub CI, Supabase 상태 또는 승인된 예외가 확보되지 않은 것을 성공으로 바꾸지 않는다. 정책 변경 없이 허용되는 immutable release-candidate는 production alias를 변경하지 않는다. 후보 배포와 실제 도메인 적용을 구분한다.

현재 상태와 배포 시도 결과는 이 문서에 추가 기록한다. 롤백 대상은 적용 직전 실제 alias를 재조회해 확정한다.

## 실제 시도 결과

- 통합 소스 SHA: `a8f9dabf06822d6fa2f4be35f25d696cdc724340`.
- 명령: `pnpm deploy:culturepeople -- --release-candidate --remote-build --no-pull`.
- 후보 배포 ID: `dpl_Ezy13vU83V7xAYvpgwupx9ArFs3Z`, READY.
- 후보 URL: https://monet-registry-main-41j05nckc-arbadas-projects-fdc12d41.vercel.app
- production 환경을 사용하되 `--skip-domain`으로 생성했다. production target이라는 API 표시만으로 운영 도메인 반영이라고 판단하지 않는다.
- 인증된 `vercel curl / --deployment <후보 URL>` 요청 종료 0. 새 InsightKoreaNewsHome 클래스, 실제 기사 링크 26개, H1 `컬처피플 최신 뉴스` 확인.
- 후보는 Vercel Deployment Protection이 적용돼 있다. 이를 해제하거나 로그인 페이지의 noindex를 공개 기사 noindex로 오판하지 않는다.
- main 작업본의 관련 테스트도 6파일 34개 통과했다.
- 기존 manifest를 지정한 production 명령은 `Release manifest does not contain a passed release gate.`로 종료 1. manifest를 위조하거나 gate를 수정하지 않았다.
- 최종 alias 읽기 재확인: culturepeople.co.kr은 여전히 `dpl_HyWykUJPnBq2dSryQaVgJi4Uzirs`다. 운영 홈페이지에는 미반영이다.
- 원격 CI 성공, 백업 복원 증거, Supabase 복구 또는 승인된 예외, 후보 기준 나머지 검사 등 정식 release manifest 선행조건은 아직 미확보다. 이전 gate 수치를 이번 SHA의 새 검사 결과라고 주장하지 않는다.
- 배포 로그와 영수증은 통합 릴리스의 `.deploy-logs/culturepeople-vercel-2026-11-17T13-02-27-310Z.log`, `.release-manifests/deployment-receipt-2026-11-17T13-06-59-408Z.json`에 있다.

배포 전 검사 조건을 실제 증거로 채우고 `release:manifest`를 다시 생성한 다음 기존 `deploy:culturepeople -- --release-manifest <통과한 파일> --verify` 흐름으로 운영 배포를 재개한다. 두 테마를 배포하는 일과 운영 타입을 바꾸는 일은 별개이며, 운영 cp-site-type은 insightkorea로 보존했다.
