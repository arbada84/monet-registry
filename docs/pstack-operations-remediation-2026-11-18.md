# pstack 운영 개선 실행

## 범위와 기준

사용자 승인 순서는 자동 보도자료 AI 통일, 데스크톱 백업, 미커밋 정리, CI 폰트, 법적 정보, 배포 절차다. 자료와 기존 변경을 삭제하지 않는다. 새 유료 좌석, 정책·예산 증액, 가짜 법적 정보, 비밀 출력은 금지한다.

운영 기준은 `757c02d955822c4f6ee954a0e227591e5558ad4d` / `dpl_CRjF7AdpdFBpKm9hk6AMVKsUXnFc`다. 저장된 OpenAI gpt-6.1-sol은 실제 사이트 생성 OK를 확인했지만, Worker health는 gemini-2.5-flash를 표시한다. main의 미커밋 83파일은 운영 반영 여부와 구분한다.

## 완료 조건과 작업 순서

| 단계 | 완료 조건 | 상태 |
| --- | --- | --- |
| 원칙·기준 확인 | pstack 원칙 읽기, 현재 소스·운영·미커밋 기준 확보 | 확인 |
| 1 AI 설정 | Next cron/retry/mail/Worker가 공통 provider/model을 일관되게 읽고 실패 시 다른 provider로 우회하지 않음. 테스트·빌드·실제 배포·runtime 확인 | 구현·로컬 검증 완료. Worker 운영 배포는 Cloudflare 인증 부재로 blocked |
| 2 백업 | 최소 인증·기존 복호화 키·중복 예약 중지 증거, fresh export, 두 사본 복원 후 timer 활성화 | 안전 검사 19개 통과. 인증·기존 복호화 키·실복원 증빙 부재로 cutover blocked |
| 3 소스 정리 | 기능별 변경 목록·secret 제외·검증·독립 커밋/원격 보존, main 사용자 변경 보존 | 기존 변경 3개 로컬 커밋 보존. 원격 별도 브랜치 보존 진행 |
| 4 CI 폰트 | 외부 폰트 URL 파싱 실패의 재현·근본 수정·회귀·실제 빌드 확인 | 로컬 빌드 통과. 5개 서체·143 WOFF2·실제 해시·라이선스 검증. 동일 SHA 원격 CI 진행 |
| 5 법적 정보 | 실제 승인 정보와 미확정 항목 구분, 공개 허구 정보 금지, 정책별 검사 | 서버 승인·수정 후 승인 해제 구현/테스트 완료. 실제 법적 문안·대표자 승인은 수동 작업 |
| 6 배포 절차 | application/data 변경 분류, 실제 source/artifact/test/rollback 검증을 표준 명령으로 적용 | release:application 구현/단위 검증 완료. 실제 후보 검증 대기 |

각 단계는 로컬 재현, 최소 수정, 회귀 테스트, 독립 검토, 필요한 운영 적용, 실제 증빙 순으로 진행한다. 외부 인증이 없으면 범위를 바꿔 성공으로 기록하지 않는다. 원본 백업이 존재한다는 사실과 새 자동 백업의 성공은 다르다.

## 검토 역할과 기록

Codex가 통합 구현과 배포를 담당한다. 기존 컬피 Claude는 AI 경계·배포 위험을 읽기 전용 검토한다. 별도 Codex 검토자는 백업 조건을 읽기 전용 조사한다. 공유 main의 동시 쓰기를 하지 않는다.

결정 기록은 `~/.local/state/culturepeople/pstack-ops-20261118/decisions.tsv`에 append-only로 저장한다. 증거 없는 완료·실행하지 않은 배포·복원·CI 통과를 기록하지 않는다.

## 구현과 증빙

- 운영에서 분리한 최초 릴리스: `release/ops-remediation-20261118`, 원격 SHA `e715e84d2e3b3764a744b234f2eaf8882da88082`. 배포 도구의 clean/sourceTree metadata 누락을 발견해 최종 릴리스 `release/ops-remediation-final-20261118`, SHA `4b549bd9a3eb8768d06f46e4850c86fc8d8931e1`로 보완했다. 최초 후보는 승격하지 않았다.
- 원격/로컬 파일 트리 동일: `2286bbedafee1272e4380da4960918b65ed3b91a`.
- 격리 릴리스 단위 테스트: 128파일 / 679개 통과. 타입 검사 통과. 최종 Worker Wrangler dry-run: 135.56 KiB / gzip 34.57 KiB, 실제 배포 아님.
- 기존 main 보존 커밋: `2017364`(AI), `e84a158`(홈), `308ec96`(백업/운영/의존성). 이 작업본의 전체 변경을 운영 배포한 것은 아니다.
- GitHub CI run `44132143291`은 작성 시 실행 중이다. 결과 확인 전 통과로 취급하지 않는다.
- main 최종 코드 검증: 143파일 / 785테스트, 타입 검사, lint 통과. `check:auto-press-agent-loop` 통과. 코드 보존 후 로컬 작업본과 운영 릴리스는 여전히 별도다.
- Claude Opus 5.5 읽기 전용 교차 검토에서 코드상 차단 결함 없음. 실제 CI/배포 성공은 이 검토의 보증 범위가 아니다. Worker/Next 순차 활성화·동시 롤백 주의, 설정 장애 시 큐 fail-closed, 한글 서체 전송량 관찰이 잔여 항목이다.
- 기존 Worker는 Gemini 전용 구버전이다. 새 Next는 Worker의 `global-opt-in-v1` 계약을 확인하기 전 공통 AI 활성화를 409로 거절한다. 자동 보도자료는 명시적 `useGlobalAiSettings: true`일 때만 공통 설정을 사용한다. undefined로 기존 비용·모델을 바꾸지 않는다.
- 새 일반 앱 배포 프로필은 Supabase 복구를 요구하지 않는다. DB 변경·비공개 자료·빌드 훅 변경·dirty 소스는 거절하며, 같은 SHA CI·READY 후보·운영 기준 SHA·DB/R2 health·기존 법적 상태 비교·후검증·조건부 rollback을 요구한다.

## 외부 blocked와 재개

1. Worker: MSI에 읽을 수 있는 Cloudflare 배포 자격이 없다. Vercel sensitive 환경값을 억지로 추출하지 않는다. 인증을 보호 파일/프로세스에 연결한 다음 같은 고정 소스에서 `wrangler deploy --config cloudflare/auto-press-worker/wrangler.toml`을 실행하고 `/health`의 계약과 설정 읽기를 확인해야 한다. 그 전 공통 AI 활성화를 하지 않는다.
2. 백업: `~/.config/culturepeople/desktop-backup.env`가 없고 기존 아카이브 복호화 키와 실복원·cutover 증빙이 없다. `python3 ops/desktop-backup/connect_d1.py`로 토큰을 숨김 입력한 다음 `python3 ops/desktop-backup/runtime.py readiness`를 재확인한다. SELECT 1 성공만으로 토큰 권한이 읽기 전용임을 증명하지 못한다. 두 실제 복원과 중복 예약 방지 확인 전 timer는 계속 중지한다. 원본과 아카이브를 삭제하지 않았다.
3. 법적 정보: 필수 내용 완성은 기술 검사이며 법적 검토/대표자 신원 증명이 아니다. 운영 문안을 임의로 작성·승인하지 않았다. 관리자에서 확정 문안을 검토한 뒤 권한 있는 사람이 승인해야 한다.

### AI 활성화 이후 롤백 계약

현재 이번 작업에서 공통 AI 플래그를 켜지 않았다. 향후 켜기 전에 Worker 직전 version ID와 Vercel 직전 deployment ID를 함께 기록해야 한다. 활성화 이후 한쪽만 구버전으로 되돌리면 provider가 갈라질 수 있으므로, 승인된 설정 변경으로 공통 사용을 false로 돌린 뒤 롤백하거나 두 runtime을 호환되는 버전으로 함께 되돌린다. Vercel 앱 배포 명령이 Worker 롤백까지 수행한다고 오해하지 않는다.

## 최종 검증 명령

```sh
pnpm check:fonts
pnpm test:unit
pnpm ci:typecheck
pnpm ci:lint
python3 -m unittest discover -s ops/desktop-backup -p 'test_*.py'
python3 ops/desktop-backup/connect_d1.py --check
python3 ops/desktop-backup/runtime.py readiness
pnpm release:application -- --dry-run
```

승격 명령은 READY 후보 ID를 실제 값으로 대입하고 동일 SHA CI 성공 이후에만 실행한다:

```sh
pnpm release:application -- --baseline 757c02d955822c4f6ee954a0e227591e5558ad4d --candidate <READY-deployment-id> --review-ci-workflow --promote --apply
```

`--review-ci-workflow`는 이번 CI release 브랜치 트리거 변경의 검토 표시다. DB·백업 게이트 우회나 임의 workflow 허용을 뜻하지 않는다. 운영 전후 최종 결과는 아래 후속 기록으로 남긴다.
