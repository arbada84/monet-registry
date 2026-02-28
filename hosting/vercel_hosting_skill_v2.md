# Vercel 운영 완결형 스킬 (호스팅·배포·도메인·파일업로드·성능·보안·관측) v2

> 목적: **이미 개발된 프로젝트(예: GitHub 저장소)**를 Vercel에 올려 **운영 가능한 상태**(도메인, 환경변수, 함수/API, 파일 업로드, 캐시/성능, 분석, 보안, 로그/관측, 제한/비용 포인트)까지 한 문서로 정리합니다.

---

## 0) 범위 확인(“모든 스킬”의 의미를 실무 기준으로 정리)
Vercel은 “호스팅(배포)”만이 아니라 **Functions, Routing Middleware, Cron Jobs, CDN 캐시/ISR, Image Optimization, Storage(Blob/Edge Config/Marketplace), Analytics/Speed Insights, Observability, Firewall/WAF, RBAC(권한), Limits**까지 플랫폼 범위가 넓습니다.

이 문서는 아래 10개 영역을 **운영에 필요한 수준으로 모두 포함**합니다(공식 문서 링크 포함).

1) 프로젝트/배포 개념 & 환경(Prod/Preview/Dev)  
2) 배포 방식 4종(Git/CLI/Deploy Hook/REST API)  
3) 프로젝트 설정(vercel.json/대시보드) + 모노레포  
4) 도메인/DNS/SSL  
5) Functions(Node/Edge) + Routing Middleware  
6) Cron Jobs(스케줄링)  
7) 파일 업로드/저장(Blob) + 데이터 스토리지(Edge Config/Marketplace DB)  
8) 성능(캐시/CDN/ISR/Request Collapsing/이미지 최적화)  
9) 분석/관측(Web Analytics/Speed Insights/로그/Tracing)  
10) 보안(Deployment Protection + Firewall/WAF) + Limits/트러블슈팅

---

## 1) 한 장 결정표(당장 뭐부터 할지)

### 1.1 배포(코드 업로드) 방식 선택
- **Git 기반(추천)**: GitHub 연결 → push/PR로 자동 배포(Preview 자동 생성)  
- **로컬에서 바로**: Vercel CLI `vercel` / `vercel --prod`  
- **CMS 발행 트리거**: Deploy Hook(HTTP POST)  
- **사내 배포시스템**: REST API(토큰) 또는 CI에서 CLI

### 1.2 “자료 업로드” 유형 구분(중요)
- **정적 파일(앱에 포함되는 파일)**: repo/빌드 산출물로 배포에 포함
- **런타임 업로드(사용자 업로드/생성 파일)**: **Vercel Blob**(또는 외부 스토리지) 사용

---

## 2) 기본 개념(운영에 필요한 만큼만)

- **Project**: 설정의 단위(빌드, 환경변수, 도메인, 방화벽 등)
- **Deployment**: 특정 커밋/빌드 결과로 생성된 배포물(고유 URL)
- **Environment**: `development / preview / production` 환경 분리
- **Scope(개인/팀)**: 개인 계정 범위 또는 Team 범위로 프로젝트가 속함(권한/RBAC 연결)

참고(공식):
- Deployments: https://vercel.com/docs/deployments  
- Project Configuration: https://vercel.com/docs/project-configuration  
- RBAC: https://vercel.com/docs/rbac

---

## 3) 배포(업로드) 4가지 방식

### 3.1 Git 연동(표준 운영 플로우)
1) Vercel 대시보드 → New Project → GitHub repo Import  
2) 프레임워크 자동 감지/빌드 설정 확인  
3) main(또는 지정 브랜치) push → Production 배포  
4) PR 생성/업데이트 → Preview 배포 URL 자동 생성

- GitHub 연동: https://vercel.com/docs/git/vercel-for-github

### 3.2 Vercel CLI(로컬 배포/자동화)
```bash
# 1) 최초 연결
vercel

# 2) Production 배포
vercel --prod
```

로컬 빌드 산출물만 올리는 방식(소스 공유 최소화):
```bash
vercel build
vercel deploy --prebuilt --archive=tgz
```
- CLI: https://vercel.com/docs/cli  
- vercel build: https://vercel.com/docs/cli/build  
- vercel deploy: https://vercel.com/docs/cli/deploy

### 3.3 Deploy Hooks(HTTP POST로 재배포 트리거)
- Deploy Hooks: https://vercel.com/docs/deploy-hooks
```bash
curl -X POST "https://api.vercel.com/v1/integrations/deploy/xxxxxx"
```

### 3.4 REST API(완전 자동화)
- REST API: https://docs.vercel.com/docs/rest-api/reference/welcome  
- Deployments API(예): https://docs.vercel.com/docs/rest-api/reference/endpoints/deployments/create-a-new-deployment  
- Access Token 가이드(KB): https://vercel.com/kb/guide/how-do-i-use-a-vercel-api-access-token

---

## 4) 프로젝트 설정(빌드/라우팅/함수/크론 등)

Vercel은 자동 감지 기본값이 있지만, 운영에서는 아래를 자주 만집니다.

### 4.1 vercel.json / 대시보드에서 자주 바꾸는 항목
- 빌드/출력 설정(Framework preset, Build command, Output)  
- 라우팅(redirects/rewrites/headers)  
- Functions 설정(런타임/리전/메모리 등은 프레임워크/설정에 따라)  
- Cron Jobs 설정  
- Image Optimization 설정  
- Firewall/WAF(일부는 대시보드, 일부는 설정 파일)

- Project Configuration: https://vercel.com/docs/project-configuration  
- vercel.json 레퍼런스: https://vercel.com/docs/project-configuration/vercel-json

### 4.2 모노레포
- 모노레포 문서: https://vercel.com/docs/monorepos  
- Remote Caching(팀 빌드 속도 개선): https://vercel.com/docs/monorepos/remote-caching

---

## 5) 도메인 연결(DNS/SSL)

1) Project → Settings → Domains에서 커스텀 도메인 추가  
2) Vercel이 안내하는 DNS 레코드(A/CNAME/TXT 등)를 도메인 DNS에 반영  
3) SSL(HTTPS) 상태 확인(대부분 자동)

- Domains: https://vercel.com/docs/domains/working-with-domains

---

## 6) 라우팅 규칙(리다이렉트/리라이트/헤더)

### 6.1 Redirects
- 문서: https://vercel.com/docs/redirects  
- 참고(주의): 라우팅 규칙 수 제한/확장 팁(KB): https://vercel.com/kb/guide/how-can-i-increase-the-limit-of-redirects-or-use-dynamic-redirects-on-vercel

예시(vercel.json):
```json
{
  "redirects": [
    { "source": "/old", "destination": "/new", "permanent": true }
  ]
}
```

### 6.2 Rewrites
- 문서: https://vercel.com/docs/rewrites

예시(vercel.json):
```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://example.com/:path*" }
  ]
}
```

### 6.3 Headers(캐시/보안 헤더 포함)
- Cache-Control 헤더 가이드: https://vercel.com/docs/headers/cache-control-headers  
- 일반 헤더: https://vercel.com/docs/headers

---

## 7) Vercel Functions(서버 코드 실행)

Vercel Functions는 서버를 직접 운영하지 않고 **API/서버 로직**을 실행하는 방식입니다.  
- 개요: https://vercel.com/docs/functions  
- Quickstart: https://vercel.com/docs/functions/quickstart

### 7.1 런타임(노드/엣지)
- Edge Functions(Edge Runtime): https://vercel.com/docs/functions/runtimes/edge/edge-functions.rsc

### 7.2 제한(번들/요청 바디 등)
- Functions 제한(예: 번들 크기): https://vercel.com/docs/functions/limitations  
- 요청 바디 4.5MB 관련(KB): https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions

실무 팁:
- 큰 파일 업로드는 “함수로 파일을 받아 저장”하기보다 **Blob Client Upload(직접 업로드)**를 고려(아래 9장).

---

## 8) Routing Middleware(요청 전처리: 인증/리다이렉트/국가별 라우팅 등)

- Routing Middleware 문서: https://vercel.com/docs/routing-middleware  
- Getting Started: https://vercel.com/docs/routing-middleware/getting-started

**중요(명칭/개념 변화)**  
Vercel Changelog 기준, 기존 Edge Middleware/Edge Functions 용어가 **Routing Middleware / Vercel Functions**로 정리되는 흐름이 안내되어 있습니다.  
- 참고: https://vercel.com/changelog/edge-middleware-and-edge-functions-are-now-powered-by-vercel-functions

---

## 9) Cron Jobs(스케줄 작업)

### 9.1 구성 방식
Cron은 “스케줄”이고, 실제 실행 코드는 보통 **Function**으로 만들고 `vercel.json`에서 크론을 설정합니다.  
- Cron Jobs: https://vercel.com/docs/cron-jobs  
- Quickstart: https://vercel.com/docs/cron-jobs/quickstart

예시(vercel.json):
```json
{
  "crons": [
    { "path": "/api/daily", "schedule": "0 5 * * *" }
  ]
}
```

### 9.2 플랜별 제약(특히 Hobby)
- Usage & Pricing: https://vercel.com/docs/cron-jobs/usage-and-pricing  
  - Hobby는 **하루 1회**만 허용되는 제한이 명시되어 있습니다.

### 9.3 로그 확인
- Cron 관리/로그: https://vercel.com/docs/cron-jobs/manage-cron-jobs

---

## 10) 파일 업로드/저장(자료 업로드) — Vercel Blob

정적 배포 파일과 달리, 사용자 업로드/생성 파일은 **Vercel Blob**이 대표 해법입니다.  
- Blob 문서: https://vercel.com/docs/vercel-blob  
- Blob SDK: https://vercel.com/docs/vercel-blob/using-blob-sdk  
- CLI Blob: https://vercel.com/docs/cli/blob

### 10.1 Server Upload vs Client Upload
- Server Upload(서버가 받아 put): https://vercel.com/docs/vercel-blob/server-upload  
- Client Upload(브라우저가 직접 업로드): https://vercel.com/docs/vercel-blob/client-upload

### 10.2 로컬 개발에서 env 동기화
Blob 스토어를 만들면 `BLOB_READ_WRITE_TOKEN` 등이 프로젝트 env로 생성될 수 있고, 로컬에서는:
```bash
vercel env pull
```

---

## 11) 데이터 스토리지(Blob 외: Edge Config / DB / Redis)

### 11.1 Storage 전체 개요
- Storage: https://vercel.com/docs/storage  
- Marketplace Storage: https://vercel.com/docs/marketplace-storage

### 11.2 Edge Config(자주 읽고 가끔 바뀌는 설정값)
- Edge Config: https://vercel.com/docs/edge-config  
- Getting Started: https://vercel.com/docs/edge-config/get-started

### 11.3 Postgres
- Postgres: https://vercel.com/docs/postgres

### 11.4 Redis(구 KV)
- Redis: https://vercel.com/docs/redis  
  - 문서에 “Vercel KV는 신규 제공 종료, 기존은 2024년 12월 Upstash Redis로 이전”이 명시되어 있습니다.

---

## 12) 성능(캐시/CDN/ISR/요청중복방지/이미지최적화)

### 12.1 CDN Cache + 캐시 헤더
- CDN Cache: https://vercel.com/docs/cdn-cache  
- Cache-Control 헤더(stale-while-revalidate 등): https://vercel.com/docs/headers/cache-control-headers  
- CDN 사용량 최적화: https://vercel.com/docs/manage-cdn-usage

### 12.2 ISR(배포 없이 재생성)
- ISR: https://vercel.com/docs/incremental-static-regeneration  
- Request Collapsing(캐시 미스 폭주 방지): https://vercel.com/docs/request-collapsing

### 12.3 Image Optimization
- Image Optimization: https://vercel.com/docs/image-optimization  
- Limits & Pricing: https://vercel.com/docs/image-optimization/limits-and-pricing  
- 비용 관리 가이드: https://vercel.com/docs/image-optimization/managing-image-optimization-costs

---

## 13) 분석/관측(Analytics/Speed Insights/Logs/Tracing)

### 13.1 Web Analytics(방문자/페이지/유입 등)
- Web Analytics: https://vercel.com/docs/analytics  
- 패키지(@vercel/analytics): https://www.npmjs.com/package/@vercel/analytics

### 13.2 Speed Insights(Core Web Vitals 기반 성능)
- Overview: https://vercel.com/docs/speed-insights  
- Quickstart: https://vercel.com/docs/speed-insights/quickstart  
- 패키지(@vercel/speed-insights): https://vercel.com/docs/speed-insights/package  
- 참고: Speed Insights Intake API는 deprecated로 안내됨: https://vercel.com/docs/speed-insights/api

### 13.3 Logs & Build Logs
- Runtime Logs(보관기간/사용): https://vercel.com/docs/logs/runtime  
- Logs 개요: https://vercel.com/docs/logs  
- Build Logs 접근: https://vercel.com/docs/deployments/logs  
- CLI로 로그 보기: https://vercel.com/docs/cli/logs

### 13.4 Tracing/Observability
- Observability: https://vercel.com/docs/observability  
- Tracing: https://vercel.com/docs/tracing

---

## 14) 보안(Deployment Protection + Firewall/WAF)

### 14.1 Deployment Protection(배포 접근 보호)
- 방법: https://vercel.com/docs/deployment-protection/methods-to-protect-deployments  
- Vercel Authentication: https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication

### 14.2 Firewall & WAF
- Firewall 개요: https://vercel.com/docs/vercel-firewall  
- WAF 문서: https://vercel.com/docs/vercel-firewall/vercel-waf  
- Firewall API(REST): https://vercel.com/docs/vercel-firewall/firewall-api

실무 포인트:
- IP Block/Managed Ruleset/Custom Rules로 운영 트래픽을 통제(대규모 공격 대응 포함).

---

## 15) 팀/권한(RBAC) — 협업 운영에 필수

- RBAC 개요: https://vercel.com/docs/rbac  
- Access Roles: https://vercel.com/docs/rbac/access-roles  
- Team Level Roles: https://vercel.com/docs/rbac/access-roles/team-level-roles  
- Managing Team Members: https://vercel.com/docs/rbac/managing-team-members

---

## 16) Limits(배포/빌드/파일 수/함수 크기 등) — 실패 예방용 체크

- Limits 전체: https://vercel.com/docs/limits  
  - 예: CLI 배포 시 업로드 소스 파일 수 제한이 문서에 명시됨
- Builds(빌드 타임아웃/빌드 캐시 등): https://vercel.com/docs/builds  
- Functions bundle size 등: https://vercel.com/docs/functions/limitations

캐시 관련 CLI:
- `vercel cache`(CDN/Data cache purge): https://vercel.com/docs/cli/cache

---

## 17) 트러블슈팅 “빠른 진단표”

1) **env 바꿨는데 반영 안 됨** → 환경변수는 “새 배포부터 적용”이 기본이므로 **재배포**가 필요  
2) **파일 업로드가 실패(Body too large)** → 함수 요청 바디 제한(예: 4.5MB) 가능성 → Blob Client Upload로 전환 고려  
3) **빌드가 오래 걸려 실패** → 빌드 타임아웃(문서 기준 45분) 확인, 캐시/출력 파일 수 점검  
4) **리다이렉트/라우트 규칙 너무 많음** → 라우팅 규칙 제한 및 Edge/Middleware/Function 기반 대체 검토  
5) **캐시가 안 먹는 느낌** → Cache-Control 헤더/ISR 설정/`vercel cache purge` 사용 여부 점검

---

## 18) 운영 체크리스트(바로 실행)

### 18.1 첫 오픈 전
- [ ] Git/CLI 중 배포 방식 확정
- [ ] Production/Preview/Development 환경변수 세팅 + 재배포 확인
- [ ] 커스텀 도메인 연결 + SSL 확인
- [ ] API/Functions 필요 여부 확정(없으면 정적 배포로 단순화)
- [ ] 파일 업로드가 있으면 Blob 설계(Server/Client 선택)
- [ ] 이미지 최적화 사용 시 비용/캐시 정책 확인
- [ ] Web Analytics/Speed Insights 켜서 “런칭 후” 데이터 확보
- [ ] 로그/관측(Logs/Tracing) 확인 루틴 만들기
- [ ] Firewall/WAF 최소 정책 적용(필요한 경우)

### 18.2 운영 중
- [ ] 배포 실패 시 Build Logs/Runtime Logs로 1차 진단
- [ ] 캐시/성능 이슈는 Speed Insights + Cache-Control/ISR 조합으로 추적
- [ ] 크론 작업은 로그/실행 빈도 제한(플랜) 점검
- [ ] 비용 이슈는 Image Optimization/ISR/DB 호출량부터 점검

---

## 부록 A) CLI 치트시트
```bash
vercel                      # 배포(Preview 기본)
vercel --prod               # Production 배포
vercel logs --follow        # 실시간 로그
vercel env pull             # 로컬로 env 가져오기
vercel cache purge          # 캐시 purge
vercel blob list            # Blob 목록(예시)
```

---

## 부록 B) “운영용 vercel.json” 템플릿(크론 + 라우팅)
```json
{
  "crons": [
    { "path": "/api/daily", "schedule": "0 5 * * *" }
  ],
  "redirects": [
    { "source": "/old", "destination": "/new", "permanent": true }
  ],
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://example.com/:path*" }
  ]
}
```

---

## 부록 C) 참고(공식 문서 홈)
- Vercel Docs: https://vercel.com/docs
