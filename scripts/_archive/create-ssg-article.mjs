const SB_URL = "https://ifducnfrjarmlpktrjkj.supabase.co";
const SB_KEY = "" + process.env.SUPABASE_SERVICE_KEY + "";

const article = {
  id: crypto.randomUUID(),
  no: 2992,
  title: "SSG닷컴, 월 2,900원 '쓱7클럽' 출시…장보기 7% 적립에 백화점 반품비 무료까지",
  category: "비즈",
  date: "2026-03-16",
  status: "게시",
  author: "박영래",
  tags: "SSG닷컴,쓱7클럽,멤버십,반품비무료,신세계,이마트,정용진",
  thumbnail: `${SB_URL}/storage/v1/object/public/images/2026/03/1773643742521_ssg7club.jpg`,
  thumbnail_alt: "SSG닷컴 쓱7클럽 멤버십 장보기 적립 혜택",
  summary: "SSG닷컴이 월 2,900원의 유료 멤버십 '쓱7클럽'을 출시했다. 장보기 결제액 7% 고정 적립, 신세계백화점몰 반품비 무료, 할인 쿠폰 등 실질적 혜택을 앞세워 온라인 장보기 시장 주도권 확보에 나섰다.",
  meta_description: "SSG닷컴이 월 2,900원 쓱7클럽 멤버십을 출시. 장보기 7% 적립, 백화점 반품비 무료, 티빙 결합 상품까지 다양한 혜택 제공.",
  body: `<p>SSG닷컴이 기존 신세계 유니버스 클럽을 대체하는 새 유료 멤버십 '쓱7클럽(SSG7CLUB)'을 공식 출시했다. 월 구독료 2,900원으로 장보기 결제액의 7%를 고정 적립받을 수 있는 것이 핵심이다.</p>

<p>쓱7클럽은 쓱배송(주간배송·새벽배송·트레이더스)과 스타배송 상품 구매 시 결제액의 7%를 SSG머니로 적립해준다. 월 최대 누적 적립 한도는 5만 원이며, 판매자 배송 식품군에도 3% 적립이 적용된다. 장을 자주 보는 가구라면 월 구독료 대비 수배의 혜택을 돌려받을 수 있는 구조다.</p>

<p>특히 눈에 띄는 혜택은 신세계백화점몰 반품비 무료 서비스다. 백화점몰에서 구매한 상품을 반품할 때 반품 신청 화면에서 '백화점 무료 반품 신청'을 선택하면 반품 택배비가 면제된다. 단, 가전·가구 등 별도 물류비가 발생하는 상품과 초특가 상품 일부는 제외된다.</p>

<p>할인 쿠폰도 매달 지급된다. 4만 원 이상 주문 시 사용 가능한 7% 할인 쿠폰 2장(최대 1만 원 할인)과 2만 원 이상 주문에 쓸 수 있는 5% 할인 쿠폰 2장(최대 2만 원 할인)이 포함된다.</p>

<p>OTT 서비스를 함께 이용하고 싶다면 '쓱7클럽+티빙' 결합 상품(월 3,900원)을 선택할 수 있다. 1,000원 추가로 티빙 무제한 시청이 가능해 KBO 야구 중계까지 챙길 수 있어 가성비 면에서 주목받고 있다.</p>

<p>론칭 기념 이벤트도 진행 중이다. 쓱7클럽 가입 시 3개월간 월 3,000원, 티빙형 가입 시 월 4,000원을 SSG머니로 캐시백해 사실상 무료에 가까운 체험이 가능하다. 웰컴 장보기 지원금 5,000원도 가입 즉시 지급된다.</p>

<p>이번 멤버십은 정용진 신세계그룹 회장이 주도하는 이마트 계열사 체질 개선의 일환으로 읽힌다. 기존 유니버스 클럽(연 3만 원)이 혜택 분산으로 체감 만족도가 낮다는 지적을 받아왔던 만큼, 쓱7클럽은 '장보기 적립'이라는 명확한 가치 제안으로 방향을 전환한 셈이다.</p>

<p>유통업계에서는 쿠팡 로켓와우(월 7,890원)와의 직접 비교가 불가피하다는 분석이 나온다. 가격은 쓱7클럽이 절반 이하지만, 무료배송·로켓배송 등 쿠팡의 물류 경쟁력과 차별화할 수 있을지가 관건이다.</p>

<p>SSG닷컴 관계자는 "합리적인 구독료에 실질적인 적립 혜택을 제공해 온라인 장보기 고객의 충성도를 높이겠다"고 밝혔다.</p>`,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

async function run() {
  const res = await fetch(`${SB_URL}/rest/v1/articles`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(article),
  });
  const data = await res.json();
  if (res.ok && data[0]) {
    console.log(`등록 완료: #${data[0].no} ${data[0].title}`);
    console.log(`URL: https://culturepeople.co.kr/article/${data[0].no}`);
  } else {
    console.log("실패:", res.status, JSON.stringify(data));
  }
}

run();
