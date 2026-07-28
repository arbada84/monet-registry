# CulturePeople 근거 기반 편집 정책

- 시행 준비일: 2026-07-29
- 적용 대상: `/cam/editorial-lab`과 `/api/editorial/**`
- 기본 운영 모드: report-only / shadow, 자동 발행 금지

## 기본 원칙

1. 보도자료나 타사 기사의 표현만 바꾼 결과를 자체 기사로 분류하지 않는다.
2. 핵심 주장은 승인된 근거 ID로 재현할 수 있어야 한다.
3. fixture, 권리 미확정 자료, 출처 불명 자료는 구조 테스트 외 기사 근거와 AI 입력에 사용하지 않는다.
4. 출처가 제출한 `evidenceEligible`, `rightsGrade`, `usageBasis` 값은 신뢰하지 않는다. D1에 superadmin이 승인한 source rights만 서버가 적용한다.
5. 동일 보도자료 파생물과 syndicated copy는 여러 독립 출처로 세지 않는다.
6. AI는 승인된 발췌 범위 안에서 초안을 보조하며 인용·수치·인물·기관·사건을 창작할 수 없다.
7. 자체 기사 발행은 항상 사람 승인과 기존 기사 등록 절차를 거친다. editorial API에는 자동 게시 기능이 없다.

## 권리 등급

| 등급 | 의미 | 근거 사용 |
|---|---|---|
| A | 공식 원문, 공공데이터, 직접 취재. 권리·시점 확인 | 허용 가능 |
| B | 귀속과 이용 근거가 확인된 독립 보도·보고서 | 교차 근거 허용 가능 |
| C | 기업·기관 보도자료 또는 이해관계자 주장 | 해당 주체의 주장으로만 사용 |
| D | 권리·출처 미확정 | 차단 |
| X | fixture, 사용 금지, 개인정보·권리 위험 | 차단 |

권리 승인은 superadmin만 수행한다. `evidenceEligible=true`는 A/B/C이고 `usageBasis`가 `unconfirmed`가 아닐 때만 허용한다. `trainingEligible`은 기사 근거 사용과 별도 결정이며 기본값은 false다.

## 검토와 발행

- reporter: 후보 생성·편집
- editor: 일반 검토·정정 초안
- sensitive_editor/admin: high-risk 검토
- superadmin: runtime, source rights, 운영 rollback
- high-risk 분야는 단어 적중만으로 유죄·위법을 확정하지 않으며 별도 민감 검토가 필요하다.
- 실제 편집자 검토와 harness 검토는 저장·통계·화면에서 분리한다.
- `approved`는 편집 검토 결과이지 게시 완료가 아니다.
- `published`는 이 API에서 설정할 수 없다.

## 정정과 철회

- 실제 게시 기사에 연결된 candidate만 정정·철회할 수 있다.
- 기사 번호, 기사 ID, 최신 편집본 hash가 일치하지 않으면 거부한다.
- 정정·철회 초안은 승인 전 공개 기사·SEO·RSS에 영향을 주지 않는다.
- 승인된 고지만 기사 상단과 RSS 본문 앞에 표시한다.
- 철회 기사도 기록 보존을 위해 원 URL을 유지하며, 법적 삭제가 필요한 별도 사안은 기존 삭제 절차를 사용한다.
- 모든 결정은 actor, role, idempotency key, 전후 hash와 함께 감사 로그에 남긴다.

## 금지

- 권리 불명 원문 장기 보관 및 재배포
- fixture를 운영 정확도, 학습, 근거로 사용
- 출처 은폐, 인용 창작, 사실 없는 배경 보강
- 명예훼손·진단·유죄·인과관계 자동 확정
- auto-news 재활성화
- 네이버뉴스·다음뉴스 자동 송고
- 자체 기사 무인 자동 발행

## 중단 기준

다음 중 하나면 feature 또는 draft flag를 끈다.

- 권리 없는 source가 evidence eligible로 표시됨
- 핵심 claim의 근거 추적 실패
- fixture eligibility 위반
- high-risk 승인 우회
- 감사 로그 누락
- 공개 기사 5xx 또는 기존 auto-press 회귀

운영 절차는 `docs/culturepeople-editorial-operations-runbook.md`를 따른다.
