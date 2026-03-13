"use client";

import { useEffect, useState } from "react";

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

interface CoupangAutoAdProps {
  /** 검색 키워드 (기사 카테고리, 태그 등) */
  keyword: string;
  /** 표시할 상품 수 (기본 4) */
  limit?: number;
  /** 레이아웃 (가로 스크롤 or 그리드) */
  layout?: "scroll" | "grid";
  className?: string;
}

export default function CoupangAutoAd({
  keyword,
  limit = 4,
  layout = "scroll",
  className = "",
}: CoupangAutoAdProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!keyword) return;
    setLoading(true);
    fetch(`/api/coupang/products?keyword=${encodeURIComponent(keyword)}&limit=${limit}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.products?.length) {
          setProducts(data.products);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [keyword, limit]);

  if (loading || products.length === 0) return null;

  const formatPrice = (n: number) =>
    n ? `${n.toLocaleString()}원` : "";

  return (
    <div className={className}>
      {/* 헤더 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
          paddingBottom: 6,
          borderBottom: "1px solid #eee",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>
          추천 상품
        </span>
        <span style={{ fontSize: 10, color: "#aaa" }}>
          이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
        </span>
      </div>

      {/* 상품 목록 — 모바일 2열 / PC 4열 반응형 */}
      {layout === "scroll" ? (
        <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
          {products.map((p) => (
            <ProductCard key={p.id} product={p} formatPrice={formatPrice} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} formatPrice={formatPrice} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductCard({
  product: p,
  formatPrice,
}: {
  product: Product;
  formatPrice: (n: number) => string;
}) {
  return (
    <a
      href={p.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="block min-w-[120px] md:min-w-[140px] max-w-[180px] flex-shrink-0"
      style={{
        textDecoration: "none",
        color: "inherit",
        borderRadius: 8,
        border: "1px solid #f0f0f0",
        overflow: "hidden",
        background: "#fff",
        transition: "box-shadow 0.2s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)")}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={p.image}
        alt={p.name}
        className="w-full h-[100px] md:h-[140px] object-contain bg-[#fafafa] p-2"
      />
      <div className="p-2 md:px-2.5 md:py-2">
        <div
          className="text-[11px] md:text-xs font-medium text-gray-700 leading-snug"
          style={{
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            minHeight: 30,
          }}
        >
          {p.name}
        </div>
        <div className="mt-1 flex items-center gap-1">
          <span className="text-[13px] md:text-sm font-bold text-[#E8192C]">
            {formatPrice(p.price)}
          </span>
        </div>
        <div className="flex gap-1 mt-1">
          {p.isRocket && (
            <span className="text-[9px] md:text-[10px] text-[#00A0E0] font-semibold">
              로켓배송
            </span>
          )}
          {p.isFreeShipping && (
            <span className="text-[9px] md:text-[10px] text-[#4CAF50]">무료배송</span>
          )}
        </div>
      </div>
    </a>
  );
}
