import dynamicImport from "next/dynamic";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ name: string }>;
}

// 빌드 최적화: 정적 생성 비활성화 — 요청 시 동적 렌더링
// export async function generateStaticParams() { ... }

export default async function PageLivePreview({ params }: PageProps) {
  const { name: pageName } = await params;

  const PageComponent = dynamicImport(
    () =>
      import(`@/components/pages/${pageName}/index`).catch(() => {
        return () => <div>Failed to load page component</div>;
      })
  );

  return (
    <>
      <style>{`
        #app-root { min-height: 0 !important; display: block !important; }
      `}</style>
      <div className="min-h-screen bg-white">
        <PageComponent />
      </div>
    </>
  );
}
