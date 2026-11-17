# 컬피 MSI Herdr 작업 역할

작업공간: 컬피. 작업 경로: /home/arbada/projects/culturepeople/monet-registry-main.

- 좌측 Codex: 작업 총괄, 구현 담당, 영향 범위 확인과 통합 검증. 명시된 과업 범위에서만 수정한다.
- 우측 Claude: 동일 변경본의 독립 코드 검토, 결함·누락·운영 위험 확인. 별도 배정 없이 Codex가 수정 중인 파일을 동시에 쓰지 않는다.
- 두 CLI는 사용자가 요청한 승인·권한 확인 생략 옵션으로 실행한다. 이는 운영 배포·DB 쓰기·예약 전환·자료 삭제·모델 예산 변경에 대한 새 승인이 아니다.
- 상위 AGENTS.md와 docs/msi-desktop-migration-result-2026-11-15.md를 우선 읽고 기존 dirty 변경을 보존한다.
- 이번 시작 안내는 경로와 인수인계 확인 후 대기까지만이다. 개발·콘텐츠·빌드·운영·백업 예약을 시작하지 않는다.
- Codex는 승인/샌드박스 생략 옵션, Claude는 permission checks 생략 옵션을 사용한다. 초기 신뢰/로그인 등 별도 UI가 나오면 자동 선택하지 않는다.
- Gemini/Antigravity는 중지 상태다. Claude 프로젝트 설정에 Gemini MCP가 있어 이번 실행은 strict empty MCP 구성으로 자동 연결을 차단한다. 원래 설정과 provider는 바꾸지 않는다.
- 백업 자동 실행 주체는 아직 노트북이다. MSI에 writer·timer·암호화키·운영 인증을 임의로 추가하지 않는다. Vercel/Fold3/DNS/운영 DB와 뉴스레터·auto-news 중지 상태를 유지한다.
- 기존 대화 이력의 이관·로딩은 이번 새 작업공간 생성의 완료 범위에 포함하지 않는다. 코드와 이전 결과서를 읽었다는 사실을 이전 대화를 resume했다고 표현하지 않는다.
