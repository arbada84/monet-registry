"use client";

import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import "quill/dist/quill.snow.css";

// Quill에 HTML을 삽입하기 전 DOMPurify 정화 (XSS 방어)
function safeHtml(html: string): string {
  if (typeof window === "undefined") return html;
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["allowfullscreen", "frameborder", "scrolling"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}

interface RichEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

/** Quill 2 기반 리치 에디터
 * - HTML 붙여넣기: 비주얼 모드에서 외부 HTML 그대로 렌더링
 * - HTML 소스 모드: 원시 HTML 코드 직접 붙여넣기/편집 가능
 * - 드래그앤드롭 이미지 업로드 → /api/upload/image
 * - AI 재작성 등 외부 content 변경 시 자동 동기화
 */
export default function RichEditor({ content, onChange, placeholder }: RichEditorProps) {
  const editorDivRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quillRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const syncedContentRef = useRef(content);
  const isMountedRef = useRef(true);

  const [showHtml, setShowHtml] = useState(false);
  const [htmlSource, setHtmlSource] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState("");

  // 언마운트 추적
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Quill 초기화 (클라이언트 전용, 1회)
  useEffect(() => {
    if (typeof window === "undefined" || !editorDivRef.current || quillRef.current) return;

    const initEditor = async () => {
      const { default: Quill } = await import("quill");
      if (!isMountedRef.current || !editorDivRef.current || quillRef.current) return;

      // 이미지 업로드 핸들러 (파일 선택 다이얼로그)
      const uploadImageFromFile = async (file: File) => {
        if (!quillRef.current) return;
        if (isMountedRef.current) { setImageUploading(true); setImageUploadError(""); }
        try {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("/api/upload/image", { method: "POST", body: fd });
          const data = await res.json();
          if (data.success && data.url && quillRef.current) {
            const range = quillRef.current.getSelection(true) ?? { index: quillRef.current.getLength() - 1 };
            quillRef.current.insertEmbed(range.index, "image", data.url);
            quillRef.current.setSelection(range.index + 1);
          } else if (isMountedRef.current) {
            setImageUploadError(data.error || "업로드에 실패했습니다.");
          }
        } catch {
          if (isMountedRef.current) setImageUploadError("업로드 중 오류가 발생했습니다.");
        } finally {
          if (isMountedRef.current) setImageUploading(false);
        }
      };

      const imageButtonHandler = () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = () => {
          const file = input.files?.[0];
          if (file) uploadImageFromFile(file);
          input.value = "";
        };
        input.click();
      };

      const quill = new Quill(editorDivRef.current, {
        theme: "snow",
        placeholder: placeholder || "내용을 입력하세요...",
        modules: {
          toolbar: {
            container: [
              [{ header: [2, 3, false] }],
              ["bold", "italic", "underline", "strike"],
              [{ color: [] }, { background: [] }],
              [{ align: [] }],
              [{ list: "ordered" }, { list: "bullet" }],
              ["blockquote"],
              ["link", "image"],
              ["clean"],
            ],
            handlers: { image: imageButtonHandler },
          },
          // matchVisual: false → HTML 붙여넣기 시 의미론적 구조 최대한 보존
          clipboard: { matchVisual: false },
        },
      });

      // 초기 콘텐츠 설정
      if (content) {
        quill.clipboard.dangerouslyPasteHTML(safeHtml(content));
      }
      syncedContentRef.current = content;

      // 변경 감지 → 부모에 HTML 전달
      quill.on("text-change", () => {
        const html = quill.root.innerHTML === "<p><br></p>" ? "" : quill.root.innerHTML;
        syncedContentRef.current = html;
        onChangeRef.current(html);
      });

      quillRef.current = quill;

      // (선택사항) 이미지를 붙여넣을 때 업로드로 변환
      quill.root.addEventListener("paste", async (e: ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of Array.from(items)) {
          if (item.type.startsWith("image/")) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) await uploadImageFromFile(file);
          }
        }
      });
    };

    initEditor().catch(console.error);

    return () => {
      if (quillRef.current) {
        quillRef.current.off("text-change");
        quillRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 1회만 실행

  // 외부 content 변경 동기화 (AI 재작성 등)
  useEffect(() => {
    if (quillRef.current && content !== syncedContentRef.current) {
      quillRef.current.clipboard.dangerouslyPasteHTML(safeHtml(content || ""));
      syncedContentRef.current = content;
    }
  }, [content]);

  // 드래그앤드롭 이미지 업로드
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (!file || !quillRef.current) return;
    setImageUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload/image", { method: "POST", body: fd });
      const data = await res.json();
      if (data.success && data.url && quillRef.current) {
        const range = quillRef.current.getSelection(true) ?? { index: quillRef.current.getLength() - 1 };
        quillRef.current.insertEmbed(range.index, "image", data.url);
      }
    } catch { /* ignore */ }
    setImageUploading(false);
  };

  // HTML 소스 ↔ 비주얼 전환
  const toggleHtmlMode = () => {
    if (!showHtml) {
      const html = quillRef.current?.root?.innerHTML ?? "";
      setHtmlSource(html === "<p><br></p>" ? "" : html);
      setShowHtml(true);
    } else {
      if (quillRef.current) {
        const clean = safeHtml(htmlSource || "");
        quillRef.current.clipboard.dangerouslyPasteHTML(clean);
        syncedContentRef.current = clean;
        onChangeRef.current(clean);
      }
      setShowHtml(false);
    }
  };

  return (
    <div style={{ border: "1px solid #DDD", borderRadius: 8, overflow: "hidden" }}>
      {showHtml ? (
        /* ── HTML 소스 편집 모드 ── */
        <div>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 14px", background: "#1A1A2E", borderBottom: "1px solid #333",
          }}>
            <span style={{ fontSize: 12, color: "#7986CB", fontFamily: "monospace", fontWeight: 600 }}>
              &lt;/&gt; HTML 소스 편집
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "#888" }}>HTML을 붙여넣거나 직접 수정 후 전환</span>
              <button
                type="button"
                onClick={toggleHtmlMode}
                style={{
                  padding: "4px 14px", fontSize: 12, border: "1px solid #555",
                  borderRadius: 5, background: "#2C2C54", color: "#D0D0FF",
                  cursor: "pointer", fontWeight: 600,
                }}
              >
                비주얼 편집으로 전환 →
              </button>
            </div>
          </div>
          <textarea
            value={htmlSource}
            onChange={(e) => setHtmlSource(e.target.value)}
            spellCheck={false}
            style={{
              display: "block", width: "100%", minHeight: 440, padding: 16,
              fontSize: 13, fontFamily: "'Consolas','Monaco','Courier New',monospace",
              lineHeight: 1.7, border: "none", outline: "none", resize: "vertical",
              background: "#1E1E2E", color: "#CDD6F4", boxSizing: "border-box",
              tabSize: 2,
            }}
          />
        </div>
      ) : (
        /* ── 비주얼 편집 모드 ── */
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          style={{ position: "relative" }}
        >
          {isDragOver && (
            <div style={{
              position: "absolute", inset: 0, background: "rgba(232,25,44,0.05)",
              border: "2px dashed #E8192C", zIndex: 10, borderRadius: 2,
              display: "flex", alignItems: "center", justifyContent: "center",
              pointerEvents: "none",
            }}>
              <span style={{ fontSize: 14, color: "#E8192C", fontWeight: 600, background: "#FFF", padding: "6px 16px", borderRadius: 8 }}>
                이미지를 여기에 놓으면 업로드됩니다
              </span>
            </div>
          )}
          {imageUploading && (
            <div style={{
              position: "absolute", top: 48, right: 12, zIndex: 5,
              background: "#FFF", border: "1px solid #EEE", borderRadius: 6,
              padding: "4px 12px", fontSize: 12, color: "#E8192C", boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            }}>
              이미지 업로드 중...
            </div>
          )}
          {/* Quill이 이 div 안에 마운트됨 */}
          <div ref={editorDivRef} />
        </div>
      )}

      {imageUploadError && (
        <div style={{
          padding: "6px 14px", background: "#FFEBEE", fontSize: 12,
          color: "#C62828", borderTop: "1px solid #FFCDD2",
        }}>
          {imageUploadError}
        </div>
      )}

      {/* 하단 HTML 소스 전환 버튼 */}
      {!showHtml && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          padding: "5px 10px", background: "#FAFAFA", borderTop: "1px solid #EEE",
        }}>
          <button
            type="button"
            onClick={toggleHtmlMode}
            title="HTML 소스를 직접 붙여넣거나 편집합니다"
            style={{
              padding: "3px 10px", fontSize: 11, border: "1px solid #DDD",
              borderRadius: 4, background: "#FFF", color: "#666",
              cursor: "pointer", fontFamily: "monospace", letterSpacing: 0.3,
            }}
          >
            &lt;/&gt; HTML 소스
          </button>
        </div>
      )}

      {/* Quill 스타일 커스터마이징 */}
      <style>{`
        .ql-toolbar.ql-snow {
          border: none !important;
          border-bottom: 1px solid #EEE !important;
          background: #FAFAFA;
          padding: 7px 10px;
          flex-wrap: wrap;
        }
        .ql-container.ql-snow {
          border: none !important;
        }
        .ql-editor {
          min-height: 380px;
          font-size: 14px;
          line-height: 1.9;
          font-family: -apple-system, BlinkMacSystemFont, 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
          padding: 18px 20px;
          color: #111;
        }
        .ql-editor p { margin: 0 0 0.75em; }
        .ql-editor h2 { font-size: 1.4em; font-weight: 700; margin: 1.2em 0 0.5em; color: #111; }
        .ql-editor h3 { font-size: 1.15em; font-weight: 600; margin: 1em 0 0.4em; color: #222; }
        .ql-editor blockquote {
          border-left: 3px solid #E8192C;
          padding: 6px 6px 6px 18px;
          color: #555;
          margin: 1em 0;
          background: #FFF8F8;
          border-radius: 0 6px 6px 0;
          font-style: italic;
        }
        .ql-editor img {
          max-width: 100%;
          border-radius: 6px;
          margin: 10px 0;
          display: block;
        }
        .ql-editor a { color: #E8192C; }
        .ql-editor ul, .ql-editor ol { padding-left: 26px; margin: 0.5em 0; }
        .ql-editor li { margin-bottom: 0.3em; }
        .ql-editor pre {
          background: #F5F5F5;
          border-radius: 6px;
          padding: 14px 16px;
          font-size: 13px;
          line-height: 1.6;
          overflow-x: auto;
        }
        .ql-editor.ql-blank::before {
          color: #BBB;
          font-style: normal;
          left: 20px;
          right: 20px;
        }
        /* 툴바 액티브/호버 색상 → #E8192C */
        .ql-snow.ql-toolbar button:hover .ql-stroke,
        .ql-snow .ql-toolbar button.ql-active .ql-stroke { stroke: #E8192C !important; }
        .ql-snow.ql-toolbar button:hover .ql-fill,
        .ql-snow .ql-toolbar button.ql-active .ql-fill { fill: #E8192C !important; }
        .ql-snow.ql-toolbar button:hover,
        .ql-snow .ql-toolbar button.ql-active { color: #E8192C !important; }
        .ql-snow .ql-picker-label:hover,
        .ql-snow .ql-picker.ql-expanded .ql-picker-label { color: #E8192C !important; border-color: #E8192C !important; }
        .ql-snow .ql-picker.ql-expanded .ql-picker-label .ql-stroke { stroke: #E8192C !important; }
        .ql-snow .ql-picker-options { border-radius: 6px !important; box-shadow: 0 4px 14px rgba(0,0,0,0.12) !important; }
        /* 링크 편집 툴팁 한국어화 */
        .ql-snow .ql-tooltip { border-radius: 8px !important; box-shadow: 0 4px 14px rgba(0,0,0,0.12) !important; z-index: 100; }
        .ql-snow .ql-tooltip::before { content: "URL 입력:"; }
        .ql-snow .ql-tooltip[data-mode=link]::before { content: "링크 URL:"; }
        .ql-snow .ql-tooltip a.ql-action::after { content: "확인"; margin-left: 4px; }
        .ql-snow .ql-tooltip a.ql-remove::before { content: "링크 삭제"; margin-left: 8px; }
        .ql-snow .ql-tooltip input[type=text] {
          border: 1px solid #DDD !important;
          border-radius: 5px !important;
          padding: 4px 8px !important;
          font-size: 13px !important;
          outline: none !important;
          width: 220px !important;
        }
        .ql-snow .ql-tooltip input[type=text]:focus { border-color: #E8192C !important; }
      `}</style>
    </div>
  );
}
