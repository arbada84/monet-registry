# 검색 색인 자동화 이후 운영 개선 기획서

작성일: 2026-06-15

## 1. 목적

최근 세 차례 논의한 다음 작업, 추가 개선, 남은 운영 리스크를 하나의 실행 기획서로 정리한다.

**현재 완료된 범위는 "검색엔진 색인 자동화"다.** IndexNow(Bing/Naver 검색 크롤러 URL 변경 알림), sitemap, RSS, news-sitemap이 기사 게시와 연동되어 동작 중이다.

2026-06-27 개발 범위에서는 네이버뉴스·다음뉴스 심사, 제휴 신청 준비, 자동 송고 기능을 제외한다. `/cam/portal-review`는 심사용 패키지가 아니라 내부 운영 품질/검색 유입 리포트로 유지하고, 기술 작업은 검색 색인, RSS/sitemap/news-sitemap, IndexNow, 백업, 이미지 이전 readiness, 운영 감사에 집중한다.

**아직 완료되지 않은 범위는 "포털 뉴스 입점"이다.** 네이버뉴스·다음뉴스 뉴스 영역 게재는 각 포털의 편집 제휴/심사 절차가 필요하며, 현재 심사 신청을 하지 않은 상태다. IndexNow가 동작한다고 해서 네이버뉴스·다음뉴스 뉴스탭에 기사가 올라가는 것이 아니다. 이 구분을 명확히 한다.

앞으로의 초점은 백업 신뢰도, 복원 가능성, 운영 경고, 검색 유입 운영 리포트, 관리자 회귀검증에 둔다.

2026-07-09 기준 로컬 백업 기본 루트는
`/media/arbada/96B82074B8205551/Users/Documents/monet-registry-main/culturepeople-backups`다.
운영 명령은 `CULTUREPEOPLE_BACKUP_ROOT`를 이 경로로 설정한 뒤 실행하고,
기존 `$HOME/culturepeople-backups`는 호환용 symlink로만 유지한다.

## 2. 현재 확인 상태

### 완료로 보는 항목

아래 "완료"는 **검색엔진 색인 알림(IndexNow) 및 피드/sitemap 자동화** 기준이다. 네이버뉴스·다음뉴스 뉴스 영역 게재는 포함되지 않는다.

- 포털 표면 검증 완료: `/ads.txt`, `/rss.xml`, `/feed.xml`, `/rss`, `/feed`, `/sitemap.xml`, `/news-sitemap.xml` 모두 `pnpm verify:portal -- --base https://culturepeople.co.kr` 기준 정상.
- 보도자료 자동등록(auto-press) 게시 후 IndexNow 성공 로그 확인 완료.
- `worker-notify` 인증 경로 정리 완료: `AUTO_PRESS_WORKER_SECRET`와 `CRON_SECRET` fallback 경로가 동작.
- `notifyIndexNow()` 내부 호출은 `CRON_SECRET` Bearer 인증을 붙여 `/api/seo/index-now` middleware를 통과.
- 기존 색인 누락 기사 IndexNow 백필 완료: 게시 기사와 IndexNow 성공 로그가 일치하는 상태까지 확인. (네이버뉴스/다음뉴스 포털 노출과는 무관)
- 보도자료 자동등록 작성자 기본값과 기존 기사 작성자 정리 완료: `박영래` 계정 정보 기준.

### 네이버뉴스·다음뉴스 상태 (심사 미신청)

- **현재 상태**: 심사 신청 전이므로 네이버뉴스·다음뉴스 뉴스 영역에 기사가 노출되지 않는다.
- **IndexNow와의 차이**: IndexNow는 네이버 검색(검색결과 사이트 노출)에 색인 속도 힌트를 주는 것이지, 네이버뉴스탭 입점과 다르다.
- **가능한 것**: 네이버 검색결과에서 컬처피플 URL이 더 빨리 색인될 수 있음. 뉴스탭 노출은 심사 통과 이후에만 가능.
- **대표자 해야 할 일**: 네이버뉴스/다음뉴스 제휴 심사 신청 → 심사 통과 → 포털이 제공하는 송고 규격(XML/RSS/API) 확정 → 그 이후에야 자동 송고 개발이 의미 있음.
- **결론**: 현재 기술 자동화로 완료된 것은 검색 색인 알림, RSS/sitemap/news-sitemap 반영, IndexNow 로그/백필 영역이다. 네이버뉴스·다음뉴스 뉴스 입점은 기술 문제가 아니라 심사/제휴 절차 문제이며, 심사 통과 전에는 포털 자체 기사 업로드나 자동 송고 개발을 진행해도 실사용 경로가 없다.

### 기존 P0 상태 정리

- 기존 `P0-001 배포/라이브 검증`, `P0-003 검색 색인/IndexNow 운영 실검증`, `P0-004 AdSense ads.txt 운영 반영 확인`은 완료로 정리한다.
- 현재 미해결 P0는 `Supabase 접근 복구(P0-001)`와 `Supabase fresh export/통합 백업 재생성(P0-002)`이다. `백업 복원 리허설`, `백업/이미지 경고 자동화`, `RPO/RTO 기준`, `정기 감사 명령`, `운영 Runbook`은 1차 구현 또는 문서화 완료 상태다.

### 남은 리스크

- 로컬 백업은 실행되고 있으나 Supabase live export가 실패해 `local_fallback`을 사용 중.
- 2026-06-16 확인 기준 Supabase fallback age는 약 27.2일이며 stale 상태다.
- D1은 최신 백업에 포함되지만 Supabase 원본 백업 신뢰도는 낮다.
- 이미지 백업은 4034/8059개 완료, 4025개가 `ifducnfrjarmlpktrjkj.supabase.co` 접근 문제로 DNS 보류 중이다.
- 이미지 백필은 최근 24시간 22회 실행됐지만 신규 저장 `+0`이며, 현재는 안전하게 defer만 하고 있어 진행률이 늘지 않는다.

## 3. 우선순위 재정렬

> **P0 기준**: 데이터 안전성 직접 위험(백업 신뢰도 저하, 복구 불가 위험)만 P0로 잡는다. 문서화·Runbook·경고 자동화는 중요하지만 즉각 위험이 아니므로 P0-OPS(운영 안정화)로 분리한다.

### P0-001. Supabase 프로젝트 접근 복구

**상태: 대표자 외부 콘솔 확인 대기**

**목표**

Supabase live REST/export와 storage 접근을 복구해 오래된 local fallback 의존을 제거한다.

현재 진단 결과가 `project_unreachable_or_paused`이므로, 코드 수정이나 대량 재시도보다 Supabase 프로젝트 상태와 도메인 접근 문제 확인이 먼저다.

현재 이 항목은 로컬 코드로 강제 해결할 수 없다. 대표자가 Supabase dashboard에서 프로젝트 pause/resume, project ref, storage bucket, service role key 상태를 확인한 뒤 아래 명령이 `readyForDbExport: true`, `readyForStorageCopy: true`를 반환하면 P0-002로 넘어간다.

**대표자가 확인할 것**

- Supabase dashboard에서 프로젝트가 paused 상태인지 확인하고 필요 시 resume.
- 프로젝트 ref가 환경변수의 `ifducnfrjarmlpktrjkj.supabase.co`와 일치하는지 확인.
- `images` storage bucket이 존재하고 접근 가능한지 확인.
- 서비스 role key가 교체되었거나 만료되었는지 확인.

**검증 명령**

```bash
pnpm supabase:recovery-check -- --require-storage
```

**완료 기준**

- `classification.readyForDbExport`가 `true`.
- `classification.readyForStorageCopy`가 `true`.
- `project_unreachable_or_paused` 상태가 사라진다.

### P0-002. Supabase fresh export와 통합 백업 재생성

**상태: P0-001 복구 전 blocked**

**목표**

Supabase 복구 직후 D1/Supabase 2개 DB가 모두 최신 상태로 들어간 통합 백업을 만든다.

live export가 가능해지면 오래된 fallback snapshot을 최신 상태로 갱신하고, 이후 `backup:local:status`에서 stale 경고가 사라지는지 확인한다.

현재 blocked 이유: Supabase host/storage 접근이 복구되지 않으면 백업 스크립트가 안전하게 `local_fallback`을 사용해야 하며, 이 상태에서 대량 이미지 재시도나 강제 export를 반복하면 부하만 늘어난다.

**작업**

- 저부하 기본값으로 로컬 백업 1회 실행.
- SQLite snapshot 재생성.
- 백업 검증과 상태 점검 실행.
- stale fallback 경고가 사라졌는지 확인.

**검증 명령**

```bash
pnpm backup:local:quiet -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
pnpm backup:local:verify -- --root "$CULTUREPEOPLE_BACKUP_ROOT" --require-sqlite
pnpm backup:local:status -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
```

**완료 기준**

- 최신 `backup-manifest.json`에서 Supabase source가 `live_rest`.
- `Supabase fallback stale` 경고가 사라진다.
- SQLite snapshot이 최신 백업 폴더에 생성된다.

---

> P0-003~010은 운영 안정화 항목이다. 2026-06-16 기준 복원 리허설, 경고 출력, RPO/RTO, audit, Runbook, redaction, 증빙 보관 기준은 1차 구현/문서화가 끝났다. 남은 즉시 위험은 Supabase 복구(P0-001)와 복구 후 fresh export(P0-002)다.

### P0-003. 백업 복원 리허설 추가

**상태: 구현 완료**

**목표**

백업이 만들어지는 것뿐 아니라 실제로 복원 가능한 구조인지 자동 점검한다.

**작업**

- 최신 `merged/culturepeople.sqlite`를 임시 복원 디렉터리에 복사해 기사 수, 최신 기사 번호, 필수 테이블 존재 여부를 확인하는 `scripts/restore-local-culturepeople-backup.mjs` 추가.
- `raw/d1`, `raw/supabase`, `merged/articles.json`, `media/media-manifest.json` 존재와 기본 row 수를 확인.
- 임시 복원 디렉터리에 복사한 SQLite를 읽기 검증만 수행한다.
- 운영 DB에는 쓰지 않는다.

**완료 기준**

- `pnpm backup:local:restore-check -- --root "$CULTUREPEOPLE_BACKUP_ROOT"` 단일 명령으로 복원 가능성 점검.
- 최신 백업이 없거나 Supabase fallback이 stale이면 명확한 경고를 출력.
- 복원 리허설은 production service를 호출하지 않는다.

### P0-004. 백업/이미지 경고 자동화

**상태: 1차 구현 완료**

**목표**

백업이 조용히 나빠지는 상황을 놓치지 않도록 운영 경고를 만든다.

**경고 조건**

- Supabase fallback age가 3일 초과.
- 이미지 백필이 24시간 이상 새 파일 `+0`.
- backup lock이 비정상적으로 오래 유지.
- 백업 디스크 여유 공간이 20GB 이하.
- 최신 백업이 36시간 이상 갱신되지 않음.

**전달 채널**

- 우선 로컬 로그와 `backup:local:status` 출력 강화. `backup:local:status`는 stale fallback, 최신 백업 RPO 초과, 디스크 20GB/10GB 기준, lock 상태, 이미지 백필 24시간 +0 상태를 `warnings`와 `health`로 표시한다.
- 가능하면 기존 텔레그램 설정을 재사용해 daily report에 포함.

**완료 기준**

- 운영자가 `pnpm backup:local:status` 또는 `pnpm ops:audit`에서 stale 백업과 이미지 보류 상태를 바로 인지할 수 있다.
- 경고는 읽기 전용이며 백업/이미지 대량 재시도를 자동으로 유발하지 않는다.

### P0-005. 백업 목표 수치와 장애 기준 정의

**상태: 구현 완료**

**목표**

백업/복구 작업의 성공 기준을 감으로 판단하지 않도록 RPO/RTO와 보관 기준을 명시한다.

**초기 권장 기준**

- RPO: D1 기준 24시간 이내, Supabase 복구 후 24시간 이내.
- RTO: 로컬 SQLite/JSON 기준 기사 조회 복구 4시간 이내, 전체 운영 복구 24시간 이내.
- 백업 보관 기간: 기본 90일.
- 최소 디스크 여유 공간: 20GB 이상 유지, 10GB 이하는 백업 실행 차단 기준.
- 이미지 백필 목표: host 접근 복구 후 저부하 단위로 100%에 도달.

**작업**

- `docs/local-backup-runbook.md`에 RPO/RTO와 보관 기준을 반영한다.
- `backup:local:status`에 RPO/RTO 기준 대비 위험도를 표시한다.
- 대표자가 허용 가능한 데이터 손실 시간과 복구 시간을 확정하면 문서의 임시 기준을 갱신한다.

**완료 기준**

- 백업 상태를 볼 때 "정상/주의/위험" 판단 기준이 숫자로 설명된다.
- 장애 대응 시 어느 백업을 기준으로 복원할지 결정할 수 있다.

### P0-006. 장애 시 중단/롤백 스위치 정리

**상태: 문서화 우선, 추가 설정 스위치 검토 유지**

**목표**

자동화가 문제를 만들 때 즉시 멈추거나 이전 안정 상태로 되돌릴 수 있게 한다.

**정리할 스위치**

- auto-press 일시중지: 관리자 설정 또는 `cp-auto-press-settings`의 cron/worker 활성화 값을 끈다.
- Cloudflare Worker 중단: `AUTO_PRESS_WORKER_ENABLED=false` 또는 worker route/cron 비활성화 절차를 문서화한다.
- Worker dry-run: `AUTO_PRESS_WORKER_DRY_RUN=true`로 기사 저장 없이 검증만 수행하는 절차를 문서화한다.
- 포털 제출 일시중지: `publishArticleToPortals` 호출 경로를 건드리지 않고 설정값으로 IndexNow 제출을 일시 skip할 수 있는지 검토한다.
- Vercel rollback: Vercel dashboard 또는 CLI에서 직전 production deployment로 promote/rollback하는 절차를 문서화한다.
- Cloudflare Worker rollback: 최근 worker version 확인과 이전 version 재배포 절차를 문서화한다.

**완료 기준**

- 장애 상황에서 "무엇을 끄면 되는지"를 5분 안에 찾을 수 있다.
- 중단 스위치는 대량 삭제나 DB write 없이 적용 가능해야 한다.

### P0-007. 복구 시나리오별 Runbook 작성

**상태: 문서화 보강 완료, 세부 콘솔 스크린샷은 대표자 확인 후 추가**

**목표**

장애 원인별로 확인 명령, 대표자 수동 확인, 복구 후 검증을 분리한다.

**필수 시나리오**

- Supabase 프로젝트 paused 또는 unreachable.
- Supabase service role key 만료/불일치.
- Supabase storage bucket 또는 media host DNS 실패.
- Cloudflare D1 API 접근 실패.
- Vercel production deploy 실패.
- Cloudflare auto-press Worker 실패.
- IndexNow/포털 제출 성공 로그 누락.
- 로컬 백업 lock 장기 유지.
- 이미지 백필이 24시간 이상 `+0` 상태.
- **IndexNow API key 유출 또는 교체 필요**: `/cam/seo`에서 새 key 입력 → 저장 즉시 `/{old-key}.txt`가 404 반환되고 `/{new-key}.txt`가 200 반환되는지 확인 → IndexNow 제출이 새 key + keyLocation으로 전송되는지 확인. key 변경 후 Bing Webmaster Tools/Naver Search Advisor에서도 key 갱신 여부를 확인한다.

**각 시나리오에 포함할 것**

- 증상.
- 원인 후보.
- 확인 명령.
- 대표자가 확인해야 하는 콘솔 위치.
- 복구 명령 또는 안전한 우회 방법.
- 복구 후 완료 기준.

**완료 기준**

- 장애가 발생해도 대화 기억 없이 문서만 보고 1차 진단을 시작할 수 있다.
- 운영 DB에 쓰기 전에 반드시 읽기 전용 확인 단계가 있다.
- 세부 절차는 `docs/culturepeople-ops-recovery-runbook.md`에 정리되어 있다.

### P0-008. 정기 데이터 정합성 감사

**상태: 1차 구현 완료**

**목표**

포털 제출, 피드 노출, 백업 상태가 시간이 지나며 drift 되는지 주기적으로 확인한다.

**감사 항목**

- D1 `게시` 기사 수와 IndexNow 성공 로그 수 비교.
- IndexNow 인증 실패 로그 수: `[auto-press-worker] 인증이 필요합니다.`는 0이어야 한다.
- `sitemap.xml`에 최신 기사 URL과 `lastmod`가 포함되는지 확인.
- `news-sitemap.xml`에 48시간 이내 기사와 `news:*` 요소가 포함되는지 확인.
- `/rss.xml`에 최신 기사와 본문형 `description` 또는 `content:encoded`가 포함되는지 확인.
- 최신 기사 author/author_email 누락 여부 확인.
- 로컬 백업 최신성, Supabase fallback stale 여부, 이미지 백필 진행률 확인.

**검증 명령 예시**

```bash
pnpm verify:portal -- --base https://culturepeople.co.kr
node scripts/backfill-portal-publication.mjs --source d1 --base https://culturepeople.co.kr --log-preview 3
pnpm backup:local:status -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
pnpm ops:audit -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
```

**완료 기준**

- `candidates without visible success log: 0`.
- `authFailed: 0`.
- `Supabase source: live_rest` 또는 fallback 사용 시 stale 위험이 명확히 표시된다.
- 최신 기사 RSS/sitemap/news-sitemap 노출이 확인된다.

### P0-009. 시크릿/환경변수 관리

**상태: 문서화 및 redaction 기준 유지**

**목표**

여러 프로젝트가 Vercel/Cloudflare/Supabase를 함께 쓰는 환경에서 토큰 혼선을 막고, 로그 유출을 방지한다.

**관리 원칙**

- Vercel 배포 토큰은 프로젝트 전용 `CULTUREPEOPLE_VERCEL_TOKEN`만 사용한다.
- 공통 이름의 전역 토큰보다 프로젝트명이 들어간 환경변수를 우선한다.
- Cloudflare Worker와 Vercel의 `AUTO_PRESS_WORKER_SECRET` 일치 여부를 점검한다.
- `CRON_SECRET` fallback 경로는 유지하되, 로그에는 값을 출력하지 않는다.
- Supabase service role key 교체 시 `supabase:recovery-check`로 DB/storage 접근을 즉시 재검증한다.
- shell history, process list, deploy log에 secret이 남지 않도록 wrapper/script에서 redaction을 유지한다.

**완료 기준**

- Vercel, Cloudflare, Supabase, Telegram 관련 secret의 저장 위치와 교체 절차가 문서화된다.
- 배포/진단 로그에서 토큰 원문이 노출되지 않는다.
- 프로젝트 전용 token 이름(`CULTUREPEOPLE_VERCEL_TOKEN`)과 secret redaction 기준은 `docs/culturepeople-ops-recovery-runbook.md`와 배포 wrapper에서 유지한다.

### P0-010. 운영 증빙/로그 보관 기준

**상태: 구현/문서화 완료**

**목표**

나중에 문제를 추적할 때 어떤 증빙을 어디서 봐야 하는지 정한다.

**보관 대상**

- `.deploy-logs/`: Vercel production deploy와 portal verification 결과.
- `.portal-backfill-runs/`: IndexNow dry-run/apply 결과와 후보 수.
- `backup-manifest.json`: D1/Supabase source, fallback 여부, merge 결과.
- `media-manifest.json`: 이미지 백업 성공/실패/재사용 상태.
- `media-url-index.json`: 로컬 이미지 캐시 인덱스.
- `backup:local:status` 출력: 최신 백업, stale, 디스크, lock, 이미지 진행률 요약.
- `journalctl --user` 로그: systemd user timer/service 실행 이력.

**완료 기준**

- 각 운영 점검 결과가 파일 또는 명령 출력으로 남는다.
- 실패 분석 시 배포, 포털 제출, 백업 상태를 같은 날짜 기준으로 연결할 수 있다.

## 4. P1 운영 개선

### P1-001. 포털 제휴 신청 패키지 정리

**목표**

검색엔진 색인 자동화는 완료됐다. 다음 단계인 네이버뉴스·다음뉴스 포털 뉴스 영역 입점을 위한 심사 신청 자료를 준비한다.

**전제 조건 (현재 상태)**: 네이버뉴스·다음뉴스 심사 신청을 아직 하지 않았다. 심사 통과 전에는 포털 뉴스탭 자동 게재를 개발해도 의미가 없다. 따라서 이 단계는 "개발 작업"이 아니라 "대표자 수동 준비 + 신청"이 핵심이며, 심사 통과 이후에야 자동 송고 어댑터 개발이 가능하다.

**작업**

- `/cam/portal-review`에서 최근 6개월 기사 CSV/JSON을 추출.
- 자체기사/보도자료/AI 생성 후보 비율을 점검.
- 네이버뉴스, 다음뉴스, Google Publisher Center 제출용 체크리스트 작성.
- 대표자 수동 준비 자료를 분리한다.

**대표자가 준비할 것**

- 매체소개.
- 편집방침.
- 윤리강령.
- 청소년보호정책.
- 정정/반론보도 안내.
- 기자/운영자 정보.
- 사업자/매체 운영 증빙.

**완료 기준**

- 신청용 CSV/JSON 산출물과 제출 체크리스트가 문서로 준비된다.
- 코드 자동화로 가능한 범위와 대표자 수동 제출 범위가 분리된다.

### P1-002. 자동 보도자료·자동 뉴스 품질 모니터링

**목표**

auto-press와 auto-news가 정상 게시되는 것을 넘어, 컬처피플 주제와 맞지 않는 기사를 줄인다.

**auto-press 점검 항목**

- 정치/외교/일반 산업성 보도자료가 문화/예술/콘텐츠 맥락 없이 게시되는지 확인.
- 제외된 항목의 reason code가 운영자가 이해할 수 있는지 확인.
- `SKIPPED_OUT_OF_SCOPE_SOURCE`, `SKIPPED_NO_IMAGE`, `DUPLICATE_SOURCE` 비율을 주기적으로 확인.

**auto-news 점검 항목 (기존 미포함)**

- auto-news는 keywords 설정으로 필터링하지만, 키워드가 제목/설명에 포함되기만 하면 통과하는 구조다. 컬처피플 관련성 없는 기사가 유입되는지 `/cam/auto-news` 실행 이력에서 주기적으로 확인한다.
- AI 편집 실패(`임시저장` 상태로 저장된 항목)가 누적되는지 확인.
- auto-news 기사에 작성자 표기가 정확한지 확인 (보도자료 작성자와 혼용 방지).

**완료 기준**

- 비문화성 기사 유입이 발견되면 auto-press/auto-news 각각 필터 규칙을 보강한다.
- `/cam/auto-press`, `/cam/auto-news`에서 품질 판단 근거를 확인할 수 있다.

### P1-003. RSS fullContent 운영 확인 (네이버 서치어드바이저 제출 대비)

**목표**

네이버 서치어드바이저 RSS 제출 전에 운영 설정에서 피드 본문 포함이 유지되는지 확인한다.

**현재 상태**

- `src/app/api/rss/route.ts`는 `fullContent = rssSettings.fullContent ?? true`로 기본값이 본문 포함이다.
- `/cam/rss`의 기본 설정도 `fullContent: true`이며, 운영 DB 저장값이 `false`일 때 관리자 화면 경고와 즉시 켜기 버튼이 있다.
- 따라서 새 구현 과제라기보다 운영 DB에 예전 `false` 값이 남아 있는지 확인하는 작업이다.

**작업**

- `/cam/rss` 설정에서 운영 DB의 `fullContent` 값을 확인한다.
- `false`이면 네이버 서치어드바이저 제출 전에 관리자 화면에서 `true`로 변경한다.
- 본문이 포함된 경우 `<description>`이 HTML이 아닌 텍스트 형태인지, `<content:encoded>`가 올바른 CDATA로 감싸지는지 확인한다.

**완료 기준**

- 네이버 서치어드바이저에 RSS를 제출했을 때 기사 본문이 포함된 피드를 제공한다.
- `/api/rss` 또는 `/rss.xml` 응답에 최신 기사의 본문과 `content:encoded`가 포함된다.

### P1-004. 뉴스 심사 대비 기사 품질 지표 리포트

**목표**

네이버뉴스·다음뉴스 제휴 심사를 신청하기 전에 매체 운영 지표를 수치로 파악한다. 심사 신청 시기를 판단하는 근거가 된다.

**필요한 지표**

- 최근 6개월 총 게시 기사 수.
- 자체기사(직접 작성) vs 보도자료(`sourceUrl` 있음) vs AI 생성(`aiGenerated: true`) 비율.
- 기자/작성자별 기사 수.
- 카테고리별 기사 수.
- AI 편집 실패로 임시저장된 기사 비율.

**작업**

- `/cam/portal-review`에 기간별 지표 요약 카드를 추가하거나 기존 `/cam/portal-review` 리포트에서 위 항목을 확인할 수 있는지 점검한다.
- 지표 CSV/JSON을 다운로드해 심사 제출 자료로 바로 쓸 수 있게 한다.

**완료 기준**

- 자체기사/보도자료/AI 생성 비율을 관리자 화면에서 즉시 확인할 수 있다.
- "지금 심사 신청 가능한지" 판단에 필요한 수치를 수동 SQL 없이 추출할 수 있다.

### P1-005. 관리자 화면 스모크 테스트

**목표**

배포 전후 관리자 핵심 화면이 깨지지 않는지 자동으로 확인한다.

**대상 화면**

- `/cam/articles`
- `/cam/auto-press`
- `/cam/distribute`
- `/cam/rss`
- `/cam/seo`
- `/cam/portal-review`
- `/cam/ads`

**작업**

- Playwright 기반 로그인 스모크 추가.
- 읽기 중심 검증부터 시작하고, 저장/수정은 테스트 계정 또는 mock 환경에서만 확장.
- Windows/Linux 양쪽 개발 가능성을 유지하도록 OS 종속 경로를 피한다.

**완료 기준**

- 배포 전 관리자 주요 화면 접근과 기본 렌더링을 자동 확인.
- 실패 시 어떤 화면이 깨졌는지 명확히 출력.

### P1-006. 대표자 수동 작업 체크리스트

**목표**

코드로 자동화할 수 없는 외부 콘솔/제휴/증빙 작업을 대표자가 직접 확인할 수 있게 분리한다.

**Supabase**

- 프로젝트 paused/resumed 상태 확인.
- project ref가 `ifducnfrjarmlpktrjkj`인지 확인.
- `images` storage bucket 존재와 public/private 정책 확인.
- service role key 교체 여부 확인.

**AdSense**

- `ads.txt` 경고 해소 여부 확인.
- 사이트 소유권/승인 상태 확인.

**포털/검색 콘솔 실행 (단순 "확인"이 아니라 실제 제출까지)**

- 네이버 서치어드바이저: 사이트 소유 확인 완료 여부 → `/sitemap.xml` 제출 → `/rss.xml` 또는 `/api/rss` 제출 → 수집 현황 확인. 아직 하지 않았으면 이 기회에 실행한다.
- Google Search Console: 도메인 소유 확인 완료 여부 → `/sitemap.xml` 제출 → `/news-sitemap.xml` 별도 제출 → 색인 요청 현황 확인.
- Bing Webmaster Tools: IndexNow 동작하므로 계정 연결 후 수신 로그 확인 권장.
- Google Publisher Center: 뉴스 매체 등록 여부 결정 (뉴스탭 노출 희망 시 필요).
- 네이버뉴스/다음뉴스 제휴 신청 가능 조건과 제출 창구 확인.

**각 콘솔 제출 완료 여부 체크리스트 (□ → ✅ 표시)**

- □ 네이버 서치어드바이저 사이트 소유 확인
- □ 네이버 서치어드바이저 `/sitemap.xml` 제출
- □ 네이버 서치어드바이저 RSS 제출
- □ Google Search Console 도메인 소유 확인
- □ Google Search Console `/sitemap.xml` 제출
- □ Google Search Console `/news-sitemap.xml` 제출
- □ Bing Webmaster Tools 계정 연결
- □ AdSense 경고 해소 확인

**매체 증빙**

- 매체소개.
- 편집방침.
- 윤리강령.
- 청소년보호정책.
- 정정/반론보도 안내.
- 기자/운영자 정보.
- 사업자/매체 운영 증빙.

**완료 기준**

- 대표자 수동 확인이 필요한 항목과 개발자가 처리 가능한 항목이 분리된다.
- 각 외부 콘솔 작업의 완료 여부를 체크리스트로 표시할 수 있다.

## 5. P2 정리 작업

### P2-001. 문서 상태 갱신

**작업**

- `docs/next-priority-implementation-plan.md`에서 완료된 P0 항목을 완료 상태로 정리.
- 현재 미해결 P0를 Supabase 접근 복구와 Supabase fresh export/통합 백업 재생성으로 재정렬.
- 복원 리허설, 경고 자동화, RPO/RTO, 관리자 스모크, 운영 감사 항목은 구현/문서화 상태를 코드 기준으로 반영.
- `docs/local-backup-runbook.md`와 `docs/culturepeople-ops-recovery-runbook.md`의 Linux/systemd 절차에 Windows 대체 명령을 함께 유지.

**완료 기준**

- 다음 작업이 대화 기억이 아니라 문서 기준으로 이어진다.

### P2-002. 운영 대시보드 연결 검토

**작업**

- `/cam/dashboard` 또는 별도 운영 상태 카드에서 아래 상태를 볼 수 있는지 검토.
  - 최신 백업 시각.
  - Supabase fallback stale 여부.
  - 이미지 백필 진행률.
  - 포털 IndexNow 누락 후보 수.
  - auto-press 최근 성공/실패.

**검토 결과**

- 현재는 구현 보류가 현실적이다.
- `backup:local:status`와 `ops:audit`의 핵심 증빙은 이 컴퓨터의 `$CULTUREPEOPLE_BACKUP_ROOT`, `_logs`, `media-url-index.json`, `.backup.lock` 등 로컬 파일을 읽는다. Vercel 관리자 화면은 이 로컬 백업 디렉터리에 안전하게 접근할 수 없다.
- 로컬 경로, secret, 백업 manifest를 웹 관리자 API에 직접 노출하면 보안/운영 위험이 커진다.
- 현재 운영 표면은 터미널 명령(`pnpm ops:audit`, `pnpm backup:local:status`)과 Runbook으로 유지한다. 추후 필요하면 로컬 에이전트가 redaction된 JSON 요약만 업로드하고, 관리자 화면은 그 요약만 읽는 방식으로 별도 설계한다.

**완료 기준**

- 당장은 대표자가 터미널 명령과 Runbook으로 핵심 운영 리스크를 확인한다.
- 웹 대시보드 연결은 로컬 백업 요약 업로드/인증/redaction 설계가 생긴 뒤 진행한다.

## 6. 권장 착수 순서

**[데이터 안전 — 즉시]**

1. Supabase dashboard에서 프로젝트/스토리지 접근 복구 확인 (대표자).
2. `pnpm supabase:recovery-check -- --require-storage` 재실행.
3. Supabase가 복구되면 `pnpm backup:local:quiet -- --root "$CULTUREPEOPLE_BACKUP_ROOT"` 실행.

**[운영 안정화 — 순서대로]**

4. 백업 복원 리허설 명령을 정기적으로 실행해 최신 백업이 복원 가능한지 확인.
5. `backup:local:status`와 `ops:audit`의 stale/이미지 +0/디스크/lock 경고를 매일 확인.
6. 대표자의 허용 RPO/RTO가 바뀌면 `docs/local-backup-runbook.md` 기준값 갱신.
7. 장애 시 중단/롤백 스위치와 Runbook을 배포 변경 때마다 갱신.
8. 정기 데이터 정합성 감사 명령과 운영 증빙 보관을 유지.
9. 시크릿/환경변수 교체 시 로그 redaction 기준을 지킨다.
10. 운영 대시보드 연결은 로컬 백업 요약 업로드 설계가 생긴 뒤 재검토.

**[포털 콘솔 제출 실행 — 대표자 수동]**

11. 네이버 서치어드바이저: 사이트 소유 확인 → `/sitemap.xml` 제출 → RSS 제출 (아직 안 했으면 지금 실행).
12. Google Search Console: 도메인 소유 확인 → `/sitemap.xml` 제출 → `/news-sitemap.xml` 제출.
13. Bing Webmaster Tools 계정 연결 및 IndexNow 수신 확인.

**[심사 준비 — 기술+대표자 병행]**

14. 뉴스 심사 대비 기사 품질 지표 리포트 확인 (`/cam/portal-review`): 자체기사/AI생성 비율, 기자별 발행량.
15. 네이버뉴스/다음뉴스 심사 신청 가능 조건과 창구 확인. 신청 전까지 자동 송고 개발은 의미 없음.
16. 심사 신청용 기사 리스트 CSV/JSON 추출.

**[피드 품질 개선]**

17. RSS fullContent 설정 확인 및 필요 시 `true`로 변경 (네이버 RSS 제출 전).

**[운영 품질 개선]**

18. auto-press·auto-news 품질 모니터링 리포트 보강.
19. 관리자 Playwright 스모크 테스트 추가.
20. 기존 우선순위 문서와 runbook 갱신.

## 7. 주의사항

- 이미지 백필은 현재처럼 단일 concurrency와 cooldown을 유지한다.
- `ifducnfrjarmlpktrjkj.supabase.co` 접근 문제가 풀리기 전 대량 재시도하지 않는다.
- 복원 리허설은 로컬 파일 읽기 중심으로 수행하고 운영 DB에는 쓰지 않는다.
- 포털 제휴 신청은 기술 자동화만으로 완료되지 않으며, 대표자 수동 제출과 심사 승인 절차가 필요하다.
- 앞으로 Linux에서 개발하되 Windows 복귀 가능성을 유지해야 하므로 경로, shell, systemd 의존 기능은 대체 명령 또는 문서 안내를 함께 둔다.
- secret 값은 터미널 출력, process list, deploy log, 문서에 원문으로 남기지 않는다.
- 장애 대응 문서는 먼저 읽기 전용 확인 명령을 제시하고, 쓰기/배포/삭제 작업은 별도 단계로 분리한다.
