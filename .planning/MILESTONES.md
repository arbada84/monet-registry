# Milestones

## v1.0 컬처피플 전수 점검 및 수정 (Shipped: 2026-03-27)

**Phases completed:** 9 phases, 19 plans, 36 tasks

**Key accomplishments:**

- Redis 기반 토큰 블랙리스트로 서버리스 인스턴스 간 로그아웃 토큰 무효화 + middleware 블랙리스트 검사 추가
- 검색 sort 파라미터 유지 버그 수정 + 태그 페이지 테마별 accent 색상 CSS 변수 적용 + 20건 더보기 페이지네이션 추가
- 카테고리 페이지 전체 기사 로드(3000건)를 인기 기사 10건 조회로 교체하고, 기사 상세 breadcrumb 카테고리 URL을 encodeURIComponent로 안전 처리
- 작성자 select __unlisted__ 폴백 통일 + 카테고리 삭제 경고 + Phase 03 전체 Vercel 프로덕션 배포
- Commit:
- auto-press self-fetch 제거 + IMAP decrypt 에러 격리 + OG 재귀 방어 + keywords 제한 -- 총 4건 버그 수정 + Vercel 배포
- Commit:
- RSS author 이메일 형식 수정 + 비활성화 피드 필수 요소 추가 + sitemap 정적 페이지(/about, /terms, /privacy) 포함
- 이미지/ZIP/쿠팡 업로드 API에 쿠키 인증 추가, AI content 50,000자 길이 제한, API v1 PUT 상신 상태 허용
- 27건 문제 기사 자동 수정/삭제 (삭제 4건 + 수정 23건) 후 연속 2회 감사 0건 달성, 최종 게시 기사 2,981건
- 뉴스와이어 section.article_column 기반 전용 파서로 본문/이미지/메타 정밀 추출, fetchOriginContent 자동 분기, 넷프로 경유 소스 5개 제거 및 DB 런타임 마이그레이션
- fetchNetproList/fetchNetproDetail 함수 및 netpro API 3개 삭제, 모든 소스 RSS 직접 수집 통합, 어드민 UI 레거시 정리 후 프로덕션 배포
- auto-press 뉴스와이어 소스를 CockroachDB getUnregisteredFeeds() 기반으로 전환하고, 기사 등록 후 markAsRegistered로 중복 등록 원천 차단 + Vercel 환경변수 등록 및 프로덕션 배포 완료

---
