# 컬피 데스크톱 백업 전환 준비 결과

기준일은 2026-11-16 KST다. 사용자는 '이제 백업데이터는 데스크톱 서버가 하도록 진행해 이부분 피스텍 적용해서 해봐'라고 지시했다. 백업 저장소·최소 인증·예약 이전이 승인 범위다. 뉴스 수집, 발행 큐, 미디어 생성, 운영 DB 쓰기, 배포, Gemini와 Antigravity 재개는 포함하지 않는다.

## 현재 판정

기존 백업 암호문은 MSI에 이미 옮겼다. 11월 15일 암호화 보관본 전송과 RAM 복원 검증을 수행했다. 당시 예약 업무와 키는 노트북에 남겼다. 옛 키를 이전하기 전까지 MSI 단독으로 이 보관본을 복원할 수 없다. 이번 작업에서 데스크톱 백업 환경을 새로 준비했지만 실제 운영 백업과 단독 예약 전환은 아직 완료하지 않았다.

노트북 192.168.31.198은 LAN에서 보이지만 SSH22가 연결 거부다. 기존 백업 키, Supabase 과거 snapshot, 최소 D1 인증을 안전하게 확보하고 기존 예약 중지를 확인할 수 없다. 사용자에게 SSH 복구나 새 접속 주소를 요청했다. 비밀값을 채팅으로 요구하지 않았다.

## 데이터와 저장소

기존 보관본은 /home/arbada/.migration/20261115-culturepeople-laptop-copy/encrypted 아래에 보존한다. 두 완성 파일의 전체 SHA-256을 이번에 다시 읽어 대조했고 일치했다. 부분 전송 파일도 보존하며 정상 백업으로 세지 않는다.

이번에 두 완성 파일을 /media/arbada/4A6C37B16C3796A31/culturepeople-legacy-archives에도 복제했다. 각각 0600이고 전체 SHA-256이 일치했다. 원본 staging의 파일은 그대로 유지했다. 이는 서로 다른 물리 디스크의 기존 암호문 사본이며, 신규 원격 백업이나 복호화 검증으로 표시하지 않는다. legacy-second-copy.json에 파일별 증거를 기록했다.

| 파일 | 바이트 | SHA-256 |
| --- | ---: | --- |
| culturepeople-backups-full.tar.zst.gpg | 8337850261 | ec7aca684a42411f0872ad43c74bb6e72b54a20dd2a909f8788661873748c840 |
| culturepeople-supporting-materials.tar.zst.gpg | 4623922920 | 4ef489fc8b5be46041b4426c044187b964f0d6d6295d61adb21992fbbe895d5d |

기존 키를 바꾸거나 기존 archive를 재암호화하지 않았다. 새 데스크톱 저장소용 키와 새 archive용 키를 별도로 생성했다. 각각 ~/.config/culturepeople/desktop-backup-volume.key, desktop-backup-archive.key에 0600으로 보관한다. 기존 archive 키는 이 새 키들과 다르며 아직 노트북에 있다. 새 키의 off-host 복구 사본 확보도 완료 조건이다.

| 구분 | 실제 장치 UUID | 암호문 저장소 | 마운트 보기 |
| --- | --- | --- | --- |
| primary | 17ba3897-eaa6-48c5-ab8c-2a95f21a25ba, nvme0n1p2 | ~/.local/share/culturepeople-backup-vault | /run/user/1000/culturepeople-backup-vaults/primary |
| second | e11420dc-c1ff-4f30-a309-709107fc1e0f, sda1 | /media/arbada/4A6C37B16C3796A31/culturepeople-backup-vault | /run/user/1000/culturepeople-backup-vaults/second |

각 마운트 아래 backups, secure-archives, tmp, supabase-fallback을 형제 디렉터리로 쓴다. 기본 경로 ~/culturepeople-backups와 겹치지 않는다. 마운트가 풀리면 빈 마운트 디렉터리는 000으로 잠그고, 해당 경로 자체도 /run의 RAM 영역이다. ciphertext 장치 UUID, fuse.gocryptfs와 정확한 mount target, volume ID, 10GiB 여유 공간을 확인한 뒤에만 실행한다.

주 저장소 여유 공간은 약1TB, 별도 sda1은 약916GB였다. sda1 SMART health는 PASSED다. 가득 찬 sdb NTFS는 사용하지 않았다. 파티션 포맷이나 기존 데이터 삭제를 하지 않았다.

gocryptfs 2.7.0 공식 Linux static binary를 ~/.local/opt/culturepeople-gocryptfs-2.7.0에 설치하고 공식 release asset의 SHA-256과 대조했다. 두 ciphertext 저장소를 초기화했다. 전체 호스트나 같은 계정이 탈취되면 같은 호스트의 키와 마운트 보기도 접근될 수 있다. 같은 서버 내 2개 디스크가 오프사이트 사본을 대신하지 않는다. 노트북의 기존 사본을 보존한다.

## 실행 구성과 실제 변경

백업 스크립트는 dirty 개발 작업본에서 실행하지 않는다. 별도 clean worktree /home/arbada/projects/culturepeople/backups/runtime-64de8cd1547a를 64de8cd1547a807c9db67cf87bb4d998f9e59c5f로 고정했다. Node24를 절대 경로로 실행하며 --no-env-files를 사용한다.

새 orchestration 코드는 ops/desktop-backup/runtime.py다. 설치본은 ~/.local/lib/culturepeople-desktop-backup/runtime.py다. 설정은 ~/.config/culturepeople/desktop-backup.json이며 0600이다. 설치된 wrapper와 사용자 unit의 SHA-256도 설정에서 대조한다.

사용자 unit은 다음과 같다.

- culturepeople-backup-vault@primary.service 및 @second.service는 암호화 보기를 마운트한다. 15초 이내 준비 완료를 기다리고, 사용이 끝나면 StopWhenUnneeded로 정지한다.
- culturepeople-desktop-backup.service는 기존 quiet backup, SQLite, verify, second sync와 양쪽 restore를 실행하도록 준비했다. 그 다음 양쪽 secure archive 생성과 실제 secure restore를 수행한다. 임시 tar와 TMPDIR도 암호화 마운트 안에 둔다. archive 대상은 backups의 하위가 아닌 형제 경로다.
- culturepeople-desktop-backup.timer는 기존과 같은 03:20 및 최대45분 지연으로 준비했지만 disabled/inactive 상태다.

system 단위 /etc/systemd/system/media-arbada-4A6C37B16C3796A31.mount를 새로 설치하고 local-fs.target에 enable했다. UUID로 기존 sda1을 같은 경로에 마운트하기 위한 것으로 현재 파일시스템을 포맷하거나 강제로 다시 마운트하지 않았다. root unit은 enabled/active를 확인했지만 실제 재부팅 검증은 하지 않았다. 현재 부팅의 mount options를 미래 부팅 설정이 이미 적용된 것으로 표시하지 않는다.

자동 run은 노트북 timer/service 중지, 기존 자료 복구, 전체 백업 검증, 서로 다른 archive의 secure restore 2개, off-host 키 확인의 증거 파일과 SHA-256을 요구한다. 자기 신고 boolean만으로 통과시키지 않는다. 증거는 아직 없으며 전환 marker를 임의로 만들지 않았다. 최초 수동 rehearse도 노트북 중지 증거가 있어야 허용한다. 일일 백업은 이전된 데스크톱만으로 실행해야 하므로 매일 노트북 접속을 요구하는 증거 만료 정책은 넣지 않았다. 대신 예약 전환 전에는 노트북의 해당 timer와 service가 모두 masked여야 한다. 기존 unit 파일을 보존하며 영구 중지하는 과정은 SSH 복구 후 수행한다. 같은 계정이 stop 정책과 설정을 의도적으로 바꾸는 공격까지 이 검사가 막지는 못한다.

실행 기본값은 새 미디어 30개, 기존 캐시 재사용이다. 미디어 생성이나 이미지 전체 재다운로드를 하지 않았다. 실제 원격 읽기 백업도 이번 단계에는 실행하지 않았다. 삭제와 retention 자동 정리는 하지 않는다. Telegram 알림 등 외부 발송도 켜지 않았다.

## 인증 확인

보호된 기존 Vercel 인증으로 백업에 필요한 변수만 살폈다. Cloudflare API token은 type=sensitive로 등록돼 있어 env pull로 값이 반출되지 않았다. 운영 token 자체가 비어 있다는 증거는 아니다. 데스크톱용 desktop-backup.env는 만들지 않았고 새 token도 발급하지 않았다. Supabase service key와 Vercel token을 새 백업 설정으로 복사하지 않았다.

노트북 SSH 복구 후 기존 최소 인증을 안전한 연결로 이전하거나, 해당 D1 읽기에 한정된 새 인증을 안전하게 발급해야 한다. 값은 로그·채팅·Git에 넣지 않는다. Supabase는 이전 단계에서 주소 도달 불가를 확인했으므로 과거 fallback을 보존하고 stale 경고를 숨기지 않는다.

## 검증과 남은 전환

- Python 안전 검사 14개 통과. 잘못된 디스크, 평문 mount, 잘못된 volume ID, 과도한 파일 권한, symlink 인증, 같은 물리 디스크를 2차 사본으로 쓰는 설정, 증거 없는 전환과 변경된 증거 파일을 거부한다. 실패 결과가 이전 성공 결과를 대체하고 fixture 보고서가 운영 예약을 승인하지 못하는 것도 검사했다.
- systemd unit 문법 검사 통과.
- 실제 암호화 mount에서 시험 파일을 쓰고 읽었으며, backing 파일에는 시험 평문이 없었다. 재마운트 후에도 내용과 volume ID가 일치했다.
- 실제로 second mount를 풀자 검사 실패로 차단됐다. 노트북 중지 증거가 없는 run도 종료1로 차단됐다.
- 합성 SQLite 시험 자료를 별도 preflight-fixture에 두고 기존 secure copy 및 restore 스크립트로 두 디스크 각각의 암호화 archive 생성과 복원을 통과했다. 실제 운영 백업이나 5008건의 기존 데이터 복원으로 세지 않는다.

실행 계획과 증거는 ~/.local/state/culturepeople/desktop-backup-cutover-20261116에 있다. legacy-archive-integrity.json, encrypted-volume-probe.json, unmounted-volume-blocked.json, fixture-encrypted-restores.json, credential-state.json은 서로 다른 검사 범위다. fixture 보고서를 운영 release gate의 백업 증거로 쓰지 않는다.

남은 필수 순서는 노트북 SSH 복구, 기존 timer/service와 다른 예약 경로 조사 후 중지 확인, 옛 키와 최소 백업 인증 안전 이전, 옛 archive를 암호화 mount로 직접 복원, 실제 fresh D1 백업과 양쪽 복원, off-host 키 사본 확인, 그 뒤 데스크톱 timer 활성화다. 예약 담당을 이미 데스크톱으로 전환했다고 보고하지 않는다.

수동 준비 검사는 vault를 Requires로 참조하는 culturepeople-backup-preparation transient unit 아래서 실행했다. 검사를 마치면 이 unit을 정지하고 암호화 보기도 닫는다. 마운트 안에 다른 프로세스의 cwd나 열린 파일이 있으면 정상 해제가 실패할 수 있다. 이때 다른 프로세스를 임의 종료하지 말고 사용 중인 핸들을 확인해 닫은 뒤 fusermount3 -u로 해제하고 vault를 재시작한다. lazy unmount로 문제를 숨기지 않는다.

결과 보고서는 관측 시각, sourceSha와 전체 백업 실행 ID를 기록한다. 전체 backup report의 archives와 secure restore 두 보고서의 archivePath가 같은 실행의 두 파일인지 확인한다. 실패 시에도 실패 결과를 원자적으로 기록한다. MemoryMax=4G는 첫 실제 rehearse에서 peak memory와 함께 검증해야 하며, fixture 통과를 운영 규모 메모리 검증으로 표현하지 않는다.

decisions.tsv의 ts는 실제 작업 시각이 아니라 기록한 시각이다. 파일별 generatedAt 또는 observedAt, systemd journal을 실제 실행 시각의 근거로 쓴다. 시험 자료와 실제 자료의 증거를 섞지 않도록 fixtureOnly 보고서는 자동 run 승인에서 거부하며, 전체 backup report는 이 wrapper가 쓰는 rehearse-result.json 또는 run-result.json만 인정한다.

## 후속 지시와 데스크톱 직접 인증

사용자가 '데스크탑 서버로 진행하는걸로 해서 진행해줘'라고 다시 지시했다. 최종 운영 주체는 데스크톱이다. 신규 D1 백업 인증은 노트북 인증 이전만 기다리지 않고 데스크톱에서 직접 연결하는 경로를 준비했다. 옛 archive의 복호화와 Supabase 과거 데이터 복원은 옛 키가 필요한 별도 미완료 항목으로 유지한다. 새로운 D1 전용 snapshot을 기존 전체 병합 백업의 성공 증거로 바꾸어 쓰지 않는다.

데스크톱의 표준 Wrangler 인증 경로에는 기존 Cloudflare 로그인이 없었고, 연결 가능한 Cloudflare 플러그인도 검색되지 않았다. Wrangler 4.162.0을 사용자 전용 ~/.local/opt/culturepeople-wrangler에 설치해 권한 목록만 확인했다. OAuth 목록은 D1 쓰기 권한만 제공하므로 광범위 OAuth 로그인을 시작하지 않았다. 공식 D1 query API는 D1 Read 권한으로 SELECT를 허용한다.

Vercel에서 현재 account ID와 D1 database ID, R2 공개 URL만 읽어 ~/.config/culturepeople/desktop-d1-connection.json에 0600으로 준비했다. token은 포함하지 않는다. ops/desktop-backup/connect_d1.py가 데스크톱 터미널에서 토큰을 숨김 입력받고 SELECT 1만 검증한다. 성공해야 desktop-backup.env를 0600으로 만들며, 토큰을 채팅·명령 인자·출력에 넣지 않는다. 다른 인증 파일이 있으면 덮어쓰지 않는다.

```sh
python3 /home/arbada/projects/culturepeople/monet-registry-main/ops/desktop-backup/connect_d1.py
```

토큰은 해당 Cloudflare 계정의 D1 Read 용도로 준비한다. 이미 안전하게 보관한 인증 파일이 있으면 값 대신 위치만 확인해 연결한다. 운영 DB 변경, 기존 토큰 폐기나 rotation은 수행하지 않았다. 연결 helper의 성공/인증 실패 테스트를 포함해 현재 안전 검사 16개가 통과했다. 실제 새 원격 백업과 예약 활성화는 아직 수행하지 않았다.

근거는 https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/ 의 Accepted Permissions와 https://developers.cloudflare.com/workers/wrangler/commands/general/ 이다. 단독 예약 전환은 기존 노트북 예약의 중지 여부를 확인한 뒤 진행한다. 데스크톱 최종 운영 결정과 노트북 중지 사실을 혼동하지 않는다.

## 2026-11-17 즉시 전환 요청 재확인

사용자가 pstack 기준으로 즉시 백업 전환을 지시했다. 기존 파일 이전은 재실행하지 않았다. 두 물리 디스크에 전체 archive 8,337,850,261바이트와 보조 archive 4,623,922,920바이트가 각각 0600으로 존재함을 직접 확인했다. 이번 재확인은 파일 존재·크기·권한 검사이며 전체 해시 재계산이나 복호화 검사는 아니다.

다음은 이 요청에서 직접 확인한 현재 차단 원인이다.

- desktop-backup.env가 없고 실행 환경에도 Cloudflare API token이 없다.
- 데스크톱의 기존 archive 복호화 키 표준 경로 backup-encryption.key가 없다. 새 volume/archive 키는 기존 archive 키를 대신하지 않는다.
- desktop-backup-cutover.json이 없으며 고정 runtime 검사만 통과한다.
- 알려진 노트북 주소 192.168.31.198:22는 연결 거부다. 노트북의 전용 SSH 개인키를 데스크톱으로 복제하지 않았다.
- 데스크톱 timer는 활성 예약 목록에 없다. 인증과 검증 없이 실패할 timer를 활성화하지 않았다.

재개에 필요한 외부 입력은 D1 인증과 노트북 접근이다. 인증은 데스크톱 터미널에서 아래 명령으로 숨김 입력한다. 토큰값을 채팅으로 전달하지 않는다.

```sh
python3 /home/arbada/projects/culturepeople/monet-registry-main/ops/desktop-backup/connect_d1.py
```

노트북에서는 SSH 서비스 상태와 현재 IP를 확인해야 한다. 접근이 복구되면 기존 키를 보호된 경로로 연결하고, 기존 예약 조사·중지 증거 확인, 과거 자료 복원, 신규 백업, 양쪽 복원, 키 복구 사본 확인 후에만 데스크톱 timer를 활성화한다. 원본 삭제, 임의의 증거 생성, 안전 검사 제거는 하지 않는다. 현재 상태는 자료 이전 완료 / 신규 자동 백업 전환 미완료다.
