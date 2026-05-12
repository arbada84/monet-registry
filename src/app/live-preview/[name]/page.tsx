import { redirect } from "next/navigation";
import { getRegistryPreviewBucketName } from "@/generated/live-preview-buckets";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ name: string }>;
}

// Keep registry previews dynamic and route each request to its generated bucket.
export default async function ComponentPage({ params }: PageProps) {
  const { name: componentName } = await params;
  const bucket = getRegistryPreviewBucketName(componentName);
  redirect(`/live-preview-render/buckets/${bucket}/${encodeURIComponent(componentName)}`);
}
