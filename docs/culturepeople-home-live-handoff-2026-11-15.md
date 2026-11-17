# 컬처피플 홈 라이브 반영 준비

상태: 로컬 구현·검증 완료, 운영 배포·타입 전환 미실행.

## 구현

- `culturepeople/index.ts`의 홈 export만 신규 `CulturePeopleHome`으로 연결했다. 다른 테마와 기존 상세·카테고리 화면은 변경하지 않았다.
- 승인된 보라색 목업의 분리형 대표 기사, 최신 목록, 반응형 분야 목록을 실제 공개 기사 데이터에 연결했다.
- 로고 마크 PC 57px/모바일 46px, 브랜드 글씨 PC 38px/모바일 30px, 메뉴 PC 21px/모바일 19.5px, 날짜 PC 24px, 최신 기사 보기 18px, 하단 문구 16.5px.
- 목업의 고정 날짜·기사·사진을 운영 코드에 복사하지 않았다. 날짜는 한국 시간 기준이다.
- 게시 상태·삭제 상태·중복 ID 필터, 대표/최신 기사와 분야 목록의 ID 중복 제외, 공유 이미지 기사 보존, 분야 순서/숨김 설정 유지, 남은 분야 1개도 표시한다.
- 실제 분야 링크, 기사 번호 우선 링크, 검색, 광고 4개 슬롯, 팝업, 쿠팡, 기존 법적 푸터와 알리닷 링크를 유지했다.
- 인기도는 홈에 전달된 기사 표본의 조회수 순위이며 최신 목록 배치와 독립적으로 선정한다.

## 검증

- `pnpm test:unit tests/unit/culturepeople-home-layout.test.ts tests/unit/site-type-consistency.test.ts tests/unit/home-seo-language-heading.test.ts tests/unit/public-footer-fallback.test.ts --maxWorkers=2 --testTimeout=120000`: 4개 파일 21개 통과.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: 통과.
- `git diff --check`: 통과.
- `node scripts/run-next-portable.mjs build`: 통과. Next 운영용 빌드만 실행했으며 pnpm의 메타데이터 생성 prebuild나 배포 스크립트는 실행하지 않았다.
- 빌드 결과를 localhost 임시 서버에서 1440/390/320px로 확인: HTTP 200, 가로 넘침 없음, 브라우저 JS 오류 없음. 모바일 검색 열기·포커스·Escape 닫기 확인. 임시 서버 종료.
- MSI에는 운영 DB 인증이 없어 로컬 화면은 빈 기사 상태였다. 실제 운영 데이터가 연결된 preview에서 이미지·분야·광고 조합을 추가 검증해야 한다.

## 운영 확인 및 차단 요인

- 공개 GET `/api/db/settings?key=cp-site-type`은 `{"success":true,"value":{"type":"insightkorea"}}`를 반환했다.
- `node scripts/deploy-culturepeople-vercel.mjs --check-token`에서 `CULTUREPEOPLE_VERCEL_TOKEN` 누락 확인. 표준 Vercel CLI 인증 파일도 없었다. 값은 출력하지 않았다.
- 운영 설정 변경용 관리자/CRON 인증도 현재 환경에 없다.
- 기존 dirty 변경은 보존했으며 일괄 commit/push하지 않았다. 현재 작업본 자체를 배포하면 무관한 변경이 섞이므로, 후속 배포에는 실제 운영 기준선과 대조한 clean 릴리스 후보가 필요하다.

## 이어서 할 일

1. 안전한 로컬 인증 수단으로 컬피 전용 배포·운영 설정 권한을 연결한다. 채팅으로 비밀 값을 전달하지 않는다.
2. 운영 기준선과 기존 dirty 변경을 대조하고 이번 변경만 포함하는 clean 릴리스 후보를 구성한다.
3. 인증된 preview에서 `culturepeople` 화면과 실제 기사·분야·광고·상세/카테고리 이동을 확인하고 release gate/manifest를 확보한다.
4. 검증된 후보를 운영 배포한 다음, 기존 설정값을 보관하고 인증된 설정 API/관리자에서 `cp-site-type`만 `culturepeople`로 전환한다.
5. 실제 공개 홈과 모바일·상세·카테고리를 재확인한다. 실패하면 기존 타입 `insightkorea`와 이전 배포로 복원한다.

백업 writer/예약은 노트북 담당 그대로다. 뉴스레터·auto-news·Gemini/Antigravity는 재개하지 않았다.
