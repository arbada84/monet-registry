"use client";

import type { Dispatch, FormEvent, MutableRefObject, SetStateAction } from "react";
import { updateArticle } from "@/lib/db";
import { logActivity } from "@/lib/log-activity";

type ArticleStatus = "게시" | "임시저장" | "예약" | "상신";

interface SubmitEditorArticleParams {
  event: FormEvent;
  articleId: string;
  title: string;
  category: string;
  status: ArticleStatus;
  body: string;
  thumbnail: string;
  thumbnailAlt: string;
  tags: string;
  author: string;
  authorEmail: string;
  summary: string;
  slug: string;
  metaDescription: string;
  ogImage: string;
  scheduledPublishAt: string;
  sourceUrl: string;
  originalDate: string;
  originalViews: number;
  distIndexNow: boolean;
  distGooglePing: boolean;
  saveTimerRef: MutableRefObject<ReturnType<typeof setInterval> | null>;
  isDirtyRef: MutableRefObject<boolean>;
  setSubmitError: Dispatch<SetStateAction<string>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
  setSaveProgress: Dispatch<SetStateAction<string>>;
  setSaveElapsed: Dispatch<SetStateAction<number>>;
  setSaveSuccess: Dispatch<SetStateAction<boolean>>;
}

function stripThumbnailFromBody(body: string, thumbnail: string) {
  if (!thumbnail) return body;
  const thumbSrc = thumbnail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return body
    .replace(new RegExp(`<figure[^>]*>\\s*<img[^>]+src="${thumbSrc}"[^>]*>\\s*(?:<figcaption[^>]*>[^<]*</figcaption>\\s*)?</figure>`, "gi"), "")
    .replace(new RegExp(`<img[^>]+src="${thumbSrc}"[^>]*>`, "gi"), "")
    .replace(/<p>\s*<\/p>/g, "");
}

export async function submitEditorArticle({
  event,
  articleId,
  title,
  category,
  status,
  body,
  thumbnail,
  thumbnailAlt,
  tags,
  author,
  authorEmail,
  summary,
  slug,
  metaDescription,
  ogImage,
  scheduledPublishAt,
  sourceUrl,
  originalDate,
  originalViews,
  distIndexNow,
  distGooglePing,
  saveTimerRef,
  isDirtyRef,
  setSubmitError,
  setSaving,
  setSaveProgress,
  setSaveElapsed,
  setSaveSuccess,
}: SubmitEditorArticleParams) {
  event.preventDefault();
  if (!title.trim()) { setSubmitError("제목을 입력해주세요."); return; }
  if ((status === "게시" || status === "예약") && !body.replace(/<[^>]*>/g, "").trim()) { setSubmitError("본문 내용을 입력해주세요."); return; }
  if (status === "예약" && !scheduledPublishAt) { setSubmitError("예약 발행 일시를 입력해주세요."); return; }
  if (status === "예약" && scheduledPublishAt && new Date(scheduledPublishAt).getTime() <= Date.now()) { setSubmitError("예약 발행 시간은 현재 시간보다 늦어야 합니다."); return; }

  setSubmitError("");
  setSaving(true);
  setSaveProgress("저장 준비 중...");
  setSaveElapsed(0);

  const startTime = Date.now();
  const TIMEOUT_SEC = 30;
  saveTimerRef.current = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    setSaveElapsed(elapsed);
    if (elapsed >= 20) setSaveProgress("서버 응답이 지연되고 있습니다. 네트워크 상태를 확인하세요...");
    else if (elapsed >= 15) setSaveProgress("서버 응답 대기 중... 이미지 이동이 진행 중일 수 있습니다.");
    else if (elapsed >= 10) setSaveProgress("서버 처리 중... 본문 이미지가 많으면 시간이 걸릴 수 있습니다.");
    else if (elapsed >= 5) setSaveProgress("서버로 데이터 전송 완료. 처리 대기 중...");
  }, 1000);

  const savePromise = updateArticle(articleId, {
    title: title.trim(),
    category,
    status,
    body: stripThumbnailFromBody(body, thumbnail),
    thumbnail,
    thumbnailAlt: thumbnailAlt || undefined,
    tags,
    author: author || (localStorage.getItem("cp-admin-user") || "관리자"),
    authorEmail: authorEmail || undefined,
    summary,
    slug: slug || undefined,
    metaDescription: metaDescription || undefined,
    ogImage: ogImage || undefined,
    scheduledPublishAt: status === "예약" && scheduledPublishAt ? scheduledPublishAt : undefined,
    sourceUrl: sourceUrl || undefined,
    date: originalDate,
    views: originalViews,
  }, { indexNow: distIndexNow, googlePing: distGooglePing });
  const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), TIMEOUT_SEC * 1000));

  setSaveProgress("서버에 저장 중...");
  try {
    await Promise.race([savePromise, timeoutPromise]);
  } catch (err) {
    if (saveTimerRef.current) clearInterval(saveTimerRef.current);
    setSaving(false);
    if (err instanceof Error && err.message === "TIMEOUT") {
      setSaveProgress(`${TIMEOUT_SEC}초 초과: 서버가 응답하지 않았습니다.`);
      setSubmitError(`저장 시간이 ${TIMEOUT_SEC}초를 초과했습니다. 서버 상태를 확인하거나 다시 시도해주세요.`);
    } else {
      setSaveProgress("저장 실패");
      setSubmitError("기사 저장에 실패했습니다. 다시 시도해주세요.");
    }
    setTimeout(() => setSaveProgress(""), 5000);
    return;
  }

  if (saveTimerRef.current) clearInterval(saveTimerRef.current);
  setSaveProgress(`저장 완료 (${Math.floor((Date.now() - startTime) / 1000)}초 소요)`);
  setTimeout(() => { setSaving(false); setSaveProgress(""); }, 2000);

  isDirtyRef.current = false;
  logActivity({ action: "수정", target: title.trim(), targetId: articleId, detail: `상태: ${status}` });
  setSaveSuccess(true);
  setTimeout(() => setSaveSuccess(false), 3000);
}
