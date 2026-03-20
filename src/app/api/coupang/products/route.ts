import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "crypto";
import { serverGetSetting } from "@/lib/db-server";

/**
 * 쿠팡파트너스 Open API — 상품 검색
 * GET /api/coupang/products?keyword=검색어&limit=4
 *
 * 쿠팡 HMAC 인증 방식으로 서버사이드에서 호출
 */

const DOMAIN = "https://api-gateway.coupang.com";
const PATH = "/v2/providers/affiliate_open_api/apis/openapi/v1/products/search";

function generateHmac(
  method: string,
  url: string,
  accessKey: string,
  secretKey: string
): string {
  const parts = url.split(/\?/);
  const path = parts[0];
  const query = parts[1] || "";
  const datetime = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

  const message = `${datetime}\n${method}\n${path}\n${query}`;
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(message)
    .digest("hex");

  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

export async function GET(request: NextRequest) {
  try {
    const keyword = (request.nextUrl.searchParams.get("keyword") || "베스트셀러").trim().slice(0, 50);
    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") || "4"), 10);

    // 어드민 설정 우선, 환경변수 폴백
    const adGlobal = await serverGetSetting<{ coupangAccessKey?: string; coupangSecretKey?: string }>("cp-ads-global", {});
    const accessKey = (adGlobal.coupangAccessKey?.trim() || process.env.COUPANG_ACCESS_KEY?.trim() || "").replace(/[\r\n]/g, "");
    const secretKey = (adGlobal.coupangSecretKey?.trim() || process.env.COUPANG_SECRET_KEY?.trim() || "").replace(/[\r\n]/g, "");

    if (!accessKey || !secretKey) {
      return NextResponse.json(
        { success: false, error: "쿠팡 API 키가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const queryString = `keyword=${encodeURIComponent(keyword)}&limit=${limit}`;
    const requestUrl = `${PATH}?${queryString}`;
    const authorization = generateHmac("GET", requestUrl, accessKey, secretKey);

    const res = await fetch(`${DOMAIN}${requestUrl}`, {
      method: "GET",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      next: { revalidate: 3600 }, // 1시간 캐시
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[Coupang API] Error:", res.status, text);
      return NextResponse.json(
        { success: false, error: `쿠팡 API 오류 (${res.status})` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const products = (data.data || []).map(
      (p: {
        productId: number;
        productName: string;
        productPrice: number;
        productImage: string;
        productUrl: string;
        isRocket: boolean;
        isFreeShipping: boolean;
        categoryName: string;
      }) => ({
        id: p.productId,
        name: p.productName,
        price: p.productPrice,
        image: p.productImage,
        url: p.productUrl,
        isRocket: p.isRocket,
        isFreeShipping: p.isFreeShipping,
        category: p.categoryName,
      })
    );

    return NextResponse.json({ success: true, products, keyword });
  } catch (e) {
    console.error("[Coupang API] Exception:", e);
    return NextResponse.json(
      { success: false, error: "쿠팡 API 호출 실패" },
      { status: 500 }
    );
  }
}
