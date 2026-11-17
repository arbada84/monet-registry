# 컬피 MSI 개발 자료 이전 결과

기준일: 2026-11-15 KST. 사용자 승인에 따라 같은 공유기의 LAN으로 복사했다. 노트북의 원본 파일과 기존 백업은 삭제하지 않았다.

## 1. 접속과 자료 위치

- 노트북 `192.168.31.198`에서 MSI `192.168.31.91`로 직접 연결했다. 실제 라우트는 `wlp0s20f3`이며 VPN을 사용하지 않았다.
- 기존 검증된 MSI 키를 `HostKeyAlias=192.168.31.90`, `StrictHostKeyChecking=yes`로 확인했다. 개인키를 복사하지 않았다.
- MSI 개발 경로: `/home/arbada/projects/culturepeople/monet-registry-main`.
- MSI staging: `/home/arbada/.migration/20261115-culturepeople-laptop-copy/monet-registry-main`.
- MSI 증거: 위 staging 상위의 `evidence/`.
- MSI 암호화 보관 위치: 위 staging 상위의 `encrypted/`.
- 노트북 실행 증거: `/home/arbada/.local/state/msi-migration/20261115-culturepeople/`.

## 2. 코드와 개발 환경

| 항목 | 실제 결과 |
|---|---|
| 원본·사본 HEAD | `64de8cd1547a807c9db67cf87bb4d998f9e59c5f` |
| 최초 코드 복사 | 일반 파일 7,603개, 1,465,912,851바이트, 삭제 0 |
| 최초 무결성 | SHA-256 7,603개 일치, checksum dry-run 추가 전송 0 |
| 기존 Git 상태 | 소스·staging 각각 39항목, 내용 일치. 이 결과 문서 작성 전 기준 |
| 안정된 개발 경로 | staging과 별도 사본 구성, HEAD 일치 |
| 실행 후 무결성 | 실제 소스 7,601개 일치. 실행 시 변하는 `.git/index`, `tsconfig.tsbuildinfo` 2개는 별도 분류 |
| Git index 논리값 | `git ls-files --stage -z` SHA-256이 양쪽 동일 |
| Node | MSI 기존 24.16.0 재사용 |
| pnpm | 기존 Corepack을 사용해 9.12.2 구성 |
| 의존성 | frozen lockfile, `--ignore-scripts`, 브라우저 자동 다운로드 제외 |
| SQLite CLI | 배포판 패키지를 사용자 전용 `~/.local/opt/culturepeople-sqlite3`에 설치. 시스템 패키지 변경 없음 |
| 타입 검사 | `pnpm ci:typecheck` 통과 |
| 단위 검사 | 132개 파일, 700개 테스트 통과 |
| 정적 검사 | `check:local-backup`, `check:auto-press-agent-loop` 통과 |
| 운영 빌드 | 안정된 개발 경로에서 `pnpm build` 통과. 배포하지 않음 |
| 로컬 실행 | 홈·about·contact·terms·privacy·알리닷 3페이지 모두 200. 임시 서버 종료 |

최종 단위 테스트 명령은 `pnpm test:unit --maxWorkers=2 --testTimeout=120000`이다. 기존 디스크 복구·다른 전송이 진행 중인 환경에서 실행했다. 최초 실패는 sqlite3 미설치와 5초 제한 초과였고, 도구 설치 후 남은 시간 초과는 제한 시간을 늘려 해소했다. 테스트를 삭제하거나 skip하지 않았다.

진단 중 tmpfs에서 실행한 회귀는 699개 통과·1개 실패였다. 디스크 사용률이 1% 이상이라고 가정하는 검사와 tmpfs 환경이 맞지 않았으며, 최종 전체 통과 결과는 일반 임시 경로에서 나온 것이다. 애플리케이션 소스를 수정해 실패를 숨기지 않았다.

실행 후 `.git/index` 바이너리가 달라진 것은 stat 정보 갱신 때문인지 논리값 비교로 확인했다. index 엔트리 SHA는 `ce196601ab806f70e7a7e75dc6deca11387b5b5eee74af0752072377330517f0`으로 일치했다. 빌드 캐시는 원본 사용자 데이터와 구분한다.

## 3. 비밀정보와 제외 자료

일반 코드 복사에서 운영 `.env`, 인증 파일, raw export, 실제 로컬 기사·설정, DB, 로그, 별도 worktree, 재생성 의존성과 빌드 캐시를 분리했다. MSI 최상위 운영 `.env`는 0개다.

현재 노트북 환경에서 얻은 비공개 credential 값 17개를 대상으로 선택된 텍스트 파일 4,842개를 검사했고 일치 파일은 0개였다. 값은 출력하지 않았다. 이는 알려진 값의 검사이며 모든 과거 Git 객체의 비밀 전수 감사 완료를 뜻하지 않는다.

별도 worktree·exports·data·배포 증빙은 암호화 보관 대상으로 분리했다. 소스에 존재하지 않는 과거 worktree를 복구했다고 표시하지 않는다. Git prune·reset·clean·commit·push는 하지 않았다.

## 4. 백업 이전 상태

노트북의 최신 백업을 실제 SQLite 복사와 integrity 검사로 검증했고 통과했다. 통합 기사 5,008건, raw rows 49,358건, media manifest 4,034건이다. 미디어 표본 50개는 모두 존재했다. 이 검사는 미확보 원격 이미지까지 복구했다는 뜻이 아니다.

Supabase는 2026-05-19 snapshot의 fallback을 사용하고 있으며 검사 시 약 179.3일 stale 경고가 있었다. 기존 원격 export 실패 경고를 그대로 유지한다.

전체 보관 백업과 미디어를 GnuPG AES256 암호화 및 zstd 압축으로 MSI에 전송했다. 키 파일은 노트북의 `/home/arbada/.config/culturepeople/backup-encryption.key`에 유지했다. 최종 검증 때만 키 값을 SSH 표준입력과 상속된 pipe FD로 검증 프로세스에 전달하고 `--no-symkey-cache`를 사용했다. MSI의 파일·환경변수·명령 인자에 키 값을 저장하지 않았다. MSI 디스크가 ext4인 것은 확인했지만 저장 시 암호화가 입증되지 않아 평문 raw 백업을 영구 저장하지 않았다.

완료 파일, 부분 전송 파일, 실제 복원 검증을 아래와 같이 구분한다.

### 실행 결과

| 산출물 또는 검사 | 최종 결과 |
|---|---|
| `culturepeople-backups-full.tar.zst.gpg` | 8,337,850,261바이트, 권한 0600 |
| 백업 ciphertext SHA-256 | `ec7aca684a42411f0872ad43c74bb6e72b54a20dd2a909f8788661873748c840` |
| 백업 내부 목록 | 11,373개 일반 파일, 34,401,959,580바이트. 원본 inventory와 전체 파일명·총 바이트 일치 |
| 암호화·압축 검사 | 전체 GnuPG 인증 복호화와 zstd checksum 통과 |
| MSI RAM 복원 | 실제 최신 snapshot을 swap 없는 tmpfs에 복원하고 SQLite CLI 검사 통과 |
| 복원 데이터 | 기사 5,008건, raw rows 49,358건, SQLite integrity `ok` |
| 미디어 참조 검사 | manifest 4,034건 모두 존재, 누락 0 |
| 실제 이미지 hash | 중복 제거된 `_media-store` 3,516개 파일 모두 SHA-256 일치 |
| `culturepeople-supporting-materials.tar.zst.gpg` | 4,623,922,920바이트, 권한 0600 |
| 증빙 ciphertext SHA-256 | `4ef489fc8b5be46041b4426c044187b964f0d6d6295d61adb21992fbbe895d5d` |
| 증빙 내부 검사 | 31,120개 일반 파일, 4,858,021,566바이트. 전체 인증 복호화·압축 checksum·tar 읽기 통과 |

일반 코드에서 분리한 exports·로컬 data·별도 worktree와 실제 존재한 홈 release 작업본은 증빙 archive에 보관했다. 증빙 archive의 오래된 실행 DB가 현재 운영 정본이라거나 의미상 무결성까지 검증됐다는 뜻은 아니다.

백업 snapshot 동안 노트북 backup·image-backfill timer만 일시 정지했고 EXIT 처리로 두 항목을 active로 복구했다. MSI timer는 활성화하지 않았다. RAM 복원 자료는 검사 후 제거했으며 노트북 원본과 MSI 암호화 사본은 유지했다.

최초 zlib 압축 전송은 중단하고 부분 파일을 MSI에 보존했다. 네트워크 왕복 읽기 검증도 중단한 뒤 위 MSI 내부 검증으로 대체했다. 중단된 로그를 통과 증거로 사용하지 않는다. 최종 산출물은 `.tar.zst.gpg` 2개이며 `.partial`을 정상 백업으로 계산하지 않는다.

## 5. 발견한 기존 백업 실패

11월 13~14일 노트북 backup service는 primary 생성 후 second-copy-sync 단계에서 실패했다. 기존 2차 대상 `/home/arbada/culturepeople-backups-second-copy`의 가용 공간이 로그 기준 5.56GB로 최소 10GB 기준보다 적었다.

기존 자료를 삭제하거나 이 검사를 우회하지 않았다. MSI 암호화 archive가 확보돼도 기존 `backup:local:status`의 평문 2차 경로를 바꾸거나 자동 동기화 성공으로 표시하지 않는다. 예약 작업에서는 Node20 경고도 확인돼, 후속 전환 시 Node24의 비대화형 PATH를 명시해야 한다.

## 6. 다른 프로젝트와 운영 보존

숏줍 11월 14일 staging과 현재 노트북 원본을 checksum dry-run으로 비교했다. 내용 전송 후보 17개가 있었으나 최신 `shortjup-msi-development-cutover-2026-11-15.md`에서 별도 담당의 고정 개발 경로 전환 완료 기록을 확인해 옛 staging을 덮어쓰지 않았다. 해당 기록의 기존 회귀 실패 20개를 컬피 검사 통과와 혼동하지 않는다.

타닥·돈줍·TradeJoop 전체 이전은 이번 컬피 전송의 완료 범위가 아니다. 각 최신 작업본·실행 DB 소유권·담당 기록을 확인해야 한다. 다른 프로세스의 rsync와 photorec를 중지하지 않았고 MSI 네트워크·RDP·Wi-Fi failover를 수정하지 않았다.

Vercel·Worker·D1·R2·DNS·Auth0·Fold3·운영 봇·provider 설정은 변경하지 않았다. 실제 모델 호출, Gemini/Antigravity 재개, 결제, 운영 DB 쓰기와 이미지 대량 다운로드도 하지 않았다.

## 7. 남은 전환 조건

1. 코드·보관 백업·증빙의 검증 복사는 완료했다. 기존 MSI staging과 안정된 개발 경로를 모두 유지한다.
2. MSI에서 백업을 운영하려면 저장 시 암호화 또는 승인된 암호화 저장 구조, 지속적인 키 복구 수단, 최소 백업 credential을 별도로 구성해야 한다. 일회성 RAM 복원 검증을 상시 인증 구성으로 해석하지 않는다. 노트북 외부의 안전한 키 복구 사본도 필요하다.
3. MSI 실제 복원은 완료했다. 제한된 새 백업 생성·자동 재실행·독립 2차 동기화는 미실행이다. 이 검증을 마친 뒤에만 단일 writer 계약에 따라 예약 업무를 전환한다. 현재 노트북의 운영 백업 업무는 MSI로 전환하지 않았다.
4. MSI의 컬피 Git 원격 인증과 push·배포 권한은 검증하지 않았다. 숏줍 전용 deploy key가 컬피 권한도 갖는다고 가정하지 않는다.
5. 주 개발 경로는 MSI에 준비됐지만 현재 노트북 대화 세션과 모든 에이전트가 자동으로 원격 cwd로 이동한 것은 아니다. 다음 개발 시 MSI 경로에서 시작하고 양쪽 동시 편집을 피한다.

노트북 원본은 이후에도 삭제하지 않는다. 별도 삭제 승인 없이 자동 정리·retention·prune을 이전 작업에 묶지 않는다.
