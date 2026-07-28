# CulturePeople 편집 파이프라인 운영 Runbook

## 안전 상태

정상 초기 상태는 다음과 같다.

```text
featureEnabled=false
shadowEnabled=false
draftEnabled=false
autoPublishEnabled=false
```

확인:

```bash
pnpm editorial:status -- --require-safe
pnpm editorial:rights:audit -- --source-root "<Article Guard 경로>" --dry-run
```

`autoPublishEnabled`는 UI나 API로 켤 수 없고 D1 CHECK 제약도 0만 허용한다.

## 무중단 활성화 순서

1. `pnpm ci:typecheck`, `pnpm test:unit`, `pnpm editorial:migration:rehearse`를 통과한다.
2. 운영 D1에 additive migration을 적용한다.
3. feature off 상태로 Vercel을 배포한다.
4. 관리자 인증 후 `/cam/editorial-lab`과 read-only API를 확인한다.
5. 권리 확인된 source만 superadmin source-rights API로 승인한다.
6. feature와 shadow만 켜고 draft는 끈 상태로 실제 후보를 report-only 평가한다.
7. 최소 50건 pilot, 편집자 2인, holdout 기준을 충족한 뒤에만 draft 활성화를 검토한다.
8. 자동 게시 활성화는 이 시스템의 현재 범위가 아니다.

## Source rights 승인

요청은 로그인한 superadmin의 `cp-admin-auth` 쿠키, 같은 origin, 12자 이상의 `Idempotency-Key`가 필요하다.

```http
PATCH /api/editorial/sources/{sourceId}/rights
Content-Type: application/json
Idempotency-Key: editorial-rights-<unique>

{
  "generation": 0,
  "usageBasis": "licensed",
  "rightsGrade": "B",
  "allowedUses": ["evidence"],
  "evidenceEligible": true,
  "trainingEligible": false,
  "blockReason": ""
}
```

권리 계약·공공데이터 조건·직접 취재 기록이 없으면 승인하지 않는다. fixture는 어떤 경우에도 evidence/training 대상으로 승인할 수 없다.

## 장애 확인

읽기 전용 순서:

```bash
pnpm editorial:status -- --require-safe
pnpm check:auto-press-agent-loop
pnpm auto-press:policy:sync-check
pnpm verify:portal -- --base https://culturepeople.co.kr
```

확인 항목:

- D1 13개 테이블 존재
- fixture eligibility 위반 0
- auto publish false
- 기존 auto-press policy 34 subjects 일치
- 공개 사이트 5xx 없음

## Kill switch

권리·근거·권한·5xx 문제가 있으면 superadmin이 `/cam/editorial-lab` runtime 제어에서 feature, shadow, draft를 모두 끈다. 이 변경은 candidate와 감사 로그를 보존하며 기존 기사와 auto-press를 변경하지 않는다.

runtime API 사용 시 current generation, same-origin, idempotency key가 필요하다. generation 409가 발생하면 상태를 다시 읽고 최신 값을 기준으로 판단한다.

## 정정·철회

1. 실제 게시 기사와 연결된 candidate인지 확인한다.
2. 최신 편집본 hash로 정정·철회 초안을 만든다.
3. editor 이상이 내용과 공개 문구를 검토한다.
4. 승인 후 기사 URL과 `/rss.xml`을 소량 확인한다.
5. 승인 전 초안이나 반려 기록은 공개되지 않아야 한다.

## Rollback

- UI/API 문제: feature, shadow, draft를 모두 off.
- D1 문제: 신규 테이블은 보존하고 route 접근만 중지. 기존 `articles`와 auto-press 테이블은 migration 대상이 아니므로 되돌리지 않는다.
- Vercel 문제: 직전 production deployment로 alias rollback.
- 권리 오판: 해당 source를 D/X, evidence false, training false로 변경하고 연결 후보를 보류한다.
- 공개 정정 오류: 새 정정 기록으로 바로잡고 감사 이력을 삭제하지 않는다.

## 현재 Blocked

- `biztribune_article` 100건의 CulturePeople 이용 권리
- 실제 보도자료·독립 외부 기사 pilot 자료
- 실제 편집자 2인의 50건 이상 라벨
- holdout 평가
- 90일 shadow 증적
- 대표자의 자동화 decision record

이 항목이 없어도 코드·UI를 feature off로 배포할 수 있지만, 실제 AI 초안과 자동화 준비 완료로 표시할 수는 없다.
