"use client";

import { useState, useEffect, useCallback } from "react";
import type { AiSettings, AiSkill } from "@/types/article";
import { getSetting } from "@/lib/db";
import { aiBtnStyle } from "@/lib/admin-styles";

export const DEFAULT_AI_SKILLS: AiSkill[] = [
  {
    id: "builtin-rewrite",
    name: "뉴스 리라이트",
    description: "보도자료를 전문 뉴스 기사 형식으로 재작성 (500~800자)",
    prompt: "당신은 한국의 전문 뉴스 기자입니다. 아래 보도자료를 뉴스 기사 형식으로 다시 작성해주세요.\n\n규칙:\n- 역피라미드 구조 (핵심 → 상세 → 배경)\n- 객관적이고 간결한 문체\n- 제목, 부제, 본문으로 구분\n- 원문의 핵심 사실을 빠짐없이 포함\n- 500~800자 분량",
    outputTarget: "body",
    maxOutputTokens: 2000,
    temperature: 0.7,
    contentMaxChars: 3000,
    isBuiltin: true,
    uploadedFiles: [],
    learnedUrls: [],
    createdAt: "2025-01-01T00:00:00.000Z",
  },
  {
    id: "builtin-summarize",
    name: "3줄 요약",
    description: "기사 핵심 내용을 3줄로 압축 요약",
    prompt: "아래 기사의 핵심 내용을 3줄로 요약해주세요. 각 줄은 한 문장으로, 가장 중요한 정보부터 순서대로 작성합니다.",
    outputTarget: "summary",
    maxOutputTokens: 250,
    temperature: 0.3,
    contentMaxChars: 2000,
    isBuiltin: true,
    uploadedFiles: [],
    learnedUrls: [],
    createdAt: "2025-01-01T00:00:00.000Z",
  },
  {
    id: "builtin-title",
    name: "제목 추천",
    description: "기사 내용 기반으로 클릭률 높은 제목 5개 제안",
    prompt: "아래 기사 내용을 바탕으로 클릭하고 싶은 매력적인 뉴스 제목 5개를 제안해주세요.\n\n규칙:\n- 각 제목은 30자 이내\n- 핵심 키워드 포함\n- 다양한 스타일 (정보형, 질문형, 숫자형 등)",
    outputTarget: "title",
    maxOutputTokens: 200,
    temperature: 0.8,
    contentMaxChars: 800,
    isBuiltin: true,
    uploadedFiles: [],
    learnedUrls: [],
    createdAt: "2025-01-01T00:00:00.000Z",
  },
  {
    id: "builtin-meta",
    name: "SEO 메타설명",
    description: "검색결과용 메타 설명 자동 생성 (50~160자)",
    prompt: "아래 기사 내용을 바탕으로 검색결과에 표시될 메타 설명을 작성해주세요.\n\n규칙:\n- 50~160자 이내\n- 핵심 키워드 자연스럽게 포함\n- 클릭을 유도하는 매력적인 문장\n- 마침표로 끝내기",
    outputTarget: "meta",
    maxOutputTokens: 200,
    temperature: 0.4,
    contentMaxChars: 1500,
    isBuiltin: true,
    uploadedFiles: [],
    learnedUrls: [],
    createdAt: "2025-01-01T00:00:00.000Z",
  },
  {
    id: "builtin-press",
    name: "보도자료→뉴스",
    description: "보도자료를 완성도 높은 뉴스로 변환 (800~1200자)",
    prompt: "당신은 15년 경력의 한국 뉴스 편집장입니다. 아래 보도자료를 독자가 읽기 좋은 완성된 뉴스 기사로 작성해주세요.\n\n[작성 지침]\n- 역피라미드 구조로 구성\n- 리드문: 육하원칙(5W1H)을 담아 2~3문장\n- 핵심 사실을 먼저, 세부 내용은 뒤에\n- 전문가 인용이 있다면 자연스럽게 포함\n- 800~1200자 분량의 본문\n- 객관적이고 균형잡힌 시각 유지",
    outputTarget: "body",
    maxOutputTokens: 2500,
    temperature: 0.65,
    contentMaxChars: 5000,
    isBuiltin: true,
    uploadedFiles: [],
    learnedUrls: [],
    createdAt: "2025-01-01T00:00:00.000Z",
  },
];

const TARGET_LABELS: Record<string, string> = {
  body: "본문",
  summary: "요약문",
  title: "제목",
  meta: "메타설명",
};

/** HTML 태그 제거 후 순수 텍스트 반환 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

interface TitlePickerProps {
  raw: string;
  onPick: (title: string) => void;
  onRegenerate: () => void;
  onClose: () => void;
  regenerating: boolean;
}

function TitlePicker({ raw, onPick, onRegenerate, onClose, regenerating }: TitlePickerProps) {
  // Parse numbered list like "1. 제목", "1) 제목", "- 제목"
  const lines = raw
    .split("\n")
    .map((l) => l.replace(/^\s*(\d+[\.\)]\s*|[-•]\s*)/, "").trim())
    .filter((l) => l.length > 0);

  return (
    <div style={{ background: "#F8FFF8", border: "1px solid #C8E6C9", borderRadius: 8, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#2E7D32" }}>제목 추천 — 클릭해서 적용</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating}
            style={{
              padding: "4px 10px", fontSize: 11, background: "#FFF", color: "#666",
              border: "1px solid #DDD", borderRadius: 6, cursor: regenerating ? "default" : "pointer",
            }}
          >
            {regenerating ? "재생성 중..." : "재생성"}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: "4px 10px", fontSize: 11, background: "#FFF", color: "#666", border: "1px solid #DDD", borderRadius: 6, cursor: "pointer" }}
          >
            닫기
          </button>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {lines.map((line, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(line)}
            style={{
              padding: "10px 14px", textAlign: "left", background: "#FFF",
              border: "1px solid #E8F5E9", borderRadius: 6, fontSize: 13, color: "#111",
              cursor: "pointer", lineHeight: 1.5, transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#E8F5E9"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#FFF"; }}
          >
            <span style={{ color: "#999", fontSize: 11, marginRight: 8 }}>{i + 1}</span>
            {line}
          </button>
        ))}
      </div>
    </div>
  );
}

interface AiSkillPanelProps {
  aiSettings: AiSettings | null;
  body: string;
  title?: string;
  onApply: (target: "body" | "summary" | "title" | "meta", content: string) => void;
}

export default function AiSkillPanel({ aiSettings, body, title, onApply }: AiSkillPanelProps) {
  const [skills, setSkills] = useState<AiSkill[]>(DEFAULT_AI_SKILLS);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [result, setResult] = useState<{ skill: AiSkill; content: string } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getSetting<AiSkill[] | null>("cp-ai-skills", null).then((saved) => {
      if (saved && saved.length > 0) {
        const savedIds = new Set(saved.map((s) => s.id));
        const merged = [...saved];
        DEFAULT_AI_SKILLS.forEach((builtin) => {
          if (!savedIds.has(builtin.id)) merged.push(builtin);
        });
        setSkills(merged);
      }
    });
  }, []);

  // 현재 본문 plaintext
  const plainText = stripHtml(body);

  const isReady = Boolean(
    aiSettings &&
    (aiSettings.provider === "openai" ? aiSettings.openaiApiKey : aiSettings.geminiApiKey)
  );

  const runSkill = useCallback(
    async (skill: AiSkill) => {
      if (!aiSettings) {
        setError("AI 설정이 없습니다. 관리자 > AI 설정에서 API 키를 등록해주세요.");
        return;
      }
      const apiKey = aiSettings.provider === "openai" ? aiSettings.openaiApiKey : aiSettings.geminiApiKey;
      if (!apiKey) {
        setError("API 키가 설정되지 않았습니다. AI 설정 페이지에서 키를 등록해주세요.");
        return;
      }

      if (!plainText) {
        setError("본문을 먼저 입력해주세요.");
        return;
      }

      // HTML 제거 후 글자수 제한 적용 (버그 수정: 기존엔 HTML 태그 포함 슬라이싱)
      const inputContent = plainText.slice(0, skill.contentMaxChars);

      setRunningId(skill.id);
      setError("");
      setResult(null);

      try {
        const systemPrompt = skill.styleContext
          ? `${skill.prompt}\n\n[문체 가이드라인]\n${skill.styleContext}`
          : skill.prompt;

        const resp = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: aiSettings.provider,
            model: aiSettings.provider === "openai" ? aiSettings.openaiModel : aiSettings.geminiModel,
            apiKey,
            prompt: systemPrompt,
            content: inputContent,
            maxOutputTokens: skill.maxOutputTokens,
            temperature: skill.temperature,
          }),
        });
        const data = await resp.json();
        if (data.success) {
          setResult({ skill, content: data.result });
        } else {
          setError(data.error || "AI 요청 실패");
        }
      } catch (e) {
        setError(String(e));
      }
      setRunningId(null);
    },
    [aiSettings, plainText]
  );

  const handleApply = (content: string) => {
    if (!result) return;
    onApply(result.skill.outputTarget, content);
    setResult(null);
  };

  const handleApplyDefault = () => {
    if (!result) return;
    if (result.skill.outputTarget === "title") return; // title은 TitlePicker에서 처리
    onApply(result.skill.outputTarget, result.content);
    setResult(null);
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const el = document.createElement("textarea");
      el.value = result.content;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRegenerate = () => {
    if (!result) return;
    runSkill(result.skill);
  };

  // 현재 선택된 스킬의 글자수 정보
  const getCharInfo = (skill: AiSkill) => {
    const pct = Math.min(100, Math.round((plainText.length / skill.contentMaxChars) * 100));
    const truncated = plainText.length > skill.contentMaxChars;
    return { pct, truncated, plainLen: plainText.length, max: skill.contentMaxChars };
  };

  const activeSkill = result?.skill ?? skills.find((s) => s.id === runningId);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>AI 기사 편집</h3>
          <div style={{ fontSize: 12, color: isReady ? "#888" : "#E8192C" }}>
            {isReady
              ? `${aiSettings!.provider === "openai" ? "OpenAI" : "Gemini"} · ${aiSettings!.provider === "openai" ? aiSettings!.openaiModel : aiSettings!.geminiModel}`
              : "AI 미설정 — API 키를 등록해야 사용할 수 있습니다"}
          </div>
        </div>
        <a href="/admin/ai-settings" style={{ fontSize: 12, color: "#E8192C", textDecoration: "none" }}>
          스킬 관리 →
        </a>
      </div>

      {/* AI 미설정 안내 배너 */}
      {!isReady && (
        <div style={{
          padding: "10px 14px", marginBottom: 12, background: "#FFF8E1",
          border: "1px solid #FFE082", borderRadius: 8, fontSize: 13, color: "#795548",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span>AI 기능을 사용하려면 API 키가 필요합니다.</span>
          <a href="/admin/ai-settings" style={{ color: "#E8192C", fontWeight: 600, fontSize: 12, textDecoration: "none" }}>
            설정 바로가기 →
          </a>
        </div>
      )}

      {/* 입력 글자수 표시 (스킬 실행 중이거나 결과가 있을 때) */}
      {activeSkill && plainText.length > 0 && (() => {
        const { pct, truncated, plainLen, max } = getCharInfo(activeSkill);
        return (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: truncated ? "#E8192C" : "#999", marginBottom: 3 }}>
              <span>AI 입력: {Math.min(plainLen, max).toLocaleString()} / {max.toLocaleString()}자</span>
              {truncated && <span>본문이 길어 앞부분만 전송됩니다</span>}
            </div>
            <div style={{ height: 3, background: "#EEE", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: truncated ? "#E8192C" : "#4CAF50", borderRadius: 2 }} />
            </div>
          </div>
        );
      })()}

      {/* Skill Buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {skills.map((skill) => (
          <button
            key={skill.id}
            type="button"
            onClick={() => isReady ? runSkill(skill) : undefined}
            disabled={!!runningId || !isReady}
            title={isReady
              ? `${skill.description}${skill.styleContext ? "\n[학습된 문체 적용]" : ""}`
              : "AI 설정에서 API 키를 먼저 등록해주세요"}
            style={{
              ...aiBtnStyle,
              opacity: !isReady ? 0.5 : 1,
              cursor: !isReady ? "not-allowed" : (!!runningId ? "default" : "pointer"),
              ...(runningId === skill.id ? { background: "#F5F5F5", color: "#999" } : {}),
              ...(skill.styleContext && isReady ? { borderColor: "#E8192C" } : {}),
            }}
          >
            {runningId === skill.id ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ display: "inline-flex", gap: 3 }}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} style={{
                      width: 4, height: 4, borderRadius: "50%", background: "#999",
                      animation: `aiDot 1s ease-in-out ${i * 0.2}s infinite`,
                    }} />
                  ))}
                </span>
                {skill.name}
              </span>
            ) : skill.name}
            {skill.styleContext && isReady && (
              <span style={{ fontSize: 9, background: "#E8192C", color: "#FFF", borderRadius: 3, padding: "1px 4px", marginLeft: 4, fontWeight: 600 }}>
                학습됨
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 로딩 애니메이션 CSS */}
      <style>{`
        @keyframes aiDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* Error */}
      {error && (
        <div style={{
          padding: "10px 14px", background: "#FFF0F0", border: "1px solid #FFCDD2",
          borderRadius: 8, fontSize: 13, color: "#C62828", marginBottom: 12,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError("")}
            style={{ background: "none", border: "none", color: "#C62828", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 4px" }}
          >
            ×
          </button>
        </div>
      )}

      {/* Loading */}
      {runningId && (
        <div style={{ padding: "16px 0", textAlign: "center", color: "#999", fontSize: 13 }}>
          AI가 기사를 분석하고 있습니다...
        </div>
      )}

      {/* Result */}
      {result && (
        <>
          {/* 제목 추천 → 선택 목록 */}
          {result.skill.outputTarget === "title" ? (
            <TitlePicker
              raw={result.content}
              onPick={(t) => { onApply("title", t); setResult(null); }}
              onRegenerate={handleRegenerate}
              onClose={() => setResult(null)}
              regenerating={!!runningId}
            />
          ) : (
            <div style={{ background: "#F8FFF8", border: "1px solid #C8E6C9", borderRadius: 8, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#2E7D32" }}>
                  [{result.skill.name}] → {TARGET_LABELS[result.skill.outputTarget]}
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={handleCopy}
                    style={{
                      padding: "5px 10px", fontSize: 11,
                      background: copied ? "#E8F5E9" : "#FFF",
                      color: copied ? "#2E7D32" : "#666",
                      border: `1px solid ${copied ? "#C8E6C9" : "#DDD"}`,
                      borderRadius: 6, cursor: "pointer", fontWeight: copied ? 600 : 400,
                    }}
                  >
                    {copied ? "복사됨!" : "복사"}
                  </button>
                  <button
                    type="button"
                    onClick={handleRegenerate}
                    disabled={!!runningId}
                    style={{
                      padding: "5px 10px", fontSize: 11, background: "#FFF", color: "#666",
                      border: "1px solid #DDD", borderRadius: 6, cursor: runningId ? "default" : "pointer",
                    }}
                  >
                    재생성
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyDefault}
                    style={{
                      padding: "5px 12px", fontSize: 12, background: "#4CAF50", color: "#FFF",
                      border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600,
                    }}
                  >
                    {TARGET_LABELS[result.skill.outputTarget]}에 적용
                  </button>
                  <button
                    type="button"
                    onClick={() => setResult(null)}
                    style={{ padding: "5px 10px", fontSize: 11, background: "#FFF", color: "#666", border: "1px solid #DDD", borderRadius: 6, cursor: "pointer" }}
                  >
                    닫기
                  </button>
                </div>
              </div>
              <div style={{
                fontSize: 13, color: "#333", lineHeight: 1.8, whiteSpace: "pre-wrap",
                maxHeight: 300, overflowY: "auto", background: "#FFF",
                borderRadius: 6, padding: 12, border: "1px solid #E8F5E9",
              }}>
                {result.content}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
