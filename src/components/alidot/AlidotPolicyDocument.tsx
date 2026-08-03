import Link from "next/link";
import type { ReactNode } from "react";
import { ALIDOT_LEGAL, ALIDOT_PATHS } from "@/lib/alidot-legal";

export interface AlidotPolicySection {
  id: string;
  title: string;
  content: ReactNode;
}

export default function AlidotPolicyDocument({
  title,
  summary,
  sections,
}: {
  title: string;
  summary: string;
  sections: AlidotPolicySection[];
}) {
  return (
    <>
      <header className="border-b border-[#dfe3ea] bg-[#f5f7fb]">
        <div className="mx-auto max-w-[980px] px-4 py-10 sm:py-14">
          <p className="mb-3 text-sm font-semibold text-[#155eef]">알리닷 정책</p>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
          <p className="mt-4 max-w-[720px] text-base leading-7 text-[#5b6472]">{summary}</p>
          <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm text-[#667085]">
            <div className="flex gap-2"><dt>운영자</dt><dd className="font-semibold text-[#303642]">{ALIDOT_LEGAL.operatorName}</dd></div>
            <div className="flex gap-2"><dt>시행일</dt><dd className="font-semibold text-[#303642]">{ALIDOT_LEGAL.effectiveDate}</dd></div>
            <div className="flex gap-2"><dt>버전</dt><dd className="font-semibold text-[#303642]">{ALIDOT_LEGAL.policyVersion}</dd></div>
          </dl>
        </div>
      </header>

      <div className="mx-auto grid max-w-[980px] gap-10 px-4 py-10 md:grid-cols-[220px_minmax(0,1fr)] md:py-14">
        <aside className="self-start border-l-2 border-[#dfe3ea] pl-4 md:sticky md:top-6">
          <p className="mb-3 text-sm font-bold text-[#303642]">목차</p>
          <nav aria-label={`${title} 목차`}>
            <ul className="space-y-2 text-sm leading-6 text-[#667085]">
              {sections.map((section) => (
                <li key={section.id}><a href={`#${section.id}`} className="underline-offset-4 hover:underline">{section.title}</a></li>
              ))}
            </ul>
          </nav>
        </aside>

        <article className="min-w-0">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-6 border-b border-[#e4e7ec] py-8 first:pt-0 last:border-b-0">
              <h2 className="text-xl font-bold leading-8 text-[#20242c]">{section.title}</h2>
              <div className="mt-4 space-y-4 text-[15px] leading-7 text-[#4d5664]">{section.content}</div>
            </section>
          ))}
          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 border-t border-[#cfd5df] pt-6 text-sm font-semibold">
            <Link href={ALIDOT_PATHS.home} className="underline underline-offset-4">알리닷 소개</Link>
            <Link href={ALIDOT_PATHS.terms} className="underline underline-offset-4">이용약관</Link>
            <Link href={ALIDOT_PATHS.privacy} className="underline underline-offset-4">개인정보처리방침</Link>
            <Link href={ALIDOT_LEGAL.contactPath} className="underline underline-offset-4">문의하기</Link>
          </div>
        </article>
      </div>
    </>
  );
}

