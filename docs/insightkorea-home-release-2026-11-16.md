# 인사이트코리아 홈 디자인 확정 및 릴리스 인계

기준일: 2026-11-16 KST. 사용자가 공식 인사이트코리아를 참고한 최종 목업(8767)을 선택했다. 앞선 `culturepeople` 타입 전환 계획은 이번 운영 반영 대상이 아니다. 현재 운영 타입 `insightkorea`를 유지한다.

## 고정 소스와 롤백

- 실제 운영 도메인 `culturepeople.co.kr`의 alias를 Vercel API로 확인했다(HTTP 200).
- 현재 운영/롤백 배포: `dpl_HyWykUJPnBq2dSryQaVgJi4Uzirs`.
- 운영 URL: `monet-registry-main-3wt44m2gh-arbadas-projects-fdc12d41.vercel.app`.
- 운영 소스: `75c74f093efe48c05bc40e5277a4a903af4d334e`.
- clean 릴리스: `/home/arbada/projects/culturepeople/releases/insight-home-20261116`.
- 브랜치: `release/insight-home-20261116`.
- 최종 소스 SHA: `32a086c6b8e7b52c08cdf62c2444501bcfdd600b`.
- 커밋: `f11784f`(구현), `32a086c`(독립 검토 지적 보완). 운영 소스가 이 릴리스의 조상임을 확인했다.
- 기존 개발 작업본의 dirty 자료를 reset/clean/일괄 commit하지 않았다. 이전 컬피 시안과 다른 provider·cron·Worker·패키지 변경은 릴리스에서 제외했다.

## 구현 범위

운영 기준선 대비 8개 파일만 변경했다.

- 신규 `InsightKoreaNewsHome.tsx`, CSS module, 데이터 선택 helper, 관련 테스트.
- `insightkorea/index.ts`의 홈 export 교체. 다른 테마와 내부 페이지 헤더는 유지한다.
- `src/app/page.tsx`: insightkorea일 때만 원문 출처 중복 제거를 서버에서 먼저 수행하고 공개 projection을 적용한다. 출처나 편집 메타데이터를 추가로 공개하지 않는다.
- 기존 `InsightKoreaFooter`의 홈 전용 옵션: 법정 정보/정책 링크를 보존하고 중복 푸터 없이 홈 글씨 크기와 문구를 반영한다.
- SEO 테스트가 실제로 사용되는 신규 홈을 검사하도록 변경했다.

대표 1+오른쪽 2 이미지, 가로 최신 기사 띠, 본문/보조 칼럼, 작은 썸네일의 분야별 목록, 모바일 이미지 아래 제목을 구현했다. 실제 기사/분야 링크와 광고 4개 슬롯, 쿠팡의 기존 `베스트셀러` 키워드, 팝업을 보존한다. 인기 순위는 조작하지 않으며 남은 최신 기사 추천을 사용한다.

독립 Claude 검토에서 오래된 추천 기사 선택, 실제 SEO 테스트 경로, sourceUrl projection 전 중복 제거, 숨김 분야와 미등록 분야, 광고 키워드, 중복 푸터 문제를 수정했다. Claude는 `32a086c`를 배포 후보 소스로 수용했으며, 배포 gate 차단은 별도로 유지한다고 판정했다.

## 인증과 검증

- 보호된 기존 Vercel 파일을 그대로 사용했다. 인증을 재복사하지 않았다. 토큰 값을 출력/로그/코드에 저장하지 않았다.
- 기존 배포 스크립트 `--check-token`: `Token state: set`.
- Vercel 프로젝트와 도메인 alias, 실제 사용자 프로필 조회 HTTP 200. 확인한 실제 사용자 계정으로 릴리스 커밋 작성자를 설정했다. Vercel 후보 업로드 자체의 작성자 권한 검증은 미실행이다.
- 관련 테스트 4파일 23개 통과.
- 최종 SHA의 기존 gate `--run`: clean, env-drift, typecheck, 전체 unit-tests, lint 통과.
- 첫 실행의 lint는 동시에 실행한 빌드의 portable runner lock 때문에 실패했다. 빌드 종료 후 gate를 다시 실행해 최종 lint 통과를 확인했다.
- 첫 구현 및 리뷰 수정 후 최종 SHA의 `node scripts/run-next-portable.mjs build` 모두 통과했다. 최종 빌드 후에도 릴리스 worktree는 clean이다.
- 최종 확인: 보호된 토큰 파일 권한 0600, 운영 타입 공개 GET은 여전히 `insightkorea`다. 실제 운영 배포는 변경하지 않았다.

## 실제 gate 결과와 배포 상태

최종 gate 보고서:
`/home/arbada/.local/state/culturepeople/insight-home-20261116/release-gate-final.json`

실패 상태를 그대로 기록한 manifest:
`/home/arbada/.local/state/culturepeople/insight-home-20261116/release-manifest.json`

manifest는 clean SHA와 롤백 ID를 포함하지만 `ok:false`다. 통과 보고서로 위장하지 않았고, gate와 배포 스크립트도 변경하지 않았다. 후보 배포/운영 배포/도메인 승격/타입 변경은 실행하지 않았다.

미확보 항목:

1. 동일 SHA의 GitHub CI 성공 증거와 큐 상태. git push는 HTTPS 쓰기 인증 부재로 실패했고 gh CLI도 없다. 연결된 GitHub 앱의 읽기 접근은 확인했으나 이번 릴리스의 원격 branch/PR/CI는 생성하지 않았다.
2. 백업 primary/second의 최신 검사와 보안 감사, 서로 다른 archive를 가리키는 secure restore 보고서 2개. MSI 표준 백업 경로와 키는 없으며, 이전 RAM 복원 증거는 현재 gate의 독립 2차 증빙 형식과 동일하지 않다. 이를 임의 변환해 통과 증거로 사용하지 않았다.
3. Supabase 복구 검증 또는 사용자가 승인한 예외 ID. 현재 릴리스 환경에 URL/키가 없어 검사 실패이며 예외를 임의 생성하지 않았다.
4. 고정된 후보 URL의 법적 정보 승인, portal/alidot/noindex/browser 검사. 후보를 아직 배포하지 않아 미확보다.

기존 노트북의 현재 백업 상태를 읽기 전용으로 확인하려 했으나 `192.168.31.198:22` 연결 거부였다. 백업 경로/예약/writer를 MSI로 전환하거나 자료를 삭제하지 않았다.

## 재개 순서

1. 위 증빙을 실제 경로로 확보하고 GitHub CI 경로를 연결한다. 백업 공간 정리·경로 변경이나 Supabase 예외는 별도 사용자 결정 사항이다.
2. 동일 clean SHA로 고정 후보를 배포하고 실제 기사 데이터/모바일/광고/법적 페이지를 검증한다. 이 단계의 Vercel 작성자 권한도 확인한다.
3. gate를 실제 증빙 및 후보 URL로 다시 실행해 통과한 manifest를 만든다.
4. 동일 소스만 운영 승격하고 공개 홈/기사/분야를 확인한다. 실패 시 위 롤백 배포로 복원한다. DB·Worker·cron을 변경하지 않았으므로 이를 배포 롤백으로 되돌렸다고 주장하지 않는다.

뉴스레터·auto-news·Gemini/Antigravity는 재개하지 않았다. 백업 예약은 노트북 담당으로 유지한다.
