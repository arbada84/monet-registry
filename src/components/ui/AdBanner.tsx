/**
 * AdBanner — 광고 슬롯 렌더링 컴포넌트 (서버 컴포넌트)
 * 어드민 > 광고 관리에서 설정한 슬롯을 실제로 렌더링합니다.
 */
import { serverGetSetting } from "@/lib/db-server";
import AdSenseUnit from "@/components/ui/AdSenseUnit";
import CoupangUnit from "@/components/ui/CoupangUnit";
import ScriptUnit from "@/components/ui/ScriptUnit";

type AdPosition =
  | "top" | "bottom" | "left" | "right" | "middle"
  | "home-mid-1" | "home-mid-2"
  | "article-top" | "article-bottom" | "article-inline"
  | "floating-left" | "floating-right";

type AdDevice = "all" | "pc" | "mobile";

interface AdSlot {
  id: string;
  position: AdPosition;
  name: string;
  enabled: boolean;
  device?: AdDevice;
  provider: "adsense" | "coupang" | "image" | "script";
  // Google AdSense
  adsenseSlotId: string;
  adsenseFormat: "auto" | "horizontal" | "vertical" | "rectangle" | "in-article" | "in-feed";
  adsenseResponsive: boolean;
  // Coupang Partners
  coupangBannerId: string;
  coupangSubId: string;
  coupangTemplate: "banner" | "dynamic" | "search" | "product" | "carousel";
  coupangKeyword: string;
  // Image banner
  imageUrl: string;
  linkUrl: string;
  // Script
  scriptCode: string;
  // Common
  width: string;
  height: string;
  startDate: string;
  endDate: string;
  memo: string;
}

interface AdGlobalSettings {
  adsensePublisherId: string;
  adsenseAutoAds: boolean;
  adsenseAnchorAds: boolean;
  coupangPartnersId: string;
  coupangSubId: string;
  adsTxtContent: string;
  globalAdEnabled: boolean;
}

interface AdBannerProps {
  position?: AdPosition;
  height?: number;
  className?: string;
}

function isAdActive(ad: AdSlot): boolean {
  if (!ad.enabled) return false;
  const today = new Date().toISOString().slice(0, 10);
  if (ad.startDate && today < ad.startDate) return false;
  if (ad.endDate && today > ad.endDate) return false;
  return true;
}

export default async function AdBanner({
  position = "right",
  height = 250,
  className = "",
}: AdBannerProps) {
  const [globalSettings, ads] = await Promise.all([
    serverGetSetting<AdGlobalSettings>("cp-ads-global", {
      adsensePublisherId: "",
      adsenseAutoAds: false,
      adsenseAnchorAds: false,
      coupangPartnersId: "",
      coupangSubId: "",
      adsTxtContent: "",
      globalAdEnabled: true,
    }),
    serverGetSetting<AdSlot[]>("cp-ads", []),
  ]);

  // 전체 광고 비활성화 시 아무것도 렌더링하지 않음
  if (!globalSettings.globalAdEnabled) return null;

  // 해당 position의 활성 광고 필터링
  const activeSlots = ads.filter(
    (a) => a.position === position && isAdActive(a)
  );

  // 활성 광고 없을 때: 개발환경에서만 placeholder, 프로덕션에서는 null
  if (activeSlots.length === 0) {
    if (process.env.NODE_ENV !== "production") {
      return (
        <div
          className={className}
          style={{
            width: "100%",
            minHeight: height,
            background: "#F5F5F5",
            border: "1px dashed #DDD",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#BBB",
            fontSize: 12,
          }}
        >
          광고 영역 ({position})
        </div>
      );
    }
    return null;
  }

  // 디바이스별 분류: PC 전용, 모바일 전용, 공통
  const pcSlots = activeSlots.filter((a) => a.device === "pc");
  const mobileSlots = activeSlots.filter((a) => a.device === "mobile");
  const allSlots = activeSlots.filter((a) => !a.device || a.device === "all");

  // 디바이스 분리 설정이 있으면 각각 렌더링, 없으면 첫 번째 슬롯만
  const hasSeparate = pcSlots.length > 0 || mobileSlots.length > 0;

  if (hasSeparate) {
    const pcSlot = pcSlots[0] || allSlots[0];
    const mobileSlot = mobileSlots[0] || allSlots[0];
    return (
      <div className={className} style={{ width: "100%" }}>
        {/* PC 전용 (768px 이상) */}
        {pcSlot && (
          <div className="hidden md:block">
            <SlotRenderer slot={pcSlot} globalSettings={globalSettings} height={height} />
          </div>
        )}
        {/* 모바일 전용 (768px 미만) */}
        {mobileSlot && (
          <div className="md:hidden">
            <SlotRenderer slot={mobileSlot} globalSettings={globalSettings} height={height} />
          </div>
        )}
      </div>
    );
  }

  // 디바이스 분리 없으면 첫 번째 슬롯 렌더링
  return (
    <div className={className} style={{ width: "100%" }}>
      <SlotRenderer slot={allSlots[0] || activeSlots[0]} globalSettings={globalSettings} height={height} />
    </div>
  );
}

/** 개별 광고 슬롯 렌더링 */
function SlotRenderer({ slot, globalSettings, height }: { slot: AdSlot; globalSettings: AdGlobalSettings; height: number }) {
  const slotHeight = slot.height ? Number(slot.height) : height;

  return (
    <>
      {/* 이미지 배너 */}
      {slot.provider === "image" && slot.imageUrl && (
        slot.linkUrl ? (
          <a href={slot.linkUrl} target="_blank" rel="noopener noreferrer nofollow">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slot.imageUrl}
              alt={slot.name}
              style={{
                width: "100%",
                height: slotHeight ? `${slotHeight}px` : "auto",
                objectFit: "cover",
                display: "block",
                borderRadius: 4,
              }}
            />
          </a>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slot.imageUrl}
            alt={slot.name}
            style={{
              width: "100%",
              height: slotHeight ? `${slotHeight}px` : "auto",
              objectFit: "cover",
              display: "block",
              borderRadius: 4,
            }}
          />
        )
      )}

      {/* Google AdSense */}
      {slot.provider === "adsense" && globalSettings.adsensePublisherId && (
        <AdSenseUnit
          publisherId={globalSettings.adsensePublisherId}
          slotId={slot.adsenseSlotId || ""}
          format={slot.adsenseResponsive ? "auto" : slot.adsenseFormat}
          responsive={slot.adsenseResponsive}
        />
      )}

      {/* 쿠팡 파트너스 */}
      {slot.provider === "coupang" && slot.coupangBannerId && (
        <CoupangUnit
          id={Number(slot.coupangBannerId)}
          trackingCode={globalSettings.coupangPartnersId || undefined}
          template={slot.coupangTemplate}
          subId={slot.coupangSubId || globalSettings.coupangSubId || undefined}
          keyword={slot.coupangKeyword || undefined}
          width={slot.width || "728"}
          height={slot.height || "90"}
        />
      )}

      {/* 직접 스크립트 */}
      {slot.provider === "script" && slot.scriptCode && (
        <ScriptUnit scriptCode={slot.scriptCode} />
      )}
    </>
  );
}
