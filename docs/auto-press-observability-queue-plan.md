# 보도자료 자동등록 관측성·대기열 고도화 최종 기획서

작성일: 2026-05-03  
대상: 컬처피플 보도자료 자동등록, 수동 실행, 자동 실행, AI 재시도, 관리자 운영 화면  
상태: 기획 확정 전 검토 문서. 이 문서는 개발 착수 전 설계와 실제 적용 가능성을 비판적으로 정리한다.

## 1. 결론 요약

현재 보도자료 자동등록의 가장 큰 문제는 “등록 실패” 자체보다 “실행 상태를 사용자가 볼 수 없는 구조”다. 수동 실행 버튼을 누르면 브라우저 요청 하나 안에서 RSS 수집, 원문 수집, AI 편집, 이미지 처리, DB 저장이 모두 일어난다. 이 과정에서 AI 설정 오류, 외부 RSS 지연, 이미지 업로드 실패, Vercel 실행 시간 제한이 발생하면 사용자는 버튼이 멈춘 것처럼 느끼고, 어떤 기사에서 왜 실패했는지 알기 어렵다.

최근 라이브 D1 확인 기준 실제 실패 원인은 `Cannot read properties of null (reading 'geminiApiKey')`였다. 즉 AI 설정값이 null인 상태를 서버가 방어하지 못해 자동등록 API가 500으로 종료됐다. 최근 등록된 보도자료는 2026-04-30 18:34 KST 전후의 5건이고, 이후 실행 이력에는 성공 결과가 남지 않았다.

최종 권장안은 “수동 실행 API를 즉시 등록 API가 아니라 작업 생성 API로 바꾸고, 기사별 처리 상태를 D1에 저장한 뒤, 짧은 배치 실행기와 재시도 큐로 나누는 구조”다. 장기적으로는 Cloudflare Queues + Workers를 쓰는 것이 가장 안정적이다. 다만 개발량을 줄인 1단계는 Vercel + D1만으로도 가능하다.

## 2. 현재 구조 진단

### 확인된 근거

- 라이브 알림에 `보도자료 자동등록 실행 실패`가 있으며, metadata error는 `Cannot read properties of null (reading 'geminiApiKey')`다.
- D1 `cp-auto-press-history`에는 2026-04-30 실행 1회, 등록 5건만 남아 있다.
- D1 최근 기사도 번호 1-5까지만 보도자료 자동등록 기사로 확인된다.
- 현재 설정은 `enabled=true`, `cronEnabled=true`, `count=100`, `publishStatus=게시`, 활성 소스 11개다.
- `/api/cron/auto-press`는 `maxDuration = 60`으로 설정되어 있고, 내부 안전 타임아웃도 50초다.
- `/api/cron/retry-ai-edit`는 아직 Supabase REST를 직접 조회한다. D1 전환 이후 AI 재시도 대기열로 보기 어렵다.
- 현재 이력은 `site_settings.cp-auto-press-history` JSON 배열에 저장된다. 검색, 필터, 기사별 재시도, 상태 갱신에는 한계가 크다.

### 사용자 경험상 문제

- 버튼 클릭 후 서버가 오래 걸리면 실제로 실행 중인지, 멈췄는지, 실패했는지 알기 어렵다.
- 실패 원인이 알림에는 남아도 수동 실행 화면에 강하게 표시되지 않는다.
- “어떤 기사가 올라갔는지”, “어떤 기사가 실패했는지”, “왜 실패했는지”가 실행 단위로만 희미하게 남는다.
- AI 기능 때문에 등록하지 못한 기사가 별도 대기열로 보이지 않는다.
- 100건 실행처럼 큰 작업은 브라우저 요청과 서버리스 제한에 지나치게 의존한다.

## 3. 공식 제한과 적용 가능성

### Vercel 측 제약

Vercel Cron은 함수 호출 방식이므로 함수 실행 제한을 받는다. Vercel 공식 문서상 Hobby Cron은 하루 1회, 시간 정밀도는 시간 단위 오차가 있을 수 있다. 따라서 “AI 실패 건을 10분마다 재시도” 같은 요구를 Vercel Hobby Cron만으로 구현하는 것은 부적합하다.  
출처: https://vercel.com/docs/cron-jobs/usage-and-pricing

Vercel Functions는 응답하지 않으면 timeout이 발생한다. 공식 문서상 Fluid Compute 기준 Hobby도 더 긴 max duration을 쓸 수 있지만, 현재 코드가 `maxDuration = 60`으로 고정되어 있고 긴 AI·이미지 작업을 한 요청에 묶는 방식은 여전히 운영 안정성이 낮다.  
출처: https://vercel.com/docs/functions/limitations

### Cloudflare 측 제약

Cloudflare Queues는 Free/Paid에서 사용 가능하고, 메시지 재시도, 지연, 배치, Dead Letter Queue를 지원한다. 큐 소비자는 최대 15분 wall time을 가진다. 이는 현재 보도자료 처리처럼 “기사별로 나누고 실패하면 다시 시도”하는 작업에 적합하다.  
출처: https://developers.cloudflare.com/queues/  
출처: https://developers.cloudflare.com/queues/platform/limits/

D1 Free는 읽기/쓰기/저장 한도를 넘으면 쿼리 오류가 발생할 수 있다. 따라서 실행 로그를 D1에 남기더라도 본문 전체나 대용량 HTML을 무제한 저장하면 안 된다. 상태, 사유, URL, 요약, 짧은 오류 메시지 중심으로 저장해야 한다.  
출처: https://developers.cloudflare.com/d1/reference/faq/

## 4. 최종 권장 아키텍처

### 권장안 A: D1 기반 관측성 + Vercel 짧은 배치 실행

목표는 빠른 안정화다. 수동 실행 버튼은 작업만 만들고, 화면은 주기적으로 상태를 조회한다. 실제 처리는 기존 Vercel API를 짧은 배치 단위로 여러 번 호출한다.

장점:
- 현재 Next.js/Vercel 구조를 크게 바꾸지 않아 개발량이 중간 수준이다.
- 즉시 “작동 중인지 보이는 화면”을 만들 수 있다.
- 실패 사유와 기사별 결과를 D1에 남길 수 있다.

한계:
- Vercel Hobby Cron으로 10분 단위 재시도는 어렵다.
- 브라우저 수동 실행이 계속 폴링을 유도해야 한다.
- 대량 처리 안정성은 Cloudflare Queues보다 낮다.

판단:
- 1차 출시로 적합하다.
- 단, “주기적 AI 재시도”는 하루 1회 수준이거나 사용자가 버튼으로 수동 실행하는 형태가 현실적이다.

### 권장안 B: Cloudflare Queues + Workers 기반 장기 안정화

목표는 장기 운영 안정성이다. Vercel은 관리자 UI와 API 역할을 하고, Cloudflare Queues가 기사별 작업을 들고 Workers가 처리한다. D1/R2는 이미 Cloudflare 쪽으로 이동했으므로 구조적으로 잘 맞는다.

장점:
- 기사 1건 = 큐 메시지 1개로 분리 가능하다.
- AI 실패, 이미지 실패, 외부 원문 지연을 재시도 정책으로 다룰 수 있다.
- Dead Letter Queue로 영구 실패 목록을 운영 화면에 보여줄 수 있다.
- 브라우저를 닫아도 작업은 계속 진행된다.

한계:
- Wrangler/Workers/Queues 배포 구조를 새로 추가해야 한다.
- 기존 Next.js 서버 로직 일부를 Workers에서 재사용하기 어렵다.
- AI 편집, HTML 추출, 이미지 처리 중 Node 의존 기능은 Workers 호환성을 검토해야 한다.

판단:
- 장기 추천안이다.
- 개발량은 크지만, 사용자 요구인 “수동/자동 실행의 가시성, 실패 추적, 주기적 재등록”에는 가장 잘 맞는다.

### 권장안 C: Vercel만으로 긴 함수 실행 확대

Vercel maxDuration을 늘리고 현재 API를 계속 동기 처리하는 방법이다.

장점:
- 개발량이 가장 적다.

한계:
- 실패 추적 문제가 근본적으로 해결되지 않는다.
- 긴 요청은 브라우저, 네트워크, 서버리스 timeout에 계속 취약하다.
- AI 재시도 대기열과 기사별 상태 관리가 여전히 약하다.

판단:
- 비추천이다.
- 긴급 패치로는 가능하지만, 이 기능의 최종 구조로 삼으면 같은 문제가 반복될 가능성이 높다.

## 5. 데이터 모델 제안

### `auto_press_runs`

실행 단위 기록이다.

필드:
- `id`: `press_run_YYYYMMDDHHmmss_xxxx`
- `source`: `manual`, `cron`, `telegram`, `retry`
- `requested_count`
- `status`: `queued`, `collecting`, `processing`, `completed`, `partial_failed`, `failed`, `cancelled`
- `publish_status`
- `preview`
- `force_date`
- `date_range_days`
- `no_ai_edit`
- `started_by`
- `started_at`
- `completed_at`
- `last_heartbeat_at`
- `total_candidates`
- `processed_count`
- `published_count`
- `failed_count`
- `skipped_count`
- `queued_count`
- `summary_message`
- `error_code`
- `error_message`
- `created_at`
- `updated_at`

### `auto_press_items`

기사별 처리 기록이다.

필드:
- `id`
- `run_id`
- `source_id`
- `source_name`
- `source_url`
- `wr_id`
- `title`
- `status`: `candidate`, `collecting`, `ai_pending`, `ai_processing`, `image_processing`, `publishing`, `published`, `skipped`, `failed`, `retry_waiting`, `manual_review`
- `reason_code`
- `reason_message`
- `article_id`
- `article_no`
- `retry_count`
- `next_retry_at`
- `last_attempt_at`
- `duration_ms`
- `created_at`
- `updated_at`

### `auto_press_events`

실행 로그 타임라인이다.

필드:
- `id`
- `run_id`
- `item_id`
- `level`: `info`, `warning`, `error`
- `event_type`: `run_started`, `rss_fetched`, `candidate_found`, `detail_failed`, `ai_failed`, `image_failed`, `article_created`, `run_completed`
- `message`
- `metadata_json`
- `created_at`

### `auto_press_retry_queue`

AI 또는 일시적 장애 대기열이다.

필드:
- `id`
- `item_id`
- `task_type`: `ai_edit`, `image_upload`, `detail_fetch`, `publish`
- `status`: `waiting`, `running`, `succeeded`, `failed`, `dead`
- `attempts`
- `max_attempts`
- `next_run_at`
- `last_error_code`
- `last_error_message`
- `payload_json`
- `created_at`
- `updated_at`

## 6. 실패 사유 코드 표준화

운영 화면과 텔레그램 알림은 아래 코드로 통일한다.

- `NO_AI_SETTINGS`: AI 설정 값이 null이거나 비어 있음.
- `NO_AI_KEY`: 선택된 AI provider의 API 키가 없음.
- `AI_TIMEOUT`: AI 응답 시간이 초과됨.
- `AI_RESPONSE_INVALID`: AI 응답 파싱 실패.
- `RSS_FETCH_FAILED`: RSS 수집 실패.
- `DETAIL_FETCH_FAILED`: 원문 상세 수집 실패.
- `BODY_TOO_SHORT`: 본문 길이가 기준 미달.
- `NO_IMAGE`: 이미지 필수 조건 미충족.
- `IMAGE_UPLOAD_FAILED`: R2 이미지 업로드 실패.
- `DUPLICATE_SOURCE`: 원문 URL 또는 wrId 중복.
- `OLD_DATE`: 날짜 제한으로 제외.
- `BLOCKED_KEYWORD`: 금칙어 포함.
- `DB_CREATE_FAILED`: 기사 저장 실패.
- `TIME_BUDGET_EXCEEDED`: 실행 시간 예산 초과.
- `MANUAL_CANCELLED`: 관리자가 중지.

## 7. 관리자 화면 설계

### 수동 실행 탭

보여줄 항목:
- 실행 전 예상: 활성 소스 수, 요청 건수, AI 키 상태, R2 상태, 오늘 등록 가능 여부.
- 실행 시작 후: 실행 ID, 현재 단계, 최근 heartbeat, 전체 진행률.
- 버튼: `실행 시작`, `중지 요청`, `실패 항목 재시도`, `AI 대기열 처리`, `미리보기만 실행`.

### 실행 현황 탭

보여줄 항목:
- 현재 실행 중인 run 목록.
- 단계별 카드: 수집, AI, 이미지, 등록.
- 최근 이벤트 타임라인.
- 멈춤 감지: `last_heartbeat_at`이 2분 이상 갱신되지 않으면 “멈춤 의심” 표시.

### 기사별 결과 탭

보여줄 항목:
- 제목, 소스, 상태, 사유, 등록 기사 번호, 원문 링크, 편집 링크.
- 필터: 등록성공, 실패, 스킵, AI대기, 수동확인필요.
- 액션: 개별 재시도, 수동 등록 전환, 무시 처리.

### AI 대기열 탭

보여줄 항목:
- 대기 건수, 다음 재시도 시간, 재시도 횟수, 마지막 오류.
- AI 설정 오류일 경우 “AI 설정으로 이동” 버튼.
- 재시도 정책과 Dead Letter 목록.

### 이력 탭

보여줄 항목:
- 날짜별 실행 이력.
- 등록/실패/스킵/대기 통계.
- 실패율 추이.
- CSV/JSON 내보내기.

## 8. API 설계

### 신규 API

- `POST /api/auto-press/runs`: 실행 작업 생성.
- `GET /api/auto-press/runs`: 실행 목록 조회.
- `GET /api/auto-press/runs/:id`: 실행 상세 조회.
- `GET /api/auto-press/runs/:id/events`: 이벤트 조회.
- `POST /api/auto-press/runs/:id/cancel`: 중지 요청.
- `POST /api/auto-press/runs/:id/process`: 짧은 배치 처리.
- `GET /api/auto-press/items`: 기사별 결과 조회.
- `POST /api/auto-press/items/:id/retry`: 개별 재시도.
- `GET /api/auto-press/retry-queue`: AI 대기열 조회.
- `POST /api/auto-press/retry-queue/process`: 대기열 처리.
- `GET /api/auto-press/health`: AI, R2, D1, 활성 소스 상태 통합 점검.

### 기존 API 변경

- `/api/cron/auto-press`는 장기적으로 직접 처리 API가 아니라 run 생성 또는 batch processor 호출로 바꾼다.
- `/api/db/auto-press-settings?history=1`는 하위호환으로 유지하되, 새 화면은 `auto_press_runs`를 사용한다.
- `/api/cron/retry-ai-edit`는 Supabase 직접 조회를 제거하고 D1 provider 기반 대기열로 전환한다.

## 9. 실행 흐름

### 수동 실행

1. 사용자가 실행 버튼 클릭.
2. 서버가 `auto_press_runs`에 `queued` run 생성.
3. 서버가 RSS 후보를 빠르게 수집하거나, 후보 수집 자체도 첫 배치 작업으로 넘긴다.
4. UI는 `run_id`를 받고 2-5초마다 상태 조회.
5. 배치 processor가 기사별로 `auto_press_items` 상태를 갱신.
6. AI 실패는 `auto_press_retry_queue`에 들어간다.
7. 완료 시 텔레그램과 관리자 알림에 요약 전송.

### 자동 실행

1. Vercel Cron 또는 Cloudflare Scheduled Worker가 run 생성.
2. Cloudflare Queues 사용 시 기사 후보별 메시지 발행.
3. Worker가 메시지를 처리하고 D1 상태 갱신.
4. 실패 메시지는 retry 또는 Dead Letter로 이동.
5. 오전 리포트에 자동등록 결과 포함.

### AI 재시도

1. AI 실패 항목은 `retry_waiting` 상태와 `next_retry_at`을 가진다.
2. 재시도 processor가 due 항목만 처리한다.
3. 성공하면 기사 등록 또는 기존 임시저장 기사 업데이트.
4. 최대 횟수 초과 시 `manual_review`로 전환한다.

## 10. 단계별 개발 로드맵

### Phase 0: 긴급 안정화

목표:
- `geminiApiKey` null 오류 방어.
- AI 설정 없음/키 없음을 500이 아닌 구조화된 실패 항목으로 기록.
- 수동 실행 화면에 실패 요약을 명확히 표시.

완료 기준:
- AI 설정이 null이어도 실행 API가 500으로 죽지 않는다.
- 화면에 `NO_AI_SETTINGS` 또는 `NO_AI_KEY`가 표시된다.
- 관리자 알림이 한글로 남는다.

### Phase 1: D1 이력 테이블 도입

목표:
- `auto_press_runs`, `auto_press_items`, `auto_press_events`, `auto_press_retry_queue` 생성.
- 기존 `cp-auto-press-history`는 읽기 전용 하위호환으로 유지.

완료 기준:
- 실행 1회가 D1 run과 item으로 남는다.
- 실패 사유 코드와 메시지를 조회할 수 있다.

### Phase 2: 수동 실행 UI 개편

목표:
- 실행 ID 기반 상태판.
- 기사별 결과 표.
- 실패/대기/성공 필터.

완료 기준:
- 브라우저 새로고침 후에도 실행 상태 확인 가능.
- 어떤 기사가 올라갔고 실패했는지 화면에서 확인 가능.

### Phase 3: AI 대기열과 재시도

목표:
- D1 기반 AI retry queue 구현.
- `/api/cron/retry-ai-edit` 재작성.
- AI 설정 오류는 즉시 수동확인/설정필요로 표시.

완료 기준:
- AI 실패 항목이 대기열에 남는다.
- 재시도 횟수와 다음 실행 시간이 보인다.
- 성공/포기/수동확인 상태 전환이 가능하다.

### Phase 4: Cloudflare Queues 장기 전환

목표:
- Cloudflare Queue 생성.
- Worker consumer 구현.
- Vercel은 UI/API, Cloudflare는 백그라운드 처리 담당.

완료 기준:
- 브라우저를 닫아도 작업이 계속된다.
- Dead Letter Queue 항목이 관리자 화면에 표시된다.
- 100건 실행도 안정적으로 분산 처리된다.

## 11. 비판적 적용 가능성 판단

### 실제로 가능한 것

- D1에 실행 이력/기사별 결과/대기열 테이블을 만드는 것은 가능하다.
- 수동 실행 버튼을 작업 생성형으로 바꾸는 것은 가능하다.
- AI 설정 null 오류를 방어하고 실패 사유를 구조화하는 것은 즉시 가능하다.
- R2 전환은 이미 완료되어 이미지 저장소 402 문제는 새 업로드 기준 해결된 상태다.
- Cloudflare Queues로 장기 안정화하는 것도 가능하다. 사용 중인 Cloudflare Workers Paid 계정 방향과도 맞다.

### 조심해야 하는 것

- Vercel Hobby Cron만으로 “10분마다 재시도”는 불가능하거나 배포 실패 가능성이 높다.
- Vercel 함수 하나에서 100건을 한 번에 처리하는 방식은 다시 멈춤 문제가 생길 수 있다.
- D1에 본문 HTML 전체, AI 응답 원문, 이미지 목록 전체를 무제한 저장하면 Free/Paid 모두 운영 부담이 커진다.
- Workers로 옮길 때 `sharp`, Node 전용 HTML 처리, Next.js server-only 모듈은 그대로 재사용하기 어렵다.
- AI API 비용과 rate limit은 큐가 있어도 사라지지 않는다. 큐는 실패를 안전하게 밀어낼 뿐이다.

### 추천 결론

단기적으로는 Phase 0-2를 먼저 진행해야 한다. 이 단계만 끝나도 “눌렀는데 아무 반응 없음” 문제는 대부분 해결된다. 중기적으로 Phase 3까지 진행해 AI 대기열을 관리자 화면에 보여줘야 한다. 장기적으로 100건 이상 대량 처리와 안정적 재시도를 원하면 Phase 4 Cloudflare Queues 전환이 맞다.

즉, 최종 방향은 `D1 관측성 + R2 저장 + Cloudflare Queues 백그라운드 처리`다. 이 조합이 무료/저비용 구조를 유지하면서도 장기적으로 가장 안정적이다.

## 12. 추가 제안

- 실행 전 사전 점검 카드: AI 키, R2, D1, 활성 소스, 중복 예상, 오늘 등록 가능성.
- 실행 후 자동 요약: 등록 성공, 실패, 대기, 대표 실패 사유 TOP 5.
- 실패율 경보: 실패율 50% 이상이면 텔레그램 경보.
- 중복 방지 강화: `source_url`, `wr_id`, 제목 유사도, 본문 해시를 함께 사용.
- 원문 저작권/품질 체크: 기사 자동등록과 보도자료 자동등록을 명확히 분리하고, 보도자료만 자동등록 허용.
- 관리자 수동 승인 모드: AI 실패 또는 품질 낮은 본문은 무조건 임시저장/수동확인으로 보낸다.
- 운영 리포트: 매일 오전 9시 전날 자동등록 결과와 대기열을 텔레그램으로 발송.

