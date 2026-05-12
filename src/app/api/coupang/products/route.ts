import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "crypto";
import { serverGetSetting } from "@/lib/db-server";
import { checkRateLimit } from "@/lib/redis";

/**
 * 쿠팡파트너스 Open API — 상품 검색
 * GET /api/coupang/products?keyword=검색어&limit=4
 *
 * 쿠팡 HMAC 인증 방식으로 서버사이드에서 호출
 */

const DOMAIN = "https://api-gateway.coupang.com";
const PATH = "/v2/providers/affiliate_open_api/apis/openapi/v1/products/search";
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
};

interface Product {
  id: number;
  name: string;
  price: number;
  image: string;
  url: string;
  isRocket: boolean;
  isFreeShipping: boolean;
  category: string;
}

interface CoupangProduct {
  productId?: unknown;
  productName?: unknown;
  productPrice?: unknown;
  productImage?: unknown;
  productUrl?: unknown;
  isRocket?: unknown;
  isFreeShipping?: unknown;
  categoryName?: unknown;
}

function generateHmac(
  method: string,
  url: string,
  accessKey: string,
  secretKey: string
): string {
  const parts = url.split(/\?/);
  const path = parts[0];
  const query = parts[1] || "";
  // 쿠팡 공식: YYMMDD'T'HHMMSS'Z' (6자리 연도)
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const datetime = `${String(now.getUTCFullYear()).slice(2)}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const message = datetime + method + path + query;
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(message)
    .digest("hex");

  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

function emptyProducts(keyword: string, reason: string) {
  return NextResponse.json(
    { success: true, products: [], keyword, disabled: reason },
    { headers: CACHE_HEADERS }
  );
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function toHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function toProduct(item: CoupangProduct): Product | null {
  const image = toHttpsUrl(item.productImage);
  const url = toHttpsUrl(item.productUrl);
  const id = Number(item.productId);
  const name = typeof item.productName === "string" ? item.productName.slice(0, 160) : "";
  if (!image || !url || !Number.isFinite(id) || id <= 0 || !name) return null;

  return {
    id,
    name,
    price: typeof item.productPrice === "number" ? item.productPrice : Number(item.productPrice) || 0,
    image,
    url,
    isRocket: Boolean(item.isRocket),
    isFreeShipping: Boolean(item.isFreeShipping),
    category: typeof item.categoryName === "string" ? item.categoryName.slice(0, 80) : "",
  };
}

export async function GET(request: NextRequest) {
  const keyword = (request.nextUrl.searchParams.get("keyword") || "베스트셀러").trim().slice(0, 50);
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || "4");
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.floor(requestedLimit), 1), 10)
    : 4;

  try {
    const allowed = await checkRateLimit(getClientIp(request), "cp:coupang:rate:", 60, 60, {
      context: "coupang-products",
    });
    if (!allowed) {
      return emptyProducts(keyword, "rate_limited");
    }

    // 어드민 설정 우선, 환경변수 폴백
    const adGlobal = await serverGetSetting<{ coupangAccessKey?: string; coupangSecretKey?: string }>("cp-ads-global", {});
    const accessKey = (adGlobal.coupangAccessKey?.trim() || process.env.COUPANG_ACCESS_KEY?.trim() || "").replace(/[\r\n]/g, "");
    const secretKey = (adGlobal.coupangSecretKey?.trim() || process.env.COUPANG_SECRET_KEY?.trim() || "").replace(/[\r\n]/g, "");

    if (!accessKey || !secretKey) {
      return emptyProducts(keyword, "not_configured");
    }

    const queryString = `keyword=${encodeURIComponent(keyword)}&limit=${limit}`;
    const requestUrl = `${PATH}?${queryString}`;
    const authorization = generateHmac("GET", requestUrl, accessKey, secretKey);

    const { fetchWithRetry } = await import("@/lib/fetch-retry");
    const res = await fetchWithRetry(`${DOMAIN}${requestUrl}`, {
      method: "GET",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      maxRetries: 2,
      retryDelayMs: 800,
      safeRemote: true,
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[Coupang API] Error:", res.status, text.slice(0, 500));
      return emptyProducts(keyword, "upstream_error");
    }

    const data = await res.json();
    // 쿠팡 API 응답: { rCode, rMessage, data: { productData: [...] } } 또는 { data: [...] }
    const productList = Array.isArray(data.data) ? data.data : (data.data?.productData || []);
    const products = productList
      .map((p: CoupangProduct) => toProduct(p))
      .filter((p: Product | null): p is Product => Boolean(p));

    return NextResponse.json({ success: true, products, keyword }, { headers: CACHE_HEADERS });
  } catch (e) {
    console.error("[Coupang API] Exception:", e instanceof Error ? e.message : e);
    return emptyProducts(keyword, "exception");
  }
}
