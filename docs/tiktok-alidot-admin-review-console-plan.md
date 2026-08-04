# 알리닷 TikTok 연동 전 영상 등록 UI 사전제작 기획서

- 기준일: 2026-08-04
- 상태: 로컬 구현·검증 완료, 운영 배포 검증 대기
- 공개 서비스 URL: `https://culturepeople.co.kr/alidot`
- 관리자 화면 후보: `https://culturepeople.co.kr/cam/alidot/tiktok-review`
- 이번 범위: 내부 UX 검토와 향후 TikTok 연동을 위한 영상 등록 UI 스캐폴딩
- 제외 범위: TikTok OAuth, Content Posting API, 자동 게시, 외부 사용자 서비스

> 2026-08-04 기준 P0~P3의 내부 UI prototype과 검증 도구를 구현했다. 운영 DB와
> TikTok 콘솔은 변경하지 않았다. 1차 화면은 UI 시연용이며 실제 TikTok 전송 성공을 표시하지 않는다.
> TikTok Production 심사는 실제 API 동작 증빙을 요구하므로 이 화면만으로는 앱
> 심사를 제출하지 않는다. OAuth와 Content Posting API를 별도 구현하고 서비스가
> 내부 전용이 아닌 실제 이용자 대상 제품이 된 경우에만 심사 제출을 재검토한다.

## 1. 결론

### 1.1 만들 화면

CulturePeople 관리자 안에 `알리닷 TikTok 영상 등록` 화면 하나를 만든다.

```text
/cam/alidot/tiktok-review
```

화면에서는 다음 예정 흐름을 내부에서 자연스럽게 검토할 수 있어야 한다.

1. 향후 TikTok 연결 계정이 표시될 영역
2. 등록할 영상 선택
3. 영상 미리보기
4. 제목·설명·해시태그 입력
5. 콘텐츠 권리와 AI·광고 여부 확인
6. 게시 설정 확인
7. 최종 등록 확인
8. 처리 결과 화면

### 1.2 공개 범위

- `/alidot`, `/alidot/terms`, `/alidot/privacy`만 외부 공개를 유지한다.
- 영상 등록 화면은 `/cam` 관리자 인증 뒤에서만 접근한다.
- 공개 Header와 Footer에 관리자 화면 링크를 넣지 않는다.
- sitemap과 news-sitemap에 포함하지 않는다.
- 관리자 화면은 robots.txt 차단에만 의존하지 않고 페이지 metadata 또는
  `X-Robots-Tag: noindex, nofollow, noarchive`를 직접 반환한다. 현재 RootLayout의
  기본 robots는 index/follow이므로 이 작업을 생략하면 요구사항을 충족하지 못한다.

### 1.3 이번 기획에서 제외하는 것

- 외부 메시징 도구 연동
- 별도 영상 자동화 프로젝트 연동
- TikTok 실제 로그인과 OAuth callback
- access token·refresh token 저장
- TikTok Content Posting API 호출
- TikTok 자동 공개 게시
- 예약 게시와 자동 재시도
- 외부 이용자 회원가입
- 다중 TikTok 계정 관리
- TikTok 응답을 흉내 낸 가짜 성공 기록

### 1.4 이 화면이 실제로 TikTok 심사에 기여하는가: 현실성 판단

**결론: 내부 UX 프로토타입으로는 현실적이지만 Production 승인 수단으로는
현실적이지 않다.** TikTok 공식 App Review Guidelines는 개발·시험 중인 앱과
private/personal use 앱을 승인하지 않는다고 명시한다. 특히 Direct Post용 Content
Sharing 지침은 내부 그룹만 쓰는 앱과 본인 또는 팀이 관리하는 계정에 콘텐츠를
올리는 utility 도구를 허용되지 않는 사례로 제시한다. 이번 1차 범위는
`video.upload`이므로 Direct Post 세부 UX를 그대로 적용할 단계는 아니지만, 현재
기획처럼 컬피 관리자만 사용하는 화면은 상위 App Review의 private-use 제한에
걸릴 가능성이 높다.

TikTok의 Login Kit·Content Posting API 심사는 통상 실제 TikTok OAuth 동의
화면으로의 리디렉션과 실제 API 호출이 촬영된 데모를 요구한다(3.2·13·14에서
이미 인정한 내용이다). `user.info.basic`을 요청하는 순간부터 데모 영상에는
TikTok이 호스팅하는 로그인·동의 화면이 실제로 등장해야 하며, 이는 클라이언트
UI로 재현할 수 없다. `video.upload`도 통상 실제 업로드가 성공해 TikTok 앱의
받은편지함에 영상이 뜨는 장면을 요구한다. 즉 **"UI 시연 모드"는 정의상 이
요건을 충족할 수 없으며, 화면을 아무리 잘 만들어도 해결되지 않는다.**

이 한계는 제목, 목적, 개발 단계와 완료 기준 전체에 우선하는 제출 차단 조건이다.
P0~P3를 완료해도 결과물의 상태는 `내부 UX prototype`이며 `승인 준비 완료`가 아니다.

#### 그래도 현실적으로 가치 있는 부분

- 실제 API 연동 전에 UX·상태 흐름·validation을 먼저 굳혀 두는 엔지니어링
  선행 작업으로는 합리적이다(3.1의 "화면 구조를 다시 만들지 않게 한다").
- 대표자·이해관계자에게 알리닷의 예정된 사용자 흐름을 설명하는 내부 데모
  자료로는 유효하다.
- `docs/tiktok-alidot-public-pages-plan.md` 1.4에서 이미 지적했듯, 진짜
  관건은 알리닷의 실사용자 실체와 실제 OAuth 구현 여부이며, 이 화면은 그
  판단을 대신하지 않는다.

#### Production 승인 관점에서 현실적이지 않은 부분

- 이 화면만으로 촬영한 영상은 실제 통합이 표시되지 않으므로 공식 제출 요건을
  충족하지 않는다. 이는 단순한 반려 가능성이 아니라 현재 공식 문구와 충돌하는
  명확한 제출 차단 조건으로 취급한다.
- P0~P3를 사실상 "TikTok 승인" 목표의 실행 계획처럼 배치했지만, 실제
  승인에 필요한 작업(OAuth 콜백 구현, TikTok Sandbox 앱 등록, 실제 API
  호출)은 전부 P4로 미뤄져 있다. 승인이 실제 목표라면 우선순위가 뒤바뀌어
  있는 셈이다.

#### 확정 권장

- 이 문서와 화면에서는 `승인용`, `승인 준비 완료`, `제출 가능` 표현을 사용하지
  않는다.
- 현재 앱 심사는 제출하지 않고 Developer Portal의 Draft/Sandbox 상태를 유지한다.
- Production 승인이 계속 목표라면 기술 연동보다 먼저 알리닷을 실제 외부 이용자
  대상 서비스로 운영할지 결정한다. 내부 전용을 유지한다면 이 화면은 내부 UX
  프로토타입으로만 쓰고 TikTok Studio 등 공식 수동 도구를 운영 경로로 검토한다.

## 2. 현재 상태

| 항목 | 상태 | 근거 |
|---|---|---|
| 알리닷 공개 소개 | 운영 중 | `/alidot` |
| 알리닷 이용약관 | 운영 중 | `/alidot/terms` |
| 알리닷 개인정보처리방침 | 운영 중 | `/alidot/privacy` |
| 관리자 인증 | 구현됨 | `cp-admin-auth` 쿠키 기반 `/cam` |
| SNS TikTok URL 설정 | 구현됨 | `/cam/sns` |
| TikTok 영상 등록 화면 | 로컬 구현·검증 완료 | `/cam/alidot/tiktok-review` |
| TikTok OAuth | 미구현·이번 범위 제외 | 관련 API route 없음 |
| TikTok 영상 전송 | 미구현·이번 범위 제외 | Content Posting API 없음 |

현재 `src/lib/alidot-legal.ts`도 TikTok 연동 상태를 `not_connected`로 정의한다.
UI prototype을 추가하더라도 실제 API 연동 전에는 이 값을 바꾸지 않는다.

## 3. 화면의 목적과 한계

### 3.1 목적

- 알리닷의 영상 등록 UX를 한 화면에서 설명한다.
- 내부 UX 검토와 향후 실연동 화면의 기반을 준비한다.
- 운영자가 영상·메타데이터·권리를 확인한 뒤 등록하는 흐름을 보여준다.
- 향후 실제 API를 연결하더라도 화면 구조를 다시 만들지 않게 한다.

### 3.2 한계

TikTok 공식 검토 지침은 선택한 제품과 scope의 실제 작동 장면을 요구한다. 따라서
UI만 구현된 상태는 다음 의미다.

- 제품 UX와 화면 준비: 완료 가능
- TikTok Sandbox API 검증: 미완료
- 실제 앱 심사 요건 충족: 보장 불가
- 실제 업로드 성공 증빙: 제공 불가

시연 모드 화면을 실제 API 성공 화면이라고 제출하지 않는다. 화면에는 내부 운영자만
볼 수 있는 `UI 시연 모드 · TikTok 전송 안 함` 상태를 분명히 표시한다.

### 3.3 임시 화면의 수명 관리

이 화면은 "임시" 개발물로 기획되었으므로, 존속 기간과 제거·전환 조건이 문서에
있어야 한다. 조건이 없으면 내부 검토 목적이 끝난 뒤에도 미사용 admin 화면이
`/cam` 메뉴와 배포에 무기한 남는다.

다음 세 갈래 중 실제로 벌어진 결과에 따라 처리한다.

1. **내부 UX 검토가 끝나면**: 외부 사용자 대상 제품화 여부를 결정하고, 제품화를
   선택한 경우에만 실제 OAuth·Content Posting 연동을 별도 기획한다.
2. **내부 전용 도구로 유지하면**: Production 심사를 제출하지 않고 이 화면을
   내부 prototype으로 유지할지 제거할지 30일 안에 결정한다.
3. **알리닷 프로젝트 자체가 보류·중단되면**: 화면을 `/cam` 메뉴에서 제거하거나
   feature flag로 접근을 차단한다.

prototype 배포 후 30일 안에 대표자가 존속 여부를 재검토한다. 이 재검토 없이
화면이 무기한 프로덕션에 남지 않게 한다.

## 4. 사용자와 권한

### 4.1 역할

| 역할 | 접근 | 가능한 작업 |
|---|---:|---|
| reporter | 불가 | 메뉴 비노출, middleware에서 기사 관리로 이동 |
| admin | 가능 | 영상 선택·메타데이터 작성·시연·로컬 상태 초기화 |
| superadmin | 가능 | admin과 동일한 1차 prototype 기능 |

### 4.2 보안 기준

- `cp-admin-auth` 쿠키에서 서버가 actor와 role을 확인한다.
- request body의 사용자명·role을 신뢰하지 않는다.
- 관리자 인증에 `CRON_SECRET`이나 Worker secret을 사용하지 않는다.
- 1차에는 서버 mutation과 전용 API를 만들지 않는다. 후속 서버 mutation이 생길
  때만 same-origin, CSRF, idempotency, rate limit을 적용한다.
- TikTok client secret이나 token 입력란을 만들지 않는다.
- 실제 파일 경로와 관리자 개인정보를 로그에 남기지 않는다.
- `src/middleware.ts`의 `REPORTER_ALLOWED_PATHS` allowlist에
  `/cam/alidot/tiktok-review`를 추가하지 않는다. 이 목록에 없는 `/cam` 하위
  경로는 reporter 접근 시 이미 `/cam/articles`로 자동 리다이렉트되므로,
  이 기존 동작을 그대로 이용하고 별도 role 분기 코드를 새로 만들지 않는다.

## 5. 정보 구조

```text
알리닷 TikTok 영상 등록
├── 환경 상태
├── 연결 계정
├── 영상 선택
├── 영상 미리보기
├── 게시 정보
├── 콘텐츠 확인
├── 게시 설정
├── 최종 확인
└── 시연 결과
```

페이지를 여러 단계 route로 나누지 않고 한 route 안의 단계형 작업 화면으로 만든다.
1차에는 입력을 React 메모리 상태로만 유지하고 session/local storage를 사용하지
않는다. 새로고침하면 영상과 메타데이터를 모두 초기화해 잔존 정보와 상태 불일치를
방지한다.

## 6. 화면 상세 설계

### 6.1 상단 상태 표시

화면 제목: `알리닷 TikTok 영상 등록`

상태 영역:

- 환경: `UI 시연 모드`
- TikTok API: `연결 안 됨`
- 전송 기능: `비활성`
- 공개 정책: 소개·약관·개인정보 URL 상태
- 마지막 시연 초기화 시각

상태는 색상만으로 구분하지 않고 아이콘과 텍스트를 함께 사용한다.

### 6.2 1단계: 연결 계정

TikTok 계정이 연결된 뒤 표시될 UI 구조를 보여준다.

- 프로필 이미지 자리
- 표시 이름
- 계정 식별 별칭
- 연결 상태
- 향후 요청 예정 권한: `user.info.basic`, `video.upload`
- `TikTok 계정 연결` 버튼

1차 시연 모드에서 버튼을 누르면 TikTok OAuth 성공을 흉내 내지 않는다. 대신 다음
안내 modal을 표시한다.

> 현재 화면은 UI 시연 모드입니다. 실제 TikTok 로그인과 권한 승인은 연결되지
> 않았습니다.

시연을 위해 계정 영역이 필요하면 설정 파일에 정의된 `TikTok 테스트 계정`이라는
중립적인 fixture를 사용하고, 프로필 영역에 `예시 데이터` 라벨을 항상 표시한다.

### 6.3 2단계: 영상 선택

입력 방식:

- 로컬 MP4/MOV 파일 선택
- drag and drop
- 파일 선택 버튼

검사 항목:

- 확장자와 MIME type
- 파일 크기
- 영상 재생 가능 여부
- 길이·가로세로 크기
- 세로형 비율 권장 경고
- 중복 파일 hash는 1차 범위에서 제외한다. 대용량 파일 전체 hash는 브라우저 메모리와
  메인 스레드에 불필요한 부하를 줄 수 있다.

1차 시연에서는 파일을 브라우저 메모리에서만 읽고 Vercel이나 저장소로 업로드하지
않는다. 새로고침하면 파일 선택은 초기화된다. `URL.createObjectURL()`로 만든 preview
URL은 파일 교체, 초기화와 component unmount 때 반드시 `URL.revokeObjectURL()`로
해제한다.

### 6.4 3단계: 영상 미리보기

- 9:16 세로형 preview 영역
- 재생·일시정지·음소거·전체화면 컨트롤
- 영상 길이, 해상도, 크기 표시
- poster가 없을 때 첫 프레임 미리보기
- 파일명은 촬영 영상에 개인정보가 노출되지 않도록 축약 표시
- 미지원 파일이면 입력 근처에 복구 방법을 표시

TikTok UI를 복제하지 않고 알리닷 관리자 화면으로 디자인한다.

### 6.5 4단계: 게시 정보

필드:

- 제목
- 설명·캡션
- 해시태그
- 콘텐츠 언어
- 내부 관리 메모

원칙:

- label을 항상 표시하고 placeholder만으로 설명하지 않는다.
- 글자 수를 실시간 표시한다.
- 해시태그는 중복·공백·금지문자 검사 후 정규화한다.
- 내부 관리 메모는 TikTok 전송 대상이 아님을 명시한다.
- AI가 제목이나 캡션을 자동 생성하는 기능은 이번 범위에서 제외한다.

### 6.6 5단계: 콘텐츠 확인

필수 확인:

- 영상·음원·이미지·인물에 필요한 권리를 보유함
- 제3자 플랫폼 워터마크를 제거한 복제물이 아님
- 개인정보 또는 민감정보가 포함되지 않음
- TikTok 커뮤니티 가이드라인을 확인함
- AI 생성·변형 콘텐츠 해당 여부
- 광고·브랜드 콘텐츠 해당 여부

권리 확인이 완료되지 않으면 최종 등록 단계로 이동할 수 없다. 실제 API가 없어도
이 gate는 UI에서 완전하게 동작해야 한다.

### 6.7 6단계: 게시 설정

1차 시연 UI에서는 TikTok이 실제 제공하는 선택지를 조회하지 못하므로 다음처럼
처리한다.

- 게시 방식: `TikTok 받은편지함 업로드 예정` 고정 표시
- 공개 범위: `TikTok에서 최종 선택` 안내
- 댓글·듀엣·이어붙이기: `TikTok에서 최종 확인` 안내
- 자동 공개 게시: 제공하지 않음
- 예약 게시: 제공하지 않음

실제 API의 `creator_info` 응답을 받은 것처럼 공개 범위 선택지를 꾸미지 않는다.

### 6.8 7단계: 최종 확인

최종 화면에서 다음을 한 번에 보여준다.

- 선택 영상 preview
- 제목·캡션·해시태그
- 콘텐츠 권리 확인 결과
- AI·광고 표시 여부
- 대상 계정이 예시인지 실제인지
- API 연결 상태

버튼:

- `이전 단계`
- `시연 초기화`
- `등록 흐름 확인`

실제 API가 없는 상태에서 버튼 이름을 `TikTok 업로드`, `게시`, `전송 완료`로 만들지
않는다.

### 6.9 8단계: 시연 결과

`등록 흐름 확인`을 누르면 다음 결과만 표시한다.

- `UI 입력 검증 완료`
- 파일 검증 결과
- 메타데이터 검증 결과
- 권리 확인 결과
- `TikTok API 호출 없음`
- `TikTok에 영상이 전송되지 않았습니다`

결과를 JSON으로 다운로드하는 기능은 선택 사항이다. 다운로드 데이터에 영상 본체,
브라우저 파일 경로, 관리자 계정명은 포함하지 않는다.

## 7. UI·UX 방향

### 7.1 디자인 원칙

- 기존 `/cam` 관리자 화면과 일치하는 조용하고 밀도 높은 업무형 UI
- hero와 마케팅형 문구 금지
- 카드 중첩 금지
- 단계 진행 상태가 화면의 주된 구조
- 익숙한 동작에는 lucide 아이콘 사용
- emoji 신규 사용 금지
- radius 8px 이하
- 기존 관리자 디자인 토큰 우선 사용

### 7.2 레이아웃

```text
┌──────────────────────────────────────────────────────────┐
│ 알리닷 TikTok 영상 등록       UI 시연 모드 | API 미연결 │
├──────────────┬───────────────────────────┬───────────────┤
│ 단계 목록    │ 입력·미리보기 작업 영역  │ 검증 요약     │
│ 1 계정       │                           │ 파일          │
│ 2 영상       │                           │ 게시 정보     │
│ 3 정보       │                           │ 권리          │
│ 4 확인       │                           │ API 상태      │
└──────────────┴───────────────────────────┴───────────────┘
```

- 1024px 이상: 3열
- 768px: 단계 목록 + 작업 영역, 검증 요약은 하단
- 375px: 단계 segmented control, 단일 열
- preview는 안정적인 `aspect-ratio: 9 / 16` 사용
- 동적 오류 문구 때문에 버튼이나 preview 크기가 변하지 않게 한다.

### 7.3 접근성

- 모든 입력에 visible label
- 오류는 해당 입력 아래 표시
- 오류·검증 완료는 `aria-live`로 전달
- 키보드만으로 단계 이동 가능
- focus ring 제거 금지
- 버튼 최소 높이 44px
- 명암비 WCAG AA
- 색상 외 아이콘·텍스트 상태 병행
- `prefers-reduced-motion` 존중

## 8. 데이터와 저장 정책

### 8.1 1차 구현

- 영상 파일: 브라우저 메모리에서만 사용
- 메타데이터: 브라우저 메모리에서만 사용
- TikTok 계정: fixture 또는 미연결 상태만 표시
- OAuth token: 처리하지 않음
- 업로드 결과: 생성하지 않음
- 서버 DB migration: 불필요
- 운영 DB 쓰기: 없음

### 8.2 fixture 기준

예시 데이터는 코드에서 다음처럼 분리한다.

```ts
type TikTokReviewFixture = {
  displayName: "TikTok 테스트 계정";
  accountType: "fixture";
  avatarUrl: null;
  plannedScopes: ["user.info.basic", "video.upload"];
};
```

- fixture에는 실제 open ID·계정명·프로필 사진을 넣지 않는다.
- 모든 fixture 영역에 `예시 데이터`를 표시한다.
- production 빌드에서도 fixture를 실제 연결 상태로 바꿀 수 없게 한다.

## 9. 예상 구현 파일

아래 항목은 구현됐다.

```text
src/app/cam/alidot/tiktok-review/page.tsx
src/app/cam/alidot/tiktok-review/TikTokReviewForm.tsx
src/lib/tiktok-review/types.ts
src/lib/tiktok-review/validation.ts
src/lib/tiktok-review/fixture.ts
scripts/verify-tiktok-review-page.mjs
tests/unit/tiktok-review-validation.test.ts
tests/unit/tiktok-review-auth.test.ts
tests/unit/tiktok-review-page-contract.test.ts
```

기존 수정 반영:

```text
src/app/cam/layout.tsx                  관리자 메뉴 추가
scripts/browser-smoke.mjs               --tiktok-review-only 모드 추가
next.config.ts 또는 page metadata       noindex 응답 보장
package.json                            검증 명령 추가
docs/tiktok-alidot-public-pages-plan.md 상태·연동 문서 연결
```

실제 개발 시 `src/app/cam/layout.tsx`에 남아 있는 emoji 중심 메뉴를 이번 작업에서
전면 개편하지 않는다. 신규 메뉴 항목만 기존 구조에 맞추고 별도 UI 부채로 기록한다.

## 10. 서버 경계

1차 화면은 고정된 `ui_demo`, `not_connected` 상태와 브라우저 로컬 파일만 사용하므로
전용 API를 만들지 않는다. 상태를 읽기 위해 API route를 추가하면 얻는 이점 없이
새 인증 surface만 늘어난다.

- page route: 기존 `/cam` middleware 인증 사용
- reporter: 현재 allowlist에 경로를 추가하지 않아 `/cam/articles`로 이동
- admin/superadmin: 정상 접근
- metadata: page server wrapper에서 `noindex, nofollow, noarchive` 명시
- 파일·메타데이터: 브라우저 밖으로 전송하지 않음
- cache: 기존 `/cam/(.*)`의 `no-store` 유지
- 전용 GET/POST API와 D1 migration: 만들지 않음

향후 실제 연동을 기획할 때만 별도 API 인증·토큰 저장·감사 구조를 설계한다.

## 11. 단계별 개발 계획

### P0. 계약과 가드

**목적:** 내부 prototype이 실제 연동 또는 승인 준비 완료로 오인되지 않게 한다.

- Production 심사 제출 금지 상태를 문서와 화면에 명시
- 상태 타입과 fixture 계약 작성
- API 미연결 고정 상태
- 접근 권한과 noindex 테스트
- 금지 문구 테스트: `업로드 완료`, `게시 성공`, `연결 완료`
- 완료 기준: 코드 변경만으로 fixture가 실제 성공 상태가 될 수 없음

### P1. 영상 등록 UI

**목적:** 영상 선택부터 최종 검증까지 촬영 가능한 화면을 완성한다.

- 파일 선택·미리보기
- 게시 정보 입력
- 콘텐츠 확인
- 단계 이동과 validation
- 최종 검증 결과
- 반응형·키보드·접근성
- 완료 기준: 실제 API 없이도 모든 UI 흐름과 오류 상태를 검증 가능

### P2. 관리자 연결

**목적:** 내부 관리자에서 안전하게 접근한다.

- 관리자 메뉴 추가
- admin/superadmin 권한 적용
- server page metadata로 noindex 보장
- 공개 sitemap·navigation 제외
- 완료 기준: 일반 사용자와 reporter가 접근할 수 없음

### P3. 촬영 준비

**목적:** 내부 의사결정용 walkthrough 자료를 준비한다.

- 샘플 MP4 선정
- 민감정보 없는 fixture 확정
- 예정 제품·scope와 실제 미구현 상태 체크리스트
- 데스크톱 촬영 동선 정리
- 완료 기준: 영상 촬영 시 UI가 끊기지 않고 모든 단계가 보임

### P4. 실제 연동 재평가

이번 범위에서 구현하지 않는다. 외부 사용자 대상 제품화가 확정된 경우에만 실제
OAuth·API 전송을 별도 기획한다. 현재 내부 전용 상태로 Production 심사를 먼저
제출하지 않는다.

## 12. 테스트 계획

### 12.1 신규 명령

다음 명령은 구현됐다.

```bash
pnpm verify:tiktok-review -- --base http://127.0.0.1:3000
pnpm test:unit -- tiktok-review
```

### 12.2 전체 검증

```bash
pnpm ci:typecheck
pnpm test:unit
pnpm verify:alidot-pages -- --base http://127.0.0.1:3000/alidot --site-type all
pnpm smoke:browser -- --base-url=http://127.0.0.1:3000 --tiktok-review-only --json
```

`--tiktok-review-only`는 `scripts/browser-smoke.mjs`에 구현됐다. 로컬 실행은
프로젝트의 `COOKIE_SECRET`을 사용하며, 값이 없는 로컬 테스트에서만 개발 전용
fallback으로 서명한다. 운영 URL 검증에는 `SMOKE_ADMIN_AUTH_TOKEN`이 필요하다.
운영 URL에서 실행하려면 기존 규칙대로 `--allow-remote-admin-auth`의 위험을 별도
검토하고, 기본 검증은 로컬에서 수행한다.

### 12.3 필수 테스트

- 미인증 접근 차단
- reporter 접근 시 기존 정책대로 `/cam/articles` 이동
- admin/superadmin 200
- HTML robots 또는 `X-Robots-Tag` noindex와 sitemap 제외
- MP4/MOV 허용, 잘못된 MIME 거부
- 파일 크기·영상 길이·해상도 표시
- 권리 확인 전 최종 단계 차단
- API 미연결 상태 고정
- fixture에 `예시 데이터` 표시
- TikTok API 호출 0건
- 서버 영상 업로드 0건
- preview object URL 생성·교체·unmount 시 해제
- secret/token DOM·응답·로그 0건
- 새로고침 시 영상 파일과 메타데이터 모두 초기화
- 375/768/1024/1440px 가로 스크롤 없음
- keyboard·focus·aria-live

## 13. 내부 walkthrough 촬영 시나리오

1. `/alidot`에서 서비스명과 공개 약관 링크를 보여준다.
2. 관리자 로그인 후 `/cam/alidot/tiktok-review`로 이동한다.
3. `UI 시연 모드 · TikTok API 미연결` 상태를 보여준다.
4. 테스트 MP4를 선택한다.
5. 9:16 미리보기와 영상 정보를 보여준다.
6. 제목·캡션·해시태그를 입력한다.
7. 권리·AI·광고 여부를 확인한다.
8. 게시 설정 안내를 확인한다.
9. 최종 검증 화면으로 이동한다.
10. `UI 입력 검증 완료 · TikTok 전송 없음` 결과를 보여준다.
11. `/alidot/privacy#data-deletion`을 보여준다.

이 촬영본은 제품 화면과 UX를 내부에서 설명하는 자료다. 공식 심사 제출 영상으로
사용하지 않는다. TikTok 공식 기준은 Sandbox의 실제 end-to-end 통합, 선택한 모든
제품·scope와 사용자 상호작용을 요구한다.

## 14. 내부 prototype 설명 문구

실제 API가 없는 1차 화면을 내부에서 설명할 때만 다음 문구를 사용한다.

```text
알리닷은 컬피가 운영하는 숏폼 콘텐츠 등록 관리 도구입니다. 인가된 운영자는
관리자 화면에서 등록할 영상을 선택하고 미리보기, 제목, 설명, 해시태그와 콘텐츠
권리·AI·광고 여부를 확인합니다. 최종 확인 단계에서는 선택한 영상과 게시 정보를
한 번 더 검증합니다.

현재 화면은 알리닷의 영상 등록 사용자 인터페이스와 사용자 승인 흐름을
검토하기 위한 내부 prototype입니다. TikTok 계정 연결과 Content Posting API 전송 기능은 현재
활성화되어 있지 않으며, 사용자 승인 없이 영상을 자동 공개 게시하지 않습니다.
공개 웹페이지에서는 서비스 소개, 이용약관, 개인정보처리방침과 데이터 삭제 안내를
제공합니다.
```

이 문구는 TikTok App Review 입력란에 사용하지 않는다. 실제 Login Kit·Content
Posting API를 구현한 뒤 앱 설명을 실제 동작 기준으로 새로 작성해야 한다.

## 15. 완료 기준

- 외부 메시징·영상 자동화 프로젝트 관련 구현이 없음
- 외부 공개는 알리닷 3페이지뿐임
- 관리자 영상 등록 화면이 완전한 단계형 UX를 제공함
- 실제 TikTok 연동이 없다는 상태가 명확함
- Production 심사 제출 금지 상태가 명확함
- 영상 파일이 서버로 전송되지 않음
- 실제 API 성공을 흉내 내지 않음
- admin/superadmin만 접근 가능
- 전체 단위·타입·브라우저 테스트 통과
- 배포 후 공개 사이트에 관리자 기능이 노출되지 않음

### 15.1 2026-08-04 검증 결과

- `pnpm build`: 성공, `/cam/alidot/tiktok-review` 빌드 산출물 확인
- `pnpm test:unit`: 107개 파일, 526개 테스트 통과
- `pnpm ci:typecheck`: 통과
- `pnpm verify:tiktok-review -- --base http://127.0.0.1:3000`: 15개 계약 검사 통과
- `pnpm verify:alidot-pages -- --base http://127.0.0.1:3000/alidot --site-type all`: 공개 URL 3개와 사이트 타입 3개 통과
- `pnpm smoke:browser -- --base-url=http://127.0.0.1:3000 --tiktok-review-only --json`: 375/768/1024/1440px 전체 통과
- H.264 fixture는 Linux Headless Chromium의 codec 제약으로 메타데이터 이벤트를
  테스트에서만 모사했다. 실제 브라우저에서는 로컬 object URL로 재생한다.
- 운영 배포와 production URL 인증 검증은 배포 완료 전까지 미완료로 유지한다.

## 16. 위험과 중단 조건

| 위험 | 대응 |
|---|---|
| 실제 연동 없이 앱 심사를 제출하려 함 | 제출 중단; 공식 Sandbox end-to-end 요건 확인 |
| 시연 모드를 실제 성공으로 오인 | 고정 경고·예시 라벨·금지 문구 테스트 |
| 영상이 Vercel로 업로드됨 | network 테스트 실패 처리, 서버 route 미구현 유지 |
| fixture에 실제 계정 정보 사용 | 비식별 fixture로 교체 후 촬영 |
| 관리자 화면 검색 노출 | noindex·middleware·sitemap 테스트로 차단 |
| 운영 정책이 실제 연동을 약속 | `not_connected` 유지 및 법적 문구 감사 |
| "임시" 화면이 방치되어 영구 admin surface가 됨 | 3.3의 수명 관리 기준과 30일 재검토 주기 적용, 제거 조건 미리 정의 |

## 17. 대표자 확인 항목

- [ ] 시연에 사용할 권리 확보된 MP4 한 개
- [ ] 화면에 사용할 테스트 제목·캡션·해시태그
- [ ] AI 생성 또는 광고 콘텐츠 여부
- [ ] 실제 TikTok 계정 정보를 fixture에 사용하지 않는 데 동의
- [ ] TikTok 포털에서 불필요한 제품·scope 제거
- [ ] 현재 내부 전용 상태에서는 Production 심사를 제출하지 않음 확인
- [ ] 외부 사용자 대상 제품으로 전환할 계획이 있는지 결정
- [ ] 실제 API 연동을 별도 진행할지 결정
- [ ] 내부 UX 검토 후 이 화면의 유지·제거 재검토 시점 확정

## 18. 다음 개발 프롬프트

```text
docs/tiktok-alidot-admin-review-console-plan.md를 기준으로 알리닷 TikTok 연동 전
영상 등록 UI prototype만 끝까지 구현해줘.

- 외부에는 기존 /alidot, /alidot/terms, /alidot/privacy만 유지해.
- /cam/alidot/tiktok-review는 admin/superadmin만 접근하게 해.
- 외부 메시징·영상 자동화 프로젝트, TikTok OAuth, token 저장, Content Posting API, 실제
  업로드, 자동 게시 기능은 구현하지 마.
- 영상은 브라우저 메모리에서만 읽고 서버나 Vercel로 전송하지 마.
- 영상 선택, 9:16 미리보기, 제목·캡션·해시태그, 권리·AI·광고 확인, 게시 설정
  안내, 최종 검증 결과까지 단계형 UI로 완성해.
- 모든 화면에 UI 시연 모드와 TikTok API 미연결 상태를 정확히 표시해.
- Production 심사 제출 금지 상태를 표시하고 승인·제출 가능 표현을 사용하지 마.
- fixture는 예시 데이터로 표시하고 가짜 OAuth 성공·업로드 성공을 만들지 마.
- 기존 /cam 디자인과 lucide 아이콘을 사용하고 모바일·키보드·접근성을 완성해.
- 전용 API route나 D1 migration은 만들지 마.
- reporter의 기존 /cam/articles 이동, page noindex, sitemap 제외, TikTok API 호출
  0건, 서버 업로드 0건을 테스트해.
- 신규 verify:tiktok-review 명령과 관련 단위 테스트를 추가해.
- browser-smoke.mjs에 --tiktok-review-only 검증 모드를 추가해.
- typecheck, unit test, browser smoke를 통과한 뒤 기존 release gate로 안전하게
  배포하고 라이브 관리자 접근과 공개 비노출을 확인해.
```

## 19. 공식 참고 문서

- App Review Guidelines:
  `https://developers.tiktok.com/doc/app-review-guidelines`
- Login Kit:
  `https://developers.tiktok.com/doc/login-kit-overview`
- Content Posting Upload API:
  `https://developers.tiktok.com/doc/content-posting-api-reference-upload-video`
- Content Sharing Guidelines:
  `https://developers.tiktok.com/doc/content-sharing-guidelines/`
