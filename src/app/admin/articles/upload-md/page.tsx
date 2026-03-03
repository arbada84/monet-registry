"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { marked } from "marked";
import { unzipSync, strFromU8 } from "fflate";
import { getSetting } from "@/lib/db";
import { CATEGORIES as DEFAULT_CATEGORIES } from "@/lib/constants";
import { reuploadImagesInHtml, reuploadImageUrl } from "@/lib/reupload-images";

// ── 프론트매터 파서 ──────────────────────────────────────
function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const match = content.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content.trim() };

  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(":");
    if (colonIdx < 1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key) meta[key] = val;
  }
  return { meta, body: match[2].trim() };
}

// ── 파일 내 다중 기사 분리 ────────────────────────────────
// "---\nkey: value" 패턴으로 시작하는 새 frontmatter 블록을 경계로 분리
function splitMultiArticles(rawContent: string): string[] {
  const content = rawContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // frontmatter 시작 = "---" 다음 줄이 "key: value" 형태인 경우
  const regex = /(?:^|\n)---[ \t]*\n(?=[a-zA-Z가-힣_-]+[ \t]*:)/g;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    starts.push(m.index === 0 ? 0 : m.index + 1);
  }
  if (starts.length <= 1) return [content];
  return starts.map((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : content.length;
    return content.slice(start, end).trim();
  });
}

// ── 타입 ─────────────────────────────────────────────────
type FileStatus = "pending" | "uploading" | "done" | "error";

interface ParsedFile {
  key: string;          // 고유키 (파일명 or 파일명#인덱스)
  fileName: string;     // 원본 파일명
  articleIndex?: number; // 다중 기사일 때 순번 (1부터)
  totalInFile?: number;  // 파일 내 총 기사 수
  file: File;
  title: string;
  category: string;
  author: string;
  date: string;
  tags: string;
  summary: string;
  thumbnail: string;
  status: "게시" | "임시저장";
  slug: string;
  sourceUrl: string;
  bodyHtml: string;
  parseError?: string;
  uploadStatus: FileStatus;
  uploadMessage?: string;
}

const STATUSES = ["임시저장", "게시"] as const;

// ── 마크다운 → HTML 변환 ──────────────────────────────────
async function mdToHtml(md: string): Promise<string> {
  const raw = await marked.parse(md, { async: false });
  return String(raw);
}

export default function UploadMdPage() {
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [globalCategory, setGlobalCategory] = useState("");
  const [globalStatus, setGlobalStatus] = useState<"게시" | "임시저장">("임시저장");
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSetting<{ name: string }[] | null>("cp-categories", null).then((cats) => {
      if (cats && cats.length > 0) setCategories(cats.map((c) => c.name));
    });
  }, []);

  // ── ZIP → MD File[] 추출 ────────────────────────────────
  const extractFromZip = useCallback(async (zipFile: File): Promise<File[]> => {
    const buf = await zipFile.arrayBuffer();
    let unzipped: ReturnType<typeof unzipSync>;
    try {
      unzipped = unzipSync(new Uint8Array(buf));
    } catch {
      throw new Error(`${zipFile.name}: ZIP 파일을 읽을 수 없습니다.`);
    }
    const mdFiles: File[] = [];
    for (const [path, data] of Object.entries(unzipped)) {
      if (path.startsWith("__MACOSX") || path.includes("/.")) continue;
      if (!path.endsWith(".md") && !path.endsWith(".markdown")) continue;
      const filename = path.split("/").pop() ?? path;
      const content = strFromU8(data);
      mdFiles.push(new File([content], filename, { type: "text/markdown" }));
    }
    return mdFiles;
  }, []);

  // ── 파일 파싱 ───────────────────────────────────────────
  const parseFiles = useCallback(async (rawFiles: File[]) => {
    // ZIP 파일 먼저 추출
    const zipFiles = rawFiles.filter((f) => f.name.toLowerCase().endsWith(".zip"));
    const mdDirect = rawFiles.filter((f) => f.name.endsWith(".md") || f.name.endsWith(".markdown"));

    let extractedFromZip: File[] = [];
    for (const zip of zipFiles) {
      try {
        const extracted = await extractFromZip(zip);
        extractedFromZip = [...extractedFromZip, ...extracted];
      } catch (e) {
        alert(e instanceof Error ? e.message : "ZIP 압축 해제 실패");
      }
    }

    const mdFiles = [...mdDirect, ...extractedFromZip];
    if (mdFiles.length === 0) return;
    if (mdFiles.length === 0) return;

    const parsed: ParsedFile[] = (
      await Promise.all(
        mdFiles.map(async (file) => {
          try {
            const text = await file.text();
            const articles = splitMultiArticles(text);
            const today = new Date().toISOString().slice(0, 10);
            const fileTitle = file.name.replace(/\.(md|markdown)$/i, "").replace(/[-_]/g, " ");
            const isMulti = articles.length > 1;

            return await Promise.all(
              articles.map(async (articleText, idx) => {
                try {
                  const { meta, body } = parseFrontmatter(articleText);
                  const bodyHtml = await mdToHtml(body);
                  const key = isMulti ? `${file.name}#${idx + 1}` : file.name;

                  return {
                    key,
                    fileName: file.name,
                    articleIndex: isMulti ? idx + 1 : undefined,
                    totalInFile: isMulti ? articles.length : undefined,
                    file,
                    title: meta.title || (isMulti ? `${fileTitle} (${idx + 1})` : fileTitle),
                    category: meta.category || "",
                    author: meta.author || meta.writer || "",
                    date: meta.date || today,
                    tags: meta.tags || meta.tag || "",
                    summary: meta.summary || meta.description || "",
                    thumbnail: meta.thumbnail || meta.image || "",
                    status: (meta.status === "게시" ? "게시" : "임시저장") as "게시" | "임시저장",
                    slug: meta.slug || "",
                    sourceUrl: meta.sourceUrl || meta.source_url || "",
                    bodyHtml,
                    uploadStatus: "pending" as FileStatus,
                  } satisfies ParsedFile;
                } catch {
                  const key = isMulti ? `${file.name}#${idx + 1}` : file.name;
                  return {
                    key,
                    fileName: file.name,
                    articleIndex: isMulti ? idx + 1 : undefined,
                    totalInFile: isMulti ? articles.length : undefined,
                    file,
                    title: isMulti ? `${fileTitle} (${idx + 1})` : fileTitle,
                    category: "", author: "",
                    date: today, tags: "", summary: "", thumbnail: "",
                    status: "임시저장" as const,
                    slug: "", sourceUrl: "", bodyHtml: "",
                    parseError: "파싱 실패",
                    uploadStatus: "pending" as FileStatus,
                  } satisfies ParsedFile;
                }
              })
            );
          } catch {
            return [{
              key: file.name,
              fileName: file.name,
              file,
              title: file.name,
              category: "", author: "",
              date: new Date().toISOString().slice(0, 10),
              tags: "", summary: "", thumbnail: "",
              status: "임시저장" as const,
              slug: "", sourceUrl: "", bodyHtml: "",
              parseError: "파일 파싱 실패",
              uploadStatus: "pending" as FileStatus,
            } satisfies ParsedFile];
          }
        })
      )
    ).flat();

    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.key));
      const newOnes = parsed.filter((p) => !existing.has(p.key));
      return [...prev, ...newOnes];
    });
  }, []);

  // ── 드래그 앤 드롭 ──────────────────────────────────────
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = Array.from(e.dataTransfer.files);
      parseFiles(dropped);
    },
    [parseFiles]
  );

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) parseFiles(Array.from(e.target.files));
    e.target.value = "";
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateFile = (idx: number, updates: Partial<ParsedFile>) => {
    setFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, ...updates } : f)));
  };

  // 전역 카테고리/상태 적용
  const applyGlobal = () => {
    setFiles((prev) =>
      prev.map((f) => ({
        ...f,
        ...(globalCategory ? { category: globalCategory } : {}),
        status: globalStatus,
      }))
    );
  };

  // ── 등록 실행 ───────────────────────────────────────────
  const handleSubmit = async () => {
    const pending = files.filter((f) => f.uploadStatus === "pending" && !f.parseError);
    if (pending.length === 0) return;
    setSubmitting(true);
    setDone(false);

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.uploadStatus !== "pending" || f.parseError) continue;

      setFiles((prev) =>
        prev.map((item, idx) => (idx === i ? { ...item, uploadStatus: "uploading", uploadMessage: "이미지 업로드 중…" } : item))
      );

      try {
        // 1단계: 본문 외부 이미지 → Supabase 재업로드
        const { html: uploadedBodyHtml, uploaded: imgUploaded, failed: imgFailed } =
          await reuploadImagesInHtml(f.bodyHtml, (done, total) => {
            setFiles((prev) =>
              prev.map((item, idx) =>
                idx === i
                  ? { ...item, uploadMessage: `이미지 업로드 중… (${done}/${total})` }
                  : item
              )
            );
          });

        // 2단계: 썸네일 외부 URL → Supabase 재업로드
        let thumbnail = f.thumbnail;
        if (thumbnail) {
          setFiles((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, uploadMessage: "썸네일 업로드 중…" } : item
            )
          );
          thumbnail = await reuploadImageUrl(thumbnail);
        }
        // 썸네일 없으면 본문 첫 번째 이미지 자동 추출
        if (!thumbnail) {
          const m = uploadedBodyHtml.match(/<img[^>]+src="(https?:\/\/[^"]+)"/i);
          if (m?.[1]) thumbnail = m[1];
        }

        setFiles((prev) =>
          prev.map((item, idx) =>
            idx === i ? { ...item, uploadMessage: "기사 등록 중…" } : item
          )
        );

        const imgNote = imgFailed > 0 ? ` (이미지 ${imgFailed}개 업로드 실패)` : "";

        const body: Record<string, unknown> = {
          id: crypto.randomUUID(),
          title: f.title.trim() || f.file.name,
          category: f.category || "뉴스",
          author: f.author || undefined,
          date: f.date,
          tags: f.tags || undefined,
          summary: f.summary || undefined,
          thumbnail: thumbnail || undefined,
          slug: f.slug || undefined,
          sourceUrl: f.sourceUrl || undefined,
          status: f.status,
          views: 0,
          body: uploadedBodyHtml,
        };
        void imgUploaded; void imgNote;

        const res = await fetch("/api/db/articles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();

        if (res.ok && data.success) {
          const doneMsg = `등록 완료 (no.${data.no ?? ""})${imgFailed > 0 ? ` · 이미지 ${imgFailed}개 원본URL` : imgUploaded > 0 ? ` · 이미지 ${imgUploaded}개 업로드` : ""}`;
          setFiles((prev) =>
            prev.map((item, idx) =>
              idx === i
                ? { ...item, uploadStatus: "done", uploadMessage: doneMsg }
                : item
            )
          );
        } else {
          setFiles((prev) =>
            prev.map((item, idx) =>
              idx === i
                ? { ...item, uploadStatus: "error", uploadMessage: data.error || "등록 실패" }
                : item
            )
          );
        }
      } catch (e) {
        setFiles((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? { ...item, uploadStatus: "error", uploadMessage: String(e) }
              : item
          )
        );
      }
    }

    setSubmitting(false);
    setDone(true);
  };

  const pendingCount = files.filter((f) => f.uploadStatus === "pending" && !f.parseError).length;
  const doneCount = files.filter((f) => f.uploadStatus === "done").length;
  const errorCount = files.filter((f) => f.uploadStatus === "error").length;

  const statusColor: Record<FileStatus, string> = {
    pending: "#607D8B",
    uploading: "#FF9800",
    done: "#4CAF50",
    error: "#E8192C",
  };
  const statusLabel: Record<FileStatus, string> = {
    pending: "대기",
    uploading: "등록 중…",
    done: "완료",
    error: "실패",
  };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 4px 80px" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <Link
          href="/admin/articles"
          style={{ color: "#999", fontSize: 13, textDecoration: "none" }}
        >
          ← 기사 관리
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111", margin: 0 }}>
          마크다운 기사 업로드
        </h1>
      </div>

      {/* 드래그 앤 드롭 영역 */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? "#E8192C" : "#CCC"}`,
          borderRadius: 12,
          padding: "40px 20px",
          textAlign: "center",
          cursor: "pointer",
          background: isDragging ? "#FFF5F5" : "#FAFAFA",
          transition: "all 0.2s",
          marginBottom: 20,
          userSelect: "none",
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#333", marginBottom: 4 }}>
          .md 또는 .zip 파일을 드래그하거나 클릭해서 선택
        </div>
        <div style={{ fontSize: 13, color: "#999" }}>여러 파일 동시 선택 가능 • ZIP 안의 MD 파일 자동 추출 • 모바일/PC 모두 지원</div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.markdown,.zip"
          multiple
          onChange={onFileChange}
          style={{ display: "none" }}
        />
      </div>

      {/* 전역 기본값 설정 */}
      {files.length > 0 && (
        <div
          style={{
            background: "#F8F9FA",
            border: "1px solid #E0E0E0",
            borderRadius: 10,
            padding: "14px 16px",
            marginBottom: 20,
            display: "flex",
            gap: 10,
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 11, color: "#777", marginBottom: 4 }}>전체 카테고리 적용</div>
            <select
              value={globalCategory}
              onChange={(e) => setGlobalCategory(e.target.value)}
              style={{ width: "100%", padding: "7px 10px", border: "1px solid #DDD", borderRadius: 6, fontSize: 13 }}
            >
              <option value="">선택 안함</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 11, color: "#777", marginBottom: 4 }}>전체 상태 적용</div>
            <select
              value={globalStatus}
              onChange={(e) => setGlobalStatus(e.target.value as "게시" | "임시저장")}
              style={{ width: "100%", padding: "7px 10px", border: "1px solid #DDD", borderRadius: 6, fontSize: 13 }}
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button
            onClick={applyGlobal}
            style={{
              padding: "7px 16px",
              background: "#2196F3",
              color: "#FFF",
              border: "none",
              borderRadius: 6,
              fontSize: 13,
              cursor: "pointer",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            전체 적용
          </button>
        </div>
      )}

      {/* 파일 목록 */}
      {files.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {files.map((f, i) => (
            <div
              key={f.key}
              style={{
                border: `1px solid ${f.uploadStatus === "error" ? "#FFCDD2" : f.uploadStatus === "done" ? "#C8E6C9" : "#E0E0E0"}`,
                borderRadius: 10,
                padding: "14px 16px",
                background: f.uploadStatus === "error" ? "#FFF8F8" : f.uploadStatus === "done" ? "#F9FFF9" : "#FFF",
              }}
            >
              {/* 파일 헤더 */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: f.uploadStatus === "pending" ? 12 : 0, flexWrap: "wrap" }}>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#FFF",
                    background: statusColor[f.uploadStatus],
                    whiteSpace: "nowrap",
                  }}
                >
                  {statusLabel[f.uploadStatus]}
                </span>
                <span style={{ fontSize: 13, color: "#666", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.fileName}
                  {f.articleIndex !== undefined && (
                    <span style={{ marginLeft: 6, padding: "1px 7px", background: "#E3F2FD", color: "#1565C0", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                      {f.articleIndex}/{f.totalInFile}번째 기사
                    </span>
                  )}
                </span>
                {f.uploadMessage && (
                  <span style={{ fontSize: 12, color: f.uploadStatus === "error" ? "#C62828" : "#2E7D32" }}>
                    {f.uploadMessage}
                  </span>
                )}
                {f.uploadStatus === "pending" && (
                  <button
                    onClick={() => removeFile(i)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#999", fontSize: 16, lineHeight: 1, padding: "0 4px" }}
                    title="제거"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* 편집 필드 (대기 상태일 때만) */}
              {f.uploadStatus === "pending" && (
                <>
                  {f.parseError && (
                    <div style={{ fontSize: 12, color: "#C62828", marginBottom: 8 }}>⚠ {f.parseError}</div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    {/* 제목 */}
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={{ fontSize: 11, color: "#777", marginBottom: 3 }}>제목 *</div>
                      <input
                        value={f.title}
                        onChange={(e) => updateFile(i, { title: e.target.value })}
                        placeholder="기사 제목"
                        style={{ width: "100%", padding: "7px 10px", border: "1px solid #DDD", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
                      />
                    </div>
                    {/* 카테고리 */}
                    <div>
                      <div style={{ fontSize: 11, color: "#777", marginBottom: 3 }}>카테고리</div>
                      <select
                        value={f.category}
                        onChange={(e) => updateFile(i, { category: e.target.value })}
                        style={{ width: "100%", padding: "7px 10px", border: "1px solid #DDD", borderRadius: 6, fontSize: 13 }}
                      >
                        <option value="">선택</option>
                        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    {/* 상태 */}
                    <div>
                      <div style={{ fontSize: 11, color: "#777", marginBottom: 3 }}>상태</div>
                      <select
                        value={f.status}
                        onChange={(e) => updateFile(i, { status: e.target.value as "게시" | "임시저장" })}
                        style={{ width: "100%", padding: "7px 10px", border: "1px solid #DDD", borderRadius: 6, fontSize: 13 }}
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    {/* 작성자 */}
                    <div>
                      <div style={{ fontSize: 11, color: "#777", marginBottom: 3 }}>작성자</div>
                      <input
                        value={f.author}
                        onChange={(e) => updateFile(i, { author: e.target.value })}
                        placeholder="홍길동"
                        style={{ width: "100%", padding: "7px 10px", border: "1px solid #DDD", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
                      />
                    </div>
                    {/* 날짜 */}
                    <div>
                      <div style={{ fontSize: 11, color: "#777", marginBottom: 3 }}>날짜</div>
                      <input
                        type="date"
                        value={f.date}
                        onChange={(e) => updateFile(i, { date: e.target.value })}
                        style={{ width: "100%", padding: "7px 10px", border: "1px solid #DDD", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
                      />
                    </div>
                    {/* 태그 */}
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={{ fontSize: 11, color: "#777", marginBottom: 3 }}>태그 (쉼표 구분)</div>
                      <input
                        value={f.tags}
                        onChange={(e) => updateFile(i, { tags: e.target.value })}
                        placeholder="태그1, 태그2"
                        style={{ width: "100%", padding: "7px 10px", border: "1px solid #DDD", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
                      />
                    </div>
                    {/* 요약 */}
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={{ fontSize: 11, color: "#777", marginBottom: 3 }}>요약</div>
                      <textarea
                        value={f.summary}
                        onChange={(e) => updateFile(i, { summary: e.target.value })}
                        placeholder="기사 요약 (SEO, 카드뷰에 표시)"
                        rows={2}
                        style={{ width: "100%", padding: "7px 10px", border: "1px solid #DDD", borderRadius: 6, fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
                      />
                    </div>
                    {/* 썸네일 */}
                    {f.thumbnail && (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <div style={{ fontSize: 11, color: "#777", marginBottom: 3 }}>썸네일 URL</div>
                        <input
                          value={f.thumbnail}
                          onChange={(e) => updateFile(i, { thumbnail: e.target.value })}
                          style={{ width: "100%", padding: "7px 10px", border: "1px solid #DDD", borderRadius: 6, fontSize: 12, boxSizing: "border-box", color: "#555" }}
                        />
                      </div>
                    )}
                  </div>
                  {/* 본문 미리보기 (접기/펼치기) */}
                  <details style={{ marginTop: 4 }}>
                    <summary style={{ fontSize: 12, color: "#888", cursor: "pointer", userSelect: "none" }}>
                      본문 미리보기 ({f.bodyHtml.length > 0 ? `${f.bodyHtml.replace(/<[^>]*>/g, "").slice(0, 60)}…` : "본문 없음"})
                    </summary>
                    <div
                      style={{ marginTop: 8, padding: "10px 12px", background: "#F5F5F5", borderRadius: 6, fontSize: 12, maxHeight: 200, overflow: "auto", lineHeight: 1.6 }}
                      dangerouslySetInnerHTML={{ __html: f.bodyHtml.slice(0, 2000) || "<em>본문 없음</em>" }}
                    />
                  </details>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 안내 (파일 없을 때) */}
      {files.length === 0 && (
        <div style={{ background: "#F0F4FF", border: "1px solid #C5D8FF", borderRadius: 10, padding: "16px 18px", fontSize: 13, color: "#3355AA", lineHeight: 1.8 }}>
          <strong>마크다운 frontmatter 지원 필드:</strong>
          <pre style={{ margin: "8px 0 0", fontSize: 12, background: "#E8EEFF", padding: "10px 12px", borderRadius: 6, overflowX: "auto" }}>{`---
title: 기사 제목
category: 문화
author: 홍길동
date: 2026-03-04
tags: 태그1, 태그2
summary: 기사 요약
thumbnail: https://example.com/img.jpg
status: 게시
slug: my-article-slug
sourceUrl: https://원문URL
---

본문 내용을 마크다운으로 작성합니다.

## 소제목

**굵게**, *기울임*, [링크](https://example.com)

![이미지](https://example.com/image.jpg)`}</pre>
          <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
            frontmatter 없어도 파일명을 제목으로 자동 인식합니다.
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: "#3355AA", fontWeight: 600 }}>
            파일 하나에 기사 여러 개 담기 (자동 분리):
          </div>
          <pre style={{ margin: "6px 0 0", fontSize: 12, background: "#E8EEFF", padding: "10px 12px", borderRadius: 6, overflowX: "auto" }}>{`---
title: 첫 번째 기사
category: 엔터
---
첫 번째 기사 본문...

---
title: 두 번째 기사
category: 비즈
---
두 번째 기사 본문...`}</pre>
          <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
            frontmatter 블록(<code>---</code>)이 여러 개면 자동으로 기사를 분리합니다.
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: "#3355AA", fontWeight: 600 }}>
            ZIP으로 한 번에 올리기:
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#666", lineHeight: 1.7 }}>
            여러 <code>.md</code> 파일을 ZIP으로 묶어서 업로드하면 자동으로 압축 해제 후 처리합니다.<br />
            API로도 가능: <code>POST /api/upload/zip-articles</code> (multipart: file, category, status)
          </div>
        </div>
      )}

      {/* 결과 요약 */}
      {done && (
        <div style={{ padding: "14px 16px", background: "#F1F8E9", border: "1px solid #C5E1A5", borderRadius: 10, marginBottom: 16, fontSize: 14 }}>
          ✅ <strong>{doneCount}개 완료</strong>
          {errorCount > 0 && <span style={{ color: "#E8192C" }}> · ❌ {errorCount}개 실패</span>}
          <Link href="/admin/articles" style={{ marginLeft: 16, color: "#2196F3", textDecoration: "none", fontSize: 13 }}>
            기사 목록 보기 →
          </Link>
        </div>
      )}

      {/* 하단 액션 바 */}
      {files.length > 0 && (
        <div
          style={{
            position: "sticky",
            bottom: 0,
            background: "#FFF",
            borderTop: "1px solid #EEE",
            padding: "14px 0",
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 13, color: "#666", flex: 1 }}>
            총 {files.length}개 · 대기 {pendingCount}개
            {doneCount > 0 && ` · 완료 ${doneCount}개`}
            {errorCount > 0 && ` · 실패 ${errorCount}개`}
          </span>
          <button
            onClick={() => setFiles([])}
            disabled={submitting}
            style={{ padding: "9px 16px", background: "#FFF", border: "1px solid #DDD", borderRadius: 8, fontSize: 13, cursor: "pointer", color: "#666" }}
          >
            전체 초기화
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || pendingCount === 0}
            style={{
              padding: "9px 24px",
              background: submitting || pendingCount === 0 ? "#CCC" : "#E8192C",
              color: "#FFF",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              cursor: submitting || pendingCount === 0 ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "등록 중…" : `${pendingCount}개 등록`}
          </button>
        </div>
      )}
    </div>
  );
}
