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

      {/* 상품 목록 */}
      {layout === "scroll" ? (
        <div
          style={{
            display: "flex",
            gap: 12,
            overflowX: "auto",
            paddingBottom: 4,
            scrollbarWidth: "thin",
          }}
        >
          {products.map((p) => (
            <ProductCard key={p.id} product={p} formatPrice={formatPrice} />
          ))}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(products.length, 4)}, 1fr)`,
            gap: 12,
          }}
        >
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
      style={{
        display: "block",
        minWidth: 140,
        maxWidth: 180,
        flex: "0 0 auto",
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
        style={{
          width: "100%",
          height: 140,
          objectFit: "contain",
          background: "#fafafa",
          padding: 8,
        }}
      />
      <div style={{ padding: "8px 10px" }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "#333",
            lineHeight: 1.4,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            minHeight: 34,
          }}
        >
          {p.name}
        </div>
        <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#E8192C" }}>
            {formatPrice(p.price)}
          </span>
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
          {p.isRocket && (
            <span style={{ fontSize: 10, color: "#00A0E0", fontWeight: 600 }}>
              로켓배송
            </span>
          )}
          {p.isFreeShipping && (
            <span style={{ fontSize: 10, color: "#4CAF50" }}>무료배송</span>
          )}
        </div>
      </div>
    </a>
  );
}
