"use client";

import { useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react";
import type { AiSettings, AuditEntry } from "@/types/article";
import { CATEGORIES as DEFAULT_CATEGORIES } from "@/lib/constants";
import { getArticleById, getSetting } from "@/lib/db";

type ArticleStatus = "게시" | "임시저장" | "예약" | "상신";
type AuthorOption = { id: string; name: string; email: string };

interface ArticleEditorEffectsParams {
  articleId: string;
  title: string;
  body: string;
  category: string;
  thumbnail: string;
  tags: string;
  author: string;
  summary: string;
  status: ArticleStatus;
  isLoadedRef: MutableRefObject<boolean>;
  isDirtyRef: MutableRefObject<boolean>;
  formRef: RefObject<HTMLFormElement | null>;
  saveTimerRef: MutableRefObject<ReturnType<typeof setInterval> | null>;
  setNotFound: Dispatch<SetStateAction<boolean>>;
  setPageLoading: Dispatch<SetStateAction<boolean>>;
  setTitle: Dispatch<SetStateAction<string>>;
  setCategory: Dispatch<SetStateAction<string>>;
  setBody: Dispatch<SetStateAction<string>>;
  setThumbnail: Dispatch<SetStateAction<string>>;
  setThumbUrl: Dispatch<SetStateAction<string>>;
  setThumbMode: Dispatch<SetStateAction<"file" | "url">>;
  setStatus: Dispatch<SetStateAction<ArticleStatus>>;
  setTags: Dispatch<SetStateAction<string>>;
  setAuthor: Dispatch<SetStateAction<string>>;
  setAuthorEmail: Dispatch<SetStateAction<string>>;
  setSummary: Dispatch<SetStateAction<string>>;
  setSlug: Dispatch<SetStateAction<string>>;
  setMetaDescription: Dispatch<SetStateAction<string>>;
  setScheduledPublishAt: Dispatch<SetStateAction<string>>;
  setThumbnailAlt: Dispatch<SetStateAction<string>>;
  setOgImage: Dispatch<SetStateAction<string>>;
  setOriginalDate: Dispatch<SetStateAction<string>>;
  setOriginalViews: Dispatch<SetStateAction<number>>;
  setSourceUrl: Dispatch<SetStateAction<string>>;
  setAuditTrail: Dispatch<SetStateAction<AuditEntry[]>>;
  setReviewNote: Dispatch<SetStateAction<string>>;
  setCurrentRole: Dispatch<SetStateAction<string>>;
  setAiSettings: Dispatch<SetStateAction<AiSettings | null>>;
  setCategories: Dispatch<SetStateAction<string[]>>;
  setAuthors: Dispatch<SetStateAction<AuthorOption[]>>;
  setDistIndexNow: Dispatch<SetStateAction<boolean>>;
  setDistGooglePing: Dispatch<SetStateAction<boolean>>;
}

export function useArticleEditorEffects(params: ArticleEditorEffectsParams) {
  const {
    articleId, title, body, category, thumbnail, tags, author, summary, status,
    isLoadedRef, isDirtyRef, formRef, saveTimerRef, setNotFound, setPageLoading,
    setTitle, setCategory, setBody, setThumbnail, setThumbUrl, setThumbMode,
    setStatus, setTags, setAuthor, setAuthorEmail, setSummary, setSlug,
    setMetaDescription, setScheduledPublishAt, setThumbnailAlt, setOgImage,
    setOriginalDate, setOriginalViews, setSourceUrl, setAuditTrail, setReviewNote,
    setCurrentRole, setAiSettings, setCategories, setAuthors, setDistIndexNow,
    setDistGooglePing,
  } = params;

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
  }, [articleId, isLoadedRef, setAuditTrail, setAuthor, setAuthorEmail, setBody, setCategory, setMetaDescription, setNotFound, setOgImage, setOriginalDate, setOriginalViews, setPageLoading, setReviewNote, setScheduledPublishAt, setSlug, setSourceUrl, setStatus, setSummary, setTags, setThumbMode, setThumbUrl, setThumbnail, setThumbnailAlt, setTitle]);

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
      if (cats && cats.length > 0) setCategories(cats.map((c) => c.name));
      const activeAuthors = accs
        ? accs.filter((a) => a.active !== false && a.name).map((a) => ({ id: a.id, name: a.name, email: a.email || "" }))
        : [];
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
  }, [setDistGooglePing, setDistIndexNow]);

  useEffect(() => {
    if (isLoadedRef.current && (title || body)) isDirtyRef.current = true;
  }, [body, isDirtyRef, isLoadedRef, title]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        try {
          localStorage.setItem(`cp-draft-${articleId}`, JSON.stringify({
            title, body, category, thumbnail, tags, author, summary, status,
            savedAt: new Date().toISOString(),
          }));
        } catch { /* ignore localStorage failures */ }
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [articleId, author, body, category, isDirtyRef, status, summary, tags, thumbnail, title]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [formRef]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearInterval(saveTimerRef.current);
  }, [saveTimerRef]);
}
