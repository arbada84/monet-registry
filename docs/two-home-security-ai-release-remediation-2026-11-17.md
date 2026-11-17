# 두 홈·보안·GPT 모델 선택 통합 반영 기록

> 최신 상태: 2026-11-17 23:45 KST `907e47529ee1447529141b8396b607d147ac62c7`을 운영 반영했다. 아래의 아직 미배포·CI 진행 중·일괄 백업/Supabase 선행조건 설명은 작업 당시 이력이다. 실제 CI 실패와 Vercel 빌드 성공을 구분한 최종 판단 및 배포 후 검증은 [최종 운영 결과](two-home-production-result-2026-11-17.md)에 기록했다.

기준일: 2026-11-17 KST.

## 사용자 요청과 범위

기존 두 홈 모드 배포 차단을 기록에서 조사하고 해결하도록 승인받았다. 이어서 /cam/ai-settings의 GPT 모델 목록도 같은 배포 묶음에 넣고 커밋하도록 요청받았다.

작업본은 /home/arbada/projects/culturepeople/releases/two-home-modes-20261117이다. 기존 운영 alias는 아직 dpl_HyWykUJPnBq2dSryQaVgJi4Uzirs이며, 이전 후보 a8f9dab/dpl_Ezy13vU83V7xAYvpgwupx9ArFs3Z는 이번 추가 수정 이전 소스다.

## 찾은 자료와 원인

- ~/.local/state/culturepeople/insight-home-20261116/pstack-blockers.md: 홈 전용 릴리스에서 기존 보안 패치가 제외된 과정과 원격 CI 실패 원인.
- 같은 폴더 ci-job-132878953262.log: 원격 306d0f5 CI는 audit에서 높음 50건·치명 6건으로 실패.
- ~/.migration/20261115-culturepeople-laptop-copy/evidence/ram-restore-check.json: 과거 11월 13일 snapshot의 기사 5008건·raw 49358건·미디어 4034건 실제 복원 기록. 현재 독립 두 archive 복원 증거는 아니다.
- ~/.local/state/culturepeople/desktop-backup-cutover-20261116/legacy-second-copy.json: 두 물리 디스크 암호문 사본 검증. 신규 원격 백업 또는 복호화 검증은 아니다.
- 같은 폴더 fixture-restore-primary.json 및 fixture-restore-second.json: fixtureOnly 합성 검증. 운영 증빙으로 재사용하지 않는다.
- ~/.local/state/culturepeople/insight-home-20261116/supabase-vercel-production-check.json: 실제 등록 URL이 도달 불가였던 기록. 승인된 예외가 아니다.
- 같은 폴더 release-gate-final.json: 32a086c의 실패 보고서. 현재 SHA로 바꾸어 재사용하지 않는다.

Antigravity가 자료 경로와 범위를 조사했고 Claude가 gate·manifest·의존성·AI 모델 호환을 독립 검토했다. Codex가 실제 파일과 대조하고 수정·테스트했다. 두 검토 모두 현재 운영 승격용 증빙이 충분하다고 판정하지 않았다.

## 반영한 수정

1. 기존 main의 보안 의존성 필드만 추출했다. package scripts와 무관한 AI·Worker·cron 코드 전체를 복사하지 않았다.
2. follow-redirects 1.16.2, joi 18.3.1을 추가 보완하고 독립 node_modules와 lockfile을 생성했다. 다른 작업본의 node_modules symlink만 해제했으며 대상 디렉터리는 삭제하지 않았다.
3. 격리 원격 release/two-home-complete-20261117 브랜치 push를 위한 CI 트리거와 Node 24를 지정했다. 원격 push·동일 SHA CI 성공은 아직 실행 증거가 없다.
4. GPT 선택지에 gpt-6.1-sol, gpt-6.1-terra, gpt-6-luna, gpt-6-astra를 추가했다. 존재를 확인하지 못한 gpt-6.1-luna는 만들지 않았다.
5. GPT-6 모델을 Responses API로 라우팅한다. 기존 reasoning low, max_output_tokens를 유지하고 temperature/max_tokens를 보내지 않는 모의 네트워크 테스트를 추가했다.
6. 릴리스의 기존 기본값 gpt-5.5 및 자동등록 기본값 gpt-4.1-mini를 유지했다. 운영 API 키, 저장 모델, provider, 예산, cp-site-type을 변경하지 않았다.
7. GPT-5.5와 GPT-5.4 Mini의 구식 최신 표기를 기존 호환·기존 경량으로 정정했다.

공식 확인:
- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/models/all
- https://developers.openai.com/api/docs/guides/latest-model

## 검증

- pnpm check:audit: 높음 0·치명 0, 보통 14건 잔존. 검사 기준을 낮추지 않았다.
- 전체 Vitest: 120개 파일, 600개 테스트 통과.
- ci:typecheck, ci:lint 통과.
- 신규 GPT 4종의 요청 경로·파라미터 검사는 mock fetch이며 실제 유료 생성이나 계정별 사용 권한 확인은 하지 않았다.
- 첫 운영 빌드는 next/font Google loader의 URL 확장자 추출 오류로 실패. 같은 loader로 Google font CSS 3종을 재조회해 잘못된 URL이 없음을 확인하고 빌드를 재실행했다. 최초 실패를 숨기거나 원인을 확정하지 않는다.
- 두 번째 운영 빌드는 Next.js 15.5.28로 종료 0, 정적 페이지 152개 생성까지 통과했다. 추가 코드 수정 없이 재실행에 성공했으며 최초 폰트 오류의 정확한 외부 원인은 미확정이다.
- Puppeteer 25로 실제 로컬 브라우저를 실행했다. 기존 스모크가 새 홈의 검색·분야 메뉴 aria-label을 놓쳐 두 테마의 정확한 버튼 이름을 추가했다. 검색 수정 후 재실행에서 데스크톱·모바일 검색 클릭과 input 표시, 이미지 로딩, 가로 넘침·겹침 없음이 확인됐다. 기사·분야 데이터는 로컬 인증이 없어 비어 있으므로 전체 smoke는 종료 1이고 기사 검사는 skipped다. 메뉴 selector 추가 후 브라우저 재검증은 별도 필요하다. 임시 서버 3097은 종료됐다.
- CLI HTTPS push는 인증 부재로 실패했다. 연결된 GitHub 앱으로 범위 내 파일만 구성한 tree를 생성했고 로컬 소스 tree SHA와 동일함을 확인했다. 실패한 push를 성공이라고 표시하지 않는다.

## 남은 배포 조건

새 소스의 빌드·원격 CI·인증된 후보 검증과 현재 gate의 백업·독립 복원·Supabase 복구 또는 승인된 예외가 필요하다. 과거 다른 SHA의 통과 manifest를 복사하거나 실패를 성공으로 바꾸지 않는다.

Claude는 운영 Worker 번들에도 GPT-6 라우팅이 맞는지 확인해야 한다고 지적했다. 이번 릴리스는 Worker를 배포하지 않는다. Next 설정 화면 선택지 반영만으로 Worker 호환까지 완료했다고 주장하지 않는다. 운영 전역 모델을 GPT-6로 저장하기 전 Worker의 실제 버전·호환 확인이 필요하다. 롤백 시 저장된 모델과 구형 호출 코드의 호환도 함께 확인해야 한다. 운영 설정을 자동 변경하지 않는다.

현재 범위는 더 이상 UI-only가 아니라 두 홈 + 의존성 보안 + GPT 모델 선택지다. production 승격은 별도 증빙 통과 전까지 미완료다.

## 커밋과 원격 보존

- 로컬 보안·모델 묶음: 6016354. 스모크 selector와 기록 보완: bd272a4.
- GitHub 앱으로 생성한 원격 정본: 907e47529ee1447529141b8396b607d147ac62c7.
- 격리 브랜치: release/two-home-complete-20261117. main과 main 대상 PR은 변경하지 않았다.
- 원격 정본과 로컬 bd272a4의 전체 tree는 4c2e87c8dc6414584a9d1601fc74422528622815로 같다. 커밋 메타데이터·부모 차이를 파일 내용의 차이로 숨기지 않는다.
- CI: https://github.com/arbada84/monet-registry/actions/runs/44101293032 (기록 시 진행 중). 초기 6b82fc5 실행은 concurrency 정책으로 취소됐다. CI 진행 중을 성공으로 계산하지 않는다.
- 원격 보존은 모델 선택지의 실제 운영 적용이나 gate 통과가 아니다. 현재 production alias와 저장된 AI 설정은 변경하지 않았다.
