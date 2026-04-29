import dynamicImport from "next/dynamic";
import { notFound, redirect } from "next/navigation";
import type { ComponentType } from "react";
import { getPagePreviewBucketName } from "@/generated/page-live-preview";

interface PageBucketPreviewPageProps {
  params: Promise<{ name: string }>;
  bucket: string;
  getPageComponentLoader: (name: string) => (() => Promise<unknown>) | undefined;
}

export async function renderPageBucketPreview({
  params,
  bucket,
  getPageComponentLoader,
}: PageBucketPreviewPageProps) {
  const { name: pageName } = await params;
  const expectedBucket = getPagePreviewBucketName(pageName);

  if (bucket !== expectedBucket) {
    redirect(`/page-live-preview-render/buckets/${expectedBucket}/${encodeURIComponent(pageName)}`);
  }

  const loader = getPageComponentLoader(pageName);
  if (!loader) notFound();

  const PageComponent = dynamicImport(loader as () => Promise<{ default: ComponentType<Record<string, never>> }>, {
    loading: () => <div>Loading page...</div>,
  });

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
