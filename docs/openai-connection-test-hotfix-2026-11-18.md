# OpenAI 연결 테스트 입력 키 무시 수정

## 재현과 원인

관리자 `/cam/ai-settings`의 기존 연결 테스트는 `/api/ai`에 provider/model/prompt/content만 보냈다. 입력란의 새 API 키는 보내지 않았다. `/api/ai`는 저장 설정 또는 환경변수만 사용하므로 새 키를 붙여넣어도 이전 키의 인증 오류가 반복될 수 있었다. 이 코드 결함은 확인됐으나 사용자가 가진 키의 실제 유효성을 검사한 것은 아니다.

GPT-6.1 Sol을 선택해도 GPT-5.5가 최신이라는 고정 문구가 남아 있어 선택 모델의 설명으로 교체했다.

## 수정 범위

- 새 `POST /api/ai/test-connection`: 로그인한 admin/superadmin 쿠키, 동일 Origin, 속도 제한을 요구한다. cron/worker Bearer만으로 접근할 수 없다.
- 화면에서 입력한 키를 저장 없이 HTTPS 서버 요청으로 검사한다. 키를 출력·저장·응답하지 않는다. 마스킹 문자열과 내부 공백을 거부한다.
- 명시적으로 빈 입력은 안내대로 환경변수만 검사한다. 키 override가 생략된 호출은 저장 키 또는 환경변수를 사용한다.
- OpenAI/Gemini 공식 모델 메타데이터 GET만 호출한다. 생성 요청은 하지 않는다. 성공은 키 인증·모델 조회까지만 의미하며 결제 한도·생성 권한 성공을 보장하지 않는다.
- 인증 거부, 모델 부재/접근권한, 모델 조회 권한, 잔액/요청 한도, 공급자 장애와 네트워크/timeout을 구분한다. 원본 provider 오류나 secret을 반환하지 않는다.
- Gemini의 HTTP 400 details `API_KEY_INVALID`도 구분한다.
- 실제 편집에서 새 키를 사용하려면 설정 저장이 필요함을 성공 메시지에 표시한다.
- 저장 키, AI provider/model, 운영 DB, Worker, 사이트 타입, GitHub/Vercel 계정 연결은 변경하지 않는다.

## 검증과 소스

- 기준 운영 SHA: `907e47529ee1447529141b8396b607d147ac62c7`.
- 새 SHA: `757c02d955822c4f6ee954a0e227591e5558ad4d`.
- tree: `dafeea997920b0d4a04884d9c4dd4ce18bba318e`.
- 원격 브랜치: `release/ai-connection-hotfix-20261118`.
- 격리 작업본: `/home/arbada/projects/culturepeople/releases/ai-connection-hotfix-20261118`.
- 변경 파일은 새 route, 관리자 AI 설정 화면, 회귀 테스트의 3개뿐이다. 기존 main의 다른 dirty 변경은 배포에 넣지 않았다.
- 전체 단위 테스트: 121파일 620개 통과. 신규 연결 검사 20개 포함.
- 타입 검사·린트 통과. diff whitespace 검사 통과.
- Claude 읽기 전용 검토 후 Gemini 오류 구조와 속도 제한 메시지, 저장 안내를 보완했다.
- 최초 격리 테스트에서 baseline key normalizer의 bullet 마스크 처리 차이로 1개 실패했고, 새 route에 명시적 거부를 추가한 뒤 전체 재검증했다.
- 테스트는 mocked provider 응답이다. 사용자의 실제 키로 유료 생성·설정 변경은 하지 않았다.

## 운영 적용

- 후보: `dpl_CRjF7AdpdFBpKm9hk6AMVKsUXnFc`.
- 후보 URL: `https://monet-registry-main-n4415exb4-arbadas-projects-fdc12d41.vercel.app`.
- 후보는 production 환경 `--skip-domain`으로 빌드한다. READY만으로 운영 연결 완료라고 판정하지 않는다.
- 롤백 기준: `dpl_9UescKCZswG7J4gbD5JtgH2euWNk`.
- 2026-11-18 00:47 KST: 후보 production 빌드 READY 후 동일 artifact 승격 성공. 운영 alias API에서 위 deployment와 일치를 확인했다.
- 후보/운영 health 200, D1/R2 정상. 운영 홈 200과 새 홈 유지 확인.
- 후보/운영 연결 검사 API의 비로그인 POST는 401로 차단된다. 운영 관리자 설정 화면도 로그인 경로로 보호된다.
- 운영 portal surface 11/11 통과. RSS/sitemap/news-sitemap/ads.txt 등 공개 기능 회귀 없음.
- 실제 사용자의 로그인 세션으로 입력 키 검사·설정 저장·유료 생성은 실행하지 않았다. 배포 및 mock 회귀 검증을 실제 키 성공으로 오인하지 않는다.
- 제한된 증빙: `~/.local/state/culturepeople/ai-connection-promotion-20261118.json`, `ai-connection-postflight-20261118.json`, `ai-connection-portal-20261118.json`.

## 사용자 확인

배포 완료 후 관리자 화면을 새로고침하고 키를 다시 입력해 연결 테스트를 실행한다. 성공 후 실제 사용하려는 설정만 저장한다. 모델 접근권한 오류라면 키가 틀렸다는 뜻이 아니며 API 프로젝트의 해당 모델 권한을 확인한다. 모델 조회가 제한된 키는 생성 권한이 있더라도 이 검사에서 권한 안내를 받을 수 있다.
