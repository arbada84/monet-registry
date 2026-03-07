import dynamicImport from "next/dynamic";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ name: string }>;
}

// 빌드 최적화: 정적 생성 비활성화 — 요청 시 동적 렌더링
// export async function generateStaticParams() { ... }

export default async function ComponentPage({ params }: PageProps) {
  const { name: componentName } = await params;

  const Component = dynamicImport(() =>
    import(`@/components/registry/${componentName}/index`).catch(() => {
      return () => <div>Failed to load component</div>;
    })
  );

  return (
    <>
      <style>{`
        #app-root { min-height: 0 !important; display: block !important; }
      `}</style>
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Component />
      </div>
    </>
  );
}
