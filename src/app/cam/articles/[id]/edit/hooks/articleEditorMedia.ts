"use client";

import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { reuploadImagesInHtml, reuploadImageUrl } from "@/lib/reupload-images";

interface ThumbnailUploadParams {
  setThumbnail: Dispatch<SetStateAction<string>>;
  setThumbUploading: Dispatch<SetStateAction<boolean>>;
  setThumbUploadError: Dispatch<SetStateAction<string>>;
}

export async function uploadArticleThumbnail(
  event: ChangeEvent<HTMLInputElement>,
  { setThumbnail, setThumbUploading, setThumbUploadError }: ThumbnailUploadParams,
) {
  const file = event.target.files?.[0];
  if (!file) return;

  setThumbUploading(true);
  setThumbUploadError("");

  try {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload/image", { method: "POST", body: formData });
    const data = await res.json();

    if (data.success && data.url) {
      setThumbnail(data.url);
    } else {
      setThumbUploadError(data.error || "업로드에 실패했습니다.");
    }
  } catch {
    setThumbUploadError("업로드 중 오류가 발생했습니다.");
  } finally {
    setThumbUploading(false);
    event.target.value = "";
  }
}

interface ReuploadArticleImagesParams {
  body: string;
  thumbnail: string;
  setBody: Dispatch<SetStateAction<string>>;
  setThumbnail: Dispatch<SetStateAction<string>>;
  setReuploadMsg: Dispatch<SetStateAction<string>>;
  setReuploading: Dispatch<SetStateAction<boolean>>;
}

export async function reuploadArticleImages({
  body,
  thumbnail,
  setBody,
  setThumbnail,
  setReuploadMsg,
  setReuploading,
}: ReuploadArticleImagesParams) {
  setReuploading(true);
  setReuploadMsg("이미지 이동 준비 중...");

  try {
    const { html: newBody, uploaded, failed, firstError } = await reuploadImagesInHtml(body, (done, total) => {
      setReuploadMsg(`이미지 업로드 중... (${done}/${total})`);
    });
    setBody(newBody);

    if (thumbnail && !thumbnail.includes("supabase")) {
      setReuploadMsg("대표 이미지 업로드 중...");
      setThumbnail(await reuploadImageUrl(thumbnail));
    }

    if (uploaded > 0) {
      setReuploadMsg(`완료: ${uploaded}개 Supabase 이동${failed > 0 ? `, ${failed}개 실패` : ""}. 저장 버튼을 눌러 반영하세요.`);
    } else if (failed > 0) {
      setReuploadMsg(`이미지 이동 실패 (${failed}개): ${firstError || "원본 URL 유지"}`);
    } else {
      setReuploadMsg("이동할 외부 이미지가 없습니다.");
    }
  } catch {
    setReuploadMsg("이미지 이동 중 오류가 발생했습니다.");
  } finally {
    setReuploading(false);
  }
}
