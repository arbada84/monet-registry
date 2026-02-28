"use client";

import { useState, useEffect } from "react";

interface ShareButtons {
  facebook: boolean;
  twitter: boolean;
  kakao: boolean;
  naver: boolean;
  link: boolean;
  email: boolean;
}

interface ArticleShareProps {
  title: string;
}

const DEFAULT_SHARE: ShareButtons = { facebook: true, twitter: true, kakao: true, naver: true, link: true, email: false };

export default function ArticleShare({ title }: ArticleShareProps) {
  const [shareToast, setShareToast] = useState(false);
  const [shareButtons, setShareButtons] = useState<ShareButtons>(DEFAULT_SHARE);
  const [kakaoJsKey, setKakaoJsKey] = useState("");

  useEffect(() => {
    fetch("/api/db/settings?key=cp-sns-settings&fallback=%7B%7D", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const sns = data.value ?? {};
        if (sns.shareButtons) setShareButtons({ ...DEFAULT_SHARE, ...sns.shareButtons });
        if (sns.kakaoJsKey) setKakaoJsKey(sns.kakaoJsKey);
      })
      .catch(() => {});
  }, []);

  // 카카오 SDK 초기화
  useEffect(() => {
    if (!kakaoJsKey) return;
    const win = window as unknown as Record<string, unknown>;
    const kakao = win["Kakao"] as { isInitialized?: () => boolean; init?: (key: string) => void } | undefined;
    if (kakao && kakao.isInitialized && !kakao.isInitialized()) {
      kakao.init?.(kakaoJsKey);
    }
  }, [kakaoJsKey]);

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url: window.location.href });
        return;
      } catch {
        // 취소 또는 미지원 → fallback
      }
    }
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // 무시
    }
    setShareToast(true);
    setTimeout(() => setShareToast(false), 2000);
  };

  const sendGaShare = (platform: string) => {
    const win = window as Window & { gtag?: (...args: unknown[]) => void };
    if (win.gtag) {
      win.gtag("event", "share", { method: platform, content_type: "article", item_id: window.location.pathname });
    }
  };

  const handleShare = (platform: string) => {
    sendGaShare(platform);
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(title);
    switch (platform) {
      case "facebook":
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, "_blank", "width=600,height=400");
        break;
      case "twitter":
        window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, "_blank", "width=600,height=400");
        break;
      case "kakao": {
        const win = window as unknown as Record<string, unknown>;
        const kakao = win["Kakao"] as {
          isInitialized?: () => boolean;
          Share?: { sendDefault?: (opts: Record<string, unknown>) => void };
        } | undefined;
        if (kakao?.Share?.sendDefault) {
          kakao.Share.sendDefault({
            objectType: "feed",
            content: {
              title,
              description: "",
              imageUrl: "",
              link: { mobileWebUrl: window.location.href, webUrl: window.location.href },
            },
          });
        } else {
          // Kakao SDK 없으면 카카오스토리로 폴백
          window.open(`https://story.kakao.com/share?url=${url}`, "_blank", "width=600,height=500");
        }
        break;
      }
      case "naver":
        window.open(`https://share.naver.com/web/shareView?url=${url}&title=${text}`, "_blank", "width=600,height=500");
        break;
      case "copy":
        navigator.clipboard.writeText(window.location.href).catch(() => {});
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2000);
        break;
      case "email":
        window.location.href = `mailto:?subject=${text}&body=${url}`;
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
      {shareButtons.facebook && (
        <button
          onClick={() => handleShare("facebook")}
          aria-label="Facebook으로 공유"
          className="px-3 py-2 text-xs rounded text-white hover:opacity-80"
          style={{ background: "#1877F2" }}
        >
          Facebook
        </button>
      )}
      {shareButtons.twitter && (
        <button
          onClick={() => handleShare("twitter")}
          aria-label="X(Twitter)로 공유"
          className="px-3 py-2 text-xs rounded text-white hover:opacity-80"
          style={{ background: "#000" }}
        >
          X
        </button>
      )}
      {shareButtons.kakao && (
        <button
          onClick={() => handleShare("kakao")}
          aria-label="카카오로 공유"
          className="px-3 py-2 text-xs rounded hover:opacity-80"
          style={{ background: "#FEE500", color: "#3C1E1E" }}
        >
          카카오
        </button>
      )}
      {shareButtons.naver && (
        <button
          onClick={() => handleShare("naver")}
          aria-label="네이버로 공유"
          className="px-3 py-2 text-xs rounded text-white hover:opacity-80"
          style={{ background: "#03C75A" }}
        >
          네이버
        </button>
      )}
      {shareButtons.link && (
        <button
          onClick={() => handleShare("copy")}
          aria-label="링크 복사"
          className="px-3 py-2 text-xs border border-gray-300 rounded hover:bg-gray-50"
        >
          링크 복사
        </button>
      )}
      {shareButtons.email && (
        <button
          onClick={() => handleShare("email")}
          aria-label="이메일로 공유"
          className="px-3 py-2 text-xs border border-gray-300 rounded hover:bg-gray-50"
        >
          이메일
        </button>
      )}
      {shareToast && (
        <span className="absolute top-full left-0 mt-2 px-3 py-1 bg-gray-800 text-white text-xs rounded shadow" role="status">
          링크가 복사되었습니다
        </span>
      )}
    </div>
  );
}
