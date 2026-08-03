# 알리닷 TikTok 연동 공개 3페이지 구축 기획서

- 기준일: 2026-08-03
- 운영 사업자명: `컬피`
- 뉴스 사이트명: `컬처피플`
- TikTok 연동 서비스명: `알리닷`
- 권장 공개 주소: `https://culturepeople.co.kr/alidot`
- 현재 범위: 공개 3페이지·법적 명칭 정규화·테스트·배포 gate 구현. TikTok OAuth,
  Content Posting, URL ownership 제출과 audit은 별도 단계다.

> 이 문서는 TikTok 공식 개발자 문서와 현재 확인된 프로젝트 구조를 바탕으로 한
> 개발·운영 기획서다. 법률 자문을 대신하지 않는다. 개인정보 처리 항목, 보유
> 기간, 국외 이전, 책임자 정보는 실제 알리닷 구현 및 사업자등록 정보와 대조한
> 뒤 확정해야 한다.

## 0. 구현 상태

2026-08-03 코드 기준 상태다. 실행하지 않은 작업을 완료로 간주하지 않는다.

| 구분 | 상태 | 근거 |
|---|---|---|
| 알리닷 3페이지와 공통 shell | 구현 완료 | `/alidot`, `/alidot/terms`, `/alidot/privacy`, `src/lib/alidot-legal.ts` |
| 세 사이트 타입 | 구현·로컬 검증 완료 | 공용 `site-type-options`, 9개 조합 단위 테스트, 375/768/1024/1440px 검사 |
| 기존 사업자명 정규화 | 코드 완료 | 공개 fallback·metadata 정정, 관리자 재유입 차단, audit/normalize 명령 |
| 운영 설정 apply | 안전한 no-op 완료 | `cp-terms=null`, `cp-about.companyName=컬피`라 변경 0건; 권한 0600 rollback 기록 보존 |
| SEO·푸터 연결 | 구현 완료 | 일반 sitemap과 세 Footer에 포함, news-sitemap 제외, index/follow canonical |
| 알리닷 추적 제한 | 구현 완료 | `/alidot` 하위에서 광고·방문분석·Kakao·FloatingAds 비실행 |
| 단위·타입 검사 | 완료 | 104개 파일 511개 단위 테스트 통과, TypeScript 검사 통과 |
| 운영 배포 | 진행 전 | clean release·preview gate·production 배포 및 라이브 검증 필요 |
| TikTok OAuth/게시/audit | 미구현·blocked | 실제 제품 구현과 TikTok 콘솔 승인·URL ownership 값 필요 |
| 기존 법적 정책 대표자 승인 | blocked | 운영 `cp-terms`가 비어 있고 청소년보호책임자 등 승인 기록이 없음 |

## 1. 결론

### 1.1 가능한 것

현재처럼 알리닷 단독 사이트에 표시할 제품·지원 정보가 충분하지 않은 단계에서는
완성된 컬처피플 사이트 안에 **알리닷 전용 3페이지**를 별도 경로로 만드는 것이
가장 현실적이다. 뉴스 기사·뉴스 약관과 알리닷 정책은 분리하되 같은 운영 주체가
제공한다는 관계를 명확히 보여준다.

| 역할 | 공개 URL | TikTok 입력 용도 |
|---|---|---|
| 알리닷 공식 웹사이트 | `https://culturepeople.co.kr/alidot` | Web/Desktop Website URL |
| 알리닷 이용약관 | `https://culturepeople.co.kr/alidot/terms` | Terms of Service URL |
| 알리닷 개인정보처리방침 | `https://culturepeople.co.kr/alidot/privacy` | Privacy Policy URL |

데이터 삭제 및 TikTok 연결 해제 안내는 별도 네 번째 페이지를 만들지 않고
`/alidot/privacy#data-deletion`에 독립 절로 제공한다. 향후 TikTok 또는 다른 플랫폼이
별도 삭제 URL을 요구하면 그때 `/data-deletion`을 추가한다.

### 1.2 불가능하거나 승인 위험이 큰 것

다음 방식은 Production 심사를 목표로 할 때 사용할 수 없다.

- PC 안에서만 열리는 HTML, `localhost`, 사설 IP
- 로그인해야만 읽을 수 있는 페이지
- TikTok 심사 기간에만 잠깐 열었다 닫는 페이지
- 홈페이지 없이 약관·개인정보처리방침 파일 URL만 제출하는 방식
- 빈 랜딩 페이지 또는 기능 설명 없이 로고와 링크만 있는 페이지
- 컬피 내부 운영 도구인데 외부 창작자용 공개 서비스라고 허위 설명하는 방식

TikTok App Review Guidelines는 Web/Desktop 앱에 외부에서 접근 가능한 완성된
공식 웹사이트를 요구하고, 해당 Website URL 화면에서 메뉴를 열지 않아도
Privacy Policy와 Terms of Service 링크가 보여야 한다고 명시한다. 따라서
**웹에 전혀 올리지 않는 선택은 Production 심사와 양립하지 않는다.**

### 1.3 “웹사이트에 안 올린다”의 현실적인 해석

- `culturepeople.co.kr` 뉴스 메인에 노출하지 않는 것: 가능
- 컬처피플 news-sitemap과 기사 화면에 섞지 않는 것: 가능
- 컬처피플 일반 sitemap에는 공개 서비스 페이지로 포함하는 것: 권장
- `/alidot` 아래에서 뉴스 서비스와 구분된 디자인·정책을 운영하는 것: 권장
- 별도 서브도메인 운영: 알리닷 자체 제품·고객지원 정보가 충분해진 뒤 재검토
- 인터넷에서 전혀 접근할 수 없게 하는 것: Production 심사에서는 불가

이 기획서의 기본안은 **컬처피플 도메인의 신뢰 기반을 사용하되 뉴스 기사·기존
약관과는 경로와 본문을 분리하고, 알리닷 3페이지를 공개 HTTPS로 상시 운영**하는
것이다.

### 1.4 페이지 개설이 실제 API 인가로 이어지는가: 냉정한 평가

**결론부터 말하면 페이지 개설은 심사 "신청 자격"을 채우는 필요조건이지,
승인이나 원래 목적(자동 공개 업로드) 달성을 보장하는 충분조건이 아니다.**

#### 페이지가 실제로 기여하는 부분

- Domain/URL prefix 소유권 검증을 통과할 수 있게 한다 — 순수 기술 요건이라
  페이지 품질과 무관하게 해결된다.
- "Website URL이 단순 랜딩 페이지"라는 반려 사유를 없앤다.
- "홈페이지에서 약관·개인정보 링크가 안 보인다"는 반려 사유를 없앤다.
- 즉 **서류 심사 단계의 흔한 형식적 반려 사유를 제거하는 효과는 분명하다.**

#### 페이지만으로는 해결되지 않는, 승인 여부를 실제로 좌우하는 세 가지

1. **알리닷이 진짜 다중 사용자 서비스인가, 컬피 자체 계정 자동화 도구인가.**
   TikTok 가이드라인은 개인적·사적 용도만을 위한 서비스, 그리고 개인·내부 팀
   계정만 관리하는 업로드 도구를 공개(Production) 심사의 적합한 대상으로 보지
   않는다. 알리닷의 실제 목적이 컬피가 자사 콘텐츠를 자사 TikTok 계정 하나에
   자동 업로드하는 것이라면, 5.3의 페이지 초안처럼 "이용자"가 다수 존재하고
   각자 "적법한 이용 권한을 가진 영상"을 게시한다는 서술은 실제와 다른 설명이
   되어 1.2에서 이미 금지한 "허위 설명"을 스스로 만드는 셈이 된다. **페이지를
   아무리 정교하게 만들어도 이 실체 불일치는 해결되지 않으며, 페이지가
   정교할수록 실사 단계에서 불일치가 더 뚜렷하게 드러날 수 있다.**
2. **공개 게시(Direct Post)를 하려면 페이지 심사와 별개로 TikTok audit을
   통과해야 한다.** 정확히는 Production App Review가 앱과 요청 product/scope의
   Live 사용 자격을 판단하고, Direct Post audit은 콘텐츠 공개 제한을 해제하기
   위한 추가 준수 검증이다. 2.3에서 다루듯 미감사(unaudited) 클라이언트는
   게시물이 `SELF_ONLY`(본인만 확인 가능)로 제한된다. 3페이지가 공개되고 앱이
   Production 승인을 받아도, audit을 별도로 통과하지 못하면 "자동 업로드"의
   결과물은 비공개로 남는다. **틱톡 영상 자동 업로드라는 원래 목적을
   달성하려면 페이지 심사 통과는 여러 단계 중 하나일 뿐이며, audit이 더 큰
   장벽이다.**
3. **요청 scope와 실제 제품 UX 구현의 일치 여부.** TikTok Content Posting API
   심사는 최신 creator info 조회, 게시 미리보기, 공개 범위·참여 설정 선택,
   광고·AI 생성 표시, 사용자의 명시적 최종 승인 같은 실제 동작을 데모 영상으로
   확인한다. 이는 웹페이지가 아니라 `shorts-automation` 쪽 실제 구현의
   문제이며, 2.3에서 확인했듯 현재 TikTok OAuth·Content Posting 구현 자체가
   확인되지 않은 상태에서는 페이지 완성도와 무관하게 이 단계에서 막힌다.

#### 결론

"페이지 개설이 API 서비스 인가에 도움이 되는가"에는 **부분적으로 그렇다**고
답할 수 있다. 형식적 반려 사유를 없애는 효과가 있기 때문이다. 그러나
"실질적으로 승인 가능한가"에는 **페이지만으로는 답할 수 없다**. 승인 가능성과
목적 달성 여부는 위 세 가지, 특히 (1) 알리닷의 실제 사용자 실체와 (2) audit
통과 여부에 훨씬 더 크게 좌우된다. 대표자는 페이지 착수와 별개로 다음을 먼저
결정해야 낭비를 줄일 수 있다.

- 알리닷을 실제로 외부 다중 창작자가 쓰는 제품으로 만들 계획인가, 아니면 컬피
  자체 계정 자동화가 목적인가. 후자라면 Sandbox는 기술 검증에만 사용하고,
  실제 공개 운영은 TikTok Studio 또는 수동 게시를 유지하는 편이 현실적이다.
  Sandbox를 자사 계정의 무인 공개 게시 운영 수단으로 간주하면 안 된다.
- 공개 게시(`SELF_ONLY` 아님)가 반드시 필요한 시점은 언제이며, 그 전까지 비공개
  게시로도 목적을 달성할 수 있는지.

#### 참고: 동일 주제의 선행 기획서와 라이브 표기 불일치

`/home/arbada/shorts-automation/docs/tiktok-culturepeople-site-requirements-plan.md`에
같은 목적의 기획서가 이미 존재한다. 그 문서는 페이지를 4개(데이터 삭제 안내를
별도 URL `/alidot/data-deletion`으로 분리)로, 앱 이름을 `알리닷 by 컬처피플`로
제안하며, 2026-08-03 기준 라이브 사이트를 직접 조회해 다음을 확인했다고
기록하고 있다. 이 문서 작성 중 동일 시점에 재조회한 결과도 같다.

- `culturepeople.co.kr/about`: 상호 `컬피`, 대표자 `이서련`, 사업자등록번호
  `543-26-01016`으로 표기됨.
- `culturepeople.co.kr/terms`: 회사명을 `(주)컬처피플미디어`로 표기하며
  대표자·사업자등록번호는 표기하지 않음.

두 표기가 이미 라이브에서 불일치하므로 알리닷 페이지 게시 전 반드시 하나로
통일해야 한다. 페이지 개수와 앱 이름은 대표자가 이번 대화에서 **앱 이름
`알리닷`, 사업자명 `컬피`, 컬처피플 도메인 안의 3페이지**로 확정했다. 따라서
이 문서를 구현 기준 문서로 사용하며, shorts-automation의 선행 4페이지 기획서는
`superseded` 상태로 취급한다. 선행 문서를 삭제하지는 말고 상단에 이 문서로
대체되었다는 안내를 추가해야 한다.

이 통일은 알리닷 3페이지에만 한정하지 않는다. 컬처피플의 기존 `/terms`,
`/privacy`, `/about`, `/contact`, `/advertising`, `/youth-policy`와 해당 metadata,
푸터, 법적 fallback, 관리자 법적 설정에서 **운영 사업자를 뜻하는
`(주)컬처피플미디어` 또는 `컬처피플미디어` 표기를 `컬피`로 정정**해야 한다.
단, 기사 본문·인용문·과거 기록에서 다른 법인을 지칭하는 문자열은 일괄 치환하지
않는다.

## 2. 공식 요구사항과 판단 근거

### 2.1 TikTok 앱 심사

2026-08-03 확인 기준 TikTok 공식 문서는 다음을 요구한다.

1. 앱 이름과 아이콘은 실제 앱·웹사이트 브랜드와 일치해야 한다.
2. 앱 설명은 실제 기능과 작동 방식을 설명해야 한다.
3. 앱은 개인적·사적 용도만을 위한 서비스여서는 안 된다.
4. 개발 중이거나 테스트뿐인 서비스는 Production 승인을 받을 수 없다.
5. Website URL은 서비스 정보를 담은 외부 공개 공식 웹사이트여야 한다.
6. Website URL은 단순 랜딩 페이지나 로그인 페이지여서는 안 된다.
7. 홈페이지에서 약관과 개인정보처리방침 링크를 메뉴를 열지 않고 볼 수 있어야 한다.
8. 심사 영상에는 최신 통합 기능의 처음부터 끝까지 흐름과 사용자 상호작용이 보여야 한다.
9. Web 앱 심사 영상의 도메인은 제출한 Website URL 도메인과 일치해야 한다.

### 2.2 URL 소유권 확인

2024-09-09 이후 생성된 TikTok 앱은 다음 URL의 소유권 확인이 필요하다.

- Terms of Service URL
- Privacy Policy URL
- Web 또는 Desktop URL

Content Posting API에서 `PULL_FROM_URL`을 사용하면 미디어 URL의 도메인 또는
URL prefix도 별도로 소유권 확인해야 한다. HTTPS여야 하고 리디렉션되는 미디어
URL은 유효하지 않다.

### 2.3 게시 기능 심사와 페이지 심사는 별도

3페이지를 공개했다고 Direct Post 공개 권한이 자동 승인되는 것은 아니다.

- `video.publish`: Direct Post를 위한 사용자 승인 scope
- `video.upload`: TikTok 초안으로 보내 사용자가 TikTok 안에서 마무리하는 scope
- 미감사 Direct Post 클라이언트: 공개 게시가 제한될 수 있음
- 게시 전 최신 creator info 조회, 계정·공개 범위·상호작용 설정 표시 필요
- 사용자가 캡션 등을 수정하고 명시적으로 최종 승인한 뒤에만 전송 가능

현재 `/home/arbada/shorts-automation`에는 YouTube OAuth·업로드 구현은 있으나,
TikTok OAuth·Content Posting 구현은 확인되지 않았다. 따라서 정책 페이지에서
TikTok 게시 기능이 이미 완성된 것처럼 단정하면 안 된다.

## 3. 브랜드와 운영자 표기

### 3.1 확정 표기

| 구분 | 표기 | 설명 |
|---|---|---|
| 사업자·운영자 | `컬피` | 사업자등록증의 상호와 동일해야 함 |
| 뉴스 사이트 | `컬처피플` | 컬피가 운영하는 뉴스 서비스 |
| TikTok 연동 서비스 | `알리닷` | 컬피가 운영하는 별도 콘텐츠 제작·게시 서비스 |
| 권장 관계 문구 | `알리닷은 컬피가 운영하는 숏폼 콘텐츠 서비스입니다.` | 세 페이지 공통 |

`(주)컬처피플미디어`는 사용자가 확정한 사업자명 `컬피`와 다르므로 알리닷
페이지에 사용하지 않는다. 법인 표기 여부를 임의로 붙이지 않는다.

2026-08-03 라이브 조회 결과 `culturepeople.co.kr/about`은 `컬피`(대표자
이서련, 사업자등록번호 543-26-01016), `culturepeople.co.kr/terms`는
`(주)컬처피플미디어`로 서로 다르게 표기하고 있다. 알리닷 페이지 게시 전 이
불일치부터 해소해야 하며, 이 값들도 사업자등록증 원본과 대조해 최종 확정한다
(1.4 참고).

### 3.2 TikTok 브랜드 사용

- 앱 이름 권장: `알리닷`
- 보조 설명: `컬피가 운영하는 숏폼 콘텐츠 서비스`
- 앱 이름에 `TikTok 앱`, `TikTok 업로더`처럼 플랫폼명을 넣지 않는다.
- TikTok 공식 서비스, 제휴사 또는 보증 서비스로 오인시키지 않는다.
- TikTok 로고를 알리닷 로고처럼 사용하지 않는다.
- 설명 본문에서는 실제 연동 기능을 설명하기 위해 TikTok 명칭을 사용할 수 있다.

### 3.3 공개 사업자 정보

세 페이지가 공유할 단일 설정을 둔다.

```ts
type AlidotLegalEntity = {
  businessName: "컬피";
  representativeName: string;
  businessRegistrationNumber: string;
  contactEmail: string;
  privacyEmail: string;
  effectiveDate: string;
  lastUpdatedDate: string;
};
```

- 대표자명과 사업자등록번호는 사업자등록증 확인 후 입력한다.
- 공개 주소는 법률 검토 결과 필수인 경우에만 넣는다. 기존 컬처피플 푸터에서
  주소를 제거한 결정을 자동으로 뒤집지 않는다.
- 존재하지 않는 `privacy@culturepeople.co.kr`를 먼저 정책에 쓰지 않는다.
  실제 수신 가능한 이메일인지 테스트한 뒤 사용한다.
- 각 페이지에 값을 복제하지 않고 한 파일 또는 CMS 설정을 단일 원천으로 쓴다.

### 3.4 기존 컬처피플 법적 표기 정규화

현재 코드와 라이브 설정 양쪽을 함께 처리해야 한다.

| 대상 | 현재 문제 | 정정 원칙 |
|---|---|---|
| `/terms`, `/privacy` fallback | `(주)컬처피플미디어` 하드코딩 | `컬피`로 변경 |
| about/contact/advertising/youth metadata | `컬처피플미디어` 사용 | 사업자 표기는 `컬피`, 사이트 설명은 `컬처피플`로 구분 |
| `src/lib/constants.ts`의 `COMPANY_NAME` | 이전 명칭 상수. 2026-08-03 확인 결과 `src/` 어디에서도 import되지 않음(dead code) | 실사용처가 없으므로 값 변경 또는 상수 자체 제거 중 택1. 향후 재도입 대비해 audit 스크립트에는 계속 포함 |
| D1 `cp-terms` | 운영 저장값에 이전 명칭이 남을 수 있음 | dry-run diff 후 대표자 승인으로 변경 |
| D1 `cp-about` | 라이브는 이미 `컬피` | 변경하지 않고 기준값으로 사용 |
| 관리자 약관 설정 | 새 저장 시 이전 명칭 재유입 가능 | validation·미리보기 경고 추가 |
| 단위 테스트 fixture | 이전 명칭을 정상값처럼 사용 | `컬피` 기준으로 수정 |

정규화는 다음 안전 원칙을 따른다.

1. 코드 fallback과 metadata는 일반 코드 변경으로 처리한다.
2. 운영 DB의 `cp-terms`는 먼저 현재 값을 백업하고 문자열 diff를 생성한다.
3. DB 변경 명령은 기본 dry-run이며 `--apply`에서만 쓰기 가능하게 한다.
4. `컬처피플`이라는 뉴스 사이트명은 유지한다. 바꾸는 것은 운영 사업자 표기다.
5. 기사 본문, 출처명, 인용문, 감사 로그와 과거 정책 버전은 자동 치환하지 않는다.
6. 변경 후 `/about`, `/terms`, `/privacy`의 사업자명이 모두 `컬피`인지 확인한다.
7. rollback 파일에는 변경 전 정책 원문과 checksum을 보존한다.

## 4. 권장 호스팅 구조

### 4.1 1순위: 컬처피플 안의 독립 알리닷 경로

`shorts-automation`은 현재 Python 서비스이며 공개 웹 프런트엔드가 아니다.
TikTok용 페이지는 Python 봇에 붙이지 않고, 이미 운영 중인 컬처피플 Next.js
프로젝트에 정적 공개 경로로 구현한다. 알리닷 데이터나 OAuth에 의존하지 않아
봇이 중지돼도 정책 페이지는 계속 열려야 한다.

```text
src/app/alidot/                     구현 완료
├── page.tsx                        서비스 소개
├── terms/page.tsx                  이용약관
└── privacy/page.tsx                개인정보처리방침 + 데이터 삭제

src/components/alidot/AlidotPublicShell.tsx  3개 site type 공통 shell
src/lib/alidot-legal.ts             운영자 정보·정책 버전 단일 원천
src/lib/site-type-options.ts        서버·관리자 공용 순수 타입·accent
src/app/cam/site-type/page.tsx      기본값·loading/error·accent 정정 완료
public/<TikTok-signature-file>      발급 후에만 추가
tests/unit/alidot-public-pages.test.ts
tests/unit/site-type-consistency.test.ts
```

구현 원칙:

- 현재 컬처피플 Vercel 프로젝트에서 함께 배포
- 정적 생성 우선, 운영 DB·관리자 로그인·Python 봇에 의존하지 않음
- 알리닷 레이아웃 안에서 서비스 소개·약관·개인정보 링크를 항상 노출
- 기존 컬처피플 뉴스 약관(`/terms`, `/privacy`)과 내용을 섞지 않음
- 세 URL 모두 직접 200 응답, 3xx 체인 없음
- `news-sitemap.xml`에는 제외하고 일반 `sitemap.xml`에는 포함

### 4.2 2순위: 독립 서브도메인

`https://alidot.culturepeople.co.kr`은 알리닷에 공개 사용자, 제품 화면, 지원 체계,
독립 운영 문서가 충분해진 뒤 검토한다. 현재는 내용이 적은 서브도메인이 단순
랜딩 페이지로 보일 수 있고, 별도 배포·DNS·소유권 검증 관리만 늘어나므로 2순위다.

### 4.3 홈페이지 노출과 검색 색인 정책

- 컬처피플 뉴스 메인 내비게이션에 알리닷을 주요 서비스처럼 추가할 필요는 없다.
- 다만 운영 관계를 투명하게 보여주려면 회사소개 또는 푸터의 `서비스` 영역에
  `알리닷` 텍스트 링크 하나를 두는 방안을 권장한다. 실제 노출 여부는 대표자가
  TikTok 심사 전에 결정한다.
- 알리닷 홈페이지 안에서는 `/terms`, `/privacy` 링크를 화면 하단에 항상 보이게 한다.
- 인증, IP 제한, Basic Auth, 쿠키 동의 강제 팝업으로 본문을 가리지 않는다.
- TikTokBot 또는 일반 심사 브라우저를 robots.txt로 차단하지 않는다.
- 검색 노출이 싫다면 검색엔진 `noindex` 사용을 검토할 수 있으나, TikTok 심사
  리스크를 최소화하려면 초기 Production 심사 중에는 정상 indexable 페이지를
  권장한다. 검색 노출 여부와 외부 공개 여부는 서로 다른 개념이다.

### 4.4 CulturePeople 3개 사이트 타입 적용

현재 `src/lib/site-type.ts`에서 지원하는 사이트 타입은 정확히 다음 세 가지다.

| `SiteType` | 헤더 | 푸터 | 포인트 컬러 |
|---|---|---|---|
| `netpro` | `CulturepeopleHeader0` | `CulturepeopleFooter6` | `#E8192C` |
| `insightkorea` | `InsightKoreaHeader` | `InsightKoreaFooter` | `#d2111a` |
| `culturepeople` | `CulturePeopleHeader` | `CulturePeopleFooter` | `#5B4B9E` |

알리닷 3페이지와 기존 법적 페이지 정정은 현재 운영 중인 한 타입에만 맞추지 않고
세 타입 모두에 적용한다. 다만 동일 약관을 타입별 파일로 복제하지 않는다.

#### 공통 구현 원칙

1. `/alidot`, `/alidot/terms`, `/alidot/privacy`의 본문·법적 정보·metadata는
   하나의 공통 데이터 원천을 사용한다.
2. `getSiteType()` 결과에 따라 헤더, 푸터와 accent만 선택한다.
3. 세 페이지가 각자 중첩 ternary를 복사하지 않도록 공용 resolver 또는
   `AlidotPublicShell`을 구현한다.
4. 후보 파일은 `src/components/alidot/AlidotPublicShell.tsx`와
   `src/lib/public-site-theme.ts`다. 실제 기존 구조와 비교해 하나만 선택한다.
5. `getSiteType()`의 실제 동작을 정확히 반영한다(`src/lib/site-type.ts`
   확인). `cp-site-type`이 아예 설정되지 않았을 때 서버 리졸버의 기본값은
   `culturepeople`이다(`serverGetSetting("cp-site-type", { type:
   "culturepeople" })`). `netpro`는 저장된 `type` 값이 `insightkorea`도
   `culturepeople`도 아닌, 손상되었거나 예상 밖인 값일 때만 도달하는 방어적
   분기다. "설정 없음"과 "손상된 저장값" 두 경우를 각각 검증한다.
6. 관리자 화면 `src/app/cam/site-type/page.tsx`는 현재 초기 state뿐 아니라
   `getSetting()`의 설정 없음 기본값도 `netpro`라서, 공개 서버가
   `culturepeople`을 렌더하는 동안 관리자는 netpro를 사용 중이라고 잘못 표시할
   수 있다. 이는 단순 로딩 표시가 아니라 실제 기본값 불일치이므로 수정한다.
7. 관리자 화면의 netpro accent `#C41422`도 공개 resolver의 `#E8192C`와 다르다.
   site type 이름·설명·accent·기본값을 가능한 한 하나의 공통 정의에서 읽게 하고,
   클라이언트에서 서버 전용 모듈을 import할 수 없다면 순수 공통 상수를 분리한다.
8. 테마가 달라도 `컬피`, `알리닷`, 사업자번호, 문의처, 시행일과 정책 원문은
   동일해야 한다.
9. 각 테마 푸터에 이전 사업자명 fallback이 숨어 있는지 별도로 감사한다.
10. 일반 sitemap과 news-sitemap 결과는 사이트 타입에 따라 달라지지 않는다.
11. 운영 DB의 `cp-site-type`을 테스트 때문에 변경하지 않는다.
12. 공개 query parameter로 `?siteType=` 강제 전환 기능을 만들지 않는다.

#### 테스트 매트릭스

| 페이지 | netpro | insightkorea | culturepeople |
|---|---:|---:|---:|
| `/alidot` | 필수 | 필수 | 필수 |
| `/alidot/terms` | 필수 | 필수 | 필수 |
| `/alidot/privacy` | 필수 | 필수 | 필수 |

총 9개 조합에서 다음을 검증한다.

- 올바른 헤더와 푸터 선택
- 각 타입의 accent 적용
- 정책 원문과 운영자 정보 동일
- 약관·개인정보 상호 링크 정상
- 모바일 375px 및 데스크톱 1440px에서 겹침·가로 스크롤 없음
- `컬처피플미디어` 이전 사업자명 노출 0건
- canonical은 테마와 무관하게 동일한 `culturepeople.co.kr/alidot...` URL
- 설정 없음은 공개·관리자 모두 `culturepeople`, 손상된 저장값은 공개 resolver에서
  `netpro` 방어 분기로 처리
- 관리자 선택 화면과 공개 화면의 타입 이름·accent·선택 상태 일치

기존 공개 법적 페이지(`/about`, `/terms`, `/privacy`, `/contact`, `/advertising`,
`/youth-policy`)도 세 타입 각각에서 회사명 정규화와 렌더링 회귀를 확인한다.
즉 알리닷 9개 조합뿐 아니라 기존 법적 페이지 6개 × 3타입의 핵심 텍스트·shell
검증도 포함한다.

## 5. 페이지 1: 알리닷 공식 웹사이트

### 5.1 목적

심사자와 사용자가 알리닷의 실제 서비스, 사용자, TikTok 연동 범위, 사용자 통제,
운영자를 이해할 수 있게 한다. 마케팅용 한 문장만 있는 랜딩 페이지가 아니라
제품 설명 페이지여야 한다.

### 5.2 필수 구성

1. 서비스명과 운영자
2. 실제 제공 중인 기능
3. 대상 사용자
4. 콘텐츠 제작부터 게시까지의 실제 흐름
5. 사용자의 게시 전 확인·수정·취소 권한
6. 콘텐츠 권리 및 플랫폼 정책 준수 안내
7. TikTok 비공식 서비스 고지
8. 지원 이메일
9. 이용약관·개인정보처리방침 상시 링크

### 5.3 조건부 초안

아래 문안은 TikTok 기능이 구현된 뒤 실제 화면과 일치할 때 사용한다.

> **알리닷**  
> 알리닷은 컬피가 운영하는 숏폼 콘텐츠 제작·관리 서비스입니다. 사용자는 직접
> 제작했거나 적법한 이용 권한을 가진 영상의 내용과 게시 설정을 확인한 뒤 자신의
> TikTok 계정으로 전송할 수 있습니다.
>
> 알리닷은 게시 전에 연결된 계정, 영상 미리보기, 설명과 공개 범위 등 TikTok이
> 허용하는 설정을 표시합니다. 사용자가 최종 승인한 경우에만 전송을 시작하며,
> 승인 전에는 내용을 수정하거나 취소할 수 있습니다.
>
> 알리닷은 TikTok이 제공하거나 보증하는 공식 서비스가 아닙니다. TikTok은 해당
> 권리자의 상표입니다.

TikTok 구현 전 임시 공개가 필요하다면 “연동 제공 중”이라고 쓰지 말고
“TikTok 연동 기능을 준비하고 있으며 현재 Production 서비스로 제공되지 않습니다”라고
표시한다. 다만 개발 중 서비스는 Production 앱 심사 승인을 받기 어려우므로 이
상태에서는 Sandbox만 사용한다.

## 6. 페이지 2: 알리닷 이용약관

### 6.1 목차

1. 목적
2. 용어의 정의
3. 운영자 정보
4. 약관의 효력과 변경
5. 서비스 이용 조건과 연령
6. 제공 기능과 변경·중단
7. TikTok 계정 연결과 권한 승인
8. 게시 전 사용자 확인과 최종 승인
9. 사용자 콘텐츠의 권리와 책임
10. 금지 행위
11. AI 생성·편집 콘텐츠와 상업적 콘텐츠 표시
12. TikTok 등 외부 서비스의 약관
13. 지식재산권
14. 서비스 이용 제한과 해지
15. 데이터 삭제와 연결 해제
16. 책임 범위
17. 준거법과 분쟁 처리
18. 시행일과 변경 이력

### 6.2 약관 초안

#### 제1조 목적

이 약관은 컬피(이하 “운영자”)가 제공하는 알리닷 서비스의 이용과 관련하여
운영자와 이용자 사이의 권리, 의무 및 책임사항을 정함을 목적으로 합니다.

#### 제2조 정의

1. “알리닷”은 숏폼 콘텐츠의 제작, 검수, 관리 및 외부 플랫폼 전송을 지원하는
   서비스를 말합니다.
2. “이용자”는 이 약관에 동의하고 알리닷을 이용하는 사람을 말합니다.
3. “콘텐츠”는 이용자가 알리닷에서 처리하는 영상, 이미지, 음성, 음악, 제목,
   설명, 해시태그 및 관련 정보를 말합니다.
4. “계정 연결”은 이용자가 TikTok의 승인 화면에서 알리닷에 필요한 권한을
   허용하는 절차를 말합니다.

#### 제3조 약관의 효력과 변경

약관은 알리닷 공식 웹사이트에 게시한 시행일부터 적용됩니다. 운영자는 관계
법령을 위반하지 않는 범위에서 약관을 변경할 수 있으며, 중요한 변경은 시행일과
변경 내용을 합리적인 기간 전에 공개합니다.

#### 제4조 서비스 기능

운영자는 실제 구현된 범위에서 콘텐츠 제작 지원, 미리보기, 게시 정보 확인,
TikTok 계정 연결, 사용자가 승인한 콘텐츠의 전송 및 상태 확인 기능을 제공할 수
있습니다. 외부 API의 변경, 점검, 장애 또는 심사 상태에 따라 일부 기능이 제한될
수 있습니다.

#### 제5조 계정 연결과 게시 승인

1. 이용자는 자신이 소유하거나 적법하게 관리할 권한이 있는 TikTok 계정만
   연결해야 합니다.
2. 알리닷은 이용자가 연결 계정, 콘텐츠, 게시 정보와 공개 범위를 확인하고
   명시적으로 승인한 경우에만 TikTok 전송을 시작합니다.
3. 이용자는 전송 시작 전 콘텐츠와 설정을 수정하거나 게시를 취소할 수 있습니다.
4. TikTok의 심사 상태 또는 계정 상태에 따라 게시가 비공개로 제한되거나 실패할
   수 있습니다.

#### 제6조 콘텐츠 권리와 이용자 책임

이용자는 콘텐츠를 제작·편집·게시하는 데 필요한 저작권, 초상권, 상표권, 음악
이용권 등 모든 권리를 보유하거나 적법한 허락을 받아야 합니다. 제3자의 콘텐츠를
무단 복제하거나 워터마크를 제거하거나 출처를 숨겨서는 안 됩니다.

#### 제7조 금지 행위

- 불법, 기만, 사칭, 스팸 또는 권리 침해 콘텐츠의 제작·게시
- 다른 사람의 계정 또는 인증정보 무단 사용
- TikTok 또는 알리닷의 보안·사용 제한 우회
- 허위 광고, AI 생성 여부 또는 상업적 관계의 고의적 은폐
- 서비스 안정성을 해치는 자동화·대량 요청

#### 제8조 외부 서비스

TikTok 계정 연결과 게시에는 TikTok의 약관, 개인정보처리방침, 커뮤니티
가이드라인 및 개발자 정책이 함께 적용됩니다. 알리닷은 TikTok의 정책 변경,
계정 제재, API 제한 또는 장애를 통제하지 않습니다.

#### 제9조 이용 종료와 연결 해제

이용자는 TikTok의 연결된 앱 설정 또는 알리닷에서 제공하는 기능을 통해 권한을
철회할 수 있습니다. 알리닷이 보유한 개인정보 삭제는 개인정보처리방침의 “TikTok
연결 해제 및 데이터 삭제” 절차에 따라 요청할 수 있습니다.

#### 제10조 책임과 분쟁

운영자의 책임 제한 문구는 대한민국 강행법규를 배제하지 않는 범위로 법률 검토
후 확정합니다. 준거법, 관할, 소비자 분쟁 절차를 임의로 단정하지 않습니다.

#### 부칙

- 시행일: `[대표자 확정 필요]`
- 최종 변경일: `[대표자 확정 필요]`
- 운영자: 컬피
- 문의: `[실수신 확인된 이메일 필요]`

## 7. 페이지 3: 알리닷 개인정보처리방침

### 7.1 공개 전에 코드로 확정할 사실

현재 TikTok 구현이 확인되지 않았으므로 다음을 추측해 작성하지 않는다.

- 요청하는 TikTok scope
- TikTok에서 받는 계정 필드
- access token과 refresh token 저장 위치·암호화·보유 기간
- 영상이 로컬 PC, 컬피 서버 또는 외부 스토리지 중 어디를 거치는지
- 게시 ID, 오류 로그, IP, 브라우저 정보를 실제로 수집하는지
- 처리위탁 업체와 서버 국가
- 계정 연결 해제 후 운영 저장소와 백업에서 삭제되는 기한

### 7.2 필수 데이터 처리표

구현 후 실제 처리하는 행만 정책에 남긴다.

| 데이터 | 목적 | 수집 방법 | 저장 위치 | 보유 기간 | 삭제 트리거 |
|---|---|---|---|---|---|
| TikTok open ID, 닉네임, 프로필 이미지 | 연결 계정 표시 | TikTok API | 확인 필요 | 확인 필요 | 연결 해제·삭제 요청 |
| access/refresh token, scope, 만료 시각 | 승인된 API 호출 | OAuth | 확인 필요 | 확인 필요 | 철회·만료·삭제 요청 |
| 영상·이미지·음성·미리보기 | 제작·검수·전송 | 사용자 입력·알리닷 생성 | 확인 필요 | 확인 필요 | 게시 완료·삭제 요청 |
| 설명, 해시태그, 공개 범위, 참여 설정 | 게시 설정 반영 | 사용자 입력 | 확인 필요 | 확인 필요 | 삭제 요청 |
| publish ID, 상태, 시각, 오류 코드 | 결과 확인·장애 복구 | TikTok API·서비스 로그 | 확인 필요 | 확인 필요 | 보유기간 만료 |
| 이메일과 문의 내용 | 지원·삭제 요청 처리 | 이메일 | 메일 시스템 | 확인 필요 | 목적 달성·법정 기간 |

### 7.3 개인정보처리방침 초안 구조

#### 1. 적용 범위

이 개인정보처리방침은 컬피가 운영하는 알리닷 서비스와 알리닷의 TikTok 계정
연결 및 콘텐츠 게시 기능에 적용됩니다. 컬처피플 뉴스 서비스에는 별도의
개인정보처리방침이 적용될 수 있습니다.

#### 2. 처리하는 개인정보와 수집 방법

위 7.2 표를 구현 사실로 확정한 뒤 실제 항목, 필수·선택 여부, TikTok API 또는
사용자 직접 입력 등 수집 방법을 구체적으로 공개합니다. 알리닷은 TikTok 계정
비밀번호를 수집하거나 저장하지 않습니다.

#### 3. 처리 목적

- 연결된 TikTok 계정 확인
- 이용자가 승인한 콘텐츠 게시 또는 초안 전송
- 게시 상태 확인과 오류 복구
- 보안, 고객 지원 및 데이터 삭제 요청 처리

실제로 제공하지 않는 목적은 삭제합니다.

#### 4. 보유 및 파기

데이터별 보유 기간을 “목적 달성 시”만으로 뭉뚱그리지 말고 일수 또는 사건 기준으로
표시합니다. 전자 파일은 복구하기 어려운 방식으로 삭제하며, 백업의 삭제 또는
만료 주기도 별도로 명시합니다.

#### 5. 제3자 제공·처리위탁·국외 이전

TikTok API 전송과 일반적인 처리위탁을 구분합니다. Vercel, Cloudflare, 외부
스토리지, 이메일 제공업체를 실제로 쓰는 경우 수탁자, 업무, 국가, 이전 시기와
방법, 보유 기간 및 거부 방법을 법률 검토해 적습니다. 사용하지 않는 업체를
예상으로 기재하지 않습니다.

#### 6. 이용자 권리

이용자는 개인정보의 열람, 정정, 삭제, 처리정지 및 동의 철회를 요청할 수
있습니다. 요청 이메일, 본인 확인 방식, 처리 기한과 결과 통지 방법을 공개합니다.

#### 7. TikTok 연결 해제 및 데이터 삭제

1. TikTok의 연결된 앱 관리 화면에서 알리닷 권한을 철회합니다.
2. 알리닷이 별도 연결 관리 화면을 제공하는 경우 해당 화면에서 연결을 해제합니다.
3. 알리닷 보유 데이터 삭제는 `[실수신 확인된 개인정보 문의 이메일]`로 요청합니다.
4. 요청에는 회신 이메일과 연결 계정을 확인할 최소 정보만 포함합니다.
5. 비밀번호, access token, refresh token, 주민등록번호는 이메일로 보내지 않습니다.
6. 삭제 대상, 본인 확인, 처리 기한, 법령상 보존 예외 및 백업 만료 기한은 실제
   운영 절차가 정해진 뒤 숫자로 명시합니다.

#### 8. 안전성 확보 조치

실제로 구현한 접근 제한, 전송 구간 보호, token 암호화, 로그 redaction, 권한
분리, 백업 보호만 기재합니다. 구현되지 않은 암호화를 약속하지 않습니다.

#### 9. 아동·청소년

알리닷의 최소 이용 연령과 미성년자 처리 방침을 TikTok 요구사항 및 국내 법률과
대조해 확정합니다. 확정 전 Production 서비스 대상으로 표시하지 않습니다.

#### 10. 책임자·문의·시행일

- 운영자: 컬피
- 대표자: `[사업자등록증 대조 필요]`
- 개인정보 보호책임자: `[대표자 확정 필요]`
- 문의 이메일: `[실수신 테스트 필요]`
- 시행일·최종 변경일·문서 버전: `[확정 필요]`

## 8. 개발 범위

### 8.1 구현 완료

1. 컬처피플 안의 알리닷 정적 공개 라우트
2. 세 공개 라우트
3. 공통 헤더·푸터·법적 정보 단일 원천
4. 링크·200 응답·메타데이터·placeholder·비밀정보 검사
6. 모바일·데스크톱 공개 smoke
7. 컬처피플 배포 gate·manifest와 rollback 절차 연동
8. 기존 컬처피플 공개 법적 페이지와 D1 `cp-terms`의 사업자명 정규화
9. 사업자명 감사·dry-run·rollback 스크립트와 회귀 테스트
10. `netpro`·`insightkorea`·`culturepeople` 공통 shell과 9개 렌더 조합 테스트
11. 공개 resolver와 관리자 사이트 타입 화면의 기본값·accent 일치

### 8.2 외부 값 필요 또는 별도 구현

1. TikTok이 실제 발급한 URL ownership 서명 파일 배포
2. TikTok OAuth·Content Posting과 사용자 승인 UX
3. Production App Review와 Direct Post audit
4. 수신 가능한 개인정보 문의 이메일과 데이터 보유 기간 확정
5. 기존 컬처피플 법적 정책의 대표자 승인 및 청소년보호책임자 확정

### 8.3 이번 페이지 작업에서 제외

- TikTok OAuth 및 Content Posting API 구현
- 영상 자동 게시
- TikTok 앱 Production 심사 제출
- 컬처피플 뉴스 메인의 전면 개편
- 기사 본문·인용문·과거 감사 로그의 명칭 일괄 변경
- 법률 검토 없이 보유 기간·국외 이전·책임 제한 확정

## 9. 단계별 실행 계획

### P0: 사업자·데이터 흐름 확정

- 사업자등록증의 상호가 `컬피`인지 최종 대조
- 대표자, 사업자등록번호, 실제 문의 이메일 확정
- 공개 페이지, metadata, fallback, `src/lib/constants.ts`, 테스트 fixture의 이전
  사업자명 사용처를 전수 감사
- 운영 D1 `cp-terms`를 백업하고 사업자명 변경 dry-run·rollback mapping 생성
- 대표자 승인 후 기존 약관·개인정보처리방침의 운영자 표기를 `컬피`로 정정
- 관리자 약관 저장 시 이전 사업자명이 다시 들어오면 경고 또는 차단
- 알리닷이 내부 1인 도구인지 외부 사용 가능 서비스인지 결정
- TikTok scope와 OAuth·영상·로그 데이터 흐름 설계
- 보유 기간, 삭제 담당자, 처리위탁·국외 이전 확정

완료 기준: 정책의 모든 `[확인 필요]` 항목에 코드 또는 대표자 결정 근거가 있고,
`/about`, `/terms`, `/privacy`, `/contact`, `/advertising`, `/youth-policy`의 운영자
표기가 `컬피`로 일치한다. 기사·인용문은 변경되지 않으며 rollback 파일이 있다.

Blocked: 알리닷이 개인·내부용이거나 TikTok 기능이 아직 개발 중이면 Production
심사 제출은 중단하고 Sandbox만 사용한다.

### P1: 3페이지 정적 구현

- 컬처피플 프로젝트에 정적 알리닷 경로 추가
- `/alidot`, `/alidot/terms`, `/alidot/privacy` 구현
- 3페이지 공통 법적 정보 모듈 구현
- 세 `SiteType`의 헤더·푸터·accent를 선택하는 공통 shell/resolver 구현
- `netpro`, `insightkorea`, `culturepeople` 9개 렌더 조합 테스트
- 관리자 사이트 타입의 설정 없음 기본값을 `culturepeople`로 맞추고 loading/error
  상태를 실제 선택 상태와 분리
- 관리자 netpro accent를 공개 resolver와 일치시키거나 공용 순수 상수로 통합
- `/alidot` 소개 화면에 약관·개인정보 링크 상시 노출
- 실제 기능에 맞춘 최종 원고 반영

완료 기준: 세 페이지가 JavaScript 없이도 핵심 내용을 읽을 수 있고 상호 링크가
작동한다. 세 `SiteType` 모두 올바른 shell로 렌더되며 법적 본문과 운영자 정보는
완전히 동일하다.

### P2: 배포·URL 소유권

- 기존 컬처피플 배포 gate 통과
- `culturepeople.co.kr/alidot` 세 경로 운영 배포
- HTTPS 인증서와 직접 200 확인
- 기존 뉴스 화면 회귀 테스트와 배포 rollback 확인

완료 기준: 외부 시크릿 브라우저와 모바일에서 인증 없이 세 URL이 열린다.

### P3: TikTok 검증·심사 준비

- Domain 또는 URL prefix 소유권 확인
- 앱 이름·아이콘·설명과 페이지 표기 대조
- Sandbox의 실제 end-to-end 데모 영상 준비
- 사용한 제품과 scope만 심사에 제출

완료 기준: URL properties 검증 성공, 데모 도메인과 Website URL 일치, 실제 기능과
정책 문구 불일치 0건.

## 10. 테스트와 검증 계획

아래 명령 중 `ci:typecheck`, `test:unit`은 현재 CulturePeople `package.json`에
존재한다. 아래 알리닷·사업자명 전용 명령도 이번 구현에서 `package.json`에 추가됐다.

```bash
# 기존 명령: 로컬 타입·단위 테스트
pnpm ci:typecheck
pnpm test:unit

# 구현 완료: 공개 3페이지 정적 검증
pnpm verify:alidot-pages -- --base https://culturepeople.co.kr/alidot

# 구현 완료: 3개 site type × 3페이지 및 기존 법적 페이지 회귀
pnpm test:unit

# 구현 완료: 서버 resolver와 관리자 기본값·accent 계약 테스트
pnpm test:unit -- tests/unit/site-type-consistency.test.ts

# 구현 완료: 운영 DB를 변경하지 않는 3타입 계약·HTML 검증
pnpm verify:alidot-pages -- --base http://127.0.0.1:3000/alidot --site-type all

# 구현 완료: 기존 법적 페이지·설정 사업자명 감사
pnpm legal:company-name:audit -- --expected "컬피"

# 구현 완료: 운영 설정 변경 계획과 rollback 파일 생성, DB 쓰기 없음
pnpm legal:company-name:normalize -- --expected "컬피" --dry-run

# 구현 완료: 변경 후보가 있을 때만 인증 후 반영, 현재는 0건 no-op
pnpm legal:company-name:normalize -- --expected "컬피" --apply

# 수동 소량 확인
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://culturepeople.co.kr/alidot
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://culturepeople.co.kr/alidot/terms
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://culturepeople.co.kr/alidot/privacy

# redirect와 TLS 확인
curl -sSIL https://culturepeople.co.kr/alidot
curl -sSIL https://culturepeople.co.kr/alidot/terms
curl -sSIL https://culturepeople.co.kr/alidot/privacy
```

자동 검증 항목:

- 세 URL 최종 응답 200, HTML UTF-8
- `netpro`, `insightkorea`, `culturepeople` 9개 렌더 조합 통과
- 세 타입별 올바른 Header/Footer/accent 선택
- 설정 없음·손상값·세 정상값에서 공개/관리자 기본값 계약 검증
- 약관·개인정보 링크가 홈페이지 DOM에 존재하고 숨겨지지 않음
- canonical과 title/description 일치
- `컬피`, `알리닷` 표기 일치
- `(주)컬처피플미디어`, `홍길동`, `TODO`, `준비 중` 등 금지 placeholder 없음
- 공개 법적 페이지의 이전 사업자명 0건, 기사 본문 변경 0건
- D1 변경 전 원문·checksum·rollback mapping 존재
- secret, token, 절대 로컬 경로 노출 없음
- 360/768/1024/1440px 가로 스크롤·겹침 없음
- 키보드 focus, heading 순서, 대비, 링크 이름 통과
- 로그인·쿠키·JavaScript 오류 없이 정책 본문 접근 가능

## 11. 운영 체크리스트

### 대표자가 확정할 것

- [ ] 사업자등록증 상호 `컬피` 확인
- [ ] 대표자명과 사업자등록번호 공개값 확인
- [ ] 공개 주소 필요 여부 법률 검토
- [ ] 실제 수신 가능한 일반 문의·개인정보 문의 이메일 확정
- [ ] 알리닷 대상이 외부 사용자 서비스인지 내부 1인 운영 도구인지 결정
- [ ] TikTok scope `video.publish`/`video.upload` 선택
- [ ] 데이터 항목, 저장 위치, 보유 기간, 삭제 기한 승인
- [ ] 처리위탁·국외 이전 사실 확인
- [ ] 최소 이용 연령 확정
- [ ] 컬처피플 내부 `/alidot` 경로 사용 승인
- [ ] `netpro`, `insightkorea`, `culturepeople` 세 타입 모두 적용 승인
- [ ] 회사소개 또는 푸터에서 알리닷 링크를 노출할지 결정
- [ ] `culturepeople.co.kr/terms`의 `(주)컬처피플미디어` 표기를 `/about`의
      `컬피`와 통일 (2026-08-03 라이브 불일치 확인됨, 1.4 참고)
- [ ] 개인정보처리방침·청소년보호정책·문의·광고 페이지의 사업자 표기도
      사업자등록증 기준 `컬피`로 통일 승인
- [x] shorts-automation의 선행 4페이지 기획서 상단에 `superseded` 안내 추가
      (구현 기준은 본 문서의 `알리닷` 단독·3페이지 안으로 확정)

### 개발자가 확인할 것

- [ ] 실제 TikTok 구현 데이터 흐름과 정책 문구 1:1 대조
- [ ] 세 페이지 외부 접근과 200 응답
- [ ] 홈페이지에서 정책 링크 상시 표시
- [ ] URL ownership 서명 파일 원문·경로 검증
- [ ] OAuth secret과 token 서버 전용 보관
- [ ] TikTokBot 또는 심사 브라우저 차단 없음
- [ ] 배포·rollback manifest 보존

## 12. 위험과 대응

| 위험 | 영향 | 대응 |
|---|---|---|
| 3페이지를 웹에 공개하지 않음 | URL 검증·Production 심사 불가 | 컬처피플 `/alidot` 경로 공개 |
| 홈페이지가 단순 링크 모음 | 완성된 공식 웹사이트 기준 미충족 | 실제 기능·사용 흐름·지원 정보 제공 |
| 내부 1인용 도구 | 앱 심사 기준의 private/personal use 위반 가능 | Sandbox 유지 또는 실제 외부 서비스화 |
| TikTok 기능 미구현 | 데모·scope 심사 실패 | 페이지와 API를 분리하고 심사 보류 |
| `컬피`/기존 법인명 혼용 | 운영자 신뢰·법적 불일치 | 알리닷은 `컬피` 단일 표기 |
| 무차별 문자열 치환 | 기사·인용·과거 기록 훼손 | 공개 법적 설정만 allowlist 변경, dry-run·rollback 필수 |
| 개인정보 문안 추측 | 정책 불이행·법적 위험 | 코드 기반 데이터 처리표 승인 후 게시 |
| 삭제 문구만 있고 처리 도구 없음 | 이용자 권리 처리 실패 | 담당자·기한·삭제 로그 구현 후 확정 |
| 뉴스 사이트와 같은 배포 | 알리닷 변경이 뉴스 운영에 영향 | 정적 라우트, 회귀 테스트, 기존 release gate 적용 |
| 현재 운영 타입만 테스트 | 타입 전환 시 약관 shell·푸터 누락 | 3타입 × 3페이지 9조합 테스트를 배포 gate에 포함 |
| 공개·관리자 기본값 불일치 | 관리자가 실제와 다른 타입을 사용 중으로 오인 | 설정 없음 기본값 `culturepeople` 통일, loading/error 분리 |
| netpro accent 이중 정의 | 관리자 미리보기와 공개 화면 불일치 | 공용 순수 site type 상수와 계약 테스트 |
| 미감사 Direct Post | 공개 게시 제한 | Sandbox·비공개 시험 후 별도 감사 |

## 13. 최종 완료 기준

1. 알리닷 3페이지가 컬처피플 안에 있지만 뉴스 약관·기사 UI와 명확히 분리되어 있다.
2. `culturepeople.co.kr/alidot`에서 상시 공개 HTTPS 200으로 접근된다.
3. 홈페이지에서 약관과 개인정보처리방침 링크가 메뉴 없이 보인다.
   세 사이트 타입 모두에서 동일하게 보여야 한다.
4. 모든 운영자 표기는 사업자명 `컬피`로 일치한다.
   기존 컬처피플 약관·개인정보·문의·광고·청소년보호 페이지도 포함한다.
5. 실제 TikTok 구현과 scope·데이터·보유·삭제 문구가 일치한다.
6. 데이터 삭제 절차가 `/alidot/privacy#data-deletion`에 있고 실제 운영 가능하다.
7. URL ownership 검증과 Sandbox end-to-end 데모가 통과한다.
8. 내부 1인용·개발 중 상태를 숨기지 않고, 그 상태라면 Production 제출하지 않는다.
9. 컬처피플 뉴스 메인에 과도하게 홍보하지 않되 운영 관계를 숨기지 않는다.
10. TikTok 심사 기간과 승인 이후에도 세 페이지를 계속 유지한다.
11. `netpro`, `insightkorea`, `culturepeople` 중 어느 타입으로 전환해도 알리닷
    3페이지와 기존 법적 페이지의 회사명·링크·canonical이 유지된다.
12. `cp-site-type` 설정이 없으면 공개·관리자 모두 `culturepeople`을 표시하고,
    손상된 저장값의 공개 fallback만 `netpro`로 처리한다. 세 타입의 accent가
    관리자와 공개 화면에서 일치한다.

## 14. 다음 개발 프롬프트

```text
docs/tiktok-alidot-public-pages-plan.md를 기준으로 알리닷의 TikTok 연동용 공개
3페이지를 컬처피플 프로젝트 안에 구현해줘.

먼저 /home/arbada/shorts-automation의 실제 TikTok 구현 여부, OAuth scope, token,
영상, 게시 기록, 로그의 데이터 흐름을 조사해. 확정되지 않은 법적 정보나 기능은
추측하지 말고 blocked로 표시해. 사업자명은 컬피, 서비스명은 알리닷, 뉴스
사이트명은 컬처피플로 구분해.

알리닷 페이지 구현 전에 기존 공개 법적 페이지, metadata, fallback,
src/lib/constants.ts, 관리자 약관 설정과 D1 cp-terms의 사업자명 사용처를 감사해.
운영 사업자를 뜻하는 `(주)컬처피플미디어`와 `컬처피플미디어`는 `컬피`로
정규화하되, 기사 본문·인용문·과거 감사 로그는 변경하지 마. 운영 DB 변경은 기본
dry-run, 대표자 승인 후 --apply로만 실행하고 변경 전 원문·checksum·rollback
mapping을 보존해.

기존 컬처피플 뉴스 약관과 내용을 섞지 말고, /alidot, /alidot/terms,
/alidot/privacy 정확히 세 경로를 정적으로 구현해. 데이터 삭제·TikTok 연결 해제
안내는 /alidot/privacy#data-deletion에 포함해. 알리닷 소개 페이지에서 약관과
개인정보처리방침 링크가 메뉴 없이 보여야 하며 세 URL은 인증 없이 직접 200으로
응답해야 해.

현재 지원하는 site type `netpro`, `insightkorea`, `culturepeople` 세 가지를 모두
지원해. 법적 본문을 타입별로 복사하지 말고 공통 Alidot shell 또는 theme resolver로
각 타입의 기존 Header, Footer, accent만 선택해. 운영 cp-site-type을 테스트 때문에
변경하거나 공개 `?siteType=` override를 만들지 말고, mock 기반으로 3페이지 × 3타입
9개 렌더 조합과 기존 법적 페이지 6개 × 3타입 회귀를 검증해.

src/lib/site-type.ts와 src/app/cam/site-type/page.tsx의 기본값·accent 불일치도 함께
수정해. 설정 없음은 공개·관리자 모두 culturepeople, 손상된 저장값은 서버 resolver의
netpro 방어 분기로 구분하고 loading/error 상태를 선택 상태로 위장하지 마. netpro
accent를 공용 순수 상수로 통일하고 계약 테스트를 추가해.

실제 기능과 일치하는 최종 원고, 공통 법적 정보 단일 원천, 메타데이터, 접근성,
반응형, secret 노출 방지, placeholder 검사와 verify:alidot-pages를 구현해. 일반
sitemap에는 포함하되 news-sitemap에는 넣지 마. TikTok OAuth·게시 API가 아직
없다면 제공 중이라고 쓰지 말고 Production 심사를 blocked로 남겨. 로컬 테스트를
모두 통과한 뒤 기존 clean release gate와 배포 credential이 있을 때만 컬처피플
운영에 배포하고, TikTok URL ownership은 대표자 승인 및 실제 TikTok 서명값이
준비된 뒤 진행해.

완료 보고에는 수정 파일, 확정·미확정 정책 정보, 테스트 결과, 배포 URL, DNS 상태,
세 URL 200 결과, TikTok Sandbox/Production 준비 상태와 대표자 작업을 포함해.
```

## 15. 공식 참고자료

- TikTok App Review Guidelines: https://developers.tiktok.com/doc/app-review-guidelines
- Create an App 및 URL verification: https://developers.tiktok.com/doc/getting-started-create-an-app
- Developer Guidelines: https://developers.tiktok.com/doc/our-guidelines-developer-guidelines
- Content Sharing Guidelines: https://developers.tiktok.com/doc/content-sharing-guidelines
- Content Posting API Get Started: https://developers.tiktok.com/doc/content-posting-api-get-started
- Media Transfer 및 URL ownership: https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide
