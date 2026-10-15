# 컬피 글줍 MCP 후속 게이트웨이 B단계 시도 결과

- 기준일: 2026-10-16 KST
- 상태: **BLOCKED_VERCEL_AUTHOR_ACCESS**, 운영 승격 미실행.
- 백엔드 설치 선행조건은 제공된 후속 증빙으로 해소됐다. 이번 차단은 백엔드 문제가 아니라 Vercel의 commit author 접근권한 검증이다.

## 1. 고정 소스와 설치 증빙

| 항목 | 확인 |
| --- | --- |
| 게이트웨이 소스 | `ed90c7d4897d43053f77633207093bb58797f238` |
| A단계 결과서 포함 SHA | `92acd1afc6443c536f6867d3929505e64a987141` |
| 백엔드 설치 소스 | `9a4f89028c21dfdc24f852af747baebc54f0fa14`, gateway source로 사용하지 않음 |
| B단계 격리 checkout | `/home/arbada/shortjup-gateway-glo-b-20261016`, detached ed90c7d, clean |
| 대상 프로젝트 | `shortjup-mcp-gateway`, `prj_GuqYweSyw6OaMZ7wbO7kSKHvdQgn` |
| 조직 | `team_r6EedfOTYhrZjdhxlDEFeSBF` |

A단계 결과서와 `glo-mcp-orderly-stop-and-rollout-followup-2026-10-16.md`를 끝까지 읽었다. 후속 결과서의 실제 Fold3 설치9파일 SHA를 Git의 backend9a4f890 bytes와 다시 대조해 모두 일치했다. 새 PID/시작·정상 종료·보존 검사는 후속 운영 담당자의 제공 증빙을 사용했고, 컬피가 Fold3에 재접속한 것은 아니다.

실제 새 양식 영수증 `rc_c542213910a4f3b35da7a4bd` / issue1158을 기존 운영 MCP에서 재조회했다. completed/ok=true 및 review_binding, candidate_binding, pronunciation_corrections, metadata_corrections 존재를 확인했다. 새 업무를 제출하거나 실제 교정을 적용하지 않았다.

## 2. 로컬 재검증

| 검사 | 결과 |
| --- | --- |
| npm ci | PASS, audit0 vulnerabilities |
| Node shared tests | 6 passed / 실패0 |
| mcp.selfcheck.mjs | ALL SELFCHECKS PASSED |
| Python gateway/direct-schema/english-review 계약3파일 | 27 passed / 실패0, 7.41초 |
| A단계 파일 SHA | mcp.js / _tools-contract.json / selfcheck 모두 일치 |
| 전후 운영 tools/list | 22개, description5개만 달라질 예정, description 외 schema/security 불변 |

파일 SHA-256:
- mcp.js: `dd34a73ad89a807cac540be2ea0421fba020ee17a412d2bccf469163bfd69d45`
- _tools-contract.json: `29ce831f454803e2292e28578f89afc94d834c9ce1e1a6be0c64dd292c38821a`
- mcp.selfcheck.mjs: `b659ff65ec44dc654a2d963ca510598fd47dca48af890f4d26dcce26b190ebea`

전체 백엔드7712개 통과는 제공 결과서의 증빙이며 이번 컬피 작업에서 다시 실행한 수치가 아니다. Python 런타임은 수정하지 않았다.

## 3. 시험 배포와 차단

설치된 Vercel CLI63.1.0의 deploy help로 target/skip-domain/yes 지원을 확인하고, 올바른 기존 프로젝트에 다음 방식으로 한 번 요청했다.

```bash
vercel deploy --target=production --skip-domain --yes --scope team_r6EedfOTYhrZjdhxlDEFeSBF
```

credential은 기존 보호된 파일에서 환경으로만 전달했다. 토큰을 인자·문서·Git에 기록하지 않았다. 운영 환경변수를 pull해 소스에 복사하지 않았다. 키·환경변수·프로젝트 설정을 수정하지 않았다.

| 항목 | 실제 결과 |
| --- | --- |
| 시험 배포 ID | `dpl_87SLt5E99ATHTHstkKCPBK5JxqTT` |
| 생성 시각 | 2026-10-16 01:16:13.544 KST |
| 배포 URL | https://shortjup-mcp-gateway-gbj87nn8q-arbadas-projects-fdc12d41.vercel.app |
| 상태 | **BLOCKED**, 사용 가능한 READY candidate가 아님 |
| 배포 metadata githubCommitSha | `ed90c7d4897d43053f77633207093bb58797f238` |
| seatBlock.blockCode | `TEAM_ACCESS_REQUIRED` |
| seatBlock.isVerified | false |
| readyStateReason | The deployment was blocked because the commit author doesn’t have permission to create deployments for this project. |
| CLI 결과 | 업로드 약55KB 후 Building 대기. 240초 제한에서 종료, exit status null. API에서 실제 BLOCKED 이유를 별도 확인 |
| 원격 계약·인증 검사 | NOT_RUN, READY 미충족 |
| 후보의 새 읽기 receipt | NOT_RUN |
| 운영 승격 | NOT_RUN |

소스가 컴파일 실패했다거나 backend 미설치로 거부됐다는 뜻이 아니다. Git metadata를 삭제하거나 작성자·커밋 SHA·author login을 조작하지 않았다. 같은 요청을 반복 배포하지 않았다.

## 4. 작성자·계정 대조

- GitHub commit API: 지정 ed90c7d의 author/committer는 모두 `arbada84`, authorId `227227581`.
- commit email은 GitHub에 귀속된 `227227581+arbada84@users.noreply.github.com`.
- 기존 Vercel token의 계정은 `arbada84-1366`, 이메일 `arbada84@gmail.com`.
- 따라서 GitHub가 커밋 작성자를 알 수 없는 상태는 아니다. Vercel에서 해당 작성자의 계정 연결/검증/프로젝트 접근을 승인하지 못한 것이 실측 차단이다.
- 현재 API 조회만으로 Vercel Login Connections의 실제 GitHub 연결 내용을 확정하지 못했다. 토큰 재발급이나 유료 플랜 업그레이드가 반드시 필요하다고 단정하지 않는다.

공식 근거: [Vercel collaboration troubleshooting](https://vercel.com/docs/deployments/troubleshoot-project-collaboration). 비공개 저장소 커밋은 Git provider 연결과 팀 접근권한 확인이 필요하며 Hobby는 owner 일치를 검증한다.

## 5. 운영 보존 최종 대조

시험 시도 이후 alias API와 환경변수 metadata를 다시 읽었다.

| 대상 | 전후 결과 |
| --- | --- |
| MCP production | `dpl_4d6CKkFrJfjqXsijLVYBbiDPTgMX`, 변경 없음 |
| 컬피 메인 production | `dpl_HyWykUJPnBq2dSryQaVgJi4Uzirs`, 변경 없음 |
| gateway env ID/key/target/type/updatedAt | 전후 동일 |
| DNS/Auth0/키/직접 터널/Fold3 | 수정 없음 |
| 기존 업무·규정·#69·미디어 | 변경 작업 없음 |
| 유료 생성·영상 업로드·실제 교정 제출 | 0 |

현재 정상 production이 유지돼 rollback은 실행하지 않았다. 차단된 배포도 진단 근거로 보존하고 삭제하지 않았다. 원격 인증·도구 검사 성공이나 실제 사용자 교정 applied를 보고하지 않는다.

## 6. 재개에 필요한 계정 조치

1. 현재 프로젝트 owner의 Vercel **Account Settings → Login Connections**에서 GitHub `arbada84`가 연결됐는지 확인한다.
2. 다른 GitHub 계정이 연결돼 있거나 연결이 끊겼으면 소유자가 정식 연결 절차로 수정한다. 컬피는 브라우저 OAuth 동의·계정 연결을 대신 완료하지 않았다.
3. 올바른 연결인데도 계속 차단되면 프로젝트/팀의 committer 승인·접근 상태를 확인하거나 Vercel 지원에 위 deployment ID, authorId, 고정 SHA를 제공한다. noreply 주소는 커밋에서 바꾸지 않는다.
4. 권한 문제가 해소된 증거를 받은 뒤 **같은 ed90c7d**로 도메인 없는 candidate를 다시 만든다. SHA를 바꾸거나 backend SHA로 대체하지 않는다.
5. READY와 source/project를 확인한 후에만 인증 분리·전체 tools/list·OAuth metadata·영어/기존 양식의 실제 receipt 왕복을 검사한다.
6. 통과한 동일 candidate를 재빌드 없이 promote하고, production alias·같은 receipt 재조회·메인 alias/env metadata 보존을 재검사한다.
7. Claude/ChatGPT 웹 표시와 실제 사용자 교정 applied는 별도 검증이며, 수행하지 않으면 NOT_RUN을 유지한다.

## 7. 증빙과 상태표

제한된 증빙: `/home/arbada/.local/state/culturepeople-mcp-glo-b-20261016/`. 디렉터리700, 생성 JSON/log600. baseline.json, backend-receipt.json, blocked-candidate.json, deploy.log, 로컬 검사 helper가 있다. 토큰 값은 저장하지 않았다.

| 상태 | 판정 |
| --- | --- |
| BACKEND_INSTALL_PRECONDITION | SATISFIED_BY_PROVIDED_EVIDENCE |
| BACKEND_TEMPLATE_RECEIPT | VERIFIED_EXISTING_RECEIPT |
| FIXED_GATEWAY_SOURCE | VERIFIED_ed90c7d |
| LOCAL_TESTS | PASS |
| REMOTE_DEPLOY_ATTEMPT | BLOCKED_VERCEL_AUTHOR_ACCESS |
| TOOLS_CONTRACT_VERIFIED | PASS_LOCAL / NOT_RUN_REMOTE_CANDIDATE |
| WORKER_READ_ROUNDTRIP | 기존 새 backend receipt 재조회 PASS, candidate 왕복 NOT_RUN |
| GATEWAY_DEPLOYED | false, 이번 후속 소스 미반영 |
| APP_SCHEMA_VISIBLE / REAL_CORRECTION_APPLIED | NOT_RUN |
| PAID_CANARY / YOUTUBE_UPLOAD | NOT_RUN |
