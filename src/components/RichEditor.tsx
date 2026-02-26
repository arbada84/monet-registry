"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useState } from "react";

interface RichEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const btnStyle = (active: boolean) => ({
  padding: "4px 8px",
  fontSize: 13,
  background: active ? "#E8192C" : "#F5F5F5",
  color: active ? "#FFF" : "#333",
  border: "1px solid #DDD",
  borderRadius: 4,
  cursor: "pointer" as const,
  fontWeight: active ? 600 : 400,
});

export default function RichEditor({ content, onChange, placeholder }: RichEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Image,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: placeholder || "내용을 입력하세요..." }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Sync external content changes (e.g. AI rewrite)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  const [imageInputOpen, setImageInputOpen] = useState(false);
  const [imageInputUrl, setImageInputUrl] = useState("");
  const [imageTab, setImageTab] = useState<"url" | "file">("url");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState("");
  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [linkInputUrl, setLinkInputUrl] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  if (!editor) return null;

  const addImage = () => {
    setImageInputOpen(true);
    setLinkInputOpen(false);
    setImageInputUrl("");
    setImageTab("url");
    setImageUploadError("");
  };

  const confirmImage = () => {
    if (imageInputUrl.trim()) {
      editor.chain().focus().setImage({ src: imageInputUrl.trim() }).run();
    }
    setImageInputOpen(false);
    setImageInputUrl("");
  };

  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageUploading(true);
    setImageUploadError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/image", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success && data.url) {
        editor.chain().focus().setImage({ src: data.url }).run();
        setImageInputOpen(false);
      } else {
        setImageUploadError(data.error || "업로드에 실패했습니다.");
      }
    } catch {
      setImageUploadError("업로드 중 오류가 발생했습니다.");
    }
    setImageUploading(false);
    e.target.value = "";
  };

  const addLink = () => {
    setLinkInputOpen(true);
    setImageInputOpen(false);
    setLinkInputUrl(editor.isActive("link") ? (editor.getAttributes("link").href ?? "") : "");
  };

  const confirmLink = () => {
    if (linkInputUrl.trim()) {
      editor.chain().focus().setLink({ href: linkInputUrl.trim() }).run();
    } else {
      editor.chain().focus().unsetLink().run();
    }
    setLinkInputOpen(false);
    setLinkInputUrl("");
  };

  // 드래그앤드롭 이미지 업로드
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    setImageUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/image", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success && data.url) {
        editor.chain().focus().setImage({ src: data.url }).run();
      }
    } catch { /* ignore */ }
    setImageUploading(false);
  };

  return (
    <div style={{ border: "1px solid #DDD", borderRadius: 8, overflow: "hidden" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: 8, borderBottom: "1px solid #DDD", background: "#FAFAFA" }}>
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} style={btnStyle(editor.isActive("bold"))}>B</button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} style={btnStyle(editor.isActive("italic"))}>I</button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} style={btnStyle(editor.isActive("underline"))}>U</button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} style={btnStyle(editor.isActive("strike"))}>S</button>

        <span style={{ width: 1, background: "#DDD", margin: "0 4px" }} />

        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} style={btnStyle(editor.isActive("heading", { level: 2 }))}>H2</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} style={btnStyle(editor.isActive("heading", { level: 3 }))}>H3</button>

        <span style={{ width: 1, background: "#DDD", margin: "0 4px" }} />

        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} style={btnStyle(editor.isActive("bulletList"))}>• 목록</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} style={btnStyle(editor.isActive("orderedList"))}>1. 목록</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} style={btnStyle(editor.isActive("blockquote"))}>인용</button>

        <span style={{ width: 1, background: "#DDD", margin: "0 4px" }} />

        <button type="button" onClick={() => editor.chain().focus().setTextAlign("left").run()} style={btnStyle(editor.isActive({ textAlign: "left" }))}>좌</button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign("center").run()} style={btnStyle(editor.isActive({ textAlign: "center" }))}>중</button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign("right").run()} style={btnStyle(editor.isActive({ textAlign: "right" }))}>우</button>

        <span style={{ width: 1, background: "#DDD", margin: "0 4px" }} />

        <button type="button" onClick={addLink} style={btnStyle(editor.isActive("link"))}>링크</button>
        <button type="button" onClick={addImage} style={btnStyle(false)}>이미지</button>
        <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} style={btnStyle(false)}>구분선</button>
      </div>

      {/* Inline input for link */}
      {linkInputOpen && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#FFF8F8", borderBottom: "1px solid #FFCDD2" }}>
          <span style={{ fontSize: 12, color: "#666", whiteSpace: "nowrap", fontWeight: 500 }}>링크 URL</span>
          <input
            type="url"
            autoFocus
            value={linkInputUrl}
            onChange={(e) => setLinkInputUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); confirmLink(); }
              if (e.key === "Escape") { setLinkInputOpen(false); }
            }}
            placeholder="https://"
            style={{ flex: 1, padding: "5px 10px", fontSize: 13, border: "1px solid #DDD", borderRadius: 6, outline: "none" }}
          />
          <button type="button" onClick={confirmLink} style={{ padding: "5px 14px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>확인</button>
          <button type="button" onClick={() => setLinkInputOpen(false)} style={{ padding: "5px 12px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>취소</button>
        </div>
      )}

      {/* Image insert panel with tabs */}
      {imageInputOpen && (
        <div style={{ padding: "10px 12px", background: "#FFF8F8", borderBottom: "1px solid #FFCDD2" }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {(["url", "file"] as const).map((t) => (
              <button key={t} type="button" onClick={() => { setImageTab(t); setImageUploadError(""); }} style={{ padding: "3px 12px", fontSize: 12, border: `1px solid ${imageTab === t ? "#E8192C" : "#DDD"}`, borderRadius: 5, background: imageTab === t ? "#FFF0F0" : "#FFF", color: imageTab === t ? "#E8192C" : "#666", cursor: "pointer" }}>
                {t === "url" ? "URL 입력" : "파일 업로드"}
              </button>
            ))}
            <button type="button" onClick={() => setImageInputOpen(false)} style={{ marginLeft: "auto", padding: "3px 10px", background: "#FFF", border: "1px solid #DDD", borderRadius: 5, fontSize: 12, cursor: "pointer", color: "#999" }}>취소</button>
          </div>

          {imageTab === "url" ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="url"
                autoFocus
                value={imageInputUrl}
                onChange={(e) => setImageInputUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); confirmImage(); }
                  if (e.key === "Escape") { setImageInputOpen(false); }
                }}
                placeholder="https://"
                style={{ flex: 1, padding: "5px 10px", fontSize: 13, border: "1px solid #DDD", borderRadius: 6, outline: "none" }}
              />
              <button type="button" onClick={confirmImage} style={{ padding: "5px 14px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>삽입</button>
            </div>
          ) : (
            <div>
              <input
                type="file"
                accept="image/*"
                disabled={imageUploading}
                onChange={handleImageFileUpload}
                style={{ fontSize: 13 }}
              />
              {imageUploading && <span style={{ marginLeft: 8, fontSize: 12, color: "#999" }}>업로드 중...</span>}
              {imageUploadError && <div style={{ marginTop: 4, fontSize: 12, color: "#E8192C" }}>{imageUploadError}</div>}
            </div>
          )}
        </div>
      )}

      {/* Editor — 드래그앤드롭 이미지 업로드 지원 */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        style={{ position: "relative" }}
      >
        {isDragOver && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(232,25,44,0.06)", border: "2px dashed #E8192C", borderRadius: 4, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <span style={{ fontSize: 14, color: "#E8192C", fontWeight: 600 }}>이미지를 여기에 놓으면 업로드됩니다</span>
          </div>
        )}
        {imageUploading && (
          <div style={{ position: "absolute", top: 8, right: 12, fontSize: 12, color: "#999", zIndex: 5 }}>업로드 중...</div>
        )}
        <EditorContent
          editor={editor}
          style={{ minHeight: 300, padding: 16, fontSize: 14, lineHeight: 1.8 }}
        />
      </div>

      <style>{`
        .tiptap { outline: none; }
        .tiptap p { margin: 0 0 0.8em; }
        .tiptap h2 { font-size: 1.4em; font-weight: 700; margin: 1em 0 0.5em; }
        .tiptap h3 { font-size: 1.2em; font-weight: 600; margin: 0.8em 0 0.4em; }
        .tiptap blockquote { border-left: 3px solid #E8192C; padding-left: 16px; color: #666; margin: 1em 0; }
        .tiptap img { max-width: 100%; border-radius: 8px; margin: 1em 0; }
        .tiptap a { color: #E8192C; text-decoration: underline; }
        .tiptap ul, .tiptap ol { padding-left: 24px; margin: 0.5em 0; }
        .tiptap hr { border: none; border-top: 1px solid #DDD; margin: 1.5em 0; }
        .tiptap .is-editor-empty:first-child::before { content: attr(data-placeholder); color: #AAA; float: left; height: 0; pointer-events: none; }
      `}</style>
    </div>
  );
}
