function normalizeLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function buildCategorySeoCopy(category: string) {
  const label = normalizeLabel(category) || "주요 분야";
  return {
    title: `${label} 최신 뉴스·주요 이슈·보도자료 한눈에 보기`,
    description: `컬처피플 ${label} 섹션에서 최신 뉴스와 주요 이슈, 보도자료, 관련 인물·기관 소식을 확인하세요. 새로 게시된 기사와 분야별 정보를 독자가 찾기 쉽게 정리해 제공합니다.`,
    openGraphTitle: `${label} 최신 뉴스와 주요 이슈 - 컬처피플`,
  };
}

export function buildTagSeoCopy(tag: string) {
  const label = normalizeLabel(tag) || "주요 주제";
  return {
    title: `${label} 관련 최신 뉴스·주요 이슈·보도자료 모아보기`,
    description: `컬처피플에서 ${label} 관련 최신 뉴스와 주요 이슈, 보도자료, 인물·기관 소식을 한곳에서 확인하세요. 새 기사와 연결된 정보를 주제별로 정리해 제공합니다.`,
    openGraphTitle: `${label} 관련 최신 뉴스와 주요 이슈 - 컬처피플`,
  };
}
