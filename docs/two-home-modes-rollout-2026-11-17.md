# 두 홈 모드 통합 릴리스 준비

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
