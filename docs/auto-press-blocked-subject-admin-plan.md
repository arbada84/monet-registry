# CulturePeople auto-press 편집정책 관리 화면 구축 기획서

- 문서 상태: 구현 진행 기록 포함
- 작성 기준일: 2026-07-27 KST
- 구현 갱신일: 2026-07-28 KST
- 대상: `/cam` 관리자와 auto-press 정책 백엔드
- 공개 사이트 변경: 없음
- 운영 DB: D1 migration/seed 적용 완료
- 운영 코드 배포: clean release gate 미충족으로 미실행

## 0. 문서 원칙

이 기능에서 사용하는 공식 용어는 **컬처피플 편집정책상 미게재 대상**이다. 공개 화면과 관리자 화면 모두 특정 단체에 법률상 확정된 낙인을 부여하는 표현을 사용하지 않는다. 관리자 메모도 일반 텍스트로만 저장하며 공개 API, 기사 HTML, RSS, sitemap, 검색엔진 메타데이터에 노출하지 않는다.

정책 관리와 기사 삭제는 별개 업무다.

1. 정책 편집은 앞으로 들어오는 auto-press 자료의 등록 여부를 결정한다.
2. dry-run 감사는 기존 기사와 큐를 읽기 전용으로 분류한다.
3. 큐 취소와 기존 기사 삭제는 별도 권한, 별도 보고서, 별도 확인 절차를 거친다.
4. 단순 언급, 비판, 재판, 피해자 지원, 공익 보도는 자동 삭제하지 않는다.
5. auto-news는 중지 상태를 유지하며 이 기능의 대상이 아니다.

### 0.1 2026-07-28 구현 현황

| 영역 | 상태 | 근거 |
|---|---|---|
| D1 additive migration | 운영 적용 완료 | `0005_auto_press_blocked_subject_policy.sql`, 16 statements |
| 정적 정책 seed | 운영 적용 완료 | v2, 34 subjects, 216 rules |
| seed checksum | 검증 완료 | `9c0d98dd4f19b2729410682231504dafcb126f92eeb7845aa096a2228a4941e6` |
| repository/API/auth | 로컬 구현·테스트 완료 | cookie actor/role, CSRF, idempotency, rate limit, generation CAS |
| 관리자 UI | 로컬 구현·smoke 완료 | 375/768/1024/1440, 가로 overflow 및 same-origin 5xx 없음 |
| draft/validate/match/publish/rollback | 로컬 구현·테스트 완료 | 운영 publish는 실행하지 않음 |
| Next.js/Worker 동적 loader | 로컬 구현·bundle 검증 완료 | feature flag는 양쪽 모두 off |
| runtime observation/sync status | 구현 완료, 실제 동적 적용 관측 대기 | 소비자의 다음 invocation 전에는 일치 판정 불가 |
| 최근 6개월 dry-run/report/export | 로컬 구현 완료 | D1 최대 500개 redacted 결과, CSV/JSON |
| 제한적 queue/retry 취소 | 로컬 구현 완료, 운영 실행 안 함 | report/checksum/current policy/최대 50건/확인문구/idempotency |
| 기존 기사 삭제 UI | 의도적으로 미활성 | 안전장치가 모두 검증되기 전 활성화 금지 |
| Vercel/Worker production 배포 | blocked | 현재 worktree 501개 변경으로 clean release manifest 생성 불가 |

검증 결과:

- `pnpm test:unit`: 95 files, 445 tests 통과.
- `pnpm ci:typecheck`: 통과.
- `pnpm ci:lint`: warning/error 없음.
- `pnpm check:auto-press-agent-loop`: 통과.
- 로컬 D1 migration: 16 commands 통과.
- Wrangler 4.54.0 Worker bundle dry-run: 통과. Wrangler 4.90.1은 현재 Node 20.20.2에서 Node 22 이상을 요구하므로 실행 불가.
- 운영 D1 `auto-press:policy:sync-check`: v2/34/216/checksum 일치.
- 현재 운영 Worker `/health`: 기존 배포라 `policy: null`; 새 loader가 아직 운영에 반영되지 않았음을 확인.
- 라이브 기사 삭제, 대량 DB 변경, queue 취소는 실행하지 않았다.

## 1. 경영 요약

현재 차단 백엔드는 작동하지만 정책은 `config/auto-press-blocked-subjects.json`에 정적으로 저장된다. Next.js cron과 재시도 코드, Cloudflare Worker가 같은 JSON을 빌드에 포함하므로 정책 변경에는 Vercel과 Worker 재배포가 필요하다. 관리자 화면, 동적 정책 API, 버전 승인, rollback, 역할별 권한은 아직 없다.

목표는 D1에 정책 초안과 불변 운영 버전을 저장하고 관리자가 다음 순서로 안전하게 운영하는 것이다.

`초안 편집 → 입력 검증 → 테스트 매칭 → 기존 데이터 dry-run → 변경 diff 확인 → 운영 반영 → Next.js/Worker 버전 확인 → 필요 시 rollback`

가장 중요한 아키텍처 결정은 다음과 같다.

- D1은 운영 정책의 원본이다.
- 운영 코드는 정규화 테이블을 여러 번 조회하지 않고, published version의 검증된 snapshot JSON을 한 번 읽는다.
- published version은 수정하지 않는 불변 데이터다.
- singleton 포인터를 조건부 갱신해 운영 버전을 원자적으로 전환한다.
- 정적 JSON 34개 정책은 초기 seed와 장애 fallback으로 유지한다.
- 빈 정책, 손상된 snapshot, 규칙 급감은 publish 단계에서 거부한다.
- 관리자 UI는 독립 경로 `/cam/auto-press/blocked-subjects`로 구성한다.
- 기자 `reporter` 역할은 접근할 수 없으며, 정책 반영과 삭제 권한도 분리한다.

## 2. 현재 구조 분석

### 2.1 확인된 구현

| 영역 | 현재 상태 | 근거 |
|---|---|---|
| 차단 정책 | 구현됨 | `config/auto-press-blocked-subjects.json`, version 2, 34개 subject |
| Next.js matcher | 구현됨 | `src/lib/auto-press-content-policy.ts` |
| Next.js 수집 전 차단 | 구현됨 | `src/app/api/cron/auto-press/route.ts` |
| 상세 원문 수집 후 차단 | 구현됨 | 같은 cron route |
| AI 재시도 차단 | 구현됨 | `src/lib/auto-press-retry-queue.ts` |
| Worker 큐 진입 후 차단 | 구현됨 | `cloudflare/auto-press-worker/src/index.js` |
| Worker 원문 수집 후 차단 | 구현됨 | Worker `processItem()` |
| Worker AI 편집 후 차단 | 구현됨 | Worker `editedSubject` 검사 |
| 차단 상태 | 구현됨 | `BLOCKED_SUBJECT`, `SKIPPED_BLOCKED_SUBJECT` |
| 기존 데이터 감사 | 구현됨 | `scripts/remove-blocked-subject-articles.mjs` |
| 감사 dry-run/apply 분리 | 구현됨 | 기본 dry-run, 보고서 ID와 확인문구를 요구하는 apply |
| 정책 단위 테스트 | 구현됨 | `tests/unit/auto-press-content-policy.test.ts` |
| 관리자 정책 화면 | 로컬 구현 완료, 운영 배포 대기 | `/cam/auto-press/blocked-subjects` |
| 동적 정책 저장소/API | 구현 완료, 운영 D1 seed 완료 | `/api/auto-press/blocked-subjects/**` |
| 정책 version publish/rollback | 구현 완료, 운영 실행 안 함 | immutable snapshot + pointer generation CAS |
| 역할별 정책 권한 | 구현 완료 | reporter 403, admin/superadmin capability 분리 |

### 2.2 정적 정책의 한계

Worker는 루트 JSON을 직접 import하고 Next.js matcher도 같은 JSON을 import한다. 이 방식은 목록 불일치는 막지만 모두 빌드 시점에 고정된다.

- 관리자가 브라우저에서 수정할 API가 없다.
- JSON을 수정해도 Vercel과 Worker를 각각 재배포하기 전에는 반영되지 않는다.
- 운영 버전, 초안, 변경자, 승인자, rollback 이력이 없다.
- 배포 중 한쪽만 갱신되면 Next.js와 Worker의 정책 버전이 달라질 수 있다.
- 정책 전체가 잘못 수정됐을 때 즉시 이전 버전으로 돌릴 데이터 계층 rollback이 없다.

### 2.3 현재 관리자 UI

`src/app/cam/auto-press/page.tsx`는 하나의 대형 client component이며 다음 8개 탭을 자체 상태로 관리한다.

- 설정
- 실행
- 실행 현황
- 기사별 처리
- AI 대기열
- 실패함
- 시스템 점검
- 이력

표, 상태 배지, 버튼이 대부분 inline style로 구현되어 있다. auto-press 전용 공통 컴포넌트는 현재 없다. 같은 파일에 정책 편집까지 추가하면 변경 충돌과 렌더링 부담이 커지므로 독립 하위 경로가 적합하다.

기존 `/cam` 화면은 조용하고 업무 중심인 흰색 기반 관리 화면이며, sidebar 폭 220px, 본문 `p-4/md:p-6`, 작은 상태 배지와 데이터 테이블을 사용한다. 새 화면도 이 밀도와 정보 구조를 유지한다. 별도의 hero, 마케팅 문구, 과장된 타이포그래피, 장식 애니메이션은 사용하지 않는다.

### 2.4 인증과 권한

현재 인증 토큰은 `name`과 `role`을 포함하고 role은 다음 세 값으로 운영된다.

- `superadmin`
- `admin`
- `reporter`

middleware는 reporter가 기사 관련 화면 외 `/cam` 경로에 접근하지 못하게 한다. 그러나 auto-press API 대부분은 `isAuthenticated()`로 로그인 여부만 확인하고 `superadmin`과 `admin` 권한을 구분하지 않는다. `isAuthenticated()`는 유효한 관리자 쿠키 외에 `CRON_SECRET` Bearer도 허용한다.

따라서 다음이 신규 구현 필요하다.

- 서버 API에서 관리자 쿠키 token payload의 role을 확인하는 공통 권한 함수. 정책 관리 API에서는 `CRON_SECRET` Bearer를 관리자 세션으로 인정하지 않는다.
- 조회, 편집, publish, rollback, 큐 취소, 기사 삭제 권한 분리
- 클라이언트에서 버튼을 숨기는 것과 별개로 서버에서 403 강제
- 변경자 이름과 역할을 요청 body가 아니라 검증된 token payload에서 기록

현재 client activity log는 localStorage 사용자명을 body로 보내므로 정책 감사의 신뢰 가능한 원장으로 사용하면 안 된다. 정책 감사 로그는 서버가 인증 토큰에서 actor를 추출해 D1에 직접 기록해야 한다.

### 2.5 D1과 Worker 접근

- Vercel/Next.js는 `src/lib/d1-http-client.ts`의 Cloudflare D1 HTTP API를 사용한다.
- Worker는 `env.DB.prepare()` D1 binding을 사용한다.
- 기존 migration은 `cloudflare/d1/migrations/0001`부터 `0004`까지 존재한다.
- 정책 전용 테이블은 아직 없다.
- D1 HTTP는 SQL 변수 수와 `LIKE` 패턴 복잡도 제한이 있으므로 감사 기능은 기존 청크 전략을 유지해야 한다. 이 전략은 `src/lib/d1-http-client.ts`가 아니라 `scripts/remove-blocked-subject-articles.mjs`에 이미 구현되어 있다(`maxVariables=24`, `sqliteLikeProbe(value, maxBytes=40)`). `d1-http-client.ts` 자체는 단순 fetch 래퍼이며 청크 로직을 포함하지 않는다.

## 3. 범위

### 3.1 포함

- 정책 목록 조회, 검색, 필터
- subject 추가, 수정, 활성/비활성
- exact term, domain, term group 편집
- 위험한 단일어 검증
- 테스트 입력 matcher
- draft 저장
- validation
- version publish와 rollback
- Next.js/Worker 동적 정책 읽기
- 버전 동기화 상태
- D1 기사, queue, retry queue dry-run
- 감사 결과 JSON/CSV
- 별도 권한을 통한 큐 취소 및 제한된 기존 기사 삭제
- 변경 및 실행 감사 로그

### 3.2 제외

- 공개 사이트 UI
- 공개 기사에 내부 차단 사유 표시
- auto-news 정책
- 네이버뉴스·다음뉴스 송고
- 외부 단체 정보를 자동 수집해 정책에 추가하는 크롤러
- 관리자 승인 없는 자동 정책 publish
- dry-run 없는 기존 기사 일괄 삭제
- 단순 언급 기사 자동 삭제
- Supabase가 paused 상태일 때 강제 복구 또는 대량 호출

## 4. 목표 아키텍처

### 4.1 데이터 흐름

```text
정적 JSON v2, 34개
       │
       ├─ seed dry-run/apply
       ▼
D1 draft subjects/rules ── validate ── snapshot/checksum 생성
       │                                  │
       │                                  ▼
       │                         immutable policy version
       │                                  │
       └──────── publish CAS ──────────────┤
                                          ▼
                               singleton published pointer
                                  │                │
                                  ▼                ▼
                           Next.js loader     Worker loader
                                  │                │
                                  └──── matcher ───┘

D1 실패/손상/빈 정책
       └─ 마지막 정상 snapshot → 없으면 정적 JSON fallback
```

### 4.2 권장 테이블

신규 migration 후보: `cloudflare/d1/migrations/0005_auto_press_blocked_subject_policy.sql`

#### `auto_press_policy_state`

운영 포인터를 위한 singleton 테이블이다.

| 필드 | 형식 | 설명 |
|---|---|---|
| id | TEXT PK | 항상 `blocked-subjects` |
| published_version | INTEGER | 현재 운영 version |
| previous_version | INTEGER | 즉시 rollback 후보 |
| generation | INTEGER | optimistic concurrency |
| updated_at | TEXT | 마지막 전환 시각 |
| updated_by | TEXT | 서버가 기록한 actor |

#### `auto_press_policy_versions`

published version은 수정하지 않는다.

| 필드 | 형식 | 설명 |
|---|---|---|
| version | INTEGER PK | 단조 증가 |
| state | TEXT | `draft`, `validated`, `published`, `rolled_back`, `superseded` |
| base_version | INTEGER | 초안을 만든 기준 운영 버전 |
| snapshot_json | TEXT | 런타임이 한 번에 읽는 검증 완료 정책 |
| checksum | TEXT | SHA-256 |
| subject_count | INTEGER | subject 수 |
| rule_count | INTEGER | term/domain/group 수 |
| validation_json | TEXT | 오류, 경고, dry-run 요약 |
| change_summary | TEXT | 운영 반영 사유 |
| created_by | TEXT | actor |
| validated_by | TEXT | actor |
| published_by | TEXT | actor |
| created_at | TEXT | 생성 |
| validated_at | TEXT | 검증 |
| published_at | TEXT | 반영 |

#### `auto_press_blocked_subjects`

관리자 편집용 정규화 데이터다.

| 필드 | 형식 | 설명 |
|---|---|---|
| version | INTEGER | draft version |
| subject_id | TEXT | 안정적인 slug |
| label | TEXT | 내부 표시명 |
| status | TEXT | `active`, `inactive` |
| reason | TEXT | 내부 정책 사유 |
| notes | TEXT | 일반 텍스트 메모 |
| sort_order | INTEGER | 목록 순서 |
| created_by/updated_by | TEXT | actor |
| created_at/updated_at | TEXT | 시각 |

PK는 `(version, subject_id)`를 사용한다.

#### `auto_press_blocked_subject_rules`

| 필드 | 형식 | 설명 |
|---|---|---|
| id | TEXT PK | UUID |
| version | INTEGER | draft version |
| subject_id | TEXT | 부모 subject |
| rule_type | TEXT | `term`, `domain`, `term_group` |
| value_json | TEXT | 문자열 또는 AND 배열 |
| normalized_value | TEXT | 중복 및 위험 검사 |
| risk_level | TEXT | `normal`, `warning`, `blocked` |
| enabled | INTEGER | 0/1 |
| sort_order | INTEGER | 순서 |
| created_at/updated_at | TEXT | 시각 |

#### `auto_press_policy_audit_logs`

| 필드 | 형식 | 설명 |
|---|---|---|
| id | TEXT PK | UUID |
| event | TEXT | draft/create/update/validate/publish/rollback/dry_run/delete |
| policy_version | INTEGER | 대상 버전 |
| subject_id | TEXT nullable | 대상 subject |
| actor_name/actor_role | TEXT | token 기반 |
| request_id/idempotency_key | TEXT | 중복 실행 방지 |
| before_checksum/after_checksum | TEXT | 변경 추적 |
| summary_json | TEXT | 값이 redaction된 요약 |
| ip_hash | TEXT | 원문 IP 대신 제한된 hash 권장 |
| created_at | TEXT | 시각 |

본문 전체, secret, token, API key는 저장하지 않는다.

#### `auto_press_policy_runtime_observations`

관리자 화면이 D1의 published pointer와 각 소비자가 실제 판정에 사용한 version을 구분할 수 있도록 invocation 단위의 저부하 관측값을 저장한다.

| 필드 | 형식 | 설명 |
|---|---|---|
| consumer | TEXT PK | `next-main`, `next-retry`, `worker-scheduled`, `worker-queue` |
| policy_version | INTEGER | 실제 invocation에서 사용한 version |
| checksum | TEXT | 실제 사용 snapshot checksum |
| source | TEXT | `d1`, `last-known-good`, `static-fallback` |
| invocation_id | TEXT | 원문 secret이 없는 실행 식별자 |
| applied_at | TEXT | 실제 판정에 사용한 시각 |
| observed_at | TEXT | 상태 row를 갱신한 시각 |
| error_code | TEXT nullable | redaction된 fallback/검증 오류 |

각 invocation에서 최초 정책 로드 뒤 한 번만 upsert한다. 기사별로 쓰지 않으며, 관측 기록 실패가 기사 처리 자체를 중단시키지 않게 한다. 상세 이력은 기존 Worker event 또는 redaction된 audit event로 제한적으로 남기고 이 테이블은 소비자별 최신 상태만 유지한다.

### 4.3 snapshot 형식

런타임 snapshot은 현재 JSON과 호환되는 최소 형식을 유지한다.

```json
{
  "version": 3,
  "policy": "CulturePeople editorial non-publication policy for promotional press releases",
  "generatedAt": "ISO-8601",
  "checksum": "sha256",
  "subjects": [
    {
      "id": "stable-id",
      "label": "내부 표시명",
      "terms": ["정확한 차단어"],
      "termGroups": [["단어 A", "단어 B"]],
      "domains": ["example.org"]
    }
  ]
}
```

published snapshot에는 notes, actor, reason 등 관리자 전용 필드를 포함하지 않는다.

### 4.4 publish 원자성

1. draft의 `base_version`이 현재 published version과 같은지 확인한다.
2. 서버에서 validation과 checksum을 다시 계산한다.
3. snapshot이 DB에 저장된 값과 같은지 확인한다.
4. version을 immutable `published` 상태로 만든다.
5. `auto_press_policy_state`를 `WHERE generation = ? AND published_version = ?` 조건으로 갱신한다.
6. 갱신 row가 1개가 아니면 409 conflict로 실패한다.
7. 실패 시 기존 운영 버전은 바뀌지 않는다.

여러 SQL 작업을 원자적으로 보장하기 어려운 D1 HTTP 경로에서는 Worker 내부 관리 endpoint를 새로 만들기보다, migration으로 준비된 단일 조건부 pointer update를 마지막 commit point로 사용한다. publish 이전에 완성된 version row는 포인터가 가리키지 않으므로 운영에 영향을 주지 않는다.

### 4.5 런타임 로더

신규 후보:

- `src/lib/auto-press-policy-schema.ts`
- `src/lib/auto-press-policy-repository.ts`
- `src/lib/auto-press-policy-loader.ts`
- `cloudflare/auto-press-worker/src/blocked-subject-policy.js`

원칙:

- matcher는 정책 객체를 명시적으로 받는 pure function과 호환 wrapper로 분리한다.
- Next.js cron/retry는 실행 시작 시 D1 published pointer와 snapshot을 직접 한 번 읽으며 저주기 경로에 module cache를 적용하지 않는다.
- Worker scheduled invocation도 시작 시 D1을 직접 읽는다.
- Worker queue batch는 메시지가 연속 유입될 때 D1 read가 과도해지지 않도록 최대 60초 module cache를 허용한다.
- 실행 중 version을 바꾸지 않아 한 run 안에서 판정이 일관되게 한다.
- 각 소비자는 실제 판정에 사용한 version/checksum/source를 `auto_press_policy_runtime_observations`에 invocation당 한 번 기록한다.
- `/health`와 관리자 동기화 점검은 D1 current pointer를 직접 읽는다.
- D1 read 실패 시 마지막 검증 snapshot을 사용하고, 그것도 없으면 정적 JSON을 사용한다.
- fallback source와 version을 이벤트 로그에 기록한다.
- 정상 정책이 0 subjects이면 fallback으로 조용히 전환하지 말고 health를 error로 표시하고 publish를 막는다.

#### 4.5.1 실제 반영 시간

"60초 module cache"는 Worker Queue 메시지가 연속 유입될 때만 적용하는 D1 조회 완화 장치다. publish 후 시스템 전체가 새 version을 적용하는 시간을 보장하지 않는다. matcher가 새 version을 실제로 적용하는 시점은 저주기 소비자의 다음 invocation 또는 Worker Queue cache가 만료된 뒤 최초 batch이며, 현재 확인된 실제 주기는 다음과 같다.

| 소비자 | 설정된 트리거 주기 | KST 해석 | 근거 |
|---|---|---|---|
| Next.js `/api/cron/auto-press` | 1일 1회, `0 9 * * *` UTC | 매일 18시대 KST. Hobby는 18:00~18:59 사이 실행 가능 | `vercel.json` crons |
| Next.js `/api/cron/retry-ai-edit` | 1시간 1회, 매시 45분 UTC | KST도 매시 45분 | `.github/workflows/retry-ai-edit.yml` |
| Worker scheduled invocation | `*/10 * * * *`와 `0 0 * * *` UTC | 10분 간격, 별도 09:00 KST 일일 보고 | `cloudflare/auto-press-worker/wrangler.toml` crons |
| Worker queue consumer | 큐 메시지가 도착할 때 | 고정 시각 없음 | `cloudflare/auto-press-worker/wrangler.toml` queues |

`crawl-newswire.yml`의 매시 15분 크롤러는 CockroachDB에 원본을 적재한다. 이 workflow 자체가 Worker Queue 메시지를 직접 발행하는 것은 아니므로 queue 정책 반영 주기의 근거로 사용하지 않는다.

시간 해석 근거:

- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs): timezone은 항상 UTC다.
- [Vercel Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs): Hobby는 지정된 시간대 한 시간 안의 임의 시점에 실행될 수 있고 실패 invocation을 자동 재시도하지 않는다.
- [GitHub Actions workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax): timezone 미지정 schedule은 UTC다.
- [GitHub schedule event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule): 고부하 때 지연되거나 일부 queued job이 누락될 수 있다.
- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/): Cron Trigger는 UTC로 실행된다.

publish 직후 invocation이 없다면 정상적인 scheduler 동작을 가정한 **명목상 예상 상한**은 Next.js 메인 크론 약 24시간, retry 약 1시간, Worker scheduled 약 10분이다. 그러나 예약 실행은 지연되거나 실패할 수 있으므로 이를 보장된 SLA나 절대 최대시간으로 표현하지 않는다. 동기화 경고는 `예정 invocation 시각 + 운영 허용 지연`이 지난 뒤에도 runtime 적용 version이 갱신되지 않을 때 발생시킨다. 초기 허용 지연 권장은 Vercel Hobby 75분, Vercel 유료 plan 5분, GitHub 15분, Worker scheduled 5분이다. 실제 운영 plan과 로그를 확인해 설정값으로 조정한다.

이 표는 이후 12.1/12.2/18/19/21.3의 반영 시간 서술을 해석하는 기준이며, 완료기준에서 "60초 이내 시스템 전체 반영"을 요구하지 않는다. `sync-status`가 D1 current pointer를 직접 읽어 즉시 보여주는 것은 "published version이 무엇인지"이다. "matcher가 그 version을 실제로 썼는지"는 runtime observation의 `applied_at`, version, checksum으로만 판정한다.

긴급하게 즉시 반영이 필요한 운영 상황(예: 급한 신규 차단)이 실제로 발생하는지, 발생한다면 별도 인증된 즉시 검증 invocation을 추가할지는 20장 "대표자 운영 결정"에서 확정한다. 1분 cron을 상시 추가하는 방식은 불필요한 D1 read와 운영 복잡도를 만들므로 초기 권장안에서 제외한다.

## 5. 관리자 정보 구조

### 5.1 경로 결정

권장 경로는 `/cam/auto-press/blocked-subjects`다.

이유:

- 현재 auto-press page가 이미 크고 탭이 8개다.
- 정책 편집은 deep link, reload, browser back 동작이 필요한 독립 업무다.
- 권한과 loading/error boundary를 별도로 둘 수 있다.
- 추후 dry-run 상세 결과 `/runs/[reportId]`로 확장하기 쉽다.

기존 `/cam/auto-press` 상단에 `편집정책 관리` 링크 버튼을 추가하고 `/cam` sidebar에는 별도 메뉴를 늘리지 않는다. reporter에게는 링크가 보이지 않아야 한다.

### 5.2 화면 탭

독립 페이지 내부 탭은 URL query 또는 하위 경로로 유지한다.

- `정책 목록`
- `변경 초안`
- `테스트 매칭`
- `기존 자료 감사`
- `변경 이력`

선택 상태는 `?view=subjects`처럼 URL에 보존해 새로고침과 뒤로가기를 지원한다.

### 5.3 상단 상태 band

페이지 섹션은 floating card가 아니라 full-width status band와 표 형태로 구성한다.

- 운영 version
- draft version
- 마지막 publish 시각
- 활성 subject 수
- 활성 rule 수
- 최근 24시간 `BLOCKED_SUBJECT`
- Next.js 확인 version
- Worker 확인 version
- fallback 사용 여부

상태는 색상만으로 표현하지 않고 `정상`, `불일치`, `fallback`, `확인 실패` 텍스트와 아이콘을 같이 쓴다.

## 6. UI·UX 설계

### 6.1 시각 방향

UI/UX 검색 결과의 landing page형 hero와 과장된 타이포그래피는 이 운영 도구에 맞지 않아 채택하지 않는다. 기존 `/cam`의 조용한 업무 화면을 기준으로 다음만 적용한다.

- 흰색/중성 회색 surface
- 기존 컬처피플 보라색은 선택 상태와 focus에 제한
- 빨간색은 삭제와 publish 위험 경고에만 사용
- 초록/주황/빨강 상태색에는 반드시 텍스트와 아이콘 병기
- 제목 20~24px, section 16px, table 12~14px
- 숫자 열은 tabular figures
- radius 6~8px
- 애니메이션은 dialog와 toast의 150~200ms 상태 전환 정도
- `prefers-reduced-motion` 존중
- lucide-react 아이콘 사용

기존 sidebar의 emoji는 이번 기능 범위에서 교체하지 않는다. 신규 버튼에서는 `Search`, `Plus`, `Save`, `FlaskConical`, `Upload`, `RotateCcw`, `Download`, `Trash2`, `ShieldAlert` 등 lucide 아이콘을 사용한다.

### 6.2 정책 목록

필터:

- 텍스트 검색: label, id, term, domain
- 상태: 활성/비활성
- 규칙 종류: term/domain/term-group
- 위험 수준: normal/warning/blocked
- 최근 24시간 매칭 있음/없음

표 컬럼:

- 선택
- 표시명
- subject ID
- 상태
- 대표 term
- domain 수
- term group 수
- 최근 24시간 차단
- 마지막 변경자
- 마지막 변경 시각
- 작업

50건 이상이면 서버 pagination을 사용한다. 현재는 34건이지만 확장을 고려해 `page`, `pageSize`, `cursor` 중 하나를 API에 명시한다. 모바일에서는 table을 억지로 가로 스크롤시키지 않고 우선 필드를 행 요약으로 바꾸며 상세 편집은 full-screen sheet로 연다.

### 6.3 편집 패널

필드:

- 내부 표시명
- 안정적인 subject ID
- 활성화 toggle
- 내부 정책 사유
- 내부 메모
- exact terms
- domains
- AND term groups

terms와 domains는 삭제 가능한 token input을 사용한다. familiar delete icon에 tooltip과 accessible label을 제공한다. term group은 다음처럼 표현한다.

```text
다음 조건을 모두 포함
[정명석] AND [섭리]
```

OR는 여러 group 행으로 표현한다. drag 전용 정렬은 사용하지 않고 위/아래 버튼을 제공해 keyboard 대안을 보장한다.

### 6.4 위험 규칙 검증

최소 초기 위험어:

- 통일
- 섭리
- 다락방
- 하나님의 교회
- 명인교회
- 부산제일교회

검증 정책:

- 지나치게 짧거나 일반적인 단일 term은 저장 자체를 차단한다.
- 일반어는 term group 또는 공식 domain과 함께만 허용한다.
- IDN domain은 punycode로 정규화하고 protocol/path/query 입력을 거부한다.
- domain wildcard 입력은 금지하고 hostname 및 subdomain 매칭은 코드가 담당한다.
- 중복 normalized term/domain/group은 저장하지 않는다.
- NFKC, lowercase, whitespace 및 구두점 정규화 결과를 미리 보여준다.
- 34개 seed 규칙이 초안에서 대량 제거되면 warning이 아니라 publish block으로 처리한다.

### 6.5 상태

반드시 설계할 상태:

- 초기 skeleton
- 데이터 없음
- 검색 결과 없음
- API 401: 로그인 이동
- API 403: 권한 부족
- API 409: 다른 관리자가 먼저 변경
- D1 unavailable: 마지막 snapshot read-only 표시
- Worker version 확인 실패
- validation 오류와 warning
- 저장 중
- 저장 성공 toast
- publish 중
- publish 성공과 version
- rollback 결과
- 부분 감사 실패

오류는 `role="alert"` 또는 `aria-live="polite"`로 전달하고 입력 오류는 해당 필드 바로 아래 표시한다.

## 7. 테스트 매칭 기능

### 7.1 입력

- 제목
- 요약
- 본문 텍스트
- 본문 HTML
- 태그
- 출처명
- 출처 URL
- keywords
- 테스트할 정책: 운영 version 또는 현재 draft

### 7.2 출력

- `blocked`
- subject ID와 label
- `matchType`: `term`, `domain`, `term-group`
- 실제 rule
- 매칭된 입력 필드
- 정규화된 비교값
- 정책 version/checksum
- Next.js matcher 결과
- Worker 호환 matcher 결과
- 차단되지 않은 이유
- 일반어 위험 경고

현재 matcher는 어느 필드에서 걸렸는지 반환하지 않으므로 신규 구현 필요다. matcher의 반환값을 다음처럼 확장한다.

```ts
{
  blocked: true,
  subjectId: "example",
  subjectLabel: "내부 표시명",
  matchType: "term",
  rule: "정확한 규칙",
  matchedField: "bodyText",
  policyVersion: 3
}
```

테스트 입력은 기본적으로 저장하지 않는다. 사용자가 `감사 증빙에 결과만 저장`을 선택해도 원문은 저장하지 않고 hash, 길이, match result만 기록한다.

## 8. dry-run 감사

### 8.1 대상

- D1 `articles`
- D1 `auto_press_items`
- D1 `auto_press_retry_queue`
- 선택적 Supabase

### 8.2 분류

| 분류 | 의미 | 기본 동작 |
|---|---|---|
| `promotional_block_candidate` | 공식 홍보 자료로 보이는 기존 기사 | 검토 대상 |
| `official_domain_match` | 정책 domain과 출처 host 일치 | 높은 우선순위 검토 |
| `queue_block_candidate` | 아직 게시 전인 queue/retry | 취소 후보 |
| `mention_only_review` | 본문 단순 언급 | 자동 삭제 제외 |
| `critical_or_public_interest` | 비판, 재판, 피해자 지원, 공익 문맥 | 자동 삭제 제외 |
| `false_positive_risk` | 일반어 또는 모호한 규칙 | 정책 수정 후보 |

`critical_or_public_interest` 분류는 완전 자동 판정으로 확정하지 않는다. 제목, 출처, 매칭 위치, 문맥 일부를 이용한 보수적 heuristic과 관리자 검토를 결합한다.

### 8.3 부하 제한

- 기본 기간 최근 6개월, page size 50
- `전체 기간`은 별도 경고 후 읽기 전용 background job
- D1 SQL bind 24개 이하 청크
- 긴 `LIKE` probe는 UTF-8 40 bytes 이하 후보 검색 후 서버에서 full matcher
- 본문 전체를 브라우저로 보내지 않고 match 주변 160자 이하 snippet
- 같은 정책 version/report 조건의 중복 실행 debounce
- 동시 감사 1개
- 20초 server timeout 이후 continuation cursor
- Supabase unavailable이면 D1 결과를 유지하고 `blocked`로 표시

### 8.4 보고서

신규 D1 report table 또는 R2/서버 증빙 저장소가 필요하다. Vercel local filesystem은 영속 저장소로 사용하지 않는다.

보고서 메타:

- report ID
- policy version/checksum
- 검색 범위
- 분류별 수
- candidate IDs
- 생성자
- 생성 시각
- 만료 시각
- 보고서 checksum
- 원문 전체 미포함

JSON/CSV 다운로드는 인증 API가 서버에서 생성하며 비공개 cache header를 사용한다.

## 9. 기존 기사 및 큐 처리

### 9.1 작업 분리

| 작업 | 정책 변경과 동시 실행 | 권한 |
|---|---:|---|
| subject/규칙 편집 | 가능, draft만 | policy editor |
| publish | 가능 | superadmin 또는 별도 publisher |
| 기존 기사 dry-run | 가능 | admin 이상 |
| queue/retry 취소 | 금지, 별도 실행 | admin 이상 |
| 기존 기사 삭제 | 금지, 별도 실행 | superadmin |
| rollback | 별도 실행 | superadmin |

### 9.2 삭제 gate

- published policy version
- 만료되지 않은 dry-run report ID
- report checksum
- 선택된 기사 ID/no
- `--max-articles`와 동일한 UI 최대 건수
- 확인 문구
- superadmin 재인증 또는 최근 인증 시각
- idempotency key
- 현재 기사 상태 재확인

삭제는 기존 `/api/db/articles?id=<id>`의 소프트 삭제 경로를 재사용해 실제 기사 `no` 기준 URL로 `URL_DELETED`를 제출한다. 처리 후 article 404, sitemap/news-sitemap 미포함을 확인한다.

부분 실패 시 성공한 항목을 자동 복원한다고 약속하지 않는다. 소프트 삭제 결과와 실패 목록을 보고서에 기록하고 실패 항목만 재시도한다. 이미 외부에 제출된 `URL_DELETED`는 단순 rollback으로 취소되지 않는다는 점을 UI에 표시한다.

## 10. API 설계

모든 API는 신규 구현 필요다. 현재 middleware 보호 prefix 목록(`/api/db`, `/api/netpro`, `/api/ai`, `/api/upload`, `/api/newsletter`, `/api/cam`, `/api/seo`, `/api/admin`, `/api/mail`, `/api/telegram`)에는 애초에 `/api/auto-press`가 없다. 즉 middleware 레벨의 포괄 보호는 처음부터 존재하지 않으며 각 auto-press route가 개별적으로 `isAuthenticated()`를 호출해 자체 방어한다.

신규 정책 API도 각 route에서 인증과 역할을 직접 검증하지만 기존 `isAuthenticated()`를 그대로 사용해서는 안 된다. 이 함수는 cron 호출을 위해 `CRON_SECRET` Bearer도 성공으로 반환하고 actor/role을 제공하지 않기 때문이다. 정책 조회·편집·검증·publish·rollback API에는 `cp-admin-auth` 쿠키만 검증하고 `TokenPayload`의 role을 강제하는 별도 helper를 사용한다. 자동화 전용 내부 endpoint가 나중에 필요하면 관리자 API와 경로·credential·capability를 분리한다.

### 10.1 공통 규칙

- 쿠키 token payload를 서버에서 확인
- `CRON_SECRET`과 `AUTO_PRESS_WORKER_SECRET`은 관리자 정책 API 인증에 사용하지 않음
- Bearer `CRON_SECRET`은 정책 UI mutation에서 허용하지 않음
- GET 외 요청은 Origin/Host same-origin 검증 또는 CSRF token 필요
- Zod schema 사용
- `Cache-Control: private, no-store`
- mutation에 `Idempotency-Key` 필수
- actor는 request body를 신뢰하지 않음
- 409 conflict에 current version/generation 반환
- 오류 응답에 secret, raw SQL, token을 포함하지 않음
- publish/rollback/delete rate limit 적용

### 10.2 endpoint

| API | 메서드 | 권한 | 입력 | 반환 | 주요 오류 |
|---|---|---|---|---|---|
| `/api/auto-press/blocked-subjects` | GET | admin/superadmin | view, q, status, cursor | 목록, version, counts | 401/403/503 |
| 같은 경로 | POST | admin/superadmin | baseVersion, subject draft | subject, generation | 400/409/422 |
| `/api/auto-press/blocked-subjects/[id]` | PATCH | admin/superadmin | version, patch, generation | updated subject | 404/409/422 |
| 같은 경로 | DELETE | admin/superadmin | draft version | draft에서 제거 | 404/409 |
| `/validate` | POST | admin/superadmin | draftVersion | errors, warnings, counts, checksum | 409/422 |
| `/match` | POST | admin/superadmin | policy target, test input | match details | 400/413/422 |
| `/dry-run` | POST | admin/superadmin | version, range, stores | report/job | 409/423/429 |
| `/dry-run/[reportId]` | GET | admin/superadmin | cursor, classification | paged results | 404/410 |
| `/publish` | POST | superadmin 권장 | version, baseVersion, generation, summary | published version | 409/422/429 |
| `/rollback` | POST | superadmin | targetVersion, generation, reason | new pointer state | 409/422/429 |
| `/sync-status` | GET | admin/superadmin | remote=0/1 | D1/Next/Worker versions | 503 |
| `/audit-logs` | GET | admin/superadmin | event, actor, cursor | redacted logs | 400 |
| `/queue-actions` | POST | admin/superadmin | report, selected IDs, action | per-item result | 409/422 |
| `/article-actions` | POST | superadmin | report, selected IDs/no, confirm | per-item result | 409/422/429 |

### 10.3 payload 제한

- label 100자
- subject ID 80자, `[a-z0-9-]+`
- term 120자
- domain 253자
- term group 2~5 terms
- subject당 term 100개
- subject당 domain 50개
- snapshot 최대 크기 별도 제한, 초기 512KB 권장
- 테스트 본문 최대 50KB
- notes 2,000자
- publish summary 500자

## 11. 권한 모델

현재 계정 role을 유지하면서 capability를 서버에서 매핑한다.

| capability | reporter | admin | superadmin |
|---|---:|---:|---:|
| 정책 조회 | 아니오 | 예 | 예 |
| 테스트 매칭 | 아니오 | 예 | 예 |
| draft 편집 | 아니오 | 예 | 예 |
| validation/dry-run | 아니오 | 예 | 예 |
| publish | 아니오 | 초기에는 아니오 | 예 |
| rollback | 아니오 | 아니오 | 예 |
| queue 취소 | 아니오 | 예 | 예 |
| 기사 삭제 | 아니오 | 아니오 | 예 |
| 감사 로그 | 아니오 | 예 | 예 |

향후 별도 `policy_editor`, `policy_publisher` capability 테이블로 확장할 수 있지만 1차 구현에서 계정 role 스키마까지 동시에 바꾸지 않는다.

신규 공통 함수 후보:

- `requireAdminSession(request)`
- `requireAdminCapability(request, capability)`
- `assertSameOrigin(request)`
- `getRequestActor(request)`

## 12. 동기화와 장애 대응

### 12.1 정상 전파

1. publish 성공
2. D1 current pointer version 증가
3. `sync-status`는 즉시 새 published version을 표시한다(D1 direct read이므로 invocation을 기다리지 않는다).
4. Next.js matcher는 정상 scheduler 동작 기준 다음 `/api/cron/auto-press`(명목상 약 24시간 이내) 또는 `/api/cron/retry-ai-edit`(명목상 약 1시간 이내) invocation에서 D1 snapshot을 직접 읽는다.
5. Worker scheduled matcher는 정상 동작 기준 다음 10분 invocation에서 D1 snapshot을 직접 읽는다. Worker Queue는 cache 만료 전 batch에서 이전 version을 사용할 수 있으므로 publish 후 최대 60초 cache가 지난 뒤 도착한 최초 batch에서 새 snapshot을 읽는다.
6. 각 소비자는 실제 사용한 version/checksum/source를 runtime observation에 기록한다.
7. 관리자 sync-status에서 "published version"(D1, 즉시)과 "각 runtime이 마지막으로 실제 적용한 version"(runtime observation)을 구분해 표시한다.

이 전파 시간은 4.5.1의 실제 소비자 주기에 따른 것이며, 즉시 반영이 아니다. `즉시 반영` 버튼이 Worker token을 브라우저에 전달해서는 안 된다. 필요하면 서버가 인증된 내부 ping을 보내되, 새 version을 강제로 주입하지 않고 Worker가 D1에서 읽게 한다.

### 12.2 장애별 동작

| 장애 | 동작 | 관리자 표시 |
|---|---|---|
| D1 read 실패 | last-known-good → static fallback | fallback warning |
| snapshot JSON 손상 | checksum 불일치로 거부 | error, 이전 정책 유지 |
| current pointer 없음 | static fallback | P0 error |
| subject 0개 | publish 거부 | validation error |
| Next/Worker version 불일치 | 예정 invocation과 허용 지연이 지난 뒤 runtime observation이 이전 version이면 warning | published/applied version과 마지막 applied 시각 병기 |
| runtime observation 없음·stale | invocation 자체 실패 또는 관측 기록 실패를 분리 진단 | 마지막 성공 시각과 scheduler 상태 확인 |
| Worker Queue cache TTL 초과 불일치 | 새 메시지가 있었는데도 60초 넘게 이전 version이면 health error | 운영 점검 필요 |
| 두 관리자 동시 편집 | generation 409 | diff 후 새 draft |
| 과도한 차단 | 이전 version pointer rollback | rollback 기록 |
| Supabase blocked | D1 감사만 완료 | partial/blocked |

### 12.3 rollback

rollback은 이전 row를 수정하지 않고 published pointer를 검증된 과거 version으로 전환한다. rollback 자체도 audit event와 새 generation을 만든다. 정적 fallback으로 강제 전환하는 비상 switch는 server env 또는 D1 state flag로 검토하되 브라우저에 secret을 노출하지 않는다.

## 13. 화면 와이어프레임

### 13.1 목록

```text
┌ 편집정책 관리 ────────────────────────────────────────────────────────┐
│ 운영 v3  정상 │ 초안 v4  변경 7건 │ 34 대상 │ 216 규칙 │ 24h 차단 3 │
│ Next v3 정상  Worker v3 정상  fallback 미사용                 [새 대상]│
├─────────────────────────────────────────────────────────────────────┤
│ [검색________________] [활성▼] [규칙 종류▼] [위험▼] [최근 매칭▼]     │
├──┬────────────┬─────────┬────┬──────┬─────┬──────────┬─────────────┤
│□ │표시명       │상태      │term│domain│group│24h 차단  │변경/작업     │
├──┼────────────┼─────────┼────┼──────┼─────┼──────────┼─────────────┤
│□ │...          │활성      │  6 │   2  │  1  │3         │박영래 [편집] │
└──┴────────────┴─────────┴────┴──────┴─────┴──────────┴─────────────┘
```

### 13.2 상세 편집 sheet

```text
┌ 대상 편집 ───────────────────────────────────────────── [닫기] ┐
│ 표시명 [____________________________________________]           │
│ ID     [stable-subject-id___________________________] 읽기전용  │
│ 상태   [활성 ●]                                                │
│ exact terms                                                    │
│ [정확한 명칭 ×] [영문 명칭 ×]                         [+ 추가] │
│ domains                                                        │
│ [example.org ×]                                       [+ 추가] │
│ 복합 조건                                                      │
│ [단어 A ×] AND [단어 B ×]                              [삭제]  │
│                                                        [+ 그룹] │
│ 내부 사유 [____________________________________________]       │
│ 메모     [____________________________________________]       │
│ 오류/경고 영역                                                 │
│                                      [취소] [초안 저장]        │
└────────────────────────────────────────────────────────────────┘
```

### 13.3 테스트 매칭

```text
┌ 테스트 입력 ─────────────────┬ 판정 결과 ──────────────────────┐
│ 정책 [운영 v3 ▼]             │ 차단됨                           │
│ 제목 [____________________]   │ subject: example                 │
│ 출처 URL [________________]   │ field: sourceUrl                  │
│ 태그 [____________________]   │ type: domain                      │
│ 본문 [____________________]   │ rule: example.org                 │
│                              │ Next/Worker 호환: 일치             │
│ [입력 초기화] [판정 실행]     │ 저장되지 않음                     │
└──────────────────────────────┴─────────────────────────────────┘
```

### 13.4 publish

```text
┌ 운영 반영 확인 ────────────────────────────────────────────────┐
│ 운영 v3 → 초안 v4                                               │
│ + subject 2  - subject 0  + rules 8  - rules 1                  │
│ 위험 경고 1: 일반어 복합 조건 확인                              │
│ dry-run: 홍보 후보 0 / 언급 검토 4 / queue 0                    │
│ 변경 사유 [________________________________________________]   │
│ 확인 문구 [PUBLISH POLICY V4_______________________________]   │
│                                          [취소] [운영 반영]     │
└────────────────────────────────────────────────────────────────┘
```

### 13.5 감사 결과

```text
┌ 기존 자료 감사 report-... ─────────────────────────────────────┐
│ [홍보 후보 0] [공식 domain 0] [queue 0] [언급 4] [공익 2]      │
│ [분류▼] [subject▼] [기간▼]          [JSON] [CSV]                │
├──┬────┬──────────────┬─────────┬──────────┬───────────────┤
│□ │no  │제목           │분류      │매칭 규칙  │근거/작업       │
├──┼────┼──────────────┼─────────┼──────────┼───────────────┤
│  │... │...            │언급 검토 │term       │문맥 보기       │
└──┴────┴──────────────┴─────────┴──────────┴───────────────┘
```

### 13.6 rollback

```text
운영 v4
├─ v3  2026-07-27  checksum ...  [diff] [rollback 후보]
├─ v2  seed                         [diff]
└─ v1  archived                     [diff]

rollback 선택 → 영향 확인 → 사유 입력 → 확인문구 → pointer 전환
```

## 14. 단계별 백로그

아래 모든 명령에서 `신규 구현 필요` 표시는 현재 package.json에 없는 명령이다.

### P0-001 정책 스키마와 seed

- 목적: 정적 34개 정책을 손실 없이 D1 draft/version 구조로 옮긴다.
- 현재 상태: 정책 JSON 존재, D1 정책 테이블 없음.
- 개발 범위: migration, schema type, seed script, checksum, dry-run.
- 제외 범위: UI, publish, runtime dynamic read.
- 예상 파일: `cloudflare/d1/migrations/0005_auto_press_blocked_subject_policy.sql` 신규, `scripts/seed-auto-press-blocked-subjects.mjs` 신규, `src/lib/auto-press-policy-schema.ts` 신규.
- DB 변경: 6개 정책·관측 테이블과 인덱스.
- API: 없음.
- 화면: 없음.
- 권한: CLI apply에 Cloudflare credential 필요.
- dry-run: `pnpm auto-press:policy:seed -- --dry-run` 신규 구현 필요.
- apply: `pnpm cloudflare:d1:apply-sql -- --file cloudflare/d1/migrations/0005_auto_press_blocked_subject_policy.sql`, 이후 `pnpm auto-press:policy:seed -- --apply` 신규 구현 필요.
- 검증: `pnpm auto-press:policy:sync-check -- --expect-subjects 34` 신규 구현 필요.
- 완료 기준: 정적 JSON과 D1 seed checksum 일치, 34 subjects, 운영 pointer는 아직 정적 fallback.
- blocked: D1 credential 없음, 기존 migration 불일치, seed count/checksum 불일치.
- 위험: 중복 seed와 partial insert.
- rollback: 포인터를 만들지 않았으므로 운영 영향 없음. 신규 테이블은 즉시 DROP하지 않고 미사용 상태 유지.

### P0-002 read-only repository/API

- 목적: 관리자에서 운영/draft 정책을 안전하게 조회한다.
- 현재 상태: 신규 구현 필요.
- 개발 범위: repository, GET API, pagination, counts, redacted audit.
- 제외 범위: mutation.
- 예상 파일: `src/lib/auto-press-policy-repository.ts`, `src/app/api/auto-press/blocked-subjects/route.ts`.
- DB 변경: 없음.
- API: GET list/current/version.
- 화면: skeleton과 목록의 데이터 기반.
- 권한: admin/superadmin.
- dry-run/apply: 없음, 읽기 전용.
- 테스트: repository/API auth, pagination, D1 unavailable.
- 완료 기준: 34 seed 조회, reporter 403, secret 미노출.
- blocked: D1 read 불가.
- 위험: notes가 public response나 logs로 유출.
- rollback: route 제거 또는 feature flag off.

### P0-003 관리자 read-only 화면

- 목적: 배포 전 운영 정책과 동기화 상태를 확인한다.
- 현재 상태: 신규 구현 필요.
- 개발 범위: 독립 page, status band, filters, table, auto-press 링크.
- 제외 범위: 편집/publish.
- 예상 파일: `src/app/cam/auto-press/blocked-subjects/page.tsx`, `src/components/cam/auto-press/blocked-subject-policy-manager.tsx` 신규.
- DB 변경: 없음.
- API: P0-002 GET.
- 권한: admin/superadmin, reporter middleware 차단.
- 검증: desktop/mobile screenshot, keyboard navigation.
- 완료 기준: 375/768/1024/1440에서 가로 overflow 없음, 34개 표시.
- blocked: API 403 또는 D1 unavailable.
- 위험: 기존 auto-press page에 UI를 중첩해 번들이 커지는 문제.
- rollback: 링크 feature flag off.

### P0-004 validation과 테스트 매칭

- 목적: 오탐 규칙이 draft에 들어가는 것을 방지한다.
- 현재 상태: pure matcher는 있으나 동적 policy와 matchedField는 없음.
- 개발 범위: schema, matcher policy injection, `/validate`, `/match`, 위험어.
- 제외 범위: publish.
- 예상 파일: `src/lib/auto-press-content-policy.ts`, `src/lib/auto-press-policy-schema.ts`, validate/match routes.
- DB 변경: validation_json 저장.
- API: POST validate/match.
- 화면: rule editor inline errors, test panel.
- 권한: admin/superadmin.
- dry-run: match는 항상 no-write.
- apply: validation 결과 저장만 선택적.
- 테스트: 34 seed, domain/subdomain, AND group, 일반어 단독 거부.
- 완료 기준: Next/Worker fixture 결과 일치.
- blocked: matcher 결과 불일치.
- 위험: Next와 Worker matcher 구현 drift.
- rollback: runtime은 계속 정적 matcher 사용.

### P0-005 draft 저장과 감사 로그

- 목적: 운영 정책에 영향 없이 편집한다.
- 현재 상태: 신규 구현 필요.
- 개발 범위: draft clone/create/patch/delete, optimistic concurrency, server audit.
- 제외 범위: publish.
- 예상 파일: subjects API, `[id]` API, capability helper, audit repository.
- DB 변경: draft/version/subject/rule/audit write.
- API: POST/PATCH/DELETE.
- 화면: editor sheet, unsaved changes, conflict dialog.
- 권한: admin/superadmin.
- dry-run: diff preview.
- apply: draft save.
- 테스트: 409 conflict, actor spoof 방지, idempotency.
- 완료 기준: draft 저장 후 운영 checksum 불변.
- blocked: base version mismatch.
- 위험: client activity log를 신뢰하는 오류.
- rollback: draft 폐기.

### P0-006 publish/version/rollback

- 목적: 검증된 정책만 원자적으로 반영한다.
- 현재 상태: 신규 구현 필요.
- 개발 범위: immutable snapshot, pointer CAS, publish/rollback API, re-auth.
- 제외 범위: 기사 삭제.
- 예상 파일: publish/rollback routes, repository, audit.
- DB 변경: version/state/audit.
- API: POST publish/rollback.
- 화면: diff, 확인문구, 결과.
- 권한: 초기 superadmin only.
- dry-run: `pnpm auto-press:policy:publish -- --version <n> --dry-run` 신규 구현 필요.
- apply: API 또는 `--apply` CLI 신규 구현 필요.
- 테스트: 빈 정책 거부, 급감 거부, checksum, concurrent publish.
- 완료 기준: pointer 1회 전환, 이전 version 유지, audit 기록.
- blocked: validation warning 미승인, dry-run report 없음, generation conflict.
- 위험: partial publish.
- rollback: 과거 검증 version으로 pointer CAS.

### P0-007 Next.js/Worker 동적 loader

- 목적: 재배포 없이 정책을 적용한다. 반영 시점은 4.5.1의 실제 invocation 주기(정상 scheduler 동작 기준 Next 메인 약 24시간, retry 약 1시간, Worker scheduled 약 10분, Worker Queue는 60초 cache 만료 후 최초 batch)를 따르며 "60초 이내 전체 반영"을 목표로 하지 않는다.
- 현재 상태: 두 runtime 모두 빌드 정적 JSON.
- 개발 범위: D1 loader, invocation snapshot, last-known-good, fallback, health version.
- 제외 범위: 관리자 삭제.
- 예상 파일: Next loader/matcher, cron/retry, Worker policy module/health.
- DB 변경: 정책 read와 소비자별 최신 runtime observation upsert.
- API: sync-status.
- 화면: version status.
- 권한: health detail은 admin만 공개.
- dry-run: Worker Wrangler dry-run, local fixture.
- apply: Worker와 Vercel 순차 배포.
- 테스트: D1 success/failure/corrupt/empty/cache/version switch.
- 완료 기준: publish 후 저주기 소비자는 다음 정상 invocation에서, Worker Queue는 cache 만료 후 최초 batch에서 새 version을 적용하고 runtime observation으로 이를 증명한다. scheduler 지연·실패는 별도 경고하며, D1 실패 시 v2 static fallback으로 전환한다. "60초 이내 시스템 전체 일치"는 완료 기준으로 사용하지 않는다.
- blocked: 한쪽 fallback test 실패.
- 위험: run 중 version 변경, D1 read 증가.
- rollback: feature flag로 static-only loader, 이전 deployments.

### P1-001 기존 자료 dry-run 화면

- 목적: 기존 자료와 큐의 영향을 읽기 전용으로 확인한다.
- 현재 상태: CLI script는 구현, API/UI는 신규.
- 개발 범위: paged job, 분류, snippet, report persistence/download.
- 제외 범위: mutation.
- 예상 파일: dry-run routes, audit service, results component, 기존 script 공통화.
- DB 변경: report metadata/result table 또는 R2 artifact index 신규 검토.
- 권한: admin/superadmin.
- dry-run: API 자체가 dry-run.
- apply: 없음.
- 테스트: D1 chunk, pattern length, 20초 continuation, Supabase blocked.
- 완료 기준: 기존 CLI 결과와 분류 수 일치.
- blocked: full body 브라우저 전송, 대량 단일 query.
- 위험: D1 부하.
- rollback: audit job feature flag off.

### P1-002 큐 취소와 제한된 삭제

- 목적: 검증된 후보만 별도 실행으로 처리한다.
- 현재 상태: CLI apply는 구현, UI/API는 신규.
- 개발 범위: report gate, selection, queue cancel, soft delete, verification.
- 제외 범위: hard delete, 언급 기사 자동 선택.
- 예상 파일: action routes, report verifier, result UI.
- 권한: queue는 admin, article delete는 superadmin.
- dry-run: 기존 report.
- apply: 이중 확인과 idempotency.
- 테스트: stale report, changed article, max count, partial failure.
- 완료 기준: no 기준 404, sitemap 제거, audit.
- blocked: report checksum 불일치, Supabase blocked는 별도 표시.
- 위험: 외부 URL_DELETED rollback 불가.
- rollback: soft delete 복구는 별도 수동 절차, 외부 제출은 재색인 필요.

### P1-003 동기화 상태와 차단 통계

- 목적: 정책이 실제로 양쪽 runtime에서 적용됐는지 확인한다.
- 현재 상태: Worker health는 있으나 policy version 없음.
- 개발 범위: published pointer와 runtime observation 비교, health version/checksum/fallback, 24h event aggregation.
- 제외 범위: 원문 log 노출.
- 예상 파일: Worker `/health`, Next health route, manager status band.
- DB 변경: `auto_press_policy_runtime_observations` 최신 상태 upsert와 기존 events index 검토.
- 권한: admin.
- 완료 기준: 예정 invocation과 허용 지연 뒤에도 observation이 stale/mismatch이면 warning하고, invocation 실패와 observation 기록 실패를 구분한다.
- 위험: health endpoint에 내부 규칙 노출.
- rollback: version 숫자만 숨기지 말고 auth endpoint로 제한.

### P2-001 CSV/JSON과 운영 리포트

- 목적: 감사 증빙을 안전하게 내려받는다.
- 현재 상태: 신규 구현 필요.
- 개발 범위: redacted export, retention, checksum.
- 제외 범위: 본문 전체 export.
- 권한: admin/superadmin.
- 완료 기준: CSV formula injection 방지, private no-store, secret 없음.
- 위험: 내부 정책 유출.
- rollback: export route disable.

## 15. 예상 파일

### 기존 수정 후보

- `config/auto-press-blocked-subjects.json`
- `src/lib/auto-press-content-policy.ts`
- `src/lib/auto-press-retry-queue.ts`
- `src/app/api/cron/auto-press/route.ts`
- `cloudflare/auto-press-worker/src/index.js`
- `cloudflare/auto-press-worker/wrangler.toml`
- `src/app/cam/auto-press/page.tsx`
- `src/app/cam/layout.tsx`
- `src/middleware.ts`
- `scripts/remove-blocked-subject-articles.mjs`
- `tests/unit/auto-press-content-policy.test.ts`
- `package.json`

### 신규 구현 필요

- `cloudflare/d1/migrations/0005_auto_press_blocked_subject_policy.sql`
- `src/lib/auto-press-policy-schema.ts`
- `src/lib/auto-press-policy-repository.ts`
- `src/lib/auto-press-policy-loader.ts`
- `src/lib/admin-capabilities.ts`
- `src/app/cam/auto-press/blocked-subjects/page.tsx`
- `src/app/cam/auto-press/blocked-subjects/loading.tsx`
- `src/app/cam/auto-press/blocked-subjects/error.tsx`
- `src/components/cam/auto-press/blocked-subject-policy-manager.tsx`
- `src/components/cam/auto-press/blocked-subject-editor.tsx`
- `src/components/cam/auto-press/policy-match-tester.tsx`
- `src/components/cam/auto-press/policy-dry-run-results.tsx`
- blocked-subject API routes
- `scripts/seed-auto-press-blocked-subjects.mjs`
- `scripts/check-auto-press-policy-sync.mjs`
- 정책 repository/API/UI/Worker 테스트

## 16. 테스트 계획

### 16.1 단위

- 34개 JSON seed 보존
- exact term
- domain 및 subdomain
- term group AND
- `통일`, `섭리`, `다락방` 단독 허용
- 위험어 단독 저장 거부
- NFKC/공백/구두점 정규화
- disabled subject 무시
- empty/corrupt snapshot fallback
- checksum mismatch
- last-known-good
- critical/mention-only 자동 삭제 제외

### 16.2 API

- reporter 403
- admin read/edit 가능
- admin publish는 초기 403
- superadmin publish/rollback
- Bearer CRON_SECRET mutation 거부
- same-origin/CSRF
- Zod limit
- 409 generation conflict
- idempotency replay
- actor body spoof 무시
- audit redaction
- empty policy publish 거부

### 16.3 D1/Worker

- migration rehearsal
- seed dry-run/apply
- pointer CAS
- Worker direct binding load
- Next D1 HTTP load
- 한 invocation에서 version 고정
- 저주기 소비자의 다음 정상 invocation 및 Worker Queue cache 만료 후 version 전환
- runtime observation version/checksum/source 기록과 stale 판정
- D1 unavailable static fallback
- policy version health
- D1 query chunk 한도

### 16.4 UI·접근성

- desktop/mobile smoke
- keyboard only 편집
- dialog focus trap과 Escape
- icon accessible name
- inline error announcement
- status가 색상에만 의존하지 않음
- 375px 가로 overflow 없음
- 200% text zoom
- loading/empty/403/409/503
- destructive confirmation

### 16.5 회귀

- auto-press cron
- retry queue
- Worker runtime controls
- worker-notify
- articles DELETE
- sitemap/news-sitemap
- auto-news 중지 설정

## 17. 실제·신규 검증 명령

### 현재 존재

```bash
pnpm ci:typecheck
pnpm test:unit
pnpm check:auto-press-agent-loop
pnpm auto-press:blocked-subjects -- --base https://culturepeople.co.kr
pnpm smoke:browser -- --base-url=http://127.0.0.1:3000 --no-admin-auth --json
pnpm smoke:admin-ops
pnpm cloudflare:d1:apply-sql -- --file <migration.sql>
pnpm deploy:culturepeople
```

Worker dry-run은 package script가 없으므로 현재는 직접 실행한다.

```bash
npx --yes --package=node@22 --package=wrangler@4.90.1 --call \
  'wrangler deploy --dry-run --config cloudflare/auto-press-worker/wrangler.toml'
```

### 신규 구현 필요

```bash
pnpm auto-press:policy:seed -- --dry-run
pnpm auto-press:policy:seed -- --apply
pnpm auto-press:policy:validate -- --version <draft>
pnpm auto-press:policy:publish -- --version <draft> --dry-run
pnpm auto-press:policy:publish -- --version <draft> --apply
pnpm auto-press:policy:sync-check -- --base https://culturepeople.co.kr
pnpm smoke:blocked-subject-admin -- --base-url=http://127.0.0.1:3000
```

Windows에서는 줄 연속 기호를 사용하지 않은 한 줄 명령 또는 PowerShell backtick을 제공한다. 스크립트 내부에서 `/tmp`, `bash`, `sed`, `grep`, `systemd`에 의존하지 않고 Node `path`, `os.tmpdir()`, `fs` API를 사용한다.

## 18. 무중단 배포 순서

1. migration dry-run 및 별도 D1 rehearsal
2. additive migration 적용
3. 정적 JSON 34개 seed dry-run
4. seed apply 및 checksum 확인
5. read-only repository/API 배포
6. read-only 관리자 화면 배포
7. validation/match와 draft 저장 배포
8. publish/rollback API를 feature flag off 상태로 배포
9. Next.js dynamic loader를 fallback 우선 상태로 배포
10. Worker dynamic loader를 fallback 우선 상태로 배포
11. sync-status에서 양쪽 D1 read 확인
12. publish 기능 활성화
13. test draft를 publish하고 저주기 소비자의 다음 정상 invocation 및 Worker Queue cache 만료 후 runtime observation 일치 확인
14. dry-run 감사 UI 배포
15. 큐 취소 기능 활성화
16. 기존 기사 삭제 기능은 마지막에 superadmin only로 활성화

배포 gate:

- 34개 subject 손실 없음
- static JSON fallback 테스트
- migration rollback 없이 기존 기능 정상
- typecheck/unit/API/Worker/smoke 통과
- clean release manifest
- immutable preview URL 관리자 smoke
- Worker와 Vercel production version 일치
- dry-run에서 예상 밖 홍보 후보 증가 없음
- secret 원문 로그 없음

## 19. 완료 기준

- 관리자가 코드 수정 없이 draft를 편집한다.
- 저장만으로 운영 정책이 바뀌지 않는다.
- validation과 테스트 매칭이 가능하다.
- dry-run 결과를 확인한 뒤에만 publish할 수 있다.
- published version은 immutable하다.
- Next.js와 Worker가 같은 version/checksum을 사용한다.
- publish 후 Next 메인·retry·Worker scheduled는 다음 정상 invocation에서, Worker Queue는 60초 cache 만료 후 최초 batch에서 새 version을 읽고 runtime observation을 남긴다. scheduler 지연 때문에 전체 반영 시간은 보장된 SLA가 아니며 `sync-status`는 published version과 실제 applied version을 분리해 보여준다.
- D1 장애 시 last-known-good 또는 정적 34개 fallback이 작동한다.
- 빈 정책과 대량 규칙 삭제 publish가 차단된다.
- policy mutation은 role과 CSRF/idempotency 검사를 통과해야 한다.
- 정책 변경, publish, rollback, queue action, article action이 서버 감사 로그에 남는다.
- 기사 삭제는 정책 편집과 분리된다.
- 단순 언급·비판·재판·피해자 지원 기사는 자동 삭제되지 않는다.
- 내부 label, notes, reason, audit가 공개 사이트에 노출되지 않는다.
- Linux와 Windows에서 동일 Node 스크립트를 사용할 수 있다.

## 20. 대표자 운영 결정

개발 전에 다음 정책만 대표자가 확정하면 된다.

- `admin`에게 publish 권한을 줄지, `superadmin`만 허용할지
- 기존 기사 삭제 기능을 UI에서 제공할지 CLI에만 유지할지
- dry-run 보고서 보관 기간
- dry-run 보고서를 D1 신규 테이블에 저장할지 R2에 저장할지
- 정책 내부 메모에 출처 근거 URL을 저장할지
- publish 전에 2인 승인을 요구할지
- publish 후 정책 반영을 4.5.1의 기존 소비자 주기(정상 scheduler 동작 기준 Next 메인 약 24시간, retry 약 1시간, Worker scheduled 약 10분)로 둘지, 아니면 긴급 신규 차단을 위해 별도 인증된 즉시 검증 invocation을 추가할지

초기 권장은 다음과 같다.

- admin: 조회, draft 편집, validation, dry-run
- superadmin: publish, rollback, 기사 삭제
- 보고서: 90일
- 보고서 저장소: 1차는 D1에 상태·요약·최대 500개 redacted 결과만 저장한다. 제한을 넘는 상세 JSON/CSV 영구 보관이 필요해지면 R2에 immutable artifact를 두고 D1에는 checksum과 object key만 저장한다.
- 삭제: 1차 출시에서는 CLI 유지, UI는 read-only 후보 선택까지만
- 2인 승인: 계정 수가 충분해진 뒤 P2로 도입
- 반영 주기: 1차 출시에서는 기존 소비자 주기 그대로 사용하고 별도 긴급 트리거는 추가하지 않음(운영 중 긴급 반영 필요성이 실제로 확인되면 P1/P2에서 추가)

## 21. 다음 개발 프롬프트

### 21.1 1단계: D1 정책 저장소, API, seed

```text
docs/auto-press-blocked-subject-admin-plan.md의 P0-001~P0-002를 기준으로 D1 정책 저장소, migration, 정적 JSON 34개 seed, read-only repository/API를 끝까지 구현해줘.

더 묻지 말고 현재 코드와 문서를 먼저 읽어. 기존 차단 정책과 운영 배포를 되돌리지 마. 모든 위험 작업은 기본 dry-run으로 만들고 --apply에서만 D1을 변경해. published pointer는 아직 운영 matcher에 연결하지 말고 정적 JSON 차단을 유지해.

반드시 구현:
- 0005 additive migration
- policy state/version/subjects/rules/audit 스키마
- seed dry-run/apply와 checksum
- 34개 subject 보존 검증
- admin/superadmin read-only API
- reporter 403
- secret redaction
- Windows/Linux 호환 package scripts

검증:
- pnpm ci:typecheck
- 관련 Vitest
- migration rehearsal
- seed dry-run
- 테스트 D1 apply/verify
- 기존 auto-press 테스트

운영 D1 apply는 로컬 검증이 모두 통과한 뒤에만 실행하고, 실행했다면 migration과 seed 결과를 보고해.
```

### 21.2 2단계: 관리자 조회·편집·validation·publish UI

```text
docs/auto-press-blocked-subject-admin-plan.md의 P0-003~P0-006을 기준으로 `/cam/auto-press/blocked-subjects` 관리자 화면, draft 편집, validation, 테스트 매칭, publish/version/rollback을 구현해줘.

기존 `/cam` UI와 인증 패턴을 먼저 확인하고 reporter 접근을 서버에서 차단해. admin은 조회·draft·dry-run, superadmin은 publish·rollback 권한으로 시작해. client가 보낸 actor/role은 신뢰하지 말고 token payload에서 기록해. GET 외 mutation은 CSRF/same-origin, idempotency, generation conflict를 처리해.

UI는 조용하고 데이터 밀도가 높은 운영 화면으로 만들고 hero, 카드 중첩, emoji 신규 사용을 피하며 lucide 아이콘을 사용해. desktop/mobile, keyboard, focus, aria-live, destructive confirmation을 완성해.

이 단계에서는 Next.js/Worker 운영 matcher를 동적 정책으로 전환하지 말고 정적 JSON을 유지해. publish는 D1 pointer까지만 만들며 feature flag로 제어해.

검증:
- pnpm ci:typecheck
- pnpm test:unit
- API 권한/CSRF/409/idempotency 테스트
- 관리자 Playwright smoke
- 375/768/1024/1440 screenshot
- 34개 seed diff와 publish/rollback rehearsal
```

### 21.3 3단계: dry-run, 제한된 처리, 런타임 동기화와 배포

```text
docs/auto-press-blocked-subject-admin-plan.md의 P0-007과 P1-001~P1-003을 기준으로 Next.js/Worker 동적 정책 loader, last-known-good/static fallback, sync health, 기존 자료 dry-run UI, 제한된 queue 취소를 구현하고 운영 배포까지 완료해줘.

서비스 중단과 라이브 대량 호출을 금지해. Next 메인·retry와 Worker scheduled는 invocation 시작 시 D1 published snapshot을 직접 한 번 읽고, Worker Queue만 최대 60초 cache를 허용해. run 도중 version을 바꾸지 마. D1 실패, 빈 정책, checksum 오류에서는 현재 정적 34개 JSON fallback을 유지해. publish 후 저주기 소비자는 다음 정상 invocation에서, Worker Queue는 cache 만료 후 최초 batch에서 새 version/checksum을 읽고 소비자별 runtime observation을 기록해야 한다. scheduler 지연을 감안해 "60초 이내 전체 일치"나 절대 최대시간을 목표로 삼지 마.

기존 기사 삭제 UI는 superadmin, 최신 dry-run report, checksum, max count, 확인문구, idempotency를 모두 구현하고 테스트하기 전에는 활성화하지 마. 단순 언급·비판·재판·피해자 지원 기사를 자동 선택하지 마. 운영 DB 대량 쓰기와 이미지 다운로드는 하지 마.

검증:
- pnpm ci:typecheck
- pnpm test:unit
- pnpm check:auto-press-agent-loop
- Wrangler dry-run
- D1 success/failure/corrupt/empty fallback 테스트
- 관리자 smoke
- 정책 sync-check
- auto-press dry-run
- immutable Vercel preview 검증

모든 gate가 통과한 경우에만 Worker와 Vercel을 순차 배포하고 production alias, Worker version, 정책 version/checksum, fallback 미사용을 확인해.
```

## 22. 가장 먼저 실행할 개발 단계

가장 먼저 실행할 것은 **21.1 D1 정책 저장소, API, seed**다. 관리자 화면을 먼저 만들면 저장 대상과 version 원자성이 없는 임시 UI가 되고, 운영 정책 변경을 재배포 없이 안전하게 반영한다는 핵심 목표를 달성할 수 없다.
