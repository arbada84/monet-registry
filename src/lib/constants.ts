export const SERVICE_NAME = '컬처피플';
export const COMPANY_NAME = '(주)컬처피플미디어';

/** 카테고리 초기 기본값 — DB(cp-categories 설정)에 값이 있으면 동적으로 덮어씀 */
export const CATEGORIES = ["뉴스", "연예", "스포츠", "문화", "라이프", "포토"];

export const PORTALS = [
  { key: "google", name: "Google Indexing API", desc: "Google 검색에 즉시 색인 요청" },
  { key: "bing", name: "Bing IndexNow", desc: "Bing, Yandex 등에 IndexNow 프로토콜로 색인 요청" },
  { key: "naver", name: "네이버 서치어드바이저", desc: "네이버 검색에 사이트맵 제출 및 색인 요청" },
  { key: "daum", name: "다음 검색등록", desc: "다음(카카오) 검색에 URL 등록 요청" },
  { key: "zum", name: "ZUM 검색등록", desc: "ZUM 검색에 사이트 등록" },
  { key: "rss", name: "RSS 피드 발행", desc: "RSS/Atom 피드를 통한 자동 배포" },
  { key: "syndication", name: "뉴스 신디케이션", desc: "뉴스 통신사 신디케이션 API 전송" },
] as const;
