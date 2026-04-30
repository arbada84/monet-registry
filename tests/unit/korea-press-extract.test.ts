import { describe, expect, it } from "vitest";
import { cleanKoreaPressBodyHtml, extractKoreaPressArticle, isKoreaKrUrl } from "@/lib/korea-press-extract";

const ARTICLE_URL = "https://www.korea.kr/briefing/pressReleaseView.do?newsId=156759486&call_from=rsslink";

const rssDescription = `
<a href='https://www.korea.kr/briefing/pressReleaseView.do?newsId=156759486&call_from=rsslink' target='_blank'>
  <img src='https://www.korea.kr/newsWeb/resources/rss/btn_textview.gif' align='right' />
</a>
<br/><br/>
<div class="se-contents" role="textbox" style="font-size:12pt">
  <p style="margin:0"><span class="se-tab" style="padding-left:32px">&nbsp;</span><span>박종한 외교부 경제외교조정관은 4.30.(목) 서울에서 제2차 한-콩고민주공화국 공동위원회를 개최하였다.</span></p>
  <p style="margin:0"><br/></p>
  <p style="margin:0"><span>양측은 교역&middot;투자 확대를 뒷받침할 제도적 기반을 마련하자는 데 공감하였다.</span></p>
  <p style="margin:0"><span>붙 임 : 공동위 사진. &nbsp;끝.</span></p>
</div>
<br/>[자료제공 :<a href='https://www.korea.kr'><img src='https://www.korea.kr/newsWeb/resources/rss/icon_logo.gif' /></a>]<br/>
`;

const koreaShellHtml = `
<html>
  <head>
    <meta property="og:title" content="제2차 한-콩고민주공화국 공동위원회 개최" />
    <meta property="article:published_time" content="2026-04-30T16:43:13+09:00" />
  </head>
  <body>
    <section class="breadcrumbs">사이트 이동경로 홈으로 브리핑룸 보도자료</section>
    <div class="file_down">
      <p><span><a href="/common/download.do?fileId=198448595&amp;tblKey=GMN"><img src="/images/icon/icon_isetup.gif" alt="첨부파일">사진 1.jpg</a></span></p>
      <p><span><a href="/common/download.do?fileId=198448596&amp;tblKey=GMN"><img src="/images/icon/icon_isetup.gif" alt="첨부파일">사진 2.jpg</a></span></p>
    </div>
    <div class="article_body">
      <div class="view_cont">
        <div class="docConversion" id="content">
          <iframe title="content" id="content_press" src="/docViewer/iframe_skin/doc.html?fn=test"></iframe>
        </div>
        <p class="remark">“이 자료는 외교부의 보도자료를 전재하여 제공함을 알려드립니다.”</p>
      </div>
    </div>
    <div class="article_footer">저작권정책 담당자안내 공공누리 출처표시</div>
    <aside>이전다음기사 영역 실시간 인기뉴스 정책 NOW</aside>
  </body>
</html>
`;

describe("korea.kr press extraction", () => {
  it("recognizes korea.kr article URLs", () => {
    expect(isKoreaKrUrl(ARTICLE_URL)).toBe(true);
    expect(isKoreaKrUrl("https://www.korea.kr.evil.test/briefing/pressReleaseView.do")).toBe(false);
  });

  it("cleans RSS description into article body HTML", () => {
    const html = cleanKoreaPressBodyHtml(rssDescription, ARTICLE_URL);

    expect(html).toContain("박종한 외교부 경제외교조정관");
    expect(html).toContain("교역·투자");
    expect(html).not.toContain("btn_textview");
    expect(html).not.toContain("icon_logo");
    expect(html).not.toContain("자료제공");
    expect(html).not.toContain("style=");
    expect(html).not.toContain("class=");
  });

  it("uses RSS body and attachment photos instead of the korea.kr page shell", () => {
    const result = extractKoreaPressArticle(koreaShellHtml, ARTICLE_URL, {
      rssDescriptionHtml: rssDescription,
    });

    expect(result).not.toBeNull();
    expect(result?.title).toBe("제2차 한-콩고민주공화국 공동위원회 개최");
    expect(result?.bodyText).toContain("박종한 외교부 경제외교조정관");
    expect(result?.bodyText).not.toContain("사이트 이동경로");
    expect(result?.bodyText).not.toContain("저작권정책");
    expect(result?.images).toEqual([
      "https://www.korea.kr/common/download.do?fileId=198448595&tblKey=GMN",
      "https://www.korea.kr/common/download.do?fileId=198448596&tblKey=GMN",
    ]);
  });

  it("rejects document-viewer shell pages when no trusted body is available", () => {
    const result = extractKoreaPressArticle(koreaShellHtml, ARTICLE_URL);

    expect(result).toBeNull();
  });
});
