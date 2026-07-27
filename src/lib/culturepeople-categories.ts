export const CULTUREPEOPLE_CATEGORIES = [
  "문화",
  "엔터",
  "스포츠",
  "라이프",
  "테크·모빌리티",
  "비즈",
  "공공",
] as const;

export type CulturePeopleCategory = (typeof CULTUREPEOPLE_CATEGORIES)[number];

const CATEGORY_ALIASES: Record<string, CulturePeopleCategory> = {
  문화예술: "문화",
  공연: "문화",
  "공연 예술": "문화",
  공연예술: "문화",
  미술: "문화",
  전시: "문화",
  출판: "문화",
  문학: "문화",
  도서: "문화",
  문화재: "문화",
  연예: "엔터",
  엔터테인먼트: "엔터",
  영화: "엔터",
  음악: "엔터",
  방송: "엔터",
  생활: "라이프",
  건강: "라이프",
  교육: "라이프",
  여행: "라이프",
  IT: "테크·모빌리티",
  테크: "테크·모빌리티",
  기술: "테크·모빌리티",
  자동차: "테크·모빌리티",
  경제: "비즈",
  금융: "비즈",
  산업: "비즈",
  기업: "비즈",
  정책: "공공",
  정부: "공공",
  사회: "공공",
  환경: "공공",
};

const CATEGORY_KEYWORDS: Record<CulturePeopleCategory, readonly string[]> = {
  문화: ["문화", "공연", "연극", "뮤지컬", "전시", "미술", "예술", "도서", "출판", "문학", "축제", "문화재", "박물관"],
  엔터: ["연예", "배우", "가수", "방송", "드라마", "영화", "음악", "앨범", "음원", "콘서트", "k-pop", "케이팝", "팬덤", "ott"],
  스포츠: ["스포츠", "선수", "경기", "리그", "축구", "야구", "농구", "배구", "골프", "올림픽", "e스포츠"],
  라이프: ["라이프", "여행", "관광", "건강", "의료", "교육", "육아", "패션", "뷰티", "푸드", "식품", "반려동물"],
  "테크·모빌리티": ["테크", "기술", "it", "ai", "인공지능", "소프트웨어", "반도체", "통신", "자동차", "모빌리티", "로봇", "우주"],
  비즈: ["비즈", "기업", "산업", "경제", "금융", "투자", "스타트업", "부동산", "유통", "마케팅", "수출", "매출"],
  공공: ["공공", "정부", "정책", "법률", "지자체", "시청", "도청", "복지", "환경", "사회", "국제", "부처", "위원회"],
};

function cleanCategory(value: unknown): string {
  return String(value || "").normalize("NFC").trim();
}

export function isCulturePeopleCategory(value: unknown): value is CulturePeopleCategory {
  return CULTUREPEOPLE_CATEGORIES.includes(cleanCategory(value) as CulturePeopleCategory);
}

export function normalizeCulturePeopleCategory(
  value: unknown,
  context = "",
  fallback: CulturePeopleCategory = "문화",
): CulturePeopleCategory {
  const raw = cleanCategory(value);
  if (isCulturePeopleCategory(raw)) return raw;

  const alias = CATEGORY_ALIASES[raw] || CATEGORY_ALIASES[raw.toUpperCase()];
  if (alias) return alias;

  const haystack = `${raw} ${context}`.normalize("NFC").toLowerCase();
  let best: CulturePeopleCategory = fallback;
  let bestScore = 0;
  for (const category of CULTUREPEOPLE_CATEGORIES) {
    const score = CATEGORY_KEYWORDS[category].reduce(
      (total, keyword) => total + (haystack.includes(keyword.toLowerCase()) ? 1 : 0),
      0,
    );
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }
  return best;
}

export function preserveSourceCategoryTag(tags: unknown, sourceCategory: unknown): string | undefined {
  const raw = cleanCategory(sourceCategory);
  const values = String(tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (raw && !isCulturePeopleCategory(raw)) {
    const sourceTag = `원분류:${raw}`;
    if (!values.includes(sourceTag)) values.push(sourceTag);
  }
  return values.length > 0 ? values.join(",") : undefined;
}
