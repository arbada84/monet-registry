import dynamicImport from "next/dynamic";
import { notFound, redirect } from "next/navigation";
import type { ComponentType } from "react";
import { getRegistryPreviewBucketName } from "@/generated/live-preview-buckets";

interface RegistryBucketPreviewPageProps {
  params: Promise<{ name: string }>;
  bucket: string;
  getRegistryComponentLoader: (name: string) => (() => Promise<unknown>) | undefined;
}

export async function renderRegistryBucketPreview({
  params,
  bucket,
  getRegistryComponentLoader,
}: RegistryBucketPreviewPageProps) {
  const { name: componentName } = await params;
  const expectedBucket = getRegistryPreviewBucketName(componentName);

  if (bucket !== expectedBucket) {
    redirect(`/live-preview-render/buckets/${expectedBucket}/${encodeURIComponent(componentName)}`);
  }

  const loader = getRegistryComponentLoader(componentName);
  if (!loader) notFound();

  const Component = dynamicImport(loader as () => Promise<{ default: ComponentType }>, {
    loading: () => <div>Loading component...</div>,
  });

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
