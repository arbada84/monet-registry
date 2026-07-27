# CulturePeople 운영 배포 후 전수 감사 및 차순위 개발 계획

- 작성일: 2026-07-21 KST
- 대상 서비스: `https://culturepeople.co.kr`
- 기준 배포: `dpl_2FY1fDkWeWbp86HYn94N8V7M566L`
- 문서 성격: 운영 현황 감사 및 개발 계획. 이 문서 작성 과정에서는 개발, 배포, 운영 DB 쓰기, 대량 다운로드를 수행하지 않았다.
- 실제 저장소 탐색 기준: 디스크 UUID `96B82074B8205551`의 현재 마운트 위치. 감사 시점에는 `/media/arbada/96B82074B82055511`이었다.
- 후속 대조검증: 2026-07-21 라이브 사이트, 백업, Git, GitHub API, `package.json`을 독립적으로 다시 대조했다.

## 0. 판정 기준과 증빙 시점

이 문서는 다음 상태를 구분한다.

- **현재 확인**: 2026-07-21 감사 과정에서 로컬 명령, Vercel/GitHub API, 최신 백업 또는 소량 라이브 요청으로 다시 확인했다.
- **과거 스냅샷**: 기존 문서나 2026-07-18 배포 로그에 기록됐지만 이번 감사에서 전체 재실행하지 않은 값이다.
- **확인 필요**: 인증된 관리자 화면, 외부 콘솔 또는 실제 브라우저 시각 검사가 필요하다.
- **대표자 작업**: 법적 정보, 결제, 계정 소유권처럼 코드로 결정할 수 없다.
- **blocked**: 외부 상태가 풀리기 전 적용하면 안 된다.

현재 저장소에는 미커밋 파일이 많다. 아래 수치는 문서 작성 시점의 진단값이며 릴리스 기준선으로 사용해서는 안 된다. 실제 개발을 시작할 때 각 명령을 다시 실행하고 새 release manifest에 고정해야 한다.

### 0.1 후속 대조검증 반영

- 백업 파일 mode `777`, raw settings의 민감 설정 key, `/youth-policy`의 `홍길동`, disk 약 95%, Supabase fallback 62.2일, 이미지 `4,034/8,059`, second copy lag 0시간을 재확인했다.
- 초기 감사의 worktree 변경 수는 410개였고 후속 검토에서는 411개였다. 계속 변하는 값이므로 release manifest 생성 시점의 수치를 기준으로 삼는다.
- GitHub CI 최근 4회 실패와 마지막 성공 2026-05-27을 재확인했다. 추가로 2026-05-26 시작 후 한 달 이상 `queued` 상태인 run 1건이 발견됐다.
- `package.json` 대조 결과 이 문서의 명령 표에서 기존으로 표시한 15개는 실제 존재하고, `신규 구현 필요`로 표시한 8개는 존재하지 않음을 재확인했다.
- auto-press `running` 177건/101시간 이상은 최초 감사에서 최신 D1 백업을 read-only 분석한 수치다. 후속 검토자는 이 항목을 별도로 재파싱하지 않았으므로 구현 착수 직전 신규 dry-run 감사로 다시 고정한다.

## 1. 경영진 요약

### 1.1 지금 정상인 기능

| 영역 | 현재 판정 | 근거 |
|---|---|---|
| production alias | 정상 | Vercel API에서 배포 `READY`, `culturepeople.co.kr` alias 연결 확인 |
| 공개 핵심 URL | 정상 | 홈, 기사 3996, 검색, 문화 카테고리, about/contact/advertising/youth-policy가 현재 200 |
| 게시 기사 SEO | 정상 | 기사 3996이 자기 자신 canonical, index/follow, NewsArticle JSON-LD 제공 |
| NOINDEX 대상 24건 | blocking 0 | 최신 리포트에서 정상/legacy redirect 16건, 삭제 기사 404 8건 |
| legacy 기사 번호 | 정상 | 23/25/27/33/34가 각각 275/187/229/180/197로 308 |
| 삭제 기사 | 정상 | 7/43/49/57/64/67/75/598이 404. 복구·색인 대상이 아님 |
| robots/RSS/sitemap | 정상 | robots, RSS, sitemap, news-sitemap 소량 라이브 검증 통과 |
| ads.txt | 정상 | 기존 배포 후 검증과 현재 portal surface 검증 통과 |
| 로컬 통합 백업 | 조건부 정상 | 2026-07-20 03:59 KST 완료본, 감사 당시 age 약 20.7시간, RPO 24시간 충족, restore-check 통과 |
| 2차 백업 | 정상으로 개선됨 | 과거 `not_configured`와 달리 현재 `/home/arbada/culturepeople-backups-second-copy`, lag 0시간, 양쪽 restore-check 통과 |
| 자동화 스케줄 | 대체로 정상 | CulturePeople systemd timer active, 최근 GitHub 예약 workflow 성공, 관련 failed user unit 없음 |
| author 정책 | 정상 | 최신 백업의 공개 기사 3,794건 author가 모두 `박영래` |
| 운영 모드 | 정상 | auto-news false/false/임시저장, auto-press true/true/게시로 확인 |

### 1.2 운영상 위험한 문제

1. **P0 보안/데이터**: raw D1 백업의 `site_settings.json`에 메일 비밀번호, Telegram token/webhook secret, Gemini API key, 개인정보성 데이터가 포함된다. 1.8TB NTFS 백업과 second copy의 파일 모드가 `777`로 보존돼 있다. 침해가 확인된 것은 아니지만 현재 보관 방식은 민감정보 노출 위험이 높다.
2. **P0 배포 재현성**: production은 `gitDirty=1`인 CLI 배포다. 배포 meta SHA는 로컬 HEAD `0a74f317...`이지만 worktree 변경 410개가 포함돼 commit만으로 재현할 수 없다. GitHub 현재 main `1e9824bf...`와도 일치하지 않는다.
3. **P0 법적 정보**: 라이브 `/youth-policy`에 `홍길동` 임시 청소년보호책임자 정보가 남아 있음을 확인했다. 대표자가 정확한 법적 정보를 확정하기 전 추측으로 교체하면 안 된다.
4. **P0 저장공간**: 1.8TB 백업 드라이브 사용률 약 94.9%, 여유 약 85.5GB다. 다음 백업·로그·기타 프로젝트 증가로 95% block 기준을 넘을 수 있다.
5. **P0 외부 데이터 원본**: Supabase가 `project_unreachable_or_paused`, 백업은 62.2일 된 `local_fallback`이다. 이미지 8,059개 중 4,034개만 확보했고 4,025개는 blocked다.
6. **P0/P1 auto-press 운영 정합성**: 최신 D1 백업 기준 `running` item 177개가 최소 약 101시간 이상 남아 있다. 현재 worker 조회는 queued 중심이라 lease가 만료된 running item이 자동 회수되지 않을 가능성이 높다. 신규 기사 게시 자체는 최근에도 동작하지만 운영 지표와 재처리 신뢰도가 떨어진다.
7. **P0 배포 gate**: GitHub CI 최근 실행은 실패 상태이고 로컬 `predeploy:ops-check`에는 unit test, dirty worktree, GitHub CI, NOINDEX 감사, 브라우저 smoke, release manifest가 필수 gate로 묶이지 않았다.

### 1.3 즉시 필요한 대표자 작업

- 오늘 `/youth-policy`에 들어갈 실제 청소년보호책임자, 연락처, 회사 법적 명칭을 확정한다.
- 이 PC와 백업 드라이브에 접근 가능한 OS 계정을 점검하고, 백업 암호화 전에는 디스크 공유·외부 반출을 중지한다.
- Supabase dashboard에서 프로젝트 Resume/결제/다운로드 중 한 방식을 결정하고 project ref, `images` bucket, service role key를 확인한다.
- 1.8TB 드라이브 공간을 확보할 대상을 결정하되, Supabase의 유일한 fallback이나 restore-check 미검증 백업을 먼저 삭제하지 않는다.
- 2차 백업의 최종 목적지를 현재 같은 PC의 홈 디스크로 둘지, 외장디스크/NAS/암호화 object storage로 분리할지 결정한다.

### 1.4 다음 개발의 가장 중요한 목표

첫 개발 목표는 기능 추가가 아니라 **민감정보가 들어 있는 백업을 암호화된 복원 가능 구조로 전환하고, dirty 배포를 차단하는 재현 가능한 release gate를 만드는 것**이다. 그 다음 auto-press stale item 복구, Supabase fresh export, 이미지 확보, SEO·성능 개선 순으로 진행한다.

## 2. 배포 재현성과 변경 추적 감사

### 2.1 현재 배포와 Git 상태

| 항목 | 현재 확인 값 | 판정 |
|---|---|---|
| production deploy ID | `dpl_2FY1fDkWeWbp86HYn94N8V7M566L` | READY |
| production URL | `monet-registry-main-4qpg4rukk-arbadas-projects-fdc12d41.vercel.app` | alias 연결됨 |
| production alias | `https://culturepeople.co.kr` | 정상 |
| 배포 source | Vercel CLI, `gitSource: null` | commit 기반 자동 배포가 아님 |
| 배포 meta SHA | `0a74f31743cbd7ad75565013448cfe84ebb2d4ad` | 로컬 HEAD와 같음 |
| 배포 dirty 상태 | `gitDirty: 1` | 재현 불가 위험 |
| 로컬 변경 수 | 최초 410, 후속 검토 411 entries | 계속 변하는 dirty worktree |
| GitHub live main | `1e9824bfeb72c98232ff64f73d6fb8f5962dd7e5` | 배포 SHA와 다름 |
| 로컬 `origin/main` | `b0ed311e...` | fetch하지 않은 stale ref |
| 이전 production | `dpl_C17s4jUJkJ1TeNasXMNkS3iiBbNB` | 같은 dirty SHA |
| 최근 CI | 최근 4회 실패, 마지막 성공 2026-05-27, 2026-05-26 run 1건 장기 queued | 실패 원인과 zombie run 정리 필요 |

배포 당시 기록된 `82개 테스트 파일, 379개 테스트, 타입 검사 통과`는 **2026-07-18 배포 로그의 과거 스냅샷**이다. 현재 410개 변경 상태 전체에 대해 이번 문서 작업에서 테스트를 재실행한 결과가 아니다. 현재 로컬에서는 `pnpm ci:lint`만 별도 통과했으며 deprecation warning이 있었다.

### 2.2 핵심 위험

- 같은 SHA라도 dirty diff가 다르면 같은 산출물을 만들 수 없다.
- 배포 로그만으로 어떤 410개 파일의 어느 내용이 포함됐는지 복원할 수 없다.
- GitHub main과 production 코드가 달라 PR/CI 결과가 운영 코드를 증명하지 못한다.
- 현재 이전 배포들도 같은 dirty SHA가 많아, 단순히 "직전 배포"로 롤백해도 알려진 문제를 제거한다는 보장이 없다.
- `.deploy-logs`, `.seo-audit-runs`, `.category-audit-runs`, `.portal-backfill-runs`가 저장소에서 무시되지 않은 상태라 실수로 commit될 가능성이 있다.

### 2.3 release manifest 설계

`release:manifest`는 **신규 구현 필요**다. 배포 전에 다음 내용을 JSON과 Markdown으로 생성하고 배포 후 Vercel ID를 덧붙인다.

- release ID, 생성 시각 KST/UTC, 운영자
- branch, HEAD SHA, upstream SHA, ahead/behind
- dirty 여부, 변경 파일 목록, staged/unstaged/untracked 구분
- dirty 배포 예외 승인자와 사유. 기본값은 미승인/차단
- `pnpm-lock.yaml` 및 배포 산출물 핵심 파일 hash
- Node/pnpm/Vercel CLI 버전
- 환경변수는 key 이름과 missing/empty/masked 상태만 기록하고 값은 절대 기록하지 않음
- typecheck/unit/portal/NOINDEX/browser smoke/backup/ops audit 결과와 리포트 SHA-256
- Vercel deploy ID, immutable URL, production alias 적용 시각
- 선택한 rollback deployment ID와 사전 smoke 결과
- DB schema/migration 적용 여부와 rollback 가능성

후보 파일:

- `scripts/create-culturepeople-release-manifest.mjs` - 신규 구현 필요
- `scripts/predeploy-ops-check.mjs` - 기존 스크립트 보강
- `scripts/deploy-culturepeople-vercel.mjs` - manifest ID 강제 연동
- `.gitignore` - 운영 리포트와 로컬 evidence 경로 정책 반영
- `docs/culturepeople-ops-recovery-runbook.md` - 연동 문서 보강 필요

### 2.4 배포 전 필수 gate

1. 현재 UUID 기반 저장소 경로가 실제 존재한다.
2. branch/upstream을 확인하고 dirty이면 기본 실패한다. 긴급 예외는 diff bundle/hash와 명시적 `--allow-dirty` 사유가 있어야 한다.
3. GitHub CI가 같은 SHA에서 green이어야 한다. 외부 CI 조회 불가 시 `blocked`가 기본이다.
4. `ci:typecheck`, `test:unit`, portal verify, NOINDEX audit, public browser smoke가 통과한다.
5. 게시 기사에 noindex/X-Robots-Tag noindex가 1건이라도 나오면 실패한다.
6. 백업 primary/second copy restore-check가 통과한다.
7. backup danger, disk 95% 이상, stale lock은 실패한다. Supabase blocked는 대표자 승인된 known exception으로만 허용한다.
8. env drift에서 empty masking 또는 canonical secret source 충돌이 있으면 실패한다.
9. release manifest가 생성되고 secret 원문이 없는지 검사한다.
10. 배포 후 immutable URL smoke가 통과해야 production alias를 전환한다.

### 2.5 롤백 정책

읽기 전용 확인을 먼저 한다.

1. Vercel에서 현재/이전 deployment ID, READY 상태, 생성 시각, alias를 조회한다.
2. rollback 후보 immutable URL에 공개 smoke와 portal verify를 실행한다.
3. 후보가 현재보다 오래된 schema나 알려진 NOINDEX/404 오류를 포함하지 않는지 release manifest로 확인한다.
4. 장애 유형이 frontend인지 Worker/DB/config인지 분리한다. frontend rollback이 DB·Worker 문제를 고치지는 않는다.

쓰기 단계는 다음 원칙을 적용한다.

- 현재 직전 배포 `dpl_C17s4jUJkJ1TeNasXMNkS3iiBbNB`는 같은 dirty SHA이므로 **일반적인 golden rollback으로 승인하지 않는다**.
- 장애로 현재 서비스가 열리지 않을 때만 사전 smoke 후 Vercel dashboard의 promote/rollback 기능을 사용한다.
- Vercel CLI rollback 정확한 명령은 현재 프로젝트 CLI 버전의 `vercel --help`로 확인한 뒤 runbook에 고정한다. 검증 전 임의 명령을 문서 표준으로 만들지 않는다.
- rollback 후 alias, 5xx, 기사 canonical, robots/RSS/sitemap, auto-press webhook 상태를 다시 확인한다.
- 장기 완료 기준은 clean SHA에서 만든 새 deployment를 golden baseline으로 지정하는 것이다.

## 3. 운영 기능 전수 점검표

| 영역 | 현재 상태 | 근거/시점 | 영향도 | 재현 방법 | 담당 |
|---|---|---|---|---|---|
| 홈 `/` | 200, no-store | 현재 소량 GET | 중 | `curl -sSI https://culturepeople.co.kr/` | 개발 |
| 기사 `/article/3996` | 200, canonical/NewsArticle/index 정상 | 현재 HTML 검사 | 높음 | `curl -sL .../article/3996` | 개발 |
| 검색 | 200, 의도된 noindex | 현재 확인 | 중 | `/search?q=치유` | 개발 |
| 카테고리 | 200 | 현재 확인 | 중 | `/category/문화` | 개발 |
| about/contact/advertising | 200 | 현재 확인 | 중 | URL별 GET 1회 | 개발+대표자 |
| youth-policy | 200이나 `홍길동` 임시정보 노출 | 현재 확인 | **P0** | `/youth-policy` 본문 확인 | 대표자+개발 |
| privacy/terms | 기존 구현 존재 | 이번 라이브 재확인 생략 | 중 | metadata/unit/live GET | 개발+대표자 |
| 공개 브라우저 smoke | 과거 통과 | 2026-07-18 스냅샷 | 중 | `smoke:browser --public-site-only` | 개발 |
| 관리자 핵심 화면 | 인증 smoke 확인 필요 | 이번 미실행 | 높음 | admin auth를 이용한 별도 smoke | 개발+운영 |
| auto-news | false/false/임시저장 | 최신 백업 설정 | 높음 | settings read-only audit | 운영 |
| auto-press | true/true/게시 | 최신 백업 설정 | 높음 | settings/run/item audit | 운영 |
| 뉴스레터 | 중지 상태 유지가 정책 | 코드·운영 설정 재확인 필요 | 중 | 공개 widget/발송 cron read-only audit | 운영 |
| auto-press stale running | 177 items, 101시간 이상 | 최초 감사의 최신 백업 read-only 분석. 구현 직전 재확인 | 높음 | 신규 stale audit 필요 | 개발 |
| author 박영래 | 공개 3,794건 모두 일치 | 최신 백업 | 중 | author audit | 개발 |
| IndexNow | candidates/authFailed 0/0 | 현재 `ops:audit` | 중 | `pnpm ops:audit` | 운영 |
| RSS | 200, 50 items, fullContent | 현재 portal verify | 높음 | `pnpm verify:portal` | 개발 |
| sitemap | 200, 14,510 URLs | 현재 소량 GET | 높음 | sitemap parser | 개발 |
| news-sitemap | 200, 11 URLs | 현재 소량 GET | 높음 | portal verify | 개발 |
| robots | 200, article 허용 | 현재 확인 | 높음 | `/robots.txt` | 개발 |
| canonical/NewsArticle | 샘플 정상 | 현재 기사 3996 | 높음 | NOINDEX audit | 개발 |
| tags in sitemap | 10,697 tag URLs, 8,394는 기사 1건 | 현재 sitemap+최신 백업 분석 | 중/SEO 높음 | 신규 tag audit 필요 | 개발 |
| ads.txt | 통과 | 현재 portal verify | 높음 | `/ads.txt` | 운영 |
| Google/Coupang 광고 | 브라우저 오류 warning | 과거 smoke | 중 | 브라우저 console/network | 광고 운영 |
| 페이지 캐시 | CSP nonce로 private/no-store, MISS | 현재 헤더 | 중/성능 | HEAD 1~2회 | 개발 |
| D1 백업 | 최신 raw 34,313 rows | 현재 backup status | 높음 | `backup:local:status` | 운영 |
| Supabase 백업 | 3,095 rows local fallback, 62.2일 stale | 현재 status/recovery check | **P0** | `supabase:recovery-check` | 대표자+운영 |
| 통합 SQLite | 3,811 articles, integrity 통과 | 현재 restore-check | 높음 | restore-check | 운영 |
| primary backup | age 20.7h, 11GB, RPO 충족 | 현재 status | 높음 | backup status | 운영 |
| second copy | lag 0h, restore-check 통과 | 현재 status | 높음 | restore-check-all | 운영 |
| 백업 민감정보 | raw settings에 secret/PII 존재, mode 777 | 현재 구조 감사 | **P0** | 값 미출력 security audit 필요 | 대표자+개발 |
| 이미지 | 4,034/8,059, 4,025 blocked | 현재 status | 높음 | R2 readiness | 대표자+운영 |
| R2 readiness | copy 후보 4,018/4,018, rewrite 금지 | 현재 readiness | 중 | R2 readiness | 운영 |
| 디스크 | primary 94.9% 사용, 85.5GB free | 현재 status | **P0** | `df -h`+status | 대표자+운영 |
| backup timer | active/waiting | 현재 systemd | 높음 | `systemctl --user list-timers` | 운영 |
| image timer | active, 최근 24h +0 | 현재 systemd/status | 중 | timer+journal | 운영 |
| GitHub scheduled jobs | 최근 조회 20건 성공 | 현재 GitHub API | 중 | `gh run list` | 운영 |
| GitHub CI | 최근 4회 실패, 장기 queued run 1건 | 현재 GitHub API | **P0/P2** | failing run annotation/log, queued run 상태 | 개발+운영 |
| Cloudflare Worker live version | 확인 필요 | 로컬 정적 검사만 통과 | 높음 | Wrangler/API read-only inspect | 운영 |
| Telegram 실제 수신 | 확인 필요 | 설정 존재만 확인 | 높음 | 민감값 미출력 test alert | 대표자+운영 |
| actual live 5xx | 이번 최소 요청에서 미발견 | 현재 표본 | **발견 즉시 P0** | 동일 출처 smoke/로그 | 개발 |

## 4. 문제점 등록부

| ID | 심각도 | 사용자/데이터/SEO 영향 | 근거 | 원인 가설 | 수정 후보 | 검증/완료 기준 | rollback 조건 |
|---|---|---|---|---|---|---|---|
| CP-PP-P0-001 | P0 | secret·개인정보 노출, 백업 신뢰 훼손 | raw settings와 777 mode | NTFS `allow_other`, raw 전체 export, sync 시 mode 보존 | backup scripts, secure-copy 신규, runbook | 암호화 backup 양쪽 restore 통과, 평문 신규 생성 차단 | 암호화본 복원 실패 시 평문 원본 삭제 금지 |
| CP-PP-P0-002 | P0 | 재현·롤백 불가 | dirty deployment, 410 changes, SHA 불일치 | CLI가 dirty bundle 직접 배포 | deploy/predeploy/release manifest/CI | clean SHA, green CI, manifest와 deploy ID 일치 | alias 전환 전 immutable URL smoke 실패 |
| CP-PP-P0-003 | P0 | 법적·신뢰 위험 | live `/youth-policy`의 `홍길동` | fallback placeholder가 production 노출 | youth-policy page, site settings, legal validator | 대표자 승인값 노출, placeholder CI 실패 | 승인값 불명확하면 section 비노출 또는 배포 block |
| CP-PP-P0-004 | P0 | 백업 중단·파일 손상 | disk 94.9%, 85.5GB | 같은 디스크에 프로젝트와 backup 누적 | status/retention/alerts | 90% 미만 목표, 95%에서 write block | restore 검증 없는 cleanup 금지 |
| CP-PP-P0-005 | P0 | 원본 DB·이미지 유실 위험 | fallback 62.2일, 이미지 4,025 blocked | Supabase paused/unreachable | recovery wrapper/runbook/R2 readiness | live_rest fresh backup, image 회수 증가 | recovery check 실패 시 대량 작업 즉시 중단 |
| CP-PP-P0-006 | P0/P1 | auto-press 상태 왜곡·재처리 누락 | running 177개 장기 잔류 | expired lease sweep 부재 | worker, D1 repository, repair script/tests | stale 0 또는 정책상 DLQ, 중복 게시 0 | dry-run/apply diff 불일치 또는 publish 후보 발생 |
| CP-PP-P0-007 | P0 | 회귀 배포 가능 | recent CI red, local gate 누락 | local deploy와 CI 분리 | workflows, predeploy script | 같은 SHA 모든 필수 gate green | gate 결과 없는 alias 전환 금지 |
| CP-PP-P1-001 | P1 | env 오작동·token 혼선 | 26 sensitive key 중복, empty masking warning | 여러 `.env*` 중복 | env drift/deploy loader | canonical source 1개, empty masking 0 | token 원문 출력 시 즉시 중단·회전 |
| CP-PP-P1-002 | P1 | crawl budget·thin page | tag URL 10,697, 단일기사 tag 8,394 | 모든 tag index+sitemap | tag page/sitemap/audit | 승인 threshold, sitemap 감소, 주요 tag 유지 | traffic/index 급락 시 정책 되돌림 |
| CP-PP-P1-003 | P1 | 응답 성능·원본 부하 | 모든 표본 no-store/MISS | root CSP nonce/headers dynamic | layout/middleware/cache/invalidation | 보안 유지+신선도 5분 이내+CWV 개선 | CSP/게시 신선도 회귀 시 즉시 복구 |
| CP-PP-P1-004 | P1 | 백업 장애 늦은 발견 | warnings 있으나 자동 수신 미확인 | report와 알림 연결 약함 | status/audit/systemd/Task Scheduler | 주간 양쪽 restore, 위험 알림 실수신 | alert storm 발생 시 발송만 disable |
| CP-PP-P1-005 | P1 | 검색 노출 지연 | Search Console 과거 NOINDEX | 과거 crawl state | noindex CI/report/docs | live blocking 0, SC 유효성 검사 | 삭제 404를 index 대상으로 넣지 않음 |
| CP-PP-P1-006 | P1 | sitemap 200이지만 기사 누락 가능 | route fail-open 가능성 | DB 오류를 빈 목록으로 처리 | sitemap route/verify script | 최소 기사 수/최신 no 포함 검사 | DB 장애 시 잘못된 empty sitemap 배포 차단 |
| CP-PP-P2-001 | P2 | 분류 UX·SEO 일관성 | 2026-07-18 스냅샷 3,808건 중 후보 332 | source category 혼재 | category audit/normalize | reviewed mapping+rollback, apply 별도 승인 | dry-run 미검토면 DB 쓰기 금지 |
| CP-PP-P2-002 | P2 | 운영 품질 | auto-press count 1000, queue cap과 불일치 | 설정/UI/route 제한 불일치 | auto-press settings/routes/UI | 상한 일치, 품질 사유 리포트 | 생산량 급변 시 설정 rollback |
| CP-PP-P2-003 | P2 | 관리자 회귀 미탐지 | 인증 smoke 미확인 | public smoke 중심 | browser-smoke/auth fixture | 핵심 관리자 read-only smoke 통과 | 운영 쓰기 발생 가능 테스트 금지 |
| CP-PP-P2-004 | P2 | 상태 파악 지연 | CLI 리포트 분산 | dashboard 연결 부족 | `/cam` ops dashboard/API | freshness, disk, Supabase, stale runs 표시 | secret/PII 표시 시 즉시 비활성화 |
| CP-PP-P2-005 | P2 | CI queue·운영 증빙 왜곡 | 2026-05-26 run 1건이 한 달 이상 queued | concurrency/runner/event 상태 미정리 | GitHub Actions workflow/concurrency, runbook | 원인 기록, zombie run 정리, 재발 감시 | 실행 중 정상 job을 취소하지 않음 |
| CP-PP-P3-001 | P3 | 접근성·사용성 | 현재 전수 측정 없음 | 자동 a11y/CWV gate 없음 | public components/smoke | WCAG 핵심 위반 0, CWV budget | 시각 회귀 시 component rollback |

## 5. 현실적 우선순위

### P0: 24시간 안에 시작

`24시간`은 아래 작업을 모두 끝내는 기한이 아니라 read-only 진단, 대표자 결정, 위험 차단부터 **착수하는 목표**다. 암호화 전환과 clean release baseline은 단계별 복원·배포 검증을 통과한 뒤 완료한다.

1. 백업 민감정보 노출 범위 감사, 암호화 구조와 임시 접근 통제.
2. youth-policy 법적 임시정보 확정 및 placeholder 배포 차단.
3. disk 95% 진입 방지와 검증된 retention 계획.
4. dirty 배포/CI red 차단, release manifest와 clean golden deployment.
5. Supabase 대표자 결정 및 fresh export 재개 조건 확정.
6. auto-press stale running dry-run 감사와 안전한 lease 복구 설계.
7. 동일 출처 실제 5xx가 발견되면 다른 작업보다 우선해 즉시 P0 incident로 전환.

### P1: 7~14일

1. Search Console NOINDEX 유효성 검사와 CI 재발 방지.
2. sitemap fail-open 방지, thin tag 감사 및 index 정책.
3. CSP를 약화하지 않는 cache/성능 측정과 무효화 검증.
4. 백업 실패 알림, 주간 primary/second restore-check 자동화.
5. Supabase 복구 후 저부하 이미지 회수와 R2 readiness. 100% 확보 전 production rewrite 금지.
6. env canonical source와 empty masking 차단.

### P2: 14~30일

- 카테고리 332건 결과를 사람이 검토한 뒤 별도 승인된 apply 계획 수립.
- auto-press source 품질, 제외 사유, count 상한, retry/DLQ 지표 개선.
- 관리자 핵심 화면 read-only 인증 smoke.
- 백업·Supabase·이미지·auto-press 상태를 관리자 운영 대시보드에 연결.
- 박영래 author 정책과 auto-news 중지 상태를 감사 gate로 유지.
- 한 달 이상 queued인 GitHub Actions run의 원인과 concurrency 상태를 확인하고, 정상 실행 중인 job과 구분해 정리.

### P3: 30일 이후

- 모바일/데스크톱 접근성, Core Web Vitals, 가로 스크롤, 메뉴·검색 overlay 전수 측정.
- Google/Coupang third-party 광고 warning 추세 관찰. 동일 출처 4xx/5xx만 실패 유지.
- evidence 보관 기간, hash, 접근권한, `.gitignore` 정책 정리.
- Linux systemd와 Windows Task Scheduler 절차를 같은 명령 wrapper로 통일.
- 네이버뉴스·다음뉴스 제휴/자동 송고는 범위에서 계속 제외한다.

## 6. P0/P1 개발 과제 상세

### P0-001. 백업 민감정보 보호와 암호화 2중화

- **목적**: 백업이 유출돼도 secret과 개인정보 원문을 읽을 수 없고, 암호화된 primary/second copy를 실제로 복원할 수 있게 한다.
- **현재 상태**: raw D1 settings에 secret/PII가 포함되고 NTFS/second copy 파일 mode가 777이다. second copy 자체는 최신성과 restore-check가 정상이다.
- **개발 범위**: key 이름/존재 여부만 출력하는 security audit, application-level encrypted archive 또는 restic/age 기반 repository, secret escrow 분리, 암호화 restore-check, sync 후 permission 검사, report redaction.
- **제외 범위**: 확인 전 기존 백업 삭제, 운영 DB에서 설정 삭제, secret 원문 출력, 암호화본 복원 검증 전 key 회전.
- **예상 파일**: `scripts/local-culturepeople-backup.mjs`, `scripts/sync-local-backup-copy.mjs`, `scripts/restore-local-culturepeople-backup.mjs`, `scripts/backup-security-audit.mjs`(신규), `scripts/secure-local-backup-copy.mjs`(신규), `package.json`.
- **대표자 작업**: 암호화 key의 오프라인 보관 위치, 외부 second target, 접근 가능한 OS 계정 확정. 안전한 복사 완료 후 Telegram/메일/Gemini/webhook key 회전 승인.
- **dry-run**: `pnpm backup:security:audit -- --root <primary> --no-values` - **신규 구현 필요**.
- **apply**: `pnpm backup:secure-copy -- --source <primary> --target <secure-target> --apply` - **신규 구현 필요**.
- **검증**: 암호화 target에서 신규 `backup:secure:restore-check`; 기존 `backup:local:restore-check-all`; 로그 secret pattern scan.
- **무중단 순서**: 읽기 감사 → 암호화 시험 복사 → 임시 디렉터리 복원 → primary/second hash 대조 → timer 전환 → 7일 병행 → secret 회전 → 승인 후 평문 retention 축소.
- **완료 기준**: 신규 backup은 평문 secret archive를 만들지 않음, 양쪽 복원 통과, 로그 원문 0, key 분실 대응 문서, NTFS chmod에 의존하지 않음.
- **blocked**: 대표자가 key 보관 위치를 정하지 않음, secure target 공간 부족, 복원 실패.
- **위험/rollback**: 암호화 key 분실이 가장 큰 위험이다. 검증된 암호화본 두 개가 생길 때까지 기존 평문을 삭제하지 않고 timer만 이전 방식으로 되돌릴 수 있게 유지한다.

### P0-002. 법적 정보 확정과 placeholder 차단

- **목적**: production에 허위·임시 법적 정보가 노출되지 않게 한다.
- **현재 상태**: `/youth-policy`에서 `홍길동` 확인. 회사 명칭·책임자·연락처 간 일치도는 대표자 확인 필요.
- **개발 범위**: 승인된 site settings 사용, fallback placeholder 제거, 필수 법적 필드 validator, `홍길동/example/TODO` 탐지 CI, metadata/canonical/robots 테스트.
- **제외 범위**: 개발자가 법적 정보 추측, 대표자 승인 없는 값 입력.
- **예상 파일**: `src/app/youth-policy/page.tsx`, site settings type/API/admin UI, `scripts/validate-public-legal-content.mjs`(신규), 관련 unit test.
- **대표자 작업**: 법적 회사명, 청소년보호책임자, 전화/이메일, 시행일을 서면 확정.
- **dry-run**: `pnpm legal:public-content-check -- --base https://culturepeople.co.kr` - **신규 구현 필요**.
- **apply**: 승인값을 관리자 설정 또는 검토된 config로 반영. 정확한 명령은 저장 방식을 결정한 후 구현.
- **검증**: local unit → preview URL GET → production GET; placeholder 0, 연락 경로 정상, canonical self.
- **무중단 순서**: 대표자 승인 → preview 반영 → 검사 → alias 전환 → live 재검사.
- **완료 기준**: 임시문구 0, 대표자 승인 기록, 법적 페이지 테스트가 release gate에 포함됨.
- **blocked**: 대표자 값 미확정.
- **위험/rollback**: 잘못된 승인값이면 이전 값으로 돌리는 것이 아니라 해당 책임자 섹션을 명확히 비노출하고 배포를 차단한다.

### P0-003. clean release manifest와 배포 gate

- **목적**: 운영 산출물을 commit, 테스트, 환경상태, rollback 후보와 1:1 연결한다.
- **현재 상태**: dirty CLI deployment, worktree 410 entries, GitHub main/production SHA 불일치, recent CI red.
- **개발 범위**: release manifest, dirty/upstream/CI gate, env drift 필수화, unit/NOINDEX/public smoke 포함, immutable preview 검증 후 alias 전환, artifact retention/hash.
- **제외 범위**: 사용자 기존 변경 되돌리기, 강제 reset, manifest 없는 긴급 배포 자동 승인.
- **예상 파일**: `scripts/predeploy-ops-check.mjs`, `scripts/deploy-culturepeople-vercel.mjs`, 신규 release manifest/CI status scripts, `.github/workflows/ci.yml`, `package.json`, `.gitignore`.
- **대표자 작업**: emergency dirty deploy 승인권자와 golden rollback 승인 기준 확정.
- **dry-run**: `pnpm predeploy:ops-check -- --root <backup-root> --base https://culturepeople.co.kr --dry-run`; 신규 `pnpm release:manifest -- --dry-run`.
- **apply**: clean branch에서 `pnpm release:manifest -- --apply` 후 기존 `pnpm deploy:culturepeople`. manifest ID가 없으면 wrapper가 중단해야 함.
- **검증**: `ci:typecheck`, `test:unit`, `verify:portal`, `seo:audit:noindex`, public browser smoke, restore-check-all, ops audit, env drift, GitHub CI SHA 일치.
- **무중단 순서**: clean commit/CI → prebuilt immutable deployment → smoke → alias promote → post-live verify → manifest 봉인.
- **완료 기준**: `gitDirty=0`, GitHub SHA=manifest SHA=deployment SHA, 필수 gate green, rollback ID 사전 smoke 통과.
- **blocked**: CI log 원인 미해결, dirty worktree, token missing/empty, backup danger, legal validator 실패.
- **위험/rollback**: alias 전환 전 실패는 배포 폐기. 전환 후 회귀는 사전 승인한 immutable rollback을 promote하고 같은 검증을 반복한다.

### P0-004. 디스크 95% 진입 방지와 retention 안전화

- **목적**: 다음 자동 백업 중 ENOSPC로 백업과 프로젝트 파일이 손상되는 일을 막는다.
- **현재 상태**: primary disk 사용률 약 94.9%, 여유 약 85.5GB. second copy는 약 52.3GB free.
- **개발 범위**: 80/90/95% threshold, 예상 다음 backup 크기 사전 계산, 95% write block, 보존 후보 dry-run, primary/second restore 보호, alert 연결.
- **제외 범위**: 자동 무검증 삭제, stale Supabase의 유일한 raw export 삭제, repo/타 프로젝트 임의 삭제.
- **예상 파일**: `scripts/local-culturepeople-backup-status.mjs`, backup entry script, retention planner 신규, systemd service/Windows wrapper.
- **대표자 작업**: 삭제 가능한 비백업 대용량 파일과 추가 저장장치 결정.
- **dry-run**: `pnpm backup:retention:plan -- --root <primary> --dry-run` - **신규 구현 필요**.
- **apply**: 검토된 목록만 `--apply --manifest <approved-plan>` - **신규 구현 필요**.
- **검증**: primary/second restore-check-all, 최신/월간 보관본 존재, free space 10% 이상 목표.
- **무중단 순서**: 공간 inventory → second copy 확인 → 삭제 후보 hash/보존등급 → 대표자 승인 → 한 batch 삭제 → restore-check → 다음 batch.
- **완료 기준**: 90% 미만 또는 최소 2회 백업 예상 용량 확보, 95%에서 backup이 명확히 blocked/alert, 보존 정책 문서화.
- **blocked**: second copy restore 실패, 삭제 후보에 유일한 Supabase fallback 포함, target 공간 부족.
- **위험/rollback**: 삭제는 되돌릴 수 없으므로 second copy/hash 검증 없는 apply를 금지한다.

### P0-005. Supabase fresh export와 이미지 원본 회수 gate

- **목적**: 62.2일 stale fallback을 최신 원본으로 교체하고 4,025개 미확보 이미지를 안전하게 회수한다.
- **현재 상태**: `project_unreachable_or_paused`; DB/Storage ready false. 이미지 4,034/8,059.
- **개발 범위**: 기존 recovery check/wrapper 재검증, fresh export, 통합 backup, 단일 concurrency image backfill, progress checkpoint, 실패 host cooldown.
- **제외 범위**: Supabase 자동 결제/resume, blocked 상태 대량 재시도, 이미지 100% 전 production URL rewrite.
- **예상 파일**: 기존 recovery/backup/backfill/R2 readiness scripts와 runbook. 필요 시 상태 분류만 보강.
- **대표자 작업**: dashboard Resume/결제/다운로드, project ref, `images` bucket, service role key 확인.
- **dry-run**: `pnpm supabase:recovery-check -- --require-storage`; `pnpm cloudflare:r2:media-readiness`.
- **apply**: ready인 경우에만 `pnpm ops:supabase-recovered-backup -- --root <primary>`; 이미지 backfill은 기존 저부하 timer 사용.
- **검증**: manifest source `live_rest`, stale warning 0, restore-check-all, 이미지 수 증가, R2 readiness 재실행.
- **무중단 순서**: console 확인 → read-only recovery probe → fresh DB export → restore-check → 이미지 1 concurrency 소량 → 24시간 관찰 → 계속.
- **완료 기준**: live_rest fresh backup, image source 접근 정상, blocked count 감소. rewrite 해제는 8,059/8,059 materialized+R2 검증+rollback mapping일 때만.
- **blocked**: recovery check 실패, bucket 불일치, key invalid, storage DNS 실패.
- **위험/rollback**: 새 export가 불완전하면 기존 fallback을 삭제하지 않고 신규 snapshot만 폐기한다. URL rewrite는 별도 승인 전 금지한다.

### P0-006. auto-press expired running lease 회수

- **목적**: 장기 running item을 안전하게 분류·재큐잉/DLQ 처리해 중복 게시 없이 운영 지표를 정상화한다.
- **현재 상태**: 최신 백업에서 running item 177개가 101시간 이상. 현재 로직이 queued item 위주라 자동 회수 공백 가능.
- **개발 범위**: read-only stale audit, lease timeout 정책, attempts/maxAttempts 기준 requeue 또는 failed/DLQ, bounded scheduled sweep, run count reconciliation, audit event, idempotency tests.
- **제외 범위**: 기존 177개 즉시 일괄 쓰기, 이미 게시된 item 재게시, auto-news 활성화.
- **예상 파일**: Cloudflare auto-press worker, D1 repository/queries, `scripts/audit-auto-press-stale-items.mjs`와 repair script(신규), tests.
- **대표자 작업**: timeout 시간, max attempts, DLQ 수동 검토 담당자 승인.
- **dry-run**: `pnpm auto-press:stale-recovery -- --older-than-hours 2 --dry-run` - **신규 구현 필요**.
- **apply**: 승인된 report ID를 요구하는 `--apply --report <id> --limit <small>` - **신규 구현 필요**.
- **검증**: stale count, 중복 기사 0, 게시량/daily limit 유지, source별 실패율, worker tests.
- **무중단 순서**: 백업 → dry-run → 5~10건 bounded apply → 24시간 관찰 → batch 확대 → scheduled sweep.
- **완료 기준**: 정책을 벗어난 running 0, 모든 전환 audit log, 중복 publish 0, auto-news 계속 disabled.
- **blocked**: item과 article의 idempotency key를 대조할 수 없음, backup stale, dry-run이 게시 후보를 직접 생성함.
- **위험/rollback**: requeue가 중복 게시를 만들 수 있으므로 이미 articleId가 있는 item은 재큐잉하지 않는다. 문제가 생기면 sweep flag만 끄고 기존 상태 전환 log로 복원한다.

### P1-001. NOINDEX 재발 방지와 Search Console 후속

- **목적**: 공개 게시 기사에 noindex가 재발하면 배포 전에 차단하고, 과거 Search Console 상태만 별도로 정리한다.
- **현재 상태**: 최신 24건 audit blocking 0. legacy 308/삭제 404 정책 정상.
- **개발 범위**: 기존 audit를 release gate에 연결, 대표 공개 기사+sitemap sample 자동 탐색, X-Robots-Tag 검사, report retention.
- **제외 범위**: 삭제·미게시·중복·위험 기사 복구/색인, Search Console API 대량 요청.
- **예상 파일**: `scripts/audit-article-noindex.mjs`, `scripts/predeploy-ops-check.mjs`, article metadata/sitemap tests.
- **대표자 작업**: Search Console URL Inspection 라이브 테스트, 정상 legacy 목적지 색인 요청, NOINDEX 보고서 유효성 검사.
- **dry-run/apply**: 감사 자체는 read-only. `pnpm seo:audit:noindex -- --base ... --urls-file tmp/noindex-urls.txt`.
- **검증**: blocking 0, published sample 200/self canonical/index, 삭제 8건 404 유지.
- **무중단 순서**: local test → preview audit → alias → live audit 1회 → SC 수동 요청.
- **완료 기준**: CI에서 게시 noindex 1건이면 실패, stale SC와 live defect 구분.
- **blocked**: Search Console은 대표자 권한 없이는 검증 완료 처리하지 않음.
- **위험/rollback**: 삭제 URL을 실수로 published로 분류하면 audit fixture를 되돌리고 404 정책을 우선한다.

### P1-002. sitemap fail-open과 thin tag 색인 정책

- **목적**: DB 오류 때 빈 기사 sitemap이 200으로 배포되는 것을 막고 10,697개 tag URL의 crawl budget을 관리한다.
- **현재 상태**: sitemap 14,510 중 tag 10,697. 최신 백업 기준 tag 10,660개 중 8,394개가 기사 1건.
- **개발 범위**: tag count/read-only audit, threshold 시뮬레이션, sitemap 최소 article/latest article invariant, empty/1건 tag metadata 정책, Search Console 전후 지표.
- **제외 범위**: 사전 리포트 없는 대량 noindex, tag DB 삭제, URL redirect 일괄 변경.
- **예상 파일**: `src/app/tag/[name]/page.tsx`, `src/app/sitemap.xml/route.ts`, `scripts/verify-portal-surface.mjs`, 신규 tag audit script/tests.
- **대표자 작업**: 핵심 브랜드/인물 tag allowlist와 threshold(예: 2건/3건) 승인.
- **dry-run**: `pnpm seo:tag-audit -- --root <backup-root> --thresholds 2,3,5` - **신규 구현 필요**.
- **apply**: 코드 정책 배포이며 DB 쓰기 없음. production 전 preview sitemap diff를 승인한다.
- **검증**: sitemap article 최소 수, 최신 no 포함, tag URL 감소량, 주요 tag 200/index 유지, 50k URL 제한 이하.
- **무중단 순서**: audit → threshold 승인 → tests → preview sitemap diff → 배포 → 30일 Search Console 관찰.
- **완료 기준**: DB 오류를 성공으로 숨기지 않음, thin tag 정책 문서화, 주요 landing traffic 회귀 없음.
- **blocked**: tag traffic/Search Console baseline을 확보하지 못함.
- **위험/rollback**: 검색 유입 감소 시 tag metadata/sitemap threshold만 이전 정책으로 되돌린다.

### P1-003. CSP 보존형 캐시·성능 개선

- **목적**: CSP nonce 보안을 유지하면서 public read 부하와 체감 응답 시간을 줄인다.
- **현재 상태**: 표본 public 페이지가 `private, no-cache, no-store`, `x-vercel-cache: MISS`.
- **개발 범위**: 동적 원인 tracing, 정적/동적 route 경계, data cache와 HTML cache 분리, article/home/category invalidate path, CWV/Lighthouse budget.
- **제외 범위**: 측정 없이 CSP nonce 제거, 검색/관리자 캐시, 게시 후 5분 이상 지연.
- **예상 파일**: root layout, middleware, `next.config.ts`, home/article/category pages, publication invalidation helpers, performance tests.
- **대표자 작업**: 허용 가능한 게시 반영 지연 최대값 승인(권장 5분 이내).
- **dry-run**: 헤더·TTFB baseline report - package script **신규 구현 필요**.
- **apply**: route 단위 preview 배포 후 alias 전환.
- **검증**: CSP 헤더/nonce, 새 기사 캐시 무효화, 수정·삭제·예약·auto-press 반영, mobile/desktop CWV.
- **무중단 순서**: baseline → 한 route → preview → publication smoke → 점진 확대.
- **완료 기준**: CSP 회귀 0, 게시 신선도 5분 이내, p75 성능 목표 개선, 검색/admin dynamic 유지.
- **blocked**: Next middleware 구조상 nonce와 public cache를 안전하게 분리하지 못함. 이 경우 no-store 유지와 원인 문서화가 완료 기준이다.
- **위험/rollback**: stale/잘못된 사용자 콘텐츠가 보이면 해당 route revalidate를 제거하고 이전 no-store로 복구한다.

### P1-004. 백업 경고와 주간 restore 자동화

- **목적**: 정상 timer처럼 보여도 stale/공간/복원 실패를 사람이 놓치지 않게 한다.
- **현재 상태**: status와 restore-check는 정상이나 위험을 자동 수신했는지 미확인. 일부 danger가 프로세스 exit 0으로 끝난다.
- **개발 범위**: strict exit policy, deduplicated Telegram/local report, 주간 primary+second restore, systemd timer와 Windows Task Scheduler wrapper.
- **제외 범위**: alert 실패 때문에 backup 자체 중단, Telegram secret 로그 출력.
- **예상 파일**: status/audit scripts, notification helper, `ops/systemd`, `ops/windows` 신규 또는 보강, runbook.
- **대표자 작업**: Telegram test 수신, 야간 알림 허용 시간, Windows 계정/Task Scheduler 권한 확인.
- **dry-run**: `pnpm backup:health:notify -- --root <primary> --dry-run` - **신규 구현 필요**.
- **apply**: timer install wrapper - **신규 구현 필요**. 먼저 local report, 이후 test alert 1회.
- **검증**: stale fixture, disk threshold fixture, lock fixture, 양쪽 restore report, duplicate suppression.
- **무중단 순서**: report only → test chat → warning only → danger alert → weekly schedule.
- **완료 기준**: backup age>24h, disk>=90/95, restore fail, stale lock, Supabase stale, image +0 상태가 severity와 함께 전달됨.
- **blocked**: Telegram destination/secret 미확정이면 local report까지만 완료.
- **위험/rollback**: alert storm 시 notification timer만 disable하고 backup timers는 유지한다.

### P1-005. 이미지 R2 readiness와 rewrite 보호

- **목적**: 확보된 이미지를 별도 object storage에 검증 가능하게 복제하되 원본 누락 상태에서 공개 URL을 바꾸지 않는다.
- **현재 상태**: local materialized 4,034/8,059, R2 copy 후보 4,018/4,018, rewrite allowed false.
- **개발 범위**: object hash/metadata/content-type 검증, copy checkpoint, URL mapping/rollback mapping, representative sample serve test.
- **제외 범위**: 4,025개 미확보 상태 rewrite, 대량 live 요청, 원본 삭제.
- **예상 파일**: 기존 R2 readiness/copy/planner scripts, media manifest/index, migration runbook.
- **대표자 작업**: R2 account/billing/custom domain/retention 결정.
- **dry-run**: `pnpm cloudflare:r2:media-readiness` 및 기존 R2 copy dry-run 명령 존재 여부 재확인.
- **apply**: Supabase 회수와 manifest 100% 이후 별도 승인. 없는 명령은 구현 전 `신규 구현 필요`로 처리.
- **검증**: 8,059/8,059 materialized, R2 hash 100%, sample 200/content-type, rollback mapping 100%, backup restore.
- **무중단 순서**: copy only → sample serve → dual-read 가능성 → DB rewrite dry-run → 소량 apply → 관찰 → 확대.
- **완료 기준**: 누락 0, rewrite 후보/rollback 1:1, CDN·도메인·비용 승인.
- **blocked**: Supabase blocked 또는 R2 credential/billing 미확정.
- **위험/rollback**: URL 실패 시 mapping으로 이전 URL을 복구한다. Supabase/로컬 원본은 안정화 기간 동안 삭제하지 않는다.

### P1-006. 관리자 read-only smoke와 실제 5xx gate

- **목적**: 공개 사이트 통과 뒤 관리자 핵심 화면이 깨지는 회귀를 배포 전에 잡는다.
- **현재 상태**: public smoke 과거 통과, 인증 관리자 smoke는 이번 감사 미확인.
- **개발 범위**: articles/auto-press/distribute/rss/seo/portal-review 화면의 read-only load, same-origin 4xx/5xx 실패, secret redaction, fixture-free auth.
- **제외 범위**: 운영 기사 생성·삭제, auto-press 실행, 설정 저장.
- **예상 파일**: `scripts/browser-smoke.mjs`, auth session helper, tests/CI workflow.
- **대표자 작업**: 최소권한 smoke 계정과 credential 저장 위치 승인.
- **dry-run**: 공개 smoke는 기존 명령 사용. 관리자 mode는 지원 옵션을 코드와 대조하고 없으면 **신규 구현 필요**.
- **apply**: 배포 행위가 아니라 CI gate 연결.
- **검증**: desktop/mobile 핵심 route, console/network, 동일 출처 5xx 0, 외부 광고 warning 분리.
- **무중단 순서**: preview read-only → CI → production 배포 후 1회.
- **완료 기준**: 핵심 관리자 화면 모두 렌더, 운영 write 0, secret screenshot/log 0.
- **blocked**: 최소권한 계정 없음, MFA/session 자동화 정책 미확정.
- **위험/rollback**: 테스트가 write를 시도하면 즉시 중단하고 public smoke만 유지한다.

## 7. 대표자가 직접 해야 하는 작업

### 오늘

- [ ] `/youth-policy`의 실제 청소년보호책임자 이름, 전화/이메일, 법적 회사명을 확정한다.
- [ ] 백업 드라이브와 현재 PC에 로그인 가능한 사용자 목록, 공유 설정, 원격 접근 여부를 점검한다.
- [ ] 백업 암호화 key를 비밀번호 관리자/오프라인 매체 중 어디에 보관할지 정한다.
- [ ] primary disk의 95% 진입을 막기 위해 추가 저장공간 또는 삭제 가능한 비백업 파일을 결정한다.
- [ ] Supabase dashboard에서 프로젝트 상태, Resume/결제/Download 선택지를 확인한다.

### 7일 안

- [ ] Supabase project ref와 환경 URL이 일치하는지 확인한다.
- [ ] `images` bucket과 service role key 접근 가능 여부를 확인한다.
- [ ] 외장디스크/NAS/R2/다른 로컬 드라이브 중 물리적으로 분리된 2차 보관 위치를 결정한다.
- [ ] R2 billing, custom domain, egress/retention 정책을 결정한다.
- [ ] Telegram test alert가 실제 대표자 채팅에 도착하는지 확인한다.
- [ ] Search Console에서 정상 legacy 목적지 URL을 라이브 테스트하고 색인 요청, NOINDEX 유효성 검사를 시작한다.

### 외부 콘솔 정기 확인

- [ ] Google Search Console: Pages, sitemap, URL Inspection, Core Web Vitals.
- [ ] Bing Webmaster Tools: sitemap/IndexNow 수신 상태.
- [ ] Google AdSense: ads.txt 승인, 정책 위반, 광고 오류. 외부 iframe warning과 사이트 5xx를 구분한다.
- [ ] Supabase: project pause, DB/Storage 접근, 다운로드 기한과 결제.
- [ ] Cloudflare: Worker cron/version, R2 object/비용, rollback 가능한 version.
- [ ] Vercel: production alias, deployment retention, clean golden deployment 지정.

네이버뉴스·다음뉴스 제휴·자동 송고는 이 계획의 범위가 아니다. Search Console과 일반 웹 검색 색인만 운영한다.

## 8. 30일 실행 로드맵

| 기간 | 작업 | 선행조건/병렬성 | 배포 gate | 성공 지표 |
|---|---|---|---|---|
| 24시간 | 법적 정보 확정, backup security read-only audit 설계, disk inventory, Supabase 결정, auto-press stale read-only report | 법적 값은 대표자 필수. 나머지 병렬 가능 | 개발/배포 없음 | 임시 법적값 확정, secret 값 미출력 inventory, disk plan, stale item 분류 |
| 2~7일 | 암호화 backup 시험/복원, release manifest와 dirty/CI gate, legal validator, CI 실패 원인 수정 | secure target/key 필요 | clean SHA+unit/type+restore+NOINDEX+preview smoke | encrypted restore 양쪽 통과, gitDirty 0 golden release, CI green |
| 7~14일 | auto-press stale 5~10건 bounded repair, backup alert/주간 restore, env canonical source, sitemap/tag audit | backup과 idempotency 확인 | write 전 dry-run report 승인 | stale 감소·중복 0, test alert 수신, tag threshold 결정 |
| 14~30일 | Supabase ready 시 fresh export, 저부하 이미지 회수, R2 copy 검증, cache/CWV 실험, 관리자 smoke | Supabase/R2/대표자 결정. 성능·smoke 병렬 가능 | 이미지 rewrite 금지, preview 기반 route별 gate | live_rest, 이미지 blocked 감소, CSP 유지, admin write 0 |
| 30일 | 카테고리 332건 사람 검토, ops dashboard, 문서/증빙 정리 | P0/P1 안정화 후 | DB apply는 별도 승인 | rollback mapping, 상태 한 화면, 근거 보관 정책 |

### 단계별 중단 기준

- disk 사용률 95% 이상이면 대용량 build/copy/backup apply를 중단한다.
- encrypted restore가 실패하면 기존 평문 backup을 삭제하거나 key를 회전하지 않는다.
- Supabase recovery check가 실패하면 fresh export/대량 이미지 backfill을 실행하지 않는다.
- auto-press dry-run에서 이미 게시된 article이 재게시 후보가 되면 apply하지 않는다.
- 게시 기사 noindex, 실제 same-origin 5xx, CSP 회귀, legal placeholder가 발견되면 production alias를 전환하지 않는다.
- 이미지 8,059개와 R2 hash/rollback mapping이 모두 확인되기 전 URL rewrite를 금지한다.

## 9. 검증 명령과 존재 여부

저장소 경로는 하드코딩하지 않고 먼저 UUID로 계산한다.

```bash
MOUNT="$(findmnt -rn -S UUID=96B82074B8205551 -o TARGET | head -n 1)"
REPO="$MOUNT/Users/Documents/monet-registry-main"
cd "$REPO"
```

Windows에서는 저장소 드라이브 문자를 확인한 뒤 같은 `pnpm` 명령을 PowerShell에서 실행한다. `systemctl`, `findmnt`, shell wrapper는 Windows Task Scheduler/PowerShell wrapper를 별도로 제공해야 하며 핵심 Node 스크립트는 OS 중립 경로 API를 사용한다.

| 명령 | 현재 존재 | 용도/주의 |
|---|---|---|
| `pnpm ci:typecheck` | 예 | 타입 검사 |
| `pnpm test:unit` | 예 | 단위 테스트 전체 |
| `pnpm verify:portal -- --base https://culturepeople.co.kr` | 예 | ads/RSS/sitemap/news-sitemap 소량 확인 |
| `pnpm seo:audit:noindex -- --base https://culturepeople.co.kr --urls-file tmp/noindex-urls.txt` | 예 | 대상 24 URL. 배포 후 1회만 |
| `pnpm smoke:browser -- --base-url=https://culturepeople.co.kr --public-site-only --no-auto-start --no-admin-auth --json` | 예 | 공개 브라우저 smoke |
| `pnpm backup:local:status` | 예 | symlink/default root 또는 `--root` 명시 |
| `pnpm backup:local:restore-check` | 예 | primary 최신 복원 |
| `pnpm backup:local:restore-check-all` | 예 | primary+second copy 복원 |
| `pnpm ops:audit` | 예 | backup/IndexNow/선택 portal 요약. 현재 warning에도 exit 0 가능 |
| `pnpm supabase:recovery-check -- --require-storage` | 예 | blocked/ready gate |
| `pnpm cloudflare:r2:media-readiness` | 예 | 이미지 확보·rewrite 금지 상태 |
| `pnpm ops:env-drift-check` | 예 | missing/empty/masked, 원문 출력 금지 |
| `pnpm predeploy:ops-check -- --root <root> --base <url> --dry-run` | 예 | 현재 gate 계획. 필수 항목 보강 필요 |
| `pnpm category:audit -- --root <root>` | 예 | read-only 카테고리 감사 |
| `pnpm category:normalize -- --dry-run` | 예 | DB apply 전 dry-run. 이번 계획에서는 apply 금지 |
| `systemctl --user list-timers --all \| grep culturepeople` | Linux만 | timer 확인 |
| `journalctl --user -u culturepeople-local-backup.service -n 120 --no-pager` | Linux만 | backup journal |
| `pnpm backup:security:audit -- --root <root> --no-values` | **신규 구현 필요** | secret/PII 구조와 권한 감사 |
| `pnpm backup:secure-copy -- --source <root> --target <target> --dry-run` | **신규 구현 필요** | 암호화 복사 계획 |
| `pnpm backup:secure:restore-check -- --root <secure-target>` | **신규 구현 필요** | 암호화 복원 검사 |
| `pnpm release:manifest -- --dry-run` | **신규 구현 필요** | 배포 근거 묶음 |
| `pnpm release:gate` | **신규 구현 필요** | dirty/CI/legal/security 포함 필수 gate |
| `pnpm auto-press:stale-recovery -- --dry-run` | **신규 구현 필요** | expired running 분류 |
| `pnpm seo:tag-audit -- --root <root>` | **신규 구현 필요** | thin tag threshold 분석 |
| `pnpm backup:health:notify -- --dry-run` | **신규 구현 필요** | 경고와 주간 restore 연동 |

## 10. 운영 증빙과 보관 기준

- `.deploy-logs`: release manifest가 참조하는 배포 로그만 보관하고 secret scanner/hash를 통과시킨다.
- `.seo-audit-runs`, `.category-audit-runs`, `.portal-backfill-runs`: retention과 `.gitignore` 정책을 정하고 accidental commit을 차단한다.
- backup manifest/media manifest/media-url-index: backup snapshot과 같은 암호화 경계에 보관한다.
- systemd journal/Windows Task Scheduler logs: 30~90일 rolling 보관, token/URL query secret redaction.
- 배포 manifest: 운영 release별 장기 보관하고 SHA-256을 남긴다. secret 값, 이메일, IP, subscriber token은 포함하지 않는다.
- security audit 결과: field name, count, masked 상태만 남긴다.
- NTFS의 `chmod` 표시를 보안 경계로 신뢰하지 않는다. Linux/Windows 공통으로 application-level encryption을 사용한다.

## 11. 이번 감사에서 확인하지 못한 항목

- Search Console, Bing, AdSense 내부 콘솔의 현재 상태.
- 인증된 관리자 화면의 실제 브라우저 smoke.
- Cloudflare에 현재 배포된 Worker version과 rollback 후보의 live 동작.
- Telegram 경고의 실제 수신 여부.
- GitHub CI 최근 실패의 상세 로그 원인. annotation은 exit code 1만 제공했다.
- 전체 production 로그를 이용한 5xx 비율과 Core Web Vitals p75.
- `/privacy`, `/terms` 법적 본문의 대표자 승인 여부.
- Supabase dashboard의 실제 Resume 가능 상태와 다운로드/결제 조건.
- 민감정보가 과거 외부로 복사됐는지 여부. 현재는 노출 가능성만 확인했으며 침해로 단정하지 않는다.

## 12. 다음 개발 프롬프트 3개

### 프롬프트 1. P0 운영·법적·배포 재현성 개선

```text
docs/post-production-deployment-audit-and-next-plan.md의 문제 등록부 CP-PP-P0-001~007과 상세 P0-001~006을 기준으로 백업 민감정보 보호, 법적 placeholder 차단, clean release manifest, 배포 gate, 디스크 보호, auto-press stale lease 복구 기반을 끝까지 구현해줘.

진행 원칙:
- 더 묻지 말고 실제 UUID 96B82074B8205551의 현재 마운트에서 저장소를 찾아 코드와 git 상태를 먼저 읽어.
- 기존 변경을 되돌리지 말고 범위를 좁게 수정해.
- 운영 DB 쓰기, 기존 백업 삭제, 대량 live 호출, 즉시 production 배포는 하지 마.
- 위험 명령은 dry-run 기본, --apply와 승인된 report ID가 있을 때만 쓰기 가능하게 해.
- secret 원문, 개인정보, token을 stdout/log/report에 출력하지 마.
- NTFS chmod에 의존하지 않고 Linux/Windows 공통 application-level encryption을 사용해.
- auto-news와 뉴스레터는 중지 상태를 유지하고 auto-press만 다뤄.

반드시 구현:
1. backup security audit, encrypted secure-copy, encrypted restore-check package scripts.
2. 암호화본 복원 성공 전 기존 평문 backup 삭제를 막는 guard.
3. youth-policy placeholder validator. 대표자 승인값이 없으면 값을 추측하지 말고 배포 gate를 blocked 처리.
4. release manifest와 dirty/upstream/CI/env/legal/backup/unit/NOINDEX/browser smoke 필수 gate.
5. current deploy ID, SHA, diff hash, test reports, rollback ID를 연결하고 secret은 key 상태만 기록.
6. disk 80/90/95 threshold와 95% backup apply block, retention dry-run planner.
7. auto-press stale running read-only audit와 idempotent bounded recovery. 기본 dry-run, 이미 게시된 item 재큐잉 금지.
8. systemd와 Windows Task Scheduler 대체 명령/문서를 함께 유지.

검증:
- pnpm ci:typecheck
- pnpm test:unit
- pnpm backup:local:restore-check-all
- 신규 backup security/secure restore fixture tests
- pnpm ops:env-drift-check
- pnpm verify:portal -- --base https://culturepeople.co.kr
- pnpm seo:audit:noindex -- --base https://culturepeople.co.kr --urls-file tmp/noindex-urls.txt
- release gate dry-run
- auto-press stale recovery dry-run

모든 검증이 통과해도 대표자 법적값과 암호화 key 보관 위치가 없으면 production 배포하지 말고 blocked로 보고해. 완료 보고에는 파일, 테스트, dry-run 결과, blocked, 대표자 작업, 롤백 절차를 적어.
```

### 프롬프트 2. 백업 2중화와 Supabase·이미지 복구

```text
docs/post-production-deployment-audit-and-next-plan.md의 P0-001, P0-004, P0-005와 P1-004~P1-005를 기준으로 암호화 2중 백업, 경고, Supabase fresh export, 이미지/R2 readiness를 구현하고 검증해줘.

- UUID 기반 현재 마운트와 primary/second copy를 먼저 read-only 확인해.
- Supabase recovery-check가 ready가 아니면 fresh export와 이미지 대량 backfill을 실행하지 말고 blocked 처리해.
- 기존 평문 backup과 stale fallback은 암호화본 양쪽 복원 검증 전 삭제하지 마.
- disk 95% 이상에서는 copy/backup apply를 차단해.
- 이미지 backfill은 concurrency 1, checkpoint/resume, host cooldown을 유지해.
- 이미지 8059/8059, R2 hash/content-type, rollback mapping 100% 전 production URL rewrite를 금지해.
- Linux systemd와 Windows Task Scheduler 절차를 함께 구현/문서화해.

필수 검증:
pnpm backup:local:status
pnpm backup:local:restore-check-all
pnpm ops:audit
pnpm supabase:recovery-check -- --require-storage
pnpm cloudflare:r2:media-readiness
신규 encrypted primary/second restore-check
신규 alert dry-run과 test alert 1회
pnpm ci:typecheck
관련 unit tests

Supabase가 blocked면 정확한 dashboard 작업과 재개 명령만 남기고 강제 복구하지 마. 실제 URL rewrite와 기존 backup 삭제는 이번 작업에서 하지 마.
```

### 프롬프트 3. SEO·성능·관리자 smoke 개선

```text
docs/post-production-deployment-audit-and-next-plan.md의 P1-001~P1-003, P1-006과 P2/P3를 기준으로 SEO 재발 방지, sitemap/tag 감사, CSP 보존형 성능 개선, 관리자 read-only smoke를 구현하고 테스트·preview·운영 검증까지 진행해줘.

- 게시 기사만 indexable, 삭제·미게시·중복·위험 기사 404를 유지해.
- legacy 23/25/27/33/34의 기존 308 매핑을 유지해.
- 모든 tag를 즉시 noindex하지 말고 article count와 traffic 기준 dry-run report를 먼저 만들어.
- sitemap이 DB 오류에도 기사 없이 200으로 성공하지 않게 최소 기사 수와 최신 기사 invariant를 추가해.
- CSP nonce를 제거하지 말고 cache 가능성을 route별로 측정해. 게시/수정/삭제/예약/auto-press 후 5분 이내 반영을 보장하지 못하면 no-store를 유지해.
- 관리자 smoke는 read-only이며 기사 생성·삭제·auto-press 실행·설정 저장을 금지해.
- auto-news/뉴스레터 중지 상태와 박영래 author 정책을 회귀 테스트해.
- 네이버뉴스·다음뉴스 제휴나 자동 송고 기능은 만들지 마.

검증:
pnpm ci:typecheck
pnpm test:unit
pnpm verify:portal -- --base https://culturepeople.co.kr
pnpm seo:audit:noindex -- --base https://culturepeople.co.kr --urls-file tmp/noindex-urls.txt
pnpm smoke:browser -- --base-url=<preview> --public-site-only --no-auto-start --no-admin-auth --json
신규 tag audit와 sitemap invariant tests
신규 관리자 read-only smoke
Cache-Control/CSP/TTFB/CWV 전후 비교

clean release gate가 통과한 경우에만 immutable preview를 만들고 smoke 후 production alias를 전환해. 배포 후 소량 URL만 재검증하고 Search Console 수동 작업을 분리해 보고해.
```

## 13. 가장 먼저 실행할 개발 프롬프트

**12장의 `프롬프트 1. P0 운영·법적·배포 재현성 개선`을 가장 먼저 실행한다.**

다만 실제 적용 순서는 그 프롬프트 안에서도 다음처럼 제한한다.

1. read-only backup security audit와 disk/auto-press stale audit.
2. encrypted test copy와 restore-check.
3. release manifest와 배포 gate.
4. 대표자 승인 법적값 반영.
5. bounded auto-press recovery.
6. 모든 gate 통과 후에만 clean production 배포.

이 순서라야 현재 기능을 더 늘리기 전에 데이터 노출·유실·재현 불가 위험을 먼저 낮출 수 있다.
