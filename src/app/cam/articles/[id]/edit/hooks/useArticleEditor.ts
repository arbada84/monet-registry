"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import type { AiSettings, AuditEntry } from "@/types/article";
import { CATEGORIES as DEFAULT_CATEGORIES } from "@/lib/constants";
import { deleteArticle } from "@/lib/db";
import { reuploadArticleImages, uploadArticleThumbnail } from "./articleEditorMedia";
import { submitEditorArticle } from "./articleEditorSave";
import { useArticleEditorEffects } from "./useArticleEditorEffects";

type ArticleStatus = "게시" | "임시저장" | "예약" | "상신";

export function useArticleEditor() {
  const router = useRouter();
  const params = useParams();
  const articleId = params.id as string;

  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [notFound, setNotFound] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const isLoadedRef = useRef(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(DEFAULT_CATEGORIES[0]);
  const [body, setBody] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [status, setStatus] = useState<ArticleStatus>("게시");
  const [currentRole, setCurrentRole] = useState("");
  const [tags, setTags] = useState("");
  const [author, setAuthor] = useState("");
  const [authorEmail, setAuthorEmail] = useState("");
  const [summary, setSummary] = useState("");
  const [slug, setSlug] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [scheduledPublishAt, setScheduledPublishAt] = useState("");
  const [originalDate, setOriginalDate] = useState("");
  const [originalViews, setOriginalViews] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const [wordGoal, setWordGoal] = useState(0);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState("");
  const [saveElapsed, setSaveElapsed] = useState(0);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [distIndexNow, setDistIndexNow] = useState(true);
  const [distGooglePing, setDistGooglePing] = useState(true);
  const [submitError, setSubmitError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isDirtyRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [authors, setAuthors] = useState<{ id: string; name: string; email: string }[]>([]);
  const [thumbMode, setThumbMode] = useState<"file" | "url">("file");
  const [thumbUrl, setThumbUrl] = useState("");
  const [thumbUploading, setThumbUploading] = useState(false);
  const [thumbUploadError, setThumbUploadError] = useState("");
  const [thumbnailAlt, setThumbnailAlt] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [auditTrail, setAuditTrail] = useState<AuditEntry[]>([]);
  const [reviewNote, setReviewNote] = useState("");
  const [reuploadMsg, setReuploadMsg] = useState("");
  const [reuploading, setReuploading] = useState(false);

  useArticleEditorEffects({
    articleId, title, body, category, thumbnail, tags, author, summary, status,
    isLoadedRef, isDirtyRef, formRef, saveTimerRef, setNotFound, setPageLoading,
    setTitle, setCategory, setBody, setThumbnail, setThumbUrl, setThumbMode,
    setStatus, setTags, setAuthor, setAuthorEmail, setSummary, setSlug,
    setMetaDescription, setScheduledPublishAt, setThumbnailAlt, setOgImage,
    setOriginalDate, setOriginalViews, setSourceUrl, setAuditTrail, setReviewNote,
    setCurrentRole, setAiSettings, setCategories, setAuthors, setDistIndexNow,
    setDistGooglePing,
  });

  const plainText = body.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  const wordCount = plainText.length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 500));

  const updateDistDefaults = (key: "indexNow" | "googlePing", val: boolean) => {
    if (key === "indexNow") setDistIndexNow(val);
    else setDistGooglePing(val);
    try {
      const prev = JSON.parse(localStorage.getItem("cp-distribute-defaults") || "{}");
      localStorage.setItem("cp-distribute-defaults", JSON.stringify({ ...prev, [key]: val }));
    } catch { /* ignore */ }
  };

  const handleThumbnailUpload = (e: ChangeEvent<HTMLInputElement>) =>
    uploadArticleThumbnail(e, { setThumbnail, setThumbUploading, setThumbUploadError });

  const handleReuploadImages = () =>
    reuploadArticleImages({ body, thumbnail, setBody, setThumbnail, setReuploadMsg, setReuploading });

  const handleSubmit = (event: React.FormEvent) =>
    submitEditorArticle({
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
    });

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteArticle(articleId);
      router.push("/cam/articles");
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const goToList = () => router.push("/cam/articles");

  return {
    pageLoading,
    notFound,
    saveSuccess,
    submitError,
    showPreview,
    formRef,
    sourceUrl,
    goToList,
    handleSubmit,
    metadataProps: {
      title,
      setTitle,
      categories,
      category,
      setCategory,
      status,
      setStatus,
      currentRole,
      scheduledPublishAt,
      setScheduledPublishAt,
      authors,
      author,
      setAuthor,
      authorEmail,
      setAuthorEmail,
      tags,
      setTags,
      summary,
      setSummary,
      body,
      setBody,
      wordGoal,
      setWordGoal,
      showMobilePreview,
      setShowMobilePreview,
      wordCount,
      readingTime,
      thumbnail,
      setThumbnail,
      thumbMode,
      setThumbMode,
      thumbUrl,
      setThumbUrl,
      thumbUploading,
      thumbUploadError,
      thumbnailAlt,
      setThumbnailAlt,
      handleThumbnailUpload,
      handleReuploadImages,
      reuploading,
      reuploadMsg,
    },
    seoSettingsProps: {
      title,
      summary,
      slug,
      setSlug,
      metaDescription,
      setMetaDescription,
      ogImage,
      setOgImage,
    },
    aiToolsProps: {
      aiSettings,
      body,
      title,
      categories,
      thumbnail,
      setBody,
      setSummary,
      setTitle,
      setMetaDescription,
      setCategory,
      setThumbnail,
      setThumbUrl,
      setThumbMode,
    },
    portalSettingsProps: {
      distIndexNow,
      distGooglePing,
      updateDistDefaults,
    },
    seoChecklistProps: {
      title,
      thumbnail,
      summary,
      tags,
      slug,
    },
    actionBarProps: {
      currentRole,
      pageLoading,
      saving,
      reuploading,
      status,
      setStatus,
      saveElapsed,
      formRef,
      setShowPreview,
      goToList,
      confirmDelete,
      deleting,
      setConfirmDelete,
      onDelete: handleDelete,
      distIndexNow,
      distGooglePing,
    },
    saveProgressNoticeProps: {
      saving,
      saveProgress,
      saveElapsed,
    },
    reviewHistoryProps: {
      reviewNote,
      auditTrail,
    },
    previewModalProps: {
      category,
      title,
      author,
      authorEmail,
      originalDate,
      wordCount,
      readingTime,
      thumbnail,
      summary,
      body,
      tags,
      onClose: () => setShowPreview(false),
    },
  };
}
