import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, Film, Link2Off, ShieldCheck } from "lucide-react";
import AlidotPublicShell from "@/components/alidot/AlidotPublicShell";
import { ALIDOT_LEGAL, ALIDOT_PATHS } from "@/lib/alidot-legal";
import { getBaseUrl } from "@/lib/get-base-url";
import { getSiteType } from "@/lib/site-type";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "알리닷 | 숏폼 콘텐츠 브랜드",
  description: "컬피가 운영하는 숏폼 콘텐츠 브랜드 알리닷의 서비스와 운영 원칙을 안내합니다.",
  alternates: { canonical: `${getBaseUrl()}${ALIDOT_PATHS.home}` },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
};

const SERVICE_ROWS = [
  { icon: Film, title: "숏폼 콘텐츠 제작", body: "주제를 고르고 대본, 이미지, 음성, 영상을 구성해 짧고 명확한 콘텐츠를 제작합니다." },
  { icon: CheckCircle2, title: "게시 전 검토", body: "사실관계와 사용 권리, 제목과 설명을 확인한 콘텐츠만 운영 채널에 게시합니다." },
  { icon: ShieldCheck, title: "권리와 출처 존중", body: "무단 복제나 워터마크 제거를 허용하지 않으며 플랫폼 정책과 콘텐츠 권리를 준수합니다." },
] as const;

export default async function AlidotPage() {
  const siteType = await getSiteType();
  return (
    <AlidotPublicShell siteType={siteType} currentPath={ALIDOT_PATHS.home}>
      <section className="relative min-h-[520px] overflow-hidden bg-[#111722] text-white sm:min-h-[560px]">
        <Image
          src="/alidot/alidot-symbol.png"
          alt=""
          width={1280}
          height={1280}
          priority
          className="pointer-events-none absolute right-[-24%] top-[-12%] h-[680px] w-[680px] object-contain opacity-25 sm:right-[-8%] sm:h-[820px] sm:w-[820px]"
        />
        <div className="relative mx-auto flex min-h-[520px] max-w-[1180px] flex-col justify-center px-4 py-16 sm:min-h-[560px]">
          <p className="text-sm font-semibold text-[#8db2ff]">컬피가 운영하는 숏폼 콘텐츠 브랜드</p>
          <h1 className="mt-4 max-w-[720px] text-5xl font-bold leading-[1.12] sm:text-7xl">알리닷</h1>
          <p className="mt-5 max-w-[620px] text-lg leading-8 text-[#d7deea] sm:text-xl">
            알면 더 재미있는 세상의 이야기를 짧고 명확하게 전합니다.
          </p>
          <div className="mt-9 flex flex-wrap gap-4 text-sm font-semibold">
            <Link href={ALIDOT_PATHS.terms} className="border-b-2 border-[#4b7dff] pb-1 text-white">서비스 이용약관</Link>
            <Link href={ALIDOT_PATHS.privacy} className="border-b-2 border-[#ff4d59] pb-1 text-white">개인정보처리방침</Link>
          </div>
        </div>
      </section>

      <section className="border-b border-[#e4e7ec] bg-white">
        <div className="mx-auto max-w-[1180px] px-4 py-14 sm:py-20">
          <h2 className="text-2xl font-bold sm:text-3xl">지금 제공하는 서비스</h2>
          <div className="mt-9 grid gap-8 md:grid-cols-3">
            {SERVICE_ROWS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="border-t-2 border-[#1f2937] pt-5">
                <Icon aria-hidden="true" className="h-6 w-6 text-[#155eef]" />
                <h3 className="mt-4 text-lg font-bold">{title}</h3>
                <p className="mt-3 text-[15px] leading-7 text-[#5b6472]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f5f7fb]">
        <div className="mx-auto grid max-w-[1180px] gap-8 px-4 py-14 md:grid-cols-[220px_minmax(0,1fr)] sm:py-20">
          <div><Link2Off aria-hidden="true" className="h-9 w-9 text-[#ff3e4d]" /></div>
          <div>
            <p className="text-sm font-semibold text-[#667085]">TikTok 연동 상태</p>
            <h2 className="mt-2 text-2xl font-bold leading-tight sm:text-3xl">현재 계정 연결이나 자동 게시 기능을 제공하지 않습니다.</h2>
            <p className="mt-5 max-w-[760px] text-base leading-8 text-[#56606f]">
              알리닷 공개 페이지는 TikTok 비밀번호, OAuth 토큰, 사용자 영상 또는 게시 기록을 수집하지 않습니다.
              향후 연동 기능을 도입할 경우 실제 기능과 데이터 처리 기준을 먼저 공개하고 사용자의 명시적 승인을 받습니다.
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-[#dfe3ea] bg-white">
        <div className="mx-auto max-w-[1180px] px-4 py-12 text-sm leading-7 text-[#5b6472]">
          <p><strong className="text-[#20242c]">운영자</strong> {ALIDOT_LEGAL.operatorName} · 대표 {ALIDOT_LEGAL.representativeName} · 사업자등록번호 {ALIDOT_LEGAL.businessRegistrationNumber}</p>
          <p className="mt-2">알리닷은 TikTok이 제공하거나 보증하는 공식 서비스가 아닙니다. TikTok은 해당 권리자의 상표입니다.</p>
          <Link href={ALIDOT_LEGAL.contactPath} className="mt-5 inline-block font-semibold underline underline-offset-4">서비스 문의</Link>
        </div>
      </section>
    </AlidotPublicShell>
  );
}

