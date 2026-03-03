export const SERVICE_NAME = '컬처피플';
export const COMPANY_NAME = '(주)컬처피플미디어';

/** 카테고리 초기 기본값 — DB(cp-categories 설정)에 값이 있으면 동적으로 덮어씀 */
export const CATEGORIES = ["엔터", "스포츠", "라이프", "테크·모빌리티", "비즈", "공공"];

/**
 * 영문 슬러그 → 한글 카테고리명 매핑
 * 마크다운 업로드 / API 업로드 시 영문 카테고리를 자동 변환
 */
export const CATEGORY_SLUG_MAP: Record<string, string> = {
  // 엔터
  entertainment: "엔터",
  enter: "엔터",
  culture: "엔터",
  music: "엔터",
  film: "엔터",
  movie: "엔터",
  celebrity: "엔터",
  drama: "엔터",
  art: "엔터",
  // 스포츠
  sports: "스포츠",
  sport: "스포츠",
  football: "스포츠",
  baseball: "스포츠",
  basketball: "스포츠",
  soccer: "스포츠",
  // 라이프
  lifestyle: "라이프",
  life: "라이프",
  health: "라이프",
  food: "라이프",
  travel: "라이프",
  fashion: "라이프",
  beauty: "라이프",
  // 테크·모빌리티
  technology: "테크·모빌리티",
  tech: "테크·모빌리티",
  mobility: "테크·모빌리티",
  "tech-mobility": "테크·모빌리티",
  techmobility: "테크·모빌리티",
  it: "테크·모빌리티",
  auto: "테크·모빌리티",
  automotive: "테크·모빌리티",
  ev: "테크·모빌리티",
  // 비즈
  business: "비즈",
  biz: "비즈",
  economy: "비즈",
  finance: "비즈",
  industry: "비즈",
  market: "비즈",
  // 공공
  public: "공공",
  government: "공공",
  policy: "공공",
  social: "공공",
  politics: "공공",
  local: "공공",
};

/**
 * 카테고리명을 정규화: 영문 슬러그 → 한글, 한글은 그대로 반환
 * 매핑에 없으면 원래 값 그대로 반환
 */
export function normalizeCategory(raw: string): string {
  if (!raw) return raw;
  const lower = raw.trim().toLowerCase();
  return CATEGORY_SLUG_MAP[lower] ?? raw.trim();
}

export const PORTALS = [
  { key: "google", name: "Google Indexing API", desc: "Google 검색에 즉시 색인 요청" },
  { key: "bing", name: "Bing IndexNow", desc: "Bing, Yandex 등에 IndexNow 프로토콜로 색인 요청" },
  { key: "naver", name: "네이버 서치어드바이저", desc: "네이버 검색에 사이트맵 제출 및 색인 요청" },
  { key: "daum", name: "다음 검색등록", desc: "다음(카카오) 검색에 URL 등록 요청" },
  { key: "zum", name: "ZUM 검색등록", desc: "ZUM 검색에 사이트 등록" },
  { key: "rss", name: "RSS 피드 발행", desc: "RSS/Atom 피드를 통한 자동 배포" },
  { key: "syndication", name: "뉴스 신디케이션", desc: "뉴스 통신사 신디케이션 API 전송" },
] as const;
