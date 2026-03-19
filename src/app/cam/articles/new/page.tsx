"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Article, AiSettings } from "@/types/article";
import { CATEGORIES as DEFAULT_CATEGORIES } from "@/lib/constants";
import { inputStyle, labelStyle } from "@/lib/admin-styles";
import { createArticle, getSetting } from "@/lib/db";
import dynamic from "next/dynamic";
const RichEditor = dynamic(() => import("@/components/RichEditor"), {
  ssr: false,
  loading: () => <div className="h-96 bg-gray-50 animate-pulse rounded" />,
});
import AiSkillPanel from "@/components/AiSkillPanel";
import ImageSearchPanel from "@/components/ImageSearchPanel";
import DOMPurify from "dompurify";
import { logActivity } from "@/lib/log-activity";

function ArticleNewInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromPress = searchParams.get("from") === "press";

  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(DEFAULT_CATEGORIES[0]);
  const [body, setBody] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [status, setStatus] = useState<"게시" | "임시저장" | "예약" | "상신">("게시");
  const [currentRole, setCurrentRole] = useState("");
  const [tags, setTags] = useState("");
  const [author, setAuthor] = useState("");
  const [authorEmail, setAuthorEmail] = useState("");
  const [summary, setSummary] = useState("");
  const [slug, setSlug] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [scheduledPublishAt, setScheduledPublishAt] = useState("");
  const [sourceInfo, setSourceInfo] = useState<{ source: string; sourceUrl: string; date: string } | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");

  // 초안 복구 배너 상태 (confirm() 대신 인라인 배너)
  const [draftBanner, setDraftBanner] = useState<{ draft: Record<string, string> } | null>(null);

  // Auto-save state
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const [wordGoal, setWordGoal] = useState(0);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI state
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);

  // 배포 설정 (localStorage에 기본값 저장)
  const [distIndexNow, setDistIndexNow] = useState(true);
  const [distGooglePing, setDistGooglePing] = useState(true);
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
  const updateDistDefaults = (key: "indexNow" | "googlePing", val: boolean) => {
    if (key === "indexNow") setDistIndexNow(val);
    else setDistGooglePing(val);
    try {
      const prev = JSON.parse(localStorage.getItem("cp-distribute-defaults") || "{}");
      localStorage.setItem("cp-distribute-defaults", JSON.stringify({ ...prev, [key]: val }));
    } catch { /* ignore */ }
  };

  // Submit error
  const [submitError, setSubmitError] = useState("");

  // 저장 전 경고 (미저장 변경사항)
  const isDirtyRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const isMountedRef = useRef(true);

  // 작성자 목록 (활성 계정)
  const [authors, setAuthors] = useState<{ id: string; name: string; email: string }[]>([]);

  // Thumbnail URL input mode
  const [thumbMode, setThumbMode] = useState<"file" | "url">("file");
  const [thumbUrl, setThumbUrl] = useState("");
  const [thumbUploading, setThumbUploading] = useState(false);
  const [thumbUploadError, setThumbUploadError] = useState("");
  const [thumbnailAlt, setThumbnailAlt] = useState("");

  // Load press import data
  useEffect(() => {
    if (fromPress) {
      const raw = sessionStorage.getItem("cp-press-import");
      if (raw) {
        try {
          const data = JSON.parse(raw);
          setTitle(data.title || "");
          setBody(data.body || "");
          // 작성자는 로그인 계정 기준으로 자동 선택 (아래 useEffect에서 처리)
          if (data.thumbnail) {
            setThumbUrl(data.thumbnail);
            setThumbMode("url");
            setThumbnail(data.thumbnail);
          }
          if (data.source || data.sourceUrl) {
            setSourceInfo({ source: data.source || "", sourceUrl: data.sourceUrl || "", date: data.date || "" });
            setSourceUrl(data.sourceUrl || "");
          }
          sessionStorage.removeItem("cp-press-import");
        } catch {
          // ignore
        }
      }
    }
  }, [fromPress]);

  // Load AI settings + dynamic categories + authors + role
  useEffect(() => {
    const currentUserName = localStorage.getItem("cp-admin-user") || "";
    // 현재 역할 가져오기
    fetch("/api/auth/me", { credentials: "include" }).then((r) => r.json()).then((d) => {
      if (d.role) {
        setCurrentRole(d.role);
        // 기자는 상신만 가능
        if (d.role === "reporter") setStatus("상신");
      }
    }).catch(() => {});

    Promise.all([
      getSetting<AiSettings | null>("cp-ai-settings", null),
      getSetting<{ name: string }[] | null>("cp-categories", null),
      getSetting<{ id: string; name: string; email?: string; role?: string; active?: boolean }[] | null>("cp-admin-accounts", null),
    ]).then(([s, cats, accs]) => {
      if (s) setAiSettings(s);
      if (cats && cats.length > 0) {
        const names = cats.map((c) => c.name);
        setCategories(names);
        setCategory((prev) => names.includes(prev) ? prev : names[0]);
      }
      // 활성 계정을 작성자 목록으로 사용
      const activeAuthors = accs ? accs.filter((a) => a.active !== false && a.name).map((a) => ({ id: a.id, name: a.name, email: a.email || "" })) : [];
      setAuthors(activeAuthors);

      // 로그인 계정 이름으로 자동 선택
      if (currentUserName) {
        const matched = activeAuthors.find((a) => a.name === currentUserName);
        if (matched) {
          setAuthor(matched.name);
          setAuthorEmail(matched.email);
        } else {
          setAuthor(currentUserName);
        }
      }
    }).catch(() => {});
  }, []);

  // 초안 로드 — confirm() 대신 배너로 표시
  useEffect(() => {
    if (fromPress) return;
    const raw = localStorage.getItem("cp-article-draft");
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      if (d.title || d.body) {
        setDraftBanner({ draft: d });
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restoreDraft = () => {
    if (!draftBanner) return;
    const d = draftBanner.draft;
    setTitle(d.title || "");
    setCategory(d.category || categories[0]);
    setBody(d.body || "");
    setThumbnail(d.thumbnail || "");
    setStatus((d.status as "게시" | "임시저장" | "예약") || "게시");
    setTags(d.tags || "");
    setAuthor(d.author || "");
    setAuthorEmail(d.authorEmail || "");
    setSummary(d.summary || "");
    setSlug(d.slug || "");
    setMetaDescription(d.metaDescription || "");
    setDraftBanner(null);
  };

  const discardDraft = () => {
    localStorage.removeItem("cp-article-draft");
    setDraftBanner(null);
  };

  // isMountedRef cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Auto-save draft every 3 seconds
  useEffect(() => {
    if (!title && !body) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      setSaving(true);
      const draft = { title, category, body, thumbnail, status, tags, author, authorEmail, summary, slug, metaDescription };
      localStorage.setItem("cp-article-draft", JSON.stringify(draft));
      setLastSaved(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setSaving(false);
    }, 3000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [title, category, body, thumbnail, status, tags, author, authorEmail, summary, slug, metaDescription]);

  // isDirty 추적 — title/body 변경 시 true
  useEffect(() => {
    if (title || body) isDirtyRef.current = true;
  }, [title, body]);

  // 미저장 변경사항 경고 (beforeunload)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Ctrl+S 저장 단축키
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

  // Word count & reading time
  const plainText = body.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  const wordCount = plainText.length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 500));

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setSubmitError("제목을 입력해주세요."); return; }
    if ((status === "게시" || status === "예약") && !body.replace(/<[^>]*>/g, "").trim()) { setSubmitError("본문 내용을 입력해주세요."); return; }
    if (status === "예약" && !scheduledPublishAt) { setSubmitError("예약 발행 일시를 입력해주세요."); return; }
    if (status === "예약" && scheduledPublishAt && new Date(scheduledPublishAt).getTime() <= Date.now()) { setSubmitError("예약 발행 시간은 현재 시간보다 뒤여야 합니다."); return; }
    setSubmitError("");

    // 메인 이미지(썸네일)가 본문에도 포함되어 있으면 본문에서 제거 (중복 방지)
    let finalBody = body;
    if (thumbnail) {
      const thumbSrc = thumbnail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      finalBody = finalBody
        .replace(new RegExp(`<figure[^>]*>\\s*<img[^>]+src="${thumbSrc}"[^>]*>\\s*(?:<figcaption[^>]*>[^<]*</figcaption>\\s*)?</figure>`, "gi"), "")
        .replace(new RegExp(`<img[^>]+src="${thumbSrc}"[^>]*>`, "gi"), "")
        .replace(/<p>\s*<\/p>/g, "");
    }

    const newArticle: Article = {
      id: crypto.randomUUID(),
      title: title.trim(),
      category,
      date: new Date().toISOString().slice(0, 10),
      status,
      views: 0,
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
    };

    try {
      await createArticle(newArticle, { indexNow: distIndexNow, googlePing: distGooglePing });
    } catch {
      setSubmitError("기사 저장에 실패했습니다. 다시 시도해주세요.");
      return;
    }
    isDirtyRef.current = false;
    localStorage.removeItem("cp-article-draft");
    logActivity({ action: "기사 작성", target: title.trim(), detail: `상태: ${status}, 카테고리: ${category}` });

    router.push("/cam/articles");
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>
          {fromPress ? "보도자료 기사 작성" : "기사 작성"}
        </h1>
        {sourceInfo && (
          <div style={{ fontSize: 12, color: "#999" }}>
            출처: {sourceInfo.source} · {sourceInfo.date}
          </div>
        )}
      </div>

      {/* 초안 복구 배너 (confirm() 대체) */}
      {draftBanner && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 18px", marginBottom: 20,
          background: "#FFF8E1", border: "1px solid #FFE082", borderRadius: 10,
          fontSize: 13,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16 }}>📝</span>
            <div>
              <span style={{ fontWeight: 600, color: "#795548" }}>저장되지 않은 초안이 있습니다.</span>
              {draftBanner.draft.title && (
                <span style={{ color: "#888", marginLeft: 8 }}>
                  &quot;{String(draftBanner.draft.title).slice(0, 30)}{String(draftBanner.draft.title).length > 30 ? "..." : ""}&quot;
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={restoreDraft}
              style={{ padding: "6px 16px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              불러오기
            </button>
            <button
              type="button"
              onClick={discardDraft}
              style={{ padding: "6px 16px", background: "#FFF", color: "#666", border: "1px solid #DDD", borderRadius: 6, fontSize: 13, cursor: "pointer" }}
            >
              삭제
            </button>
          </div>
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit} style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Source Info Banner */}
        {sourceInfo && (
          <div style={{ background: "#FFF8E1", border: "1px solid #FFE082", borderRadius: 10, padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
            <span style={{ fontSize: 16 }}>📥</span>
            <div>
              <span style={{ fontWeight: 600, color: "#F57F17" }}>보도자료에서 가져옴</span>
              <span style={{ color: "#666", marginLeft: 8 }}>{sourceInfo.source}</span>
              {sourceInfo.sourceUrl && (
                <a href={sourceInfo.sourceUrl} target="_blank" rel="noopener" style={{ marginLeft: 8, color: "#1976D2", fontSize: 12 }}>[원문 보기]</a>
              )}
            </div>
          </div>
        )}

        {/* Basic Info */}
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>제목</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="기사 제목을 입력하세요" style={inputStyle} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>카테고리</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}>
                {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>상태</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as "게시" | "임시저장" | "예약" | "상신")} style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}>
                {currentRole === "reporter" ? (
                  <>
                    <option value="상신">상신</option>
                    <option value="임시저장">임시저장</option>
                  </>
                ) : (
                  <>
                    <option value="게시">게시</option>
                    <option value="임시저장">임시저장</option>
                    <option value="예약">예약 발행</option>
                    <option value="상신">상신</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {status === "예약" && (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>예약 발행 일시</label>
              <input type="datetime-local" value={scheduledPublishAt} onChange={(e) => setScheduledPublishAt(e.target.value)} style={inputStyle} />
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>작성자</label>
              <select
                value={authors.find((a) => a.name === author)?.id || ""}
                onChange={(e) => {
                  if (!e.target.value) { setAuthor(""); setAuthorEmail(""); return; }
                  const a = authors.find((a) => a.id === e.target.value);
                  if (a) { setAuthor(a.name); setAuthorEmail(a.email); }
                }}
                style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}
              >
                <option value="">-- 작성자 선택 --</option>
                {authors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>작성자 이메일</label>
              <input
                type="email"
                value={authorEmail}
                readOnly
                placeholder="기자 선택 시 자동 입력"
                style={{ ...inputStyle, background: "#F5F5F5", cursor: "default", color: authorEmail ? "#333" : "#AAA" }}
              />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>태그</label>
            <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="쉼표로 구분 (예: 문화, 예술, 전시)" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>요약문</label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="기사 요약문 (SNS 공유, 검색결과에 표시)" rows={2} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <label style={labelStyle}>본문</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="number"
                  min={0}
                  step={500}
                  placeholder="목표 글자수"
                  value={wordGoal || ""}
                  onChange={(e) => setWordGoal(Number(e.target.value))}
                  style={{ width: 100, padding: "3px 8px", fontSize: 12, border: "1px solid #DDD", borderRadius: 6, outline: "none" }}
                />
                <button
                  type="button"
                  onClick={() => setShowMobilePreview(!showMobilePreview)}
                  title="모바일 미리보기 (320px)"
                  style={{ padding: "3px 10px", fontSize: 12, border: `1px solid ${showMobilePreview ? "#E8192C" : "#DDD"}`, borderRadius: 6, background: showMobilePreview ? "#FFF0F0" : "#FFF", color: showMobilePreview ? "#E8192C" : "#666", cursor: "pointer" }}
                >
                  📱 모바일
                </button>
              </div>
            </div>
            {showMobilePreview ? (
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <RichEditor content={body} onChange={setBody} placeholder="기사 본문을 입력하세요" />
                </div>
                <div style={{ width: 320, flexShrink: 0, border: "1px solid #DDD", borderRadius: 8, overflow: "hidden", background: "#FFF" }}>
                  <div style={{ background: "#333", padding: "6px 12px", fontSize: 11, color: "#FFF", textAlign: "center" }}>모바일 미리보기 (320px)</div>
                  <div style={{ padding: 16, fontSize: 14, lineHeight: 1.7, maxHeight: 400, overflowY: "auto" }}>
                    {title && <h1 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, lineHeight: 1.4 }}>{title}</h1>}
                    <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(body) }} style={{ color: "#333" }} />
                  </div>
                </div>
              </div>
            ) : (
              <RichEditor content={body} onChange={setBody} placeholder="기사 본문을 입력하세요" />
            )}
            {wordGoal > 0 && (
              <div style={{ marginTop: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: wordCount >= wordGoal ? "#4CAF50" : "#999", marginBottom: 2 }}>
                  <span>{wordCount.toLocaleString()} / {wordGoal.toLocaleString()}자 목표</span>
                  <span>{Math.min(100, Math.round((wordCount / wordGoal) * 100))}%</span>
                </div>
                <div style={{ height: 4, background: "#EEE", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, (wordCount / wordGoal) * 100)}%`, background: wordCount >= wordGoal ? "#4CAF50" : "#E8192C", borderRadius: 2, transition: "width 0.3s" }} />
                </div>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12, color: "#999" }}>
              <span>{wordCount.toLocaleString()}자 · 약 {readingTime}분 읽기</span>
              <span style={{ color: saving ? "#FF9800" : "#999" }}>
                {saving ? "저장 중..." : lastSaved ? `자동저장: ${lastSaved}` : "Ctrl+S로 저장"}
              </span>
            </div>
          </div>

          <div>
            <label style={labelStyle}>썸네일 이미지</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {(["file", "url"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setThumbMode(m)} style={{ padding: "4px 14px", fontSize: 12, border: `1px solid ${thumbMode === m ? "#E8192C" : "#DDD"}`, borderRadius: 6, background: thumbMode === m ? "#FFF0F0" : "#FFF", color: thumbMode === m ? "#E8192C" : "#666", cursor: "pointer" }}>
                  {m === "file" ? "파일 업로드" : "URL 직접 입력"}
                </button>
              ))}
            </div>
            {thumbMode === "file" ? (
              <div>
                <input type="file" accept="image/*" disabled={thumbUploading} onChange={handleThumbnailUpload} style={{ fontSize: 14 }} />
                {thumbUploading && <span style={{ marginLeft: 8, fontSize: 12, color: "#999" }}>업로드 중...</span>}
                {thumbUploadError && <div style={{ marginTop: 4, fontSize: 12, color: "#E8192C" }}>{thumbUploadError}</div>}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <input type="url" value={thumbUrl} onChange={(e) => setThumbUrl(e.target.value)} placeholder="https://example.com/image.jpg" style={{ ...inputStyle, flex: 1 }} />
                <button type="button" onClick={() => setThumbnail(thumbUrl)} style={{ padding: "8px 16px", background: "#F5F5F5", border: "1px solid #DDD", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>적용</button>
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <input
                type="text"
                value={thumbnailAlt}
                onChange={(e) => setThumbnailAlt(e.target.value)}
                placeholder="이미지 설명 (alt 텍스트, SEO용)"
                style={{ ...inputStyle, fontSize: 12, marginBottom: 8 }}
              />
              {thumbnail && (
                <div style={{ padding: 12, background: "#FAFAFA", borderRadius: 8, border: "1px solid #EEE", display: "flex", alignItems: "center", gap: 12 }}>
                  <img src={thumbnail} alt={thumbnailAlt || "썸네일 미리보기"} style={{ maxWidth: 240, maxHeight: 160, objectFit: "cover", borderRadius: 6 }} />
                  <button type="button" onClick={() => { setThumbnail(""); setThumbUrl(""); setThumbnailAlt(""); }} style={{ fontSize: 12, color: "#E8192C", background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                    삭제
                  </button>
                </div>
              )}
            </div>
            <ImageSearchPanel
              title={title}
              body={body}
              onSelectThumbnail={(url, alt) => {
                setThumbnail(url);
                setThumbUrl(url);
                setThumbMode("url");
                if (alt && !thumbnailAlt) setThumbnailAlt(alt);
              }}
              onInsertBody={(url, alt) => {
                setBody((prev) => prev + `<p><img src="${url}" alt="${alt}" /></p>`);
              }}
            />
          </div>
        </div>

        {/* SEO Settings */}
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>SEO 설정</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>URL 슬러그</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="text" value={slug} onChange={(e) => setSlug(e.target.value.replace(/[^a-z0-9가-힣-]/g, ""))} placeholder="url-friendly-slug" style={{ ...inputStyle, flex: 1 }} />
                <button type="button" onClick={() => {
                  const generated = title.trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9가-힣\s]/g, "")
                    .replace(/\s+/g, "-")
                    .replace(/^-+|-+$/g, "")
                    .slice(0, 80) || `article-${Date.now()}`;
                  setSlug(generated);
                }} style={{ padding: "8px 16px", background: "#F5F5F5", border: "1px solid #DDD", borderRadius: 8, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
                  자동생성
                </button>
              </div>
            </div>
            <div>
              <label style={labelStyle}>메타 설명 ({metaDescription.length}/160)</label>
              <textarea value={metaDescription} onChange={(e) => setMetaDescription(e.target.value.slice(0, 160))} placeholder="검색결과에 표시될 설명 (50~160자 권장)" rows={2} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
            </div>
            <div>
              <label style={labelStyle}>OG 이미지 URL <span style={{ fontSize: 11, color: "#999", fontWeight: 400 }}>(SNS 공유 시 표시 — 미입력 시 썸네일 사용)</span></label>
              <input type="url" value={ogImage} onChange={(e) => setOgImage(e.target.value)} placeholder="https://example.com/og-image.jpg (1200×630 권장)" style={inputStyle} />
            </div>
            {(title || metaDescription) && (
              <div style={{ background: "#FAFAFA", borderRadius: 8, padding: 16, border: "1px solid #EEE" }}>
                <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>검색결과 미리보기</div>
                <div style={{ fontSize: 16, color: "#1A0DAB", fontWeight: 500, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title || "기사 제목"}</div>
                <div style={{ fontSize: 12, color: "#006621", marginBottom: 4 }}>culturepeople.co.kr/article/{slug || "..."}</div>
                <div style={{ fontSize: 13, color: "#545454", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{metaDescription || summary || "기사 요약문이 여기에 표시됩니다."}</div>
              </div>
            )}
          </div>
        </div>

        {/* AI Editing Tools */}
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
          <AiSkillPanel
            aiSettings={aiSettings}
            body={body}
            title={title}
            categories={categories}
            onApply={(target, content) => {
              if (target === "body") setBody(content);
              else if (target === "summary") setSummary(content);
              else if (target === "title") setTitle(content);
              else if (target === "meta") setMetaDescription(content.slice(0, 160));
            }}
            onApplyAll={(data) => {
              if (data.title) setTitle(data.title);
              if (data.summary) setSummary(data.summary);
              if (data.body) setBody(data.body);
              if (data.category && categories.includes(data.category)) setCategory(data.category);
              // 대표 이미지가 없으면 본문 <img> 태그에서 첫 번째 이미지 자동 추출
              if (!thumbnail && data.body) {
                const imgMatch = data.body.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*>/i);
                if (imgMatch?.[1]) {
                  setThumbnail(imgMatch[1]);
                  setThumbUrl(imgMatch[1]);
                  setThumbMode("url");
                }
              }
            }}
          />
        </div>

        {/* 포털 배포 설정 */}
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>포털 배포</h3>
            <span style={{ fontSize: 11, color: "#999" }}>선택 상태는 다음 작성 시에도 유지됩니다</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "10px 14px", borderRadius: 8, cursor: "pointer",
              background: distIndexNow ? "#E3F2FD" : "#FAFAFA",
              border: `1px solid ${distIndexNow ? "#90CAF9" : "#EEE"}`,
            }}>
              <input type="checkbox" checked={distIndexNow} onChange={(e) => updateDistDefaults("indexNow", e.target.checked)} style={{ width: 16, height: 16, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>IndexNow 색인 요청</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>게시 시 Bing, Yandex, 네이버 등에 즉시 색인 요청</div>
              </div>
            </label>
            <label style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "10px 14px", borderRadius: 8, cursor: "pointer",
              background: distGooglePing ? "#E3F2FD" : "#FAFAFA",
              border: `1px solid ${distGooglePing ? "#90CAF9" : "#EEE"}`,
            }}>
              <input type="checkbox" checked={distGooglePing} onChange={(e) => updateDistDefaults("googlePing", e.target.checked)} style={{ width: 16, height: 16, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>Google 사이트맵 ping</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Google에 사이트맵 갱신 알림 전송</div>
              </div>
            </label>
          </div>
          <div style={{ fontSize: 12, color: "#999", marginTop: 10 }}>
            <a href="/cam/seo" style={{ color: "#1565C0", textDecoration: "underline" }}>SEO 설정</a>에서 API 키 등록 |
            <a href="/cam/distribute" style={{ color: "#1565C0", textDecoration: "underline", marginLeft: 4 }}>일괄 배포 관리</a>
          </div>
        </div>

        {/* Actions */}
        {submitError && (
          <div style={{ padding: "10px 16px", background: "#FFEBEE", border: "1px solid #FFCDD2", borderRadius: 8, color: "#C62828", fontSize: 13 }}>
            {submitError}
          </div>
        )}

        {/* F3: SEO 체크리스트 (경고만, 발행 차단 안 함) */}
        {(() => {
          const seoChecks = [
            { label: "제목 20자 이상", ok: title.trim().length >= 20 },
            { label: "썸네일 설정", ok: !!thumbnail },
            { label: "요약문 작성", ok: !!summary.trim() },
            { label: "태그 입력", ok: !!tags.trim() },
            { label: "slug 설정", ok: !!slug.trim() },
          ];
          const passedCount = seoChecks.filter((c) => c.ok).length;
          const passedAll = passedCount === seoChecks.length;
          return (
            <div style={{
              padding: "12px 16px",
              background: passedAll ? "#F1F8E9" : "#FFFDE7",
              border: `1px solid ${passedAll ? "#AED581" : "#FFE082"}`,
              borderRadius: 8,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: passedAll ? 0 : 10 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: passedAll ? "#558B2F" : "#F57F17" }}>
                  {passedAll ? "SEO 완료" : `SEO ${passedCount}/${seoChecks.length}`}
                </span>
                {!passedAll && <span style={{ fontSize: 12, color: "#888" }}>— 미완료 항목이 있습니다 (발행은 가능합니다)</span>}
              </div>
              {!passedAll && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
                  {seoChecks.map((c) => (
                    <span key={c.label} style={{ fontSize: 12, color: c.ok ? "#558B2F" : "#F57F17", display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 10 }}>{c.ok ? "✓" : "!"}</span>
                      {c.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button type="submit" style={{
            padding: "12px 32px", background: "#E8192C", color: "#FFF",
            border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer",
          }}>
            저장
          </button>
          <button type="button" onClick={() => setShowPreview(true)} style={{
            padding: "12px 32px", background: "#FFF", color: "#333", border: "1px solid #DDD",
            borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: "pointer",
          }}>
            미리보기
          </button>
          <button type="button" onClick={() => router.push("/cam/articles")} style={{
            padding: "12px 32px", background: "#FFF", color: "#999", border: "1px solid #DDD",
            borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: "pointer",
          }}>
            취소
          </button>
          {status === "게시" && (distIndexNow || distGooglePing) && (
            <span style={{ fontSize: 12, color: "#1565C0" }}>
              게시 시: {[distIndexNow && "IndexNow", distGooglePing && "Google ping"].filter(Boolean).join(" + ")}
            </span>
          )}
        </div>
      </form>

      {/* Preview Modal */}
      {showPreview && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowPreview(false)}
        >
          <div
            style={{ background: "#FFF", borderRadius: 12, maxWidth: 720, width: "90%", maxHeight: "90vh", overflow: "auto", padding: 40 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <span style={{ fontSize: 12, color: "#999" }}>기사 미리보기</span>
              <button onClick={() => setShowPreview(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#999", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ fontSize: 11, color: "#E8192C", fontWeight: 600, marginBottom: 8 }}>{category}</div>
            <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.4, marginBottom: 16 }}>{title || "제목 없음"}</h1>
            <div style={{ display: "flex", gap: 12, fontSize: 13, color: "#999", marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid #EEE" }}>
              <span>{author || "관리자"} 기자{authorEmail ? ` (${authorEmail})` : ""}</span>
              <span>{new Date().toISOString().slice(0, 10)}</span>
              <span>{wordCount.toLocaleString()}자</span>
              <span>약 {readingTime}분</span>
            </div>
            {thumbnail && <img src={thumbnail} alt="" style={{ width: "100%", borderRadius: 8, marginBottom: 24 }} />}
            {summary && <p style={{ fontSize: 15, color: "#666", lineHeight: 1.8, marginBottom: 24, padding: 16, background: "#F9F9F9", borderRadius: 8 }}>{summary}</p>}
            <div style={{ fontSize: 15, lineHeight: 1.9, color: "#333" }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(body) }} />
            {tags && (
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #EEE", display: "flex", gap: 8, flexWrap: "wrap" }}>
                {tags.split(",").map((tag, i) => (
                  <span key={i} style={{ padding: "4px 12px", background: "#F5F5F5", borderRadius: 20, fontSize: 12, color: "#666" }}>#{tag.trim()}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminArticleNewPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#999" }}>로딩 중...</div>}>
      <ArticleNewInner />
    </Suspense>
  );
}
