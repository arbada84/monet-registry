# Netpro RSS/Newswire 파싱 기반 수집·선택·작성 연동 스킬 명세서

생성: 2026-02-14 00:00 UTC+09:00  
대상 보드: `bo_table=rss`(보도자료), `bo_table=newswire`(뉴스와이어)

---

## 0) 목표

- **모든 원천 데이터를 수집/정규화**해 사용자가 웹에서 **탐색 → 미리보기 → 선택 → 기사 초안에 삽입**까지 한 흐름으로 처리.
- 구현은 **파싱(HTML/RSS/XML) 중심**으로 설계.
- “넷프로 화면”은 **중간 집계(큐)**로 보되, 최종적으로는 **원천 URL(출처) 기반**으로 디듀프/정규화.

---

## 1) 관찰된 사이트 구조(넷프로)

### 1-1. 목록/검색/정렬 엔드포인트

- `GET /rss/board.php`
- 핵심 파라미터
  - `bo_table`: `rss` | `newswire`
  - `sca`: 카테고리 코드(보도자료=문자열, 뉴스와이어=숫자 문자열)
  - `page`: 페이지 번호
  - 검색: `sfl`, `stx`, `sop`
  - 정렬: `sst`, `sod`
  - 보조: `version`, `access_url` (링크에 항상 붙지만 기본은 공란)

**샘플 스냅샷(업로드한 HTML 기준)**  
- 보도자료: Total 205,698건 / 마지막 페이지 8228 / 페이지당 25건  
- 뉴스와이어: Total 64,896건 / 마지막 페이지 2596 / 페이지당 25건  

> 주의: Total/마지막 페이지는 시간이 지나며 변동.

### 1-2. 목록 레코드(행) 구조

각 레코드는 테이블 행(`<table> <tbody> <tr>`) 단위.

- `wr_id`: `input[name="chk_wr_id[]"]@value`
- `detail_url`: `td.td_subject a[href*="wr_id="]@href`
- `title_display`: 위 링크 텍스트(일부는 리스트에서 말줄임 처리될 수 있음)
- `category`
  - 뉴스와이어: `a.bo_cate_link` 텍스트 존재
  - 보도자료: `sca`는 링크에 있으나 텍스트가 비어있는 경우가 있어 **nav 카테고리 목록 매핑**으로 보완
- 기타 컬럼: `writer/source`, `date_display`, `hit` (스킨에 따라 컬럼 위치는 변할 수 있음)

### 1-3. 카테고리(초기 매핑 테이블)

#### bo_table=rss (보도자료) 카테고리 61개(샘플 HTML에서 추출)

- `(empty)` : 전체
- `policy` : 정책뉴스
- `photo` : 포토뉴스
- `media` : 영상뉴스
- `fact` : 사실은 이렇습니다
- `reporter` : 국민이 말하는 정책
- `pressrelease` : 브리핑룸
- `mofa` : 외교부
- `unikorea` : 통일부
- `moj` : 법무부
- `nts` : 국세청
- `customs` : 관세청
- `pps` : 조달청
- `kostat` : 통계청
- `kcc` : 방송통신위원회
- `nssc` : 원자력안전위원회
- `president` : 청와대
- `ebriefing` : e브리핑
- `cabinet` : 국무회의
- `npa` : 경찰청
- `moel` : 고용노동부
- `ftc` : 공정거래위원회
- `msit` : 과학기술정보통신부
- `moe` : 교육부
- `mpva` : 국가보훈처
- `opm` : 국무조정실
- `acrc` : 국민권익위원회
- `mnd` : 국방부
- `molit` : 국토교통부
- `fsc` : 금융위원회
- `kma` : 기상청
- `mafra` : 농림축산식품부
- `rda` : 농촌진흥청
- `cha` : 문화재청
- `mcst` : 문화체육관광부
- `dapa` : 방위사업청
- `moleg` : 법제처
- `mma` : 병무청
- `mw` : 보건복지부
- `forest` : 산림청
- `motie` : 산업통상자원부
- `sda` : 새만금개발청
- `nfa` : 소방청
- `mfds` : 식품의약품안전처
- `mogef` : 여성가족부
- `mpm` : 인사혁신처
- `mss` : 중소벤처기업부
- `kipo` : 특허청
- `kcg` : 해양경찰청
- `mof` : 해양수산부
- `mois` : 행정안전부
- `macc` : 행정중심복합도시건설청
- `mcee` : 기후에너지환경부
- `chungnam` : 충청남도
- `naju` : 나주시
- `busan` : 부산시청
- `gyeongnam` : 경상남도
- `jeonnam` : 전라남도
- `jeonbuk` : 전라북도
- `yeonggwang` : 영광군청
- `daegu` : 대구시청

#### bo_table=newswire (뉴스와이어) 카테고리 20개(샘플 HTML에서 추출)

- `(empty)` : 전체
- `100` : 경제
- `200` : 금융
- `300` : 건설/부동산
- `400` : 산업
- `500` : 자동차
- `600` : 기술/IT
- `700` : 미디어
- `800` : 유통
- `900` : 라이프스타일
- `1000` : 건강
- `1100` : 교육
- `1200` : 문화/연예
- `1300` : 레저
- `1400` : 정책/정부
- `1500` : 에너지/환경
- `1600` : 스포츠
- `1700` : 농수산
- `1800` : 물류/교통
- `1900` : 사회

---

## 2) 스킬 전체 아키텍처(파싱 중심)

### 2-1. 데이터 흐름(End-to-End)

1. **넷프로 목록 수집(Netpro List Ingestor)**
   - 보드/카테고리별로 최신 N페이지 수집(증분)
   - 레코드(기본 필드) 저장 + `wr_id` 기준 detail 큐잉

2. **넷프로 상세 수집(Netpro Detail Fetcher)**
   - `detail_url` HTML 파싱
   - (가능하면) **원문 URL(출처 링크)** 추출
   - 본문/이미지/첨부/메타를 Raw + 정규 필드로 저장

3. **원천 상세 수집(Origin Fetcher)**
   - `origin_url`이 있으면 도메인별 어댑터 또는 범용 파서로 원문 수집
   - 원천 본문을 표준 스키마로 정규화

4. **정규화/디듀프/버전관리(Normalizer & Deduper)**
   - 원문 URL 기반 canonicalization
   - content_hash 기반 변경 감지
   - 최신 버전만 프론트 노출

5. **사용자 UI(선택/작성 워크벤치)**
   - 검색/필터(소스/카테고리/시간/키워드/상태)
   - 미리보기(넷프로 vs 원천 비교)
   - 선택 후 “초안 카드”로 모으기
   - 내 CMS/에디터로 export(템플릿 적용)

---

## 3) 핵심 스킬 명세(구현 단위)

아래 6개 스킬을 각각 독립 모듈/잡으로 구현하면 유지보수가 쉬움.

### Skill A. NetproListIngestor
**역할:** `board.php` 목록 페이지를 파싱해 “아이템 인덱스”를 만든다.

- 입력: `bo_table`, `sca`, `page`
- 출력: `NetproListItem[]`

**파싱 규칙(권장 selector)**
- rows: `table tbody tr`
- wr_id: `input[name="chk_wr_id[]"]@value`
- detail_url: `td.td_subject a[href*="wr_id="]@href`
- title_display: 위 a의 텍스트
- category_sca: `td.td_subject a.bo_cate_link@href`에서 `sca` 파라미터 추출
- category_label:
  - newswire: `a.bo_cate_link` 텍스트
  - rss: `sca→label` 매핑 테이블로 보완
- writer/source, date_display, hit: `tr > td` 컬럼 텍스트 배열에서 스킨별 매핑(아래 “Column Mapper” 참고)

**증분 수집 전략(추천)**
- 최초 백필(backfill): (마지막 페이지까지) 배치로 천천히
- 일상 운영: 최신 3~10페이지(또는 “신규/미처리 wr_id”가 없어질 때까지)만 반복

---

### Skill B. NetproPaginationResolver
**역할:** 마지막 페이지/총건수/페이지당 건수 등을 추정해 백필 범위를 결정.

- 우선순위
  1) `a.pg_end@href`에서 `page` 추출 (가장 확실)
  2) “Total N건” + “페이지당 row 수”로 계산 (보조)
- 종료 조건(백필)
  - table에 레코드가 0개이거나
  - 이미 저장된 `wr_id`만 반복 등장하거나
  - 페이지 번호가 last_page를 초과

---

### Skill C. NetproDetailFetcher
**역할:** 상세 페이지 HTML에서 “정확한 본문/메타/첨부/출처링크”를 뽑는다.

- 입력: `detail_url`
- 출력: `NetproDetail`

**필수 저장 항목**
- `netpro_wr_id`, `bo_table`, `sca`
- `title_full`(가능하면 리스트가 아닌 상세 기준)
- `published_at_raw`(상세에 날짜가 있으면 우선)
- `body_html_raw`
- `attachments[]` (파일명, 다운로드 URL)
- `outbound_links[]` (출처 후보)

**출처(원천) URL 추출 휴리스틱**
- “관련링크/원문/출처” 라벨 영역의 `<a>`
- 본문 내 외부 링크 중 “뉴스와이어/정부부처/보도자료 원문” 도메인 우선
- `<link rel="canonical">`이 있으면 최우선
- 여러 개면 scoring 후 1개를 `origin_url_best`로 선정 + 나머지는 후보로 보관

> 상세 페이지 selector는 스킨/설정에 따라 달라질 수 있으니, 1~2개 샘플 상세 HTML로 규칙을 확정하는 “스냅샷 테스트”를 함께 만든다.

---

### Skill D. OriginFetcher
**역할:** `origin_url`에서 원문을 가져와 정규화 가능한 형태로 만든다.

- 입력: `origin_url`
- 출력: `OriginRaw`(HTML/RSS item 확장 JSON)

**도메인 어댑터 우선순위**
1) 고정 규칙이 있는 도메인(예: 정책브리핑/정부부처/뉴스와이어)
2) 범용 본문 추출(Readability 류) + fallback selector
3) 실패 시: 넷프로 본문을 “대체 원문”으로 사용(상태=origin_missing)

**SSRF 방어(필수)**
- 허용 도메인/패턴 allowlist
- 사설 IP/메타데이터 IP 차단(127.0.0.1, 169.254.169.254 등)

---

### Skill E. NormalizerAndDeduper
**역할:** “넷프로/원천”을 통합 스키마로 맞추고 중복을 제거한다.

**권장 유니크 키(우선순위)**
1) `origin_url_canonical` (가장 강력)
2) `origin_guid`(RSS guid가 있으면)
3) `(bo_table, netpro_wr_id)`
4) `hash(title_full + published_at + source_name)` (최후 수단)

**버전 관리**
- `content_hash = sha256(normalized_title + body_text + attachment_urls + origin_url)`
- hash가 바뀌면 `version++`로 업데이트 이력 저장(리비전)

---

### Skill F. WriterWorkbench(사용자 선택/작성 UI)
**역할:** 수집된 아이템을 “기사 작성에 바로 쓰는 도구”로 만든다.

**기능**
- 필터: 소스(board/sca), 날짜, 키워드, 상태(새글/검수중/작성완료)
- 미리보기: (넷프로 본문) vs (원천 본문) 비교 탭
- 클리핑: 제목/요약/핵심 문단/인용문/이미지 선택
- 초안 템플릿:
  - 헤드라인 후보 자동 생성
  - 본문 구조(리드-핵심-배경-전망)
  - 출처/링크 자동 첨부(내부 표준 표기)
- Export:
  - CMS API로 draft 생성
  - 또는 `markdown/html`로 복사/다운로드

---

## 4) 통합 데이터 스키마(권장 JSON)

```json
{
  "id": "item_123",
  "source": {
    "board": "rss",
    "sca": "policy",
    "category_label": "정책뉴스"
  },
  "netpro": {
    "wr_id": 205698,
    "detail_url": "https://www.netpro.kr/rss/board.php?bo_table=rss&wr_id=205698&version=&access_url=",
    "title_display": "..."
  },
  "origin": {
    "url": "https://(원문 URL)",
    "canonical_url": "https://(정규화된 원문 URL)",
    "domain": "(예: korea.kr)",
    "guid": "(RSS guid if any)"
  },
  "content": {
    "title": "(정규화 제목)",
    "published_at": "2026-02-13T08:00:00+09:00",
    "byline": "(작성자/배포처)",
    "body_html": "(sanitize된 HTML)",
    "body_text": "(검색용 텍스트)",
    "images": [{"url":"", "caption":"", "credit":""}],
    "attachments": [{"url":"", "filename":"", "mime":"", "size":0}],
    "outbound_links": ["..."]
  },
  "provenance": {
    "fetched_from": ["netpro_list", "netpro_detail", "origin"],
    "content_hash": "sha256...",
    "version": 1,
    "last_fetched_at": "2026-02-14T00:00:00+09:00"
  },
  "workflow": {
    "status": "new",
    "picked": false,
    "picked_by": null,
    "draft_id": null
  }
}
```

---

## 5) 서버 API 스펙(프론트 연동)

- `GET /api/sources`  
  - 반환: board/sca/label + 통계(오늘 신규/미처리 수)

- `GET /api/items?board=&sca=&q=&from=&to=&status=&page=`  
  - 반환: 리스트 카드(제목/출처/시간/상태/썸네일)

- `GET /api/items/<built-in function id>`  
  - 반환: 상세(넷프로/원천 원문, 첨부/이미지, 링크 후보)

- `POST /api/workbench/selection`  
  - body: item_ids[], mode(clip/merge)

- `POST /api/drafts`  
  - body: template_id, item_ids[], options(인용/링크 포함 등)
  - 반환: draft_url 또는 draft_id

---

## 6) 파싱 품질을 높이는 “추가 정리” 체크리스트

1) **넷프로 상세 페이지 HTML 샘플(각 보드 3~5개)** 확보 → selector 확정  
2) “원문 URL이 어디에 들어있는지” 확정  
   - 관련링크/본문 내 링크/메타 canonical 중 무엇인지
3) 날짜 표기 규칙 확정  
   - 리스트의 `HH:MM` vs `MM-DD`를 상세/원천에서 최종 확정하는 규칙
4) 첨부파일/이미지 URL 규칙 확정  
   - 상대경로/리다이렉트/다운로드 토큰 여부
5) 중복/갱신 정책 확정  
   - 동일 원문이 여러 카테고리에 뜨는 케이스 처리

---

## 7) 참고(보안/웹 제약) 링크

아래는 구현 시 체크할 기본 레퍼런스(필요한 부분만 참고):
```text
Same-Origin Policy (MDN): https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy
CORS (MDN): https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
XSS Prevention Cheat Sheet (OWASP): https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
```

---

## 8) “바로 착수용” TODO (실무 순서)

1) NetproListIngestor 구현 + DB에 인덱스 저장(bo_table/sca/page/wr_id)
2) NetproDetailFetcher 구현(상세 파서 1차) + origin_url 후보 추출
3) OriginFetcher 범용 파서 구축 + 도메인 allowlist 적용
4) NormalizerAndDeduper로 통합 스키마/중복 처리
5) WriterWorkbench UI(검색/미리보기/선택/초안 export)

