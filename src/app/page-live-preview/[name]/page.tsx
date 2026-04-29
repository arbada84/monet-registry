import { notFound, redirect } from "next/navigation";
import { getPagePreviewBucketName, isPageLivePreviewName } from "@/generated/page-live-preview";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ name: string }>;
}

// Keep the legacy preview URL while avoiding a broad pages dynamic import context.
export default async function PageLivePreview({ params }: PageProps) {
  const { name: pageName } = await params;

  if (!isPageLivePreviewName(pageName)) notFound();

  const bucket = getPagePreviewBucketName(pageName);
  redirect(`/page-live-preview-render/buckets/${bucket}/${encodeURIComponent(pageName)}`);
}
