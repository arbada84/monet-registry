# D-2 롱줍 MCP 게이트웨이 운영 반영 결과

확인일: 2026-10-15 KST. 기준 문서: `culturepeople-d2-longjup-mcp-gateway-rollout-request-2026-10-15.md`.

## 결과

기존 shortjup-mcp-gateway만 고정 정본으로 배포하고 시험 배포 검증 후 같은 deployment를 운영에 승격했다. 공개 스키마와 실제 worker 영수증 왕복은 확인했다. 이미지 URL 양식의 선택 컷 결박 및 Claude/ChatGPT 웹 화면 검증까지 모두 완료한 상태는 아니다.

## 배포 식별

| 항목 | 결과 |
| --- | --- |
| source commit | `6e522adaf29cdedc4cf294aaac94835f92a4305b` |
| projectId | `prj_GuqYweSyw6OaMZ7wbO7kSKHvdQgn` |
| orgId | `team_r6EedfOTYhrZjdhxlDEFeSBF` |
| CLI | Vercel 63.1.0, Node 20.20.2 |
| 시험 배포 방식 | Production 환경, `deploy --target=production --skip-domain` |
| 이전 정상 production | `dpl_AyzY96XvEfoTa7VDByX3oX959Wyi` |
| 이전 URL | https://shortjup-mcp-gateway-dud0dcelj-arbadas-projects-fdc12d41.vercel.app |
| candidate / new production | `dpl_4d6CKkFrJfjqXsijLVYBbiDPTgMX` |
| 검증한 배포 URL | https://shortjup-mcp-gateway-6mt7hyhga-arbadas-projects-fdc12d41.vercel.app |
| 운영 MCP | https://mcp.culturepeople.co.kr/mcp |
| 승격 | 수행, 실행 로그 기록 시각 2026-10-15 02:55:29 KST |
| 재빌드 승격 | 없음. 검증한 동일 deployment를 promote |
| 컬피 메인 배포 | `dpl_HyWykUJPnBq2dSryQaVgJi4Uzirs`, 승격 전후 동일 |

별도 native Linux 체크아웃 `/home/arbada/shortjup-gateway-d2-20261015`을 고정 커밋으로 만들었다. 원본 숏줍 dirty 작업 폴더와 병행 작업의 수정은 보존했다. Git metadata를 삭제하거나 author/team 권한을 우회하지 않았다. 요청서 SHA256 네 파일 모두 배포 전후 일치했다. `bd75844` 대비 gateway 변경 파일은 api/mcp.js, api/_tools-contract.json 두 개뿐이다. 현재 운영 응답과 비교해 바뀐 도구는 get_template 하나다.

## 검증

- `npm ci`: 성공, dependency audit 0 vulnerabilities.
- `node --test api/_shared.test.js`: 6 passed.
- `node api/mcp.selfcheck.mjs`: ALL SELFCHECKS PASSED. 잘못된/만료 토큰 및 부족 scope 거부 검사는 로컬 selfcheck이며 실사용 Auth0 토큰 검사로 표현하지 않는다.
- 시험 배포와 운영에서 tools/list 22개의 이름, 전체 schema, securitySchemes, _meta가 정본과 완전히 일치.
- get_template.bot_instance optional, enum shortJup/longJup/gloJup. required는 기존 kind만 유지.
- 무인증/잘못된 Bearer/worker token을 client MCP에 사용하면 401 및 WWW-Authenticate.
- worker poll/result는 무인증과 client token 모두 401. 유효 worker token으로 poll을 호출하여 다른 명령을 claim하지 않았다.
- 서버 canary Bearer로 initialize 및 허용된 읽기 도구 정상 동작.
- OAuth resource/issuer/scopes와 metadata Cache-Control=no-store가 이전 운영본과 동일.
- 기존 Codex 연결 ShortJup 앱에서 같은 롱줍 영수증을 승격 전후 조회: completed, ok=true. 이 결과는 실제 Claude/ChatGPT 웹 UI 및 그 앱의 새 도구 목록 표시 검증을 대체하지 않는다.

## 실제 조회 영수증

각 조회는 한 번만 제출했다. 영수증은 최소 5초 간격, 최대 12회 범위에서 확인했고 실제 2~6회 안에 종료됐다. 반환된 next_action의 제출/생성/승인 작업은 실행하지 않았다.

| 조회 | receipt | GitHub issue | 최종 결과 |
| --- | --- | ---: | --- |
| longJup new_prompt | rc_7e5d05d496d12384754af11f | 1098 | completed, shortjup_longform_selection, bot_instance=longJup |
| longJup complete_script | rc_82658ed32746d98b43368203 | 1100 | completed, shortjup_longform_script_submission |
| longJup script_feedback | rc_11c9daf82ba7ef99d2c79853 | 1101 | completed, revision 6 |
| longJup review_bundle | rc_ff93e2b6e87a52ce2da2e244 | 1102 | completed, shortjup_longform_editorial |
| longJup cut_image_urls | rc_f4700c5c12afa22802018118 | 1103 | failed, LongformError: URL을 받을 현재 컷을 먼저 선택하세요. |
| shortJup 대표 양식 | rc_d7d0c16aeef99d8cd750a374 | 1104 | completed, 기존 _instructions/text 양식 |
| gloJup 대표 양식 | rc_3ff113efb59ea56d20a6430a | 1105 | completed, 기존 _instructions/text 양식 |
| kind만 보내는 기존 호출 | rc_41df88363a370a9c5c3f63ca | 1106 | completed, 기존 기본 양식 |

롱줍 작업 ID는 `c3ddfb894ee306cf`, revision 6이다. 대본 schema_version=1, chapters=5를 확인했다. 편집 양식에는 비어 있지 않고 중복되지 않는 cut_uid 19개가 있고, 대본과 편집 양식의 selection_sha256도 일치한다. 실제 script_sha256도 반환된다.

cut_image_urls는 현재 선택 컷이 없어 양식 반환이 실패한 실제 결과를 보존했다. 이를 성공으로 바꾸지 않았다. 요청서가 허용하는 '컷 선택 없음' 선행조건으로 분류하고, 선택 컷의 URL/UID/hash 결박 검증은 NOT_APPLICABLE로 남긴다. 검증용 새 작업이나 컷 선택, 현재 포인터 변경은 하지 않았다.

승격 후 공개 production에서 같은 new_prompt receipt를 읽어 completed 및 longJup selection을 다시 확인했다. 같은 요청을 중복 제출하지 않았다. canary issue/receipt는 삭제하지 않았다.

## 보존한 경계

- 메인 사이트 HTTPS HEAD 200. www는 기존 apex로 307 응답. 메인 code/production 배포는 변경하지 않았다.
- DNS 레코드/도메인 이름/Auth0 설정/키/게이트웨이 환경변수를 변경하지 않았다. 게이트웨이 env의 ID/key/target/type/updatedAt는 승격 전후 동일하다.
- Fold3 worker, bot, controller, node 권한, NAS witness, 직접 MCP tunnel/runit 서비스, 화면 캐시를 수정하거나 재설치하지 않았다. Fold3의 현재 파일 SHA를 새로 실측한 것은 아니다.
- 이번 검증이 실행한 유료 provider 호출/영상 생성/YouTube 업로드/최종 적용/기존 작업 취소: 0.
- 실제 양식 본문과 원문 대본, token은 이 문서에 저장하지 않았다. 제한된 운영 증빙은 `/home/arbada/.local/state/culturepeople-mcp-d2-20261015/`에 보관한다.

## 상태 구분과 남은 검증

| 구분 | 상태 |
| --- | --- |
| GATEWAY_DEPLOYED | PASS |
| 공개 서버 tools/list 스키마 | PASS |
| WORKER_ROUNDTRIP_VERIFIED | PASS, longJup new_prompt 실제 completed |
| 기존 shortJup/gloJup/kind-only 읽기 | PASS |
| 롱줍 대본/피드백/편집 결박 | PASS |
| 선택 컷 이미지 URL 결박 | NOT_APPLICABLE_NO_SELECTED_CUTS; 실제 receipt는 failed |
| 연결된 Codex 앱 영수증 조회 | PASS |
| APP_SCHEMA_VISIBLE, 실제 Claude/ChatGPT UI의 새 인자 표시 | NOT_VERIFIED |
| CLAUDE_VERIFIED | NOT_RUN |
| CHATGPT_VERIFIED | NOT_RUN |
| 실사용 Auth0 JWT의 부족 scope 거부 | NOT_RUN; 로컬 selfcheck만 통과 |

실제 Claude/ChatGPT에서 longJup 인자 표시와 양식 조회를 별도로 확인해야 한다. 서버 응답이 정상이지만 클라이언트 목록이 오래된 경우 도구 목록을 다시 조회해야 하며, 서버 배포 실패로 단정하지 않는다. 실제 이미지 컷을 사용자가 선택한 다음 cut_image_urls 결박 검증을 재개한다. 검증을 위해 임의로 선택하지 않는다.

## 롤백

롤백 대상은 착수 직전 확보한 `dpl_AyzY96XvEfoTa7VDByX3oX959Wyi`다. 이번에는 롤백을 실행하지 않았다. 인증 회귀/누락 도구/다른 owner 자료 노출/지속 5xx 시 새 호출을 중단하고, 승인된 Vercel credential을 환경으로 주입한 뒤 기존 프로젝트에서 `vercel rollback dpl_AyzY96XvEfoTa7VDByX3oX959Wyi` 절차를 사용한다. token을 명령행에 넣지 않는다. 롤백 후 인증/도구/기존 조회를 다시 확인하며 Fold3 DB/작업/미디어/승인 기록은 되돌리지 않는다.
