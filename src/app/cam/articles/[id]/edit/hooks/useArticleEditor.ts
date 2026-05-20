"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { AiSettings, AuditEntry } from "@/types/article";
import { CATEGORIES as DEFAULT_CATEGORIES } from "@/lib/constants";
import { deleteArticle, getArticleById, getSetting, updateArticle } from "@/lib/db";
import { logActivity } from "@/lib/log-activity";
import { reuploadImagesInHtml, reuploadImageUrl } from "@/lib/reupload-images";

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

  useEffect(() => {
    getArticleById(articleId).then((article) => {
      if (!article) {
        setNotFound(true);
        setPageLoading(false);
        return;
      }
      setTitle(article.title);
      setCategory(article.category);
      setBody(article.body);
      const thumb = article.thumbnail || "";
      setThumbnail(thumb);
      if (thumb && (thumb.startsWith("http") || thumb.startsWith("/uploads/"))) {
        setThumbUrl(thumb);
        setThumbMode("url");
      }
      setStatus(article.status as ArticleStatus);
      setTags(article.tags || "");
      setAuthor(article.author || "");
      setAuthorEmail(article.authorEmail || "");
      setSummary(article.summary || "");
      setSlug(article.slug || "");
      setMetaDescription(article.metaDescription || "");
      setScheduledPublishAt(article.scheduledPublishAt || "");
      setThumbnailAlt(article.thumbnailAlt || "");
      setOgImage(article.ogImage || "");
      setOriginalDate(article.date);
      setOriginalViews(article.views);
      setSourceUrl(article.sourceUrl || "");
      setAuditTrail(article.auditTrail || []);
      setReviewNote(article.reviewNote || "");
      setPageLoading(false);
      setTimeout(() => { isLoadedRef.current = true; }, 0);
    }).catch(() => {
      setNotFound(true);
      setPageLoading(false);
    });
  }, [articleId]);

  useEffect(() => {
    const currentUserName = localStorage.getItem("cp-admin-user") || "";
    fetch("/api/auth/me", { credentials: "include" }).then((r) => r.json()).then((d) => {
      if (d.role) setCurrentRole(d.role);
    }).catch(() => {});

    Promise.all([
      getSetting<AiSettings | null>("cp-ai-settings", null),
      getSetting<{ name: string }[] | null>("cp-categories", null),
      getSetting<{ id: string; name: string; email?: string; role?: string; active?: boolean }[] | null>("cp-admin-accounts", null),
    ]).then(([s, cats, accs]) => {
      if (s) setAiSettings(s);
      if (cats && cats.length > 0) {
        setCategories(cats.map((c) => c.name));
      }
      const activeAuthors = accs ? accs
        .filter((a) => a.active !== false && a.name)
        .map((a) => ({ id: a.id, name: a.name, email: a.email || "" })) : [];
      setAuthors(activeAuthors);

      if (!author && currentUserName) {
        const matched = activeAuthors.find((a) => a.name === currentUserName);
        if (matched) {
          setAuthor(matched.name);
          setAuthorEmail(matched.email);
        } else {
          setAuthor(currentUserName);
        }
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("cp-distribute-defaults");
      if (saved) {
        const d = JSON.parse(saved);
        if (typeof d.indexNow === "boolean") setDistIndexNow(d.indexNow);
        if (typeof d.googlePing === "boolean") setDistGooglePing(d.googlePing);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (isLoadedRef.current && (title || body)) isDirtyRef.current = true;
  }, [title, body]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        try {
          localStorage.setItem(`cp-draft-${articleId}`, JSON.stringify({
            title, body, category, thumbnail, tags, author, summary, status,
            savedAt: new Date().toISOString(),
          }));
        } catch { /* localStorage 실패 시 무시 */ }
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [articleId, title, body, category, thumbnail, tags, author, summary, status]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearInterval(saveTimerRef.current);
    };
  }, []);

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

  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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
    }
    setThumbUploading(false);
    e.target.value = "";
  };

  const handleReuploadImages = async () => {
    setReuploading(true);
    setReuploadMsg("이미지 이관 중…");
    try {
      const { html: newBody, uploaded, failed, firstError } = await reuploadImagesInHtml(body, (done, total) => {
        setReuploadMsg(`이미지 업로드 중… (${done}/${total})`);
      });
      setBody(newBody);
      let newThumb = thumbnail;
      if (thumbnail && !thumbnail.includes("supabase")) {
        setReuploadMsg("썸네일 업로드 중…");
        newThumb = await reuploadImageUrl(thumbnail);
        setThumbnail(newThumb);
      }
      const msg = uploaded > 0
        ? `완료: ${uploaded}개 Supabase 이관${failed > 0 ? `, ${failed}개 실패` : ""} — 저장 버튼을 눌러 반영하세요.`
        : failed > 0
        ? `이미지 이관 실패 (${failed}개) — ${firstError || "원본 URL 유지"}`
        : "이관할 외부 이미지가 없습니다.";
      setReuploadMsg(msg);
    } catch {
      setReuploadMsg("이미지 이관 중 오류가 발생했습니다.");
    } finally {
      setReuploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setSubmitError("제목을 입력해주세요."); return; }
    if ((status === "게시" || status === "예약") && !body.replace(/<[^>]*>/g, "").trim()) { setSubmitError("본문 내용을 입력해주세요."); return; }
    if (status === "예약" && !scheduledPublishAt) { setSubmitError("예약 발행 일시를 입력해주세요."); return; }
    if (status === "예약" && scheduledPublishAt && new Date(scheduledPublishAt).getTime() <= Date.now()) { setSubmitError("예약 발행 시간은 현재 시간보다 뒤여야 합니다."); return; }
    setSubmitError("");

    setSaving(true);
    setSaveProgress("저장 준비 중...");
    setSaveElapsed(0);
    const startTime = Date.now();
    const TIMEOUT_SEC = 30;

    saveTimerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setSaveElapsed(elapsed);
      if (elapsed >= TIMEOUT_SEC) {
        return;
      } else if (elapsed >= 20) {
        setSaveProgress("⚠ 서버 응답이 매우 느립니다. 네트워크 상태를 확인하세요...");
      } else if (elapsed >= 15) {
        setSaveProgress("⚠ 서버 응답 지연 중... 이미지 이관이 진행 중일 수 있습니다");
      } else if (elapsed >= 10) {
        setSaveProgress("서버 처리 중... 본문 이미지가 많으면 시간이 걸릴 수 있습니다");
      } else if (elapsed >= 5) {
        setSaveProgress("서버에 데이터 전송 완료. 처리 대기 중...");
      }
    }, 1000);

    let finalBody = body;
    if (thumbnail) {
      const thumbSrc = thumbnail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      finalBody = finalBody
        .replace(new RegExp(`<figure[^>]*>\\s*<img[^>]+src="${thumbSrc}"[^>]*>\\s*(?:<figcaption[^>]*>[^<]*</figcaption>\\s*)?</figure>`, "gi"), "")
        .replace(new RegExp(`<img[^>]+src="${thumbSrc}"[^>]*>`, "gi"), "")
        .replace(/<p>\s*<\/p>/g, "");
    }

    const savePromise = updateArticle(articleId, {
      title: title.trim(),
      category,
      status,
      body: finalBody,
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

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), TIMEOUT_SEC * 1000)
    );

    setSaveProgress("서버에 저장 중...");

    try {
      await Promise.race([savePromise, timeoutPromise]);
    } catch (err) {
      if (saveTimerRef.current) clearInterval(saveTimerRef.current);
      setSaving(false);
      if (err instanceof Error && err.message === "TIMEOUT") {
        setSaveProgress(`⛔ ${TIMEOUT_SEC}초 초과 — 서버가 응답하지 않습니다`);
        setSubmitError(`저장 시간이 ${TIMEOUT_SEC}초를 초과했습니다. 서버 상태를 확인하거나 다시 시도해주세요.`);
      } else {
        setSaveProgress("⛔ 저장 실패");
        setSubmitError("기사 저장에 실패했습니다. 다시 시도해주세요.");
      }
      setTimeout(() => setSaveProgress(""), 5000);
      return;
    }

    if (saveTimerRef.current) clearInterval(saveTimerRef.current);
    const totalSec = Math.floor((Date.now() - startTime) / 1000);
    setSaveProgress(`✔ 저장 완료 (${totalSec}초 소요)`);
    setTimeout(() => { setSaving(false); setSaveProgress(""); }, 2000);

    isDirtyRef.current = false;
    logActivity({ action: "기사 수정", target: title.trim(), targetId: articleId, detail: `상태: ${status}` });

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

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
