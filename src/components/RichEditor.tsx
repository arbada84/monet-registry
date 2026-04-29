"use client";

import { useEffect, useRef, useState } from "react";
import type { ClipboardEvent, DragEvent } from "react";
import DOMPurify from "dompurify";
import { sanitizeIframeHtml } from "@/lib/html-embed-safety";

const DEFAULT_PLACEHOLDER = "\uAE30\uC0AC \uBCF8\uBB38\uC744 \uC785\uB825\uD558\uC138\uC694";
const IMAGE_UPLOAD_ERROR = "\uC774\uBBF8\uC9C0 \uC5C5\uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
const IMAGE_UPLOAD_PROGRESS = "\uC774\uBBF8\uC9C0 \uC5C5\uB85C\uB4DC \uC911...";
const DROP_IMAGE_HINT = "\uC774\uBBF8\uC9C0\uB97C \uC5EC\uAE30\uC5D0 \uB193\uC73C\uBA74 \uC5C5\uB85C\uB4DC\uB429\uB2C8\uB2E4";
const VISUAL_MODE_LABEL = "\uBE44\uC8FC\uC5BC \uD3B8\uC9D1\uC73C\uB85C \uC804\uD658";
const HTML_MODE_HINT = "HTML\uC744 \uC9C1\uC811 \uBD99\uC5EC\uB123\uAC70\uB098 \uC218\uC815\uD55C \uB4A4 \uBE44\uC8FC\uC5BC \uD3B8\uC9D1\uC73C\uB85C \uC804\uD658\uD558\uC138\uC694.";

interface RichEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

function safeHtml(html: string): string {
  if (typeof window === "undefined") return html;

  const clean = DOMPurify.sanitize(html, {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: [
      "allow",
      "allowfullscreen",
      "alt",
      "frameborder",
      "height",
      "rel",
      "sandbox",
      "scrolling",
      "src",
      "target",
      "title",
      "width",
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|\/|#|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });

  return sanitizeIframeHtml(clean, { allowScripts: true });
}

function hardenEditorIframes(root: HTMLElement): void {
  const iframes = Array.from(root.querySelectorAll("iframe"));
  for (const frame of iframes) {
    const safe = sanitizeIframeHtml(frame.outerHTML, { allowScripts: true }).trim();
    if (!safe) {
      frame.remove();
      continue;
    }

    const template = document.createElement("template");
    template.innerHTML = safe;
    const hardened = template.content.firstElementChild;
    if (hardened instanceof HTMLIFrameElement) {
      frame.replaceWith(hardened);
    }
  }
}

function normalizeEditorHtml(html: string): string {
  const trimmed = html.trim();
  if (!trimmed || trimmed === "<br>" || trimmed === "<p><br></p>" || trimmed === "<div><br></div>") {
    return "";
  }

  if (typeof document === "undefined") return trimmed;

  const template = document.createElement("template");
  template.innerHTML = trimmed;
  const hasMeaningfulMedia = Boolean(template.content.querySelector("img,iframe,video,audio,embed,object"));
  const text = template.content.textContent?.replace(/\u00a0/g, " ").trim() ?? "";
  return text || hasMeaningfulMedia ? trimmed : "";
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function toSafeLink(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return trimmed;

  try {
    const parsed = new URL(trimmed);
    return ["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

export default function RichEditor({ content, onChange, placeholder }: RichEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const syncedContentRef = useRef("");

  const [showHtml, setShowHtml] = useState(false);
  const [htmlSource, setHtmlSource] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState("");
  const [isEmpty, setIsEmpty] = useState(true);

  onChangeRef.current = onChange;

  const emitChange = () => {
    const editor = editorRef.current;
    if (!editor) return;

    const rawHtml = normalizeEditorHtml(editor.innerHTML);
    const html = rawHtml ? safeHtml(rawHtml) : "";
    if (html && html !== rawHtml) {
      editor.innerHTML = html;
    }
    hardenEditorIframes(editor);

    const normalized = normalizeEditorHtml(editor.innerHTML);
    syncedContentRef.current = normalized;
    setIsEmpty(!normalized);
    onChangeRef.current(normalized);
  };

  const focusEditor = () => {
    editorRef.current?.focus();
  };

  const runCommand = (command: string, value?: string) => {
    focusEditor();
    document.execCommand(command, false, value);
    emitChange();
  };

  const insertHtml = (html: string) => {
    focusEditor();
    document.execCommand("insertHTML", false, safeHtml(html));
    emitChange();
  };

  const uploadImageFromFile = async (file: File) => {
    setImageUploading(true);
    setImageUploadError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/image", { method: "POST", body: formData });
      const data = await res.json();

      if (data.success && data.url) {
        insertHtml(`<img src="${escapeAttribute(data.url)}" alt="" />`);
      } else {
        setImageUploadError(data.error || IMAGE_UPLOAD_ERROR);
      }
    } catch {
      setImageUploadError(IMAGE_UPLOAD_ERROR);
    } finally {
      setImageUploading(false);
    }
  };

  const toggleHtmlMode = () => {
    const editor = editorRef.current;
    if (!editor) return;

    if (!showHtml) {
      setHtmlSource(normalizeEditorHtml(editor.innerHTML));
      setShowHtml(true);
      return;
    }

    const clean = safeHtml(htmlSource || "");
    editor.innerHTML = clean;
    hardenEditorIframes(editor);
    const normalized = normalizeEditorHtml(editor.innerHTML);
    syncedContentRef.current = normalized;
    setIsEmpty(!normalized);
    onChangeRef.current(normalized);
    setShowHtml(false);
  };

  const handlePaste = async (event: ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.clipboardData?.items ?? []);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (imageItem) {
      event.preventDefault();
      const file = imageItem.getAsFile();
      if (file) await uploadImageFromFile(file);
      return;
    }

    const html = event.clipboardData?.getData("text/html");
    if (html) {
      event.preventDefault();
      insertHtml(html);
      return;
    }

    const text = event.clipboardData?.getData("text/plain");
    if (text) {
      event.preventDefault();
      runCommand("insertText", text);
    }
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);

    const file = Array.from(event.dataTransfer.files).find((candidate) => candidate.type.startsWith("image/"));
    if (file) await uploadImageFromFile(file);
  };

  const handleLink = () => {
    const url = toSafeLink(window.prompt("URL", "https://") || "");
    if (url) runCommand("createLink", url);
  };

  const handleHeading = (value: string) => {
    if (!value) return;
    runCommand("formatBlock", value);
  };

  const handleClean = () => {
    runCommand("removeFormat");
    runCommand("formatBlock", "p");
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const clean = content ? safeHtml(content) : "";
    if (clean === syncedContentRef.current) return;

    editor.innerHTML = clean;
    hardenEditorIframes(editor);
    const normalized = normalizeEditorHtml(editor.innerHTML);
    syncedContentRef.current = normalized;
    setIsEmpty(!normalized);
  }, [content]);

  return (
    <div style={{ border: "1px solid #DDD", borderRadius: 8, overflow: "hidden", background: "#FFF" }}>
      {showHtml && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "8px 14px",
              background: "#1A1A2E",
              borderBottom: "1px solid #333",
            }}
          >
            <span style={{ fontSize: 12, color: "#AAB4FF", fontFamily: "monospace", fontWeight: 700 }}>
              &lt;/&gt; HTML source
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "#AAA" }}>{HTML_MODE_HINT}</span>
              <button
                type="button"
                onClick={toggleHtmlMode}
                style={{
                  padding: "4px 14px",
                  fontSize: 12,
                  border: "1px solid #555",
                  borderRadius: 5,
                  background: "#2C2C54",
                  color: "#D0D0FF",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                {VISUAL_MODE_LABEL}
              </button>
            </div>
          </div>
          <textarea
            value={htmlSource}
            onChange={(event) => setHtmlSource(event.target.value)}
            spellCheck={false}
            style={{
              display: "block",
              width: "100%",
              minHeight: 440,
              padding: 16,
              fontSize: 13,
              fontFamily: "'Consolas','Monaco','Courier New',monospace",
              lineHeight: 1.7,
              border: "none",
              outline: "none",
              resize: "vertical",
              background: "#1E1E2E",
              color: "#CDD6F4",
              boxSizing: "border-box",
              tabSize: 2,
            }}
          />
        </div>
      )}

      <div style={{ display: showHtml ? "none" : "block" }}>
          <div
            role="toolbar"
            aria-label="Article editor toolbar"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
              padding: "7px 10px",
              background: "#FAFAFA",
              borderBottom: "1px solid #EEE",
            }}
          >
            <select
              aria-label="Block format"
              defaultValue=""
              onChange={(event) => {
                handleHeading(event.target.value);
                event.currentTarget.value = "";
              }}
              style={{
                height: 28,
                border: "1px solid #DDD",
                borderRadius: 5,
                background: "#FFF",
                color: "#333",
                fontSize: 12,
              }}
            >
              <option value="">Paragraph</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
              <option value="blockquote">Quote</option>
            </select>
            <ToolbarButton label="B" title="Bold" onClick={() => runCommand("bold")} strong />
            <ToolbarButton label="I" title="Italic" onClick={() => runCommand("italic")} italic />
            <ToolbarButton label="U" title="Underline" onClick={() => runCommand("underline")} underline />
            <ToolbarButton label="S" title="Strike" onClick={() => runCommand("strikeThrough")} strike />
            <ToolbarButton label="OL" title="Ordered list" onClick={() => runCommand("insertOrderedList")} />
            <ToolbarButton label="UL" title="Bullet list" onClick={() => runCommand("insertUnorderedList")} />
            <ToolbarButton label="Link" title="Insert link" onClick={handleLink} />
            <ToolbarButton label="Image" title="Upload image" onClick={() => fileInputRef.current?.click()} />
            <ToolbarButton label="Clean" title="Remove formatting" onClick={handleClean} />
            <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#666" }}>
              Color
              <input
                type="color"
                aria-label="Text color"
                onChange={(event) => runCommand("foreColor", event.target.value)}
                style={{ width: 28, height: 24, padding: 0, border: "1px solid #DDD", borderRadius: 4 }}
              />
            </label>
          </div>

          <div
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            style={{ position: "relative" }}
          >
            {isDragOver && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(232,25,44,0.05)",
                  border: "2px dashed #E8192C",
                  zIndex: 10,
                  borderRadius: 2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    color: "#E8192C",
                    fontWeight: 700,
                    background: "#FFF",
                    padding: "6px 16px",
                    borderRadius: 8,
                  }}
                >
                  {DROP_IMAGE_HINT}
                </span>
              </div>
            )}
            {imageUploading && (
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  zIndex: 5,
                  background: "#FFF",
                  border: "1px solid #EEE",
                  borderRadius: 6,
                  padding: "4px 12px",
                  fontSize: 12,
                  color: "#E8192C",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                }}
              >
                {IMAGE_UPLOAD_PROGRESS}
              </div>
            )}
            <div
              ref={editorRef}
              className="cp-rich-editor-surface"
              contentEditable
              data-empty={isEmpty ? "true" : "false"}
              data-placeholder={placeholder || DEFAULT_PLACEHOLDER}
              data-rich-editor-surface="true"
              onInput={emitChange}
              onBlur={emitChange}
              onPaste={handlePaste}
              suppressContentEditableWarning
              style={{
                minHeight: 380,
                padding: "18px 20px",
                outline: "none",
                color: "#111",
                fontSize: 14,
                lineHeight: 1.9,
                fontFamily: "-apple-system,BlinkMacSystemFont,'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              padding: "5px 10px",
              background: "#FAFAFA",
              borderTop: "1px solid #EEE",
            }}
          >
            <button
              type="button"
              onClick={toggleHtmlMode}
              title="Edit HTML source"
              style={{
                padding: "3px 10px",
                fontSize: 11,
                border: "1px solid #DDD",
                borderRadius: 4,
                background: "#FFF",
                color: "#666",
                cursor: "pointer",
                fontFamily: "monospace",
                letterSpacing: 0.3,
              }}
            >
              &lt;/&gt; HTML source
            </button>
          </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void uploadImageFromFile(file);
        }}
        style={{ display: "none" }}
      />

      {imageUploadError && (
        <div
          style={{
            padding: "6px 14px",
            background: "#FFEBEE",
            fontSize: 12,
            color: "#C62828",
            borderTop: "1px solid #FFCDD2",
          }}
        >
          {imageUploadError}
        </div>
      )}

      <style>{`
        .cp-rich-editor-surface[data-empty="true"]::before {
          content: attr(data-placeholder);
          color: #B7B7B7;
          pointer-events: none;
        }
        .cp-rich-editor-surface p { margin: 0 0 0.75em; }
        .cp-rich-editor-surface h2 {
          font-size: 1.4em;
          font-weight: 700;
          margin: 1.2em 0 0.5em;
          color: #111;
        }
        .cp-rich-editor-surface h3 {
          font-size: 1.15em;
          font-weight: 600;
          margin: 1em 0 0.4em;
          color: #222;
        }
        .cp-rich-editor-surface blockquote {
          border-left: 3px solid #E8192C;
          padding: 6px 6px 6px 18px;
          color: #555;
          margin: 1em 0;
          background: #FFF8F8;
          border-radius: 0 6px 6px 0;
          font-style: italic;
        }
        .cp-rich-editor-surface img {
          max-width: 100%;
          border-radius: 6px;
          margin: 10px 0;
          display: block;
        }
        .cp-rich-editor-surface iframe {
          display: block;
          width: min(100%, 720px);
          min-height: 315px;
          border: 0;
          border-radius: 8px;
          margin: 12px 0;
        }
        .cp-rich-editor-surface a { color: #E8192C; }
        .cp-rich-editor-surface ul,
        .cp-rich-editor-surface ol {
          padding-left: 26px;
          margin: 0.5em 0;
        }
        .cp-rich-editor-surface li { margin-bottom: 0.3em; }
        .cp-rich-editor-surface pre {
          background: #F5F5F5;
          border-radius: 6px;
          padding: 14px 16px;
          font-size: 13px;
          line-height: 1.6;
          overflow-x: auto;
        }
      `}</style>
    </div>
  );
}

function ToolbarButton({
  label,
  title,
  onClick,
  strong = false,
  italic = false,
  underline = false,
  strike = false,
}: {
  label: string;
  title: string;
  onClick: () => void;
  strong?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        minWidth: 30,
        height: 28,
        padding: "0 8px",
        border: "1px solid #DDD",
        borderRadius: 5,
        background: "#FFF",
        color: "#333",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: strong ? 800 : 600,
        fontStyle: italic ? "italic" : "normal",
        textDecoration: underline ? "underline" : strike ? "line-through" : "none",
      }}
    >
      {label}
    </button>
  );
}
