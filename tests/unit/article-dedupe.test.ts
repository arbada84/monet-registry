import { describe, expect, it } from "vitest";

import {
  findDuplicateArticleCandidate,
  isSubstantiallyEdited,
  normalizeArticleSourceUrl,
  normalizeArticleTitle,
  textSimilarity,
} from "@/lib/article-dedupe";

describe("article duplicate and originality guards", () => {
  it("normalizes source URLs so RSS tracking variants collide", () => {
    expect(normalizeArticleSourceUrl("https://www.newswire.co.kr/newsRead.php?no=1033672&sourceType=rss&utm_source=x#top"))
      .toBe("https://newswire.co.kr/newsRead.php?no=1033672");
  });

  it("detects duplicates by normalized source URL before title fallback", () => {
    const duplicate = findDuplicateArticleCandidate(
      {
        title: "AI가 편집한 새 제목",
        sourceUrl: "https://www.newswire.co.kr/newsRead.php?sourceType=rss&no=1033672",
      },
      [
        {
          id: "153",
          no: 153,
          title: "기존 기사 제목",
          sourceUrl: "https://newswire.co.kr/newsRead.php?no=1033672",
        },
      ],
    );

    expect(duplicate).toMatchObject({ id: "153", no: 153, reason: "source_url" });
  });

  it("uses a strict normalized title fallback when source URL is missing", () => {
    expect(normalizeArticleTitle("서울문화재단, 지역 예술교육 프로그램 운영 - 뉴스와이어"))
      .toBe("서울문화재단지역예술교육프로그램운영");

    const duplicate = findDuplicateArticleCandidate(
      { title: "서울문화재단 지역 예술교육 프로그램 운영" },
      [{ id: "200", no: 200, title: "서울문화재단, 지역 예술교육 프로그램 운영 - 뉴스와이어" }],
    );

    expect(duplicate).toMatchObject({ id: "200", reason: "title" });
  });

  it("blocks exact or near-exact press release copies", () => {
    const source = [
      "서울문화재단은 지역 예술교육 프로그램을 확대 운영한다고 밝혔다.",
      "이번 프로그램은 시민 참여형 문화예술 활동을 중심으로 진행된다.",
      "참가 신청은 재단 누리집에서 가능하다.",
    ].join(" ");

    expect(isSubstantiallyEdited({ sourceText: source, editedHtml: `<p>${source}</p>` }))
      .toMatchObject({ ok: false });

    const lightlyChanged = source.replace("밝혔다", "전했다");
    expect(isSubstantiallyEdited({ sourceText: source.repeat(4), editedHtml: `<p>${lightlyChanged.repeat(4)}</p>` }).ok)
      .toBe(false);
  });

  it("allows rewritten articles that preserve facts but change expression", () => {
    const source = "서울문화재단은 지역 예술교육 프로그램을 확대 운영한다고 밝혔다. 참가 신청은 재단 누리집에서 가능하다.";
    const edited = "지역 문화예술 교육의 문턱을 낮추기 위한 새 프로그램이 열린다. 서울문화재단은 시민이 직접 참여하는 과정을 마련하고 누리집을 통해 신청을 받는다.";

    expect(textSimilarity(source, edited)).toBeLessThan(0.94);
    expect(isSubstantiallyEdited({ sourceText: source, editedHtml: `<p>${edited}</p>` }).ok).toBe(true);
  });
});
