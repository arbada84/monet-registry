# 컬처피플 GPT 임시 전환 점검 및 수정

기준일: 2026-11-13 KST. 사용자 의도는 11월 22일까지 GPT API를 임시로 사용하는 것이다. Gemini/Antigravity 협업 에이전트를 호출하지 않았고, Gemini 복귀 예약이나 다른 프로그램의 provider 설정 변경도 하지 않았다.

## 현재 상태와 차단 사항

- 운영 D1의 `cp-ai-settings`: provider=gemini, geminiModel=gemini-2.5-flash-lite, openaiModel=gpt-5.5. 저장된 OpenAI API 키 없음.
- `cp-auto-press-settings`: aiProvider=gemini, aiModel=gemini-2.5-flash-lite, enabled/cronEnabled=true.
- `.env.local`, `.env.vercel.local`에 OpenAI 키 없음. Vercel 프로젝트 환경변수 목록과 실제 보도자료 Worker binding에도 `OPENAI_API_KEY` 없음.
- 위 진단에서는 키 원문을 출력하지 않았다. 타 프로젝트의 키를 가져오거나 발급·복제하지 않았다.
- **GPT로 실제 운영 전환하지 않았다.** 키 없이 provider만 바꾸면 편집 실패가 발생한다. 운영 배포/운영 DB 설정 변경도 이번 작업에서는 하지 않았다.
- 기존 미커밋 작업과 운영 정본의 차이를 임의로 합쳐 배포하지 않았다. 코드 변경은 로컬에 보존돼 있으며 clean release 준비와 배포가 남아 있다.

## 발견 및 수정한 문제

| 문제 | 수정 |
| --- | --- |
| 모델 선택기에 GPT-5.5를 최신으로 표시 | 공식 API 카탈로그에 맞춰 GPT-6.1 Sol/Terra, GPT-6 Luna/Astra 추가. 이전 저장 모델은 호환용으로 유지 |
| GPT-6이 Chat Completions의 구식 파라미터로 전달될 수 있음 | GPT-5/6 및 기존 o-series를 Responses 경로로 분기. reasoning=low, max_output_tokens, timeout, store=false 사용. temperature/max_tokens 전달 안 함 |
| 빈/잘린 OpenAI 응답을 정상 편집으로 오인할 가능성 | empty, failed, incomplete 및 Chat length 종료를 오류로 처리 |
| 메일이 공통 설정창과 다른 provider/model 필드를 읽음 | 공통 selection resolver로 수정. 레거시 aiProvider/aiModel 호환 유지 |
| 보도자료 설정이 공통 provider와 별도로 남음 | `useGlobalAiSettings` 기본 동작은 공통 설정 따르기. 관리자에서 체크 해제한 경우에만 명시적 별도 provider/model 적용 |
| Worker가 Gemini만 호출 | Worker도 선택한 provider/model 사용. D1 공통 설정을 batch/invocation마다 한 번 읽으며 이미 대기 중인 run의 오래된 provider보다 현재 설정을 우선함 |
| Worker에는 관리자에서 저장한 OpenAI 키가 전달되지 않음 | 비공개 D1 설정의 키를 사용하고 동일 provider의 환경변수로만 fallback. 마스킹 문자열은 실제 키로 사용하지 않음 |
| D1 읽기 실패 때 잘못된 provider로 복귀할 위험 | Worker AI 설정 읽기는 실패 시 중단. OpenAI 실패/키 누락 시 Gemini로 우회하지 않음 |
| 키 없이 제공사만 저장 가능 | 설정 API에서 키 없는 전환 차단. 기존 마스킹 키 보존 |
| 보도자료 설정 화면에 불필요하게 전체 API 키를 전달할 가능성 | 인증된 `selectionOnly=1` 조회는 provider/model만 반환 |
| 메일 AI 실패 시 원문 그대로 게시 | 원문은 임시저장하고 reviewNote 기록. 포털 제출하지 않으며 화면·응답에서 임시저장과 게시를 구분 |

진행 중 invocation은 처음 읽은 설정으로 끝난다. Worker의 다음 invocation부터 최신 설정이 적용되며, 예약 실행 시각을 절대적인 전파 SLA로 보장하지 않는다. Next.js 설정 저장은 기존 revalidateTag 흐름을 유지한다.

## 모델명과 선택 기준

2026-11-13 공식 OpenAI API 문서로 확인했다. 실제 계정의 모델 접근 권한이나 잔액은 **미확인**이다.

| 용도 | 모델 ID |
| --- | --- |
| 반복 보도자료 편집의 비용/속도 우선 선택 | `gpt-6-luna` |
| 공통 AI 설정의 새 기본값, 품질/비용 균형 | `gpt-6.1-sol` |
| 글쓰기 중심 선택지 | `gpt-6.1-terra` |
| 고난도 작업 선택지, 비용/지연 주의 | `gpt-6-astra` |

저장된 `gpt-5.5`를 몰래 고가 모델로 변경하지 않았다. 배포 후 선택기에서 필요한 모델을 명시적으로 저장해야 한다. 자동등록 반복 작업에는 우선 Luna를 검토한다. 기존 Gemini 모델 목록과 운영 Gemini 설정은 유지했다.

- [공식 모델 카탈로그](https://developers.openai.com/api/docs/models)
- [GPT-6 사용 가이드](https://developers.openai.com/api/docs/guides/latest-model)
- [GPT-6 Luna 모델 명세](https://developers.openai.com/api/docs/models/gpt-6-luna)

## 수정 파일

- 공통: `src/lib/ai-model-options.ts`, `src/lib/ai-selection.ts`, `src/lib/openai-text.ts`, `src/lib/ai-settings-server.ts`, `src/types/article.ts`.
- API: `src/app/api/ai/route.ts`, `src/app/api/db/settings/route.ts`, `src/app/api/cron/auto-press/route.ts`, `src/app/api/auto-press/health/route.ts`, `src/app/api/mail/register/route.ts`, `src/lib/auto-press-retry-queue.ts`.
- 관리자: `src/app/cam/auto-press/page.tsx`, `src/app/cam/mail-press/page.tsx`. 기존 `src/app/cam/ai-settings/page.tsx`는 공통 모델 목록을 import하므로 파일 복제 없이 목록을 반영한다.
- Worker: `cloudflare/auto-press-worker/src/index.js`.
- 테스트: `tests/unit/ai-model-options.test.ts`, `tests/unit/ai-provider-switch.test.ts`, `tests/unit/ai-settings-and-mail-switch.test.ts`.

auto-news를 켜거나 중지 설정을 변경하지 않았다. 기사 본문, 이미지, 출처, 차단 정책, 예약 수량, 일일 사용 한도는 일괄 수정하지 않았다.

## 실행한 검증

```bash
pnpm test:unit
pnpm ci:typecheck
pnpm check:auto-press-agent-loop
node /home/arbada/.cache/pnpm/dlx/ekk7ut5wvxw2hniqcb6lofcv3m/1a0f2c2d88a-c977/node_modules/.pnpm/wrangler@4.145.0/node_modules/wrangler/bin/wrangler.js deploy --dry-run --config cloudflare/auto-press-worker/wrangler.toml --outdir /tmp/culturepeople-openai-worker-dry-run-20261113
git diff --check -- src cloudflare/auto-press-worker tests/unit
```

- 최종 전체 단위 테스트: **132개 파일 / 700개 테스트 통과**.
- 최종 타입 검사: 종료 코드 0.
- auto-press agent loop 검증: 종료 코드 0. 이 명령은 로컬 구조/구문 검사이며 Gemini 에이전트를 시작하는 작업이 아니다.
- 최종 Wrangler 4.145.0 dry-run: 종료 코드 0, bundle 135.51 KiB / gzip 34.59 KiB. Worker의 공유 TypeScript helper import를 실제 번들러로 검증했다. **운영 배포가 아니다.**
- diff whitespace 검사 통과.
- Gemini/OpenAI 실제 생성 API는 호출하지 않았다. 유료 테스트 비용은 발생시키지 않았다.
- 실제 브라우저 관리자 로그인·기능 클릭, production build, 배포 후 검증은 미실행이다. 단위 테스트와 타입 검사를 운영 반영 증거로 대신하지 않는다.

Wrangler 경로는 이번 컴퓨터의 기존 캐시 위치일 뿐 배포 표준 경로가 아니다. 다른 OS에서는 기존 설치된 Wrangler CLI로 동일 인자를 사용한다. 모델 선택과 실행 코드는 OS 경로에 의존하지 않는다.

## 운영 반영 및 재개 순서

1. 현재 운영 정본에서 이번 범위와 필요한 기존 보안 변경을 구분해 clean release를 만든다. 전체 검사/build/기존 release gate를 통과시킨다. dirty main 전체를 바로 배포하거나 안전장치를 우회하지 않는다.
2. 테스트한 Worker bundle과 Vercel 변경을 안전하게 순차 배포하되, provider는 기존 Gemini 상태로 유지한다. binding/secret/cron/사용 한도/차단 정책은 보존한다.
3. 대표자가 `/cam/ai-settings`에서 OpenAI API 키를 입력한다. 키는 채팅에 붙이지 않는다. OpenAI API 과금/잔액과 ChatGPT 구독은 별개임을 확인한다.
4. 공통 provider=OpenAI, 모델은 우선 `gpt-6-luna`로 명시해 저장한 뒤 연결 테스트를 한 번 실행한다. 현재 연결 테스트는 서버에 저장된 키를 사용하므로 저장 전에 새로 입력한 키를 검사하는 기능은 아니다.
5. `/cam/auto-press`의 '공통 AI 설정 사용'을 확인한다. 별도 설정을 유지할 경우 체크 해제 후 OpenAI와 모델을 직접 저장한다.
6. Worker `/health` 및 관리자 AI 상태에서 provider/model/key configured를 소량 확인하고, 실제 편집 1건을 먼저 검증한다. API 키·잔액·접근 권한 오류면 대량 재시도하지 않는다.
7. 11월 22일에는 Gemini 사용 가능 여부와 사용자 복귀 의사를 확인한 후 동일 설정창에서 수동 전환한다. 미확정 한도를 근거로 자동 복귀하지 않는다.

rollback은 이번 selection/UI/Worker 변경과 이번 설정 diff로 범위를 제한한다. 기존 사용자 작업, 기사, 큐 데이터와 secret을 지우지 않는다. 키·권한 문제가 해결되기 전 GPT 전환 완료로 표시하지 않는다.
