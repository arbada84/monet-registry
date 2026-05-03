import { describe, expect, it } from "vitest";

import {
  extractNewswireArticle,
  isOverseasNewswireArticle,
  selectNewswireArticleForCulturePeople,
} from "@/lib/newswire-extract";

describe("newswire extract policy", () => {
  it("blocks overseas releases while allowing domestic company releases", () => {
    expect(isOverseasNewswireArticle({
      title: "Global company announces board update",
      author: "Example Inc.",
      keywords: ["Mobile App", "Overseas", "Personnel Announcement"],
      bodyText: "Example Inc. today announced an overseas release.",
    })).toBe(true);

    expect(isOverseasNewswireArticle({
      title: "서울문화재단, 전국 광역문화재단과 전략적 협력",
      author: "서울문화재단",
      keywords: ["공연 예술", "지방정부", "서울"],
      bodyText: "서울문화재단이 전국 광역문화재단과 협력을 확대한다.",
    })).toBe(false);
  });

  it("keeps Newswire company logo URLs on an existing thumbnail path", () => {
    const result = extractNewswireArticle(`
      <meta property="og:title" content="Company title - 뉴스와이어">
      <meta property="og:image" content="https://file.newswire.co.kr/data/upfile/company_img/thumb_480/2025/03/logo.jpg">
      <meta name="author" content="국내기업">
      <meta name="news_keywords" content="문화, 국내기업">
      <section class="article_column"><p>본문 내용이 충분히 길게 들어갑니다. 이미지 URL 변환 정책을 검증합니다.</p></section>
    `, "https://www.newswire.co.kr/newsRead.php?no=1");

    expect(result?.images[0]).toBe("https://file.newswire.co.kr/data/upfile/company_img/thumb_big/2025/03/logo.jpg");
  });

  it("selects by Newswire provider name before falling back to topic and source signals", () => {
    expect(selectNewswireArticleForCulturePeople({
      title: "지역 예술교육 프로그램 운영",
      author: "부산문화재단",
      keywords: ["지역", "교육"],
      bodyText: "지역 예술교육 프로그램을 운영한다.",
      sourceId: "nwrss_all",
      sourceName: "뉴스와이어 전체",
    })).toMatchObject({ allowed: true, tier: "preferred_provider" });

    expect(selectNewswireArticleForCulturePeople({
      title: "국내 출판사가 새 예술 도서를 출간",
      author: "좋은땅출판사",
      keywords: ["출판", "문화"],
      bodyText: "국내 출판사가 문화예술 분야 신간을 출간했다.",
      sourceId: "nwrss_publish",
      sourceName: "뉴스와이어 출판",
    })).toMatchObject({ allowed: true, tier: "culture_source" });

    expect(selectNewswireArticleForCulturePeople({
      title: "Global board update",
      author: "Global Company Inc.",
      keywords: ["Overseas"],
      bodyText: "Global company board update.",
      sourceId: "nwrss_all",
      sourceName: "뉴스와이어 전체",
    })).toMatchObject({ allowed: false, tier: "blocked_overseas" });
  });
});
