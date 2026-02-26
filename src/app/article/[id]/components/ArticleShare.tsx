"use client";

import { useState } from "react";

interface ArticleShareProps {
  title: string;
}

export default function ArticleShare({ title }: ArticleShareProps) {
  const [shareToast, setShareToast] = useState(false);

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url: window.location.href });
        return;
      } catch {
        // 취소 또는 미지원 → fallback
      }
    }
    // fallback: 링크 복사
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // clipboard도 실패 시 무시
    }
    setShareToast(true);
    setTimeout(() => setShareToast(false), 2000);
  };

  const handleShare = (platform: string) => {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(title);
    switch (platform) {
      case "facebook":
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, "_blank", "width=600,height=400");
        break;
      case "twitter":
        window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, "_blank", "width=600,height=400");
        break;
      case "kakao":
        window.open(`https://story.kakao.com/share?url=${url}`, "_blank", "width=600,height=500");
        break;
      case "copy":
        navigator.clipboard.writeText(window.location.href).catch(() => {});
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2000);
        break;
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mb-8 pb-8 border-b border-gray-200 relative">
      <span className="text-sm font-medium text-gray-600">공유하기</span>
      {/* 모바일 네이티브 공유 버튼 */}
      {typeof navigator !== "undefined" && "share" in navigator && (
        <button
          onClick={handleNativeShare}
          aria-label="공유하기"
          className="px-3 py-2 text-xs rounded text-white hover:opacity-80"
          style={{ background: "#E8192C" }}
        >
          공유
        </button>
      )}
      <button
        onClick={() => handleShare("facebook")}
        aria-label="Facebook으로 공유"
        className="px-3 py-2 text-xs rounded text-white hover:opacity-80"
        style={{ background: "#1877F2" }}
      >
        Facebook
      </button>
      <button
        onClick={() => handleShare("twitter")}
        aria-label="X(Twitter)로 공유"
        className="px-3 py-2 text-xs rounded text-white hover:opacity-80"
        style={{ background: "#000" }}
      >
        X
      </button>
      <button
        onClick={() => handleShare("kakao")}
        aria-label="카카오스토리로 공유"
        className="px-3 py-2 text-xs rounded hover:opacity-80"
        style={{ background: "#FEE500", color: "#3C1E1E" }}
      >
        카카오스토리
      </button>
      <button
        onClick={() => handleShare("copy")}
        aria-label="링크 복사"
        className="px-3 py-2 text-xs border border-gray-300 rounded hover:bg-gray-50"
      >
        링크 복사
      </button>
      {shareToast && (
        <span className="absolute top-full left-0 mt-2 px-3 py-1 bg-gray-800 text-white text-xs rounded shadow" role="status">
          링크가 복사되었습니다
        </span>
      )}
    </div>
  );
}
