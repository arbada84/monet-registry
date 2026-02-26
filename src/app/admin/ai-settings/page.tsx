"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { AiSettings, AiSkill } from "@/types/article";
import { inputStyle, labelStyle } from "@/lib/admin-styles";
import { getSetting, saveSetting } from "@/lib/db";
import { DEFAULT_AI_SKILLS } from "@/components/AiSkillPanel";

/** API 키 마스킹: 앞 3자 + **** + 마지막 4자 */
function maskKey(key: string): string {
  if (!key || key.length < 8) return key;
  return key.slice(0, 3) + "****" + key.slice(-4);
}

const DEFAULT_AI: AiSettings = {
  provider: "gemini",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  geminiApiKey: "",
  geminiModel: "gemini-2.0-flash",
  defaultPromptRewrite: "",
  defaultPromptSummarize: "",
  defaultPromptTitle: "",
};

const OPENAI_MODELS = [
  { value: "gpt-4o", label: "GPT-4o (최신, 추천)" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini (빠르고 저렴)" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (가장 저렴)" },
];

const GEMINI_MODELS = [
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash (최신, 추천)" },
  { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite (경량)" },
  { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
];

const TARGET_OPTIONS = [
  { value: "body", label: "본문 교체" },
  { value: "summary", label: "요약문" },
  { value: "title", label: "제목 추천" },
  { value: "meta", label: "SEO 메타설명" },
];

const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: "8px 20px",
  fontSize: 14,
  fontWeight: active ? 600 : 400,
  border: "none",
  borderBottom: active ? "2px solid #E8192C" : "2px solid transparent",
  background: "none",
  color: active ? "#E8192C" : "#666",
  cursor: "pointer",
});

export default function AdminAiSettingsPage() {
  const [activeTab, setActiveTab] = useState<"settings" | "skills">("settings");
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI);
  // 실제 키를 ref에 보관 (마스킹된 값을 state에 표시)
  const realOpenaiKey = useRef("");
  const realGeminiKey = useRef("");
  const [skills, setSkills] = useState<AiSkill[]>(DEFAULT_AI_SKILLS);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [testing, setTesting] = useState(false);

  // Skill management state
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);
  const [expandedTab, setExpandedTab] = useState<"prompt" | "file" | "url">("prompt");
  const [editedSkill, setEditedSkill] = useState<AiSkill | null>(null);
  const [fileLearning, setFileLearning] = useState(false);
  const [urlLearning, setUrlLearning] = useState(false);
  const [learnError, setLearnError] = useState("");
  const [learnSuccess, setLearnSuccess] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [confirmDeleteSkillId, setConfirmDeleteSkillId] = useState<string | null>(null);
  const [confirmClearSkillId, setConfirmClearSkillId] = useState<string | null>(null);

  // New skill form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSkill, setNewSkill] = useState<Partial<AiSkill>>({
    name: "",
    description: "",
    prompt: "",
    outputTarget: "body",
    maxOutputTokens: 1500,
    temperature: 0.7,
    contentMaxChars: 3000,
    isBuiltin: false,
  });

  useEffect(() => {
    getSetting<AiSettings | null>("cp-ai-settings", null).then((s) => {
      if (s) {
        // 실제 키를 ref에 저장, 화면에는 마스킹된 값만 표시
        realOpenaiKey.current = s.openaiApiKey || "";
        realGeminiKey.current = s.geminiApiKey || "";
        setSettings({
          ...DEFAULT_AI,
          ...s,
          openaiApiKey: maskKey(s.openaiApiKey || ""),
          geminiApiKey: maskKey(s.geminiApiKey || ""),
        });
      }
    });
    getSetting<AiSkill[] | null>("cp-ai-skills", null).then((saved) => {
      if (saved && saved.length > 0) {
        // Merge: add any new builtins not in saved list
        const savedIds = new Set(saved.map((s) => s.id));
        const merged = [...saved];
        DEFAULT_AI_SKILLS.forEach((builtin) => {
          if (!savedIds.has(builtin.id)) merged.push(builtin);
        });
        setSkills(merged);
      }
    });
  }, []);

  /** 현재 화면에 표시된 값이 마스킹된 원본과 같으면 실제 키를 반환 */
  const resolveKey = useCallback((displayed: string, realKey: string) => {
    if (displayed === maskKey(realKey)) return realKey;
    return displayed; // 사용자가 새로 입력한 키
  }, []);

  const saveSettings = async () => {
    const toSave: AiSettings = {
      ...settings,
      openaiApiKey: resolveKey(settings.openaiApiKey, realOpenaiKey.current),
      geminiApiKey: resolveKey(settings.geminiApiKey, realGeminiKey.current),
    };
    await saveSetting("cp-ai-settings", toSave);
    // 저장 후 ref 갱신 및 화면 재마스킹
    realOpenaiKey.current = toSave.openaiApiKey;
    realGeminiKey.current = toSave.geminiApiKey;
    setSettings((prev) => ({
      ...prev,
      openaiApiKey: maskKey(toSave.openaiApiKey),
      geminiApiKey: maskKey(toSave.geminiApiKey),
    }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const saveSkills = async (updatedSkills: AiSkill[]) => {
    setSkills(updatedSkills);
    await saveSetting("cp-ai-skills", updatedSkills);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult("");
    const apiKey = settings.provider === "openai"
      ? resolveKey(settings.openaiApiKey, realOpenaiKey.current)
      : resolveKey(settings.geminiApiKey, realGeminiKey.current);
    const model = settings.provider === "openai" ? settings.openaiModel : settings.geminiModel;

    try {
      const resp = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: settings.provider,
          model,
          apiKey,
          prompt: "한 문장으로 답변하세요.",
          content: "안녕하세요, API 연결 테스트입니다. 정상 동작하면 '연결 성공!'이라고 답해주세요.",
        }),
      });
      const data = await resp.json();
      setTestResult(data.success ? `성공: ${data.result}` : `오류: ${data.error}`);
    } catch (e) {
      setTestResult(`오류: ${String(e)}`);
    }
    setTesting(false);
  };

  const expandSkill = (skill: AiSkill) => {
    if (expandedSkillId === skill.id) {
      setExpandedSkillId(null);
      setEditedSkill(null);
      return;
    }
    setExpandedSkillId(skill.id);
    setExpandedTab("prompt");
    setEditedSkill({ ...skill });
    setLearnError("");
    setLearnSuccess("");
    setUrlInput("");
  };

  const saveEditedSkill = async () => {
    if (!editedSkill) return;
    const updated = skills.map((s) => (s.id === editedSkill.id ? editedSkill : s));
    await saveSkills(updated);
    setExpandedSkillId(null);
    setEditedSkill(null);
  };

  const deleteSkill = async (id: string) => {
    const updated = skills.filter((s) => s.id !== id);
    await saveSkills(updated);
    if (expandedSkillId === id) setExpandedSkillId(null);
    setConfirmDeleteSkillId(null);
  };

  const clearStyleContext = async (skillId: string) => {
    const updated = skills.map((s) =>
      s.id === skillId
        ? { ...s, styleContext: undefined, styleContextSummary: undefined, uploadedFiles: [], learnedUrls: [], lastLearnedAt: undefined }
        : s
    );
    await saveSkills(updated);
    setConfirmClearSkillId(null);
    if (editedSkill?.id === skillId) {
      setEditedSkill((prev) =>
        prev ? { ...prev, styleContext: undefined, styleContextSummary: undefined, uploadedFiles: [], learnedUrls: [] } : prev
      );
    }
  };

  const handleFileLearn = async () => {
    if (!editedSkill) return;
    if (selectedFiles.length === 0) { setLearnError("파일을 선택해주세요."); return; }

    const apiKey = resolveKey(
      settings.provider === "openai" ? settings.openaiApiKey : settings.geminiApiKey,
      settings.provider === "openai" ? realOpenaiKey.current : realGeminiKey.current,
    );
    if (!apiKey) { setLearnError("AI 설정에서 API 키를 먼저 등록해주세요."); return; }

    setFileLearning(true);
    setLearnError("");
    setLearnSuccess("");

    try {
      // Read all selected files and combine content (for multi-file batch learning)
      const parts: string[] = [];
      for (const file of selectedFiles) {
        const text = await file.text();
        parts.push(`[파일: ${file.name}]\n${text}`);
      }
      const combinedContent = parts.join("\n\n---\n\n").slice(0, 12000);
      const fileNames = selectedFiles.map((f) => f.name);

      const resp = await fetch("/api/ai/learn-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileContent: combinedContent,
          fileName: fileNames.join(", "),
          existingContext: editedSkill.styleContext || "",
          provider: settings.provider,
          model: settings.provider === "openai" ? settings.openaiModel : settings.geminiModel,
          apiKey,
        }),
      });
      const data = await resp.json();
      if (data.success) {
        const updatedFiles = [...(editedSkill.uploadedFiles || []), ...fileNames];
        const updatedSkill = {
          ...editedSkill,
          styleContext: data.styleContext,
          styleContextSummary: data.summary,
          uploadedFiles: updatedFiles,
          lastLearnedAt: new Date().toISOString(),
        };
        setEditedSkill(updatedSkill);
        const updated = skills.map((s) => (s.id === updatedSkill.id ? updatedSkill : s));
        await saveSkills(updated);
        setLearnSuccess(`${fileNames.length}개 파일 학습 완료: ${fileNames.join(", ")}`);
        if (fileInputRef.current) fileInputRef.current.value = "";
        setSelectedFiles([]);
      } else {
        setLearnError(data.error || "학습 실패");
      }
    } catch (e) {
      setLearnError(String(e));
    }
    setFileLearning(false);
  };

  const handleUrlLearn = async () => {
    if (!editedSkill) return;
    const urls = urlInput.split("\n").map((u) => u.trim()).filter(Boolean);
    if (urls.length === 0) { setLearnError("URL을 입력해주세요."); return; }

    const apiKey = resolveKey(
      settings.provider === "openai" ? settings.openaiApiKey : settings.geminiApiKey,
      settings.provider === "openai" ? realOpenaiKey.current : realGeminiKey.current,
    );
    if (!apiKey) { setLearnError("AI 설정에서 API 키를 먼저 등록해주세요."); return; }

    setUrlLearning(true);
    setLearnError("");
    setLearnSuccess("");

    try {
      const resp = await fetch("/api/ai/learn-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls,
          existingContext: editedSkill.styleContext || "",
          provider: settings.provider,
          model: settings.provider === "openai" ? settings.openaiModel : settings.geminiModel,
          apiKey,
        }),
      });
      const data = await resp.json();
      if (data.success) {
        const updatedUrls = [...(editedSkill.learnedUrls || []), ...urls];
        const updatedSkill = {
          ...editedSkill,
          styleContext: data.styleContext,
          styleContextSummary: data.summary,
          learnedUrls: updatedUrls,
          lastLearnedAt: new Date().toISOString(),
        };
        setEditedSkill(updatedSkill);
        const updated = skills.map((s) => (s.id === updatedSkill.id ? updatedSkill : s));
        await saveSkills(updated);
        setLearnSuccess(`${data.fetched}개 URL 학습 완료`);
        setUrlInput("");
      } else {
        setLearnError(data.error || "학습 실패");
      }
    } catch (e) {
      setLearnError(String(e));
    }
    setUrlLearning(false);
  };

  const [addSkillError, setAddSkillError] = useState("");

  const handleAddSkill = async () => {
    if (!newSkill.name?.trim() || !newSkill.prompt?.trim()) {
      setAddSkillError("스킬 이름과 프롬프트를 입력해주세요.");
      return;
    }
    setAddSkillError("");
    const skill: AiSkill = {
      id: `custom-${Date.now()}`,
      name: newSkill.name!.trim(),
      description: newSkill.description || "",
      prompt: newSkill.prompt!.trim(),
      outputTarget: (newSkill.outputTarget as AiSkill["outputTarget"]) || "body",
      maxOutputTokens: newSkill.maxOutputTokens || 1500,
      temperature: newSkill.temperature ?? 0.7,
      contentMaxChars: newSkill.contentMaxChars || 3000,
      isBuiltin: false,
      uploadedFiles: [],
      learnedUrls: [],
      createdAt: new Date().toISOString(),
    };
    const updated = [...skills, skill];
    await saveSkills(updated);
    setShowAddForm(false);
    setNewSkill({ name: "", description: "", prompt: "", outputTarget: "body", maxOutputTokens: 1500, temperature: 0.7, contentMaxChars: 3000, isBuiltin: false });
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 8 }}>AI 기사 편집 설정</h1>

      {/* Tab Nav */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #EEE", marginBottom: 24 }}>
        <button style={tabBtn(activeTab === "settings")} onClick={() => setActiveTab("settings")}>기본 설정</button>
        <button style={tabBtn(activeTab === "skills")} onClick={() => setActiveTab("skills")}>
          스킬 관리 ({skills.length})
        </button>
      </div>

      {/* ============ 기본 설정 탭 ============ */}
      {activeTab === "settings" && (
        <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Provider Selection */}
          <section style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>AI 서비스 선택</h2>
            <div style={{ display: "flex", gap: 12 }}>
              {[
                { key: "gemini" as const, label: "Google Gemini", desc: "무료 티어 제공, 빠른 속도" },
                { key: "openai" as const, label: "OpenAI GPT", desc: "높은 품질, 유료" },
              ].map((p) => (
                <label key={p.key} onClick={() => setSettings({ ...settings, provider: p.key })} style={{
                  flex: 1, padding: 16, borderRadius: 8, cursor: "pointer",
                  border: `2px solid ${settings.provider === p.key ? "#E8192C" : "#EEE"}`,
                  background: settings.provider === p.key ? "#FFF0F0" : "#FAFAFA",
                }}>
                  <input type="radio" checked={settings.provider === p.key} onChange={() => setSettings({ ...settings, provider: p.key })} style={{ marginRight: 8 }} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{p.label}</span>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 4, marginLeft: 24 }}>{p.desc}</div>
                </label>
              ))}
            </div>
          </section>

          {/* API Key & Model */}
          <section style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>
              {settings.provider === "openai" ? "OpenAI" : "Google Gemini"} 설정
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {settings.provider === "openai" ? (
                <>
                  <div>
                    <label style={labelStyle}>OpenAI API 키</label>
                    <input type="password" value={settings.openaiApiKey} onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })} placeholder="sk-..." style={inputStyle} />
                    <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                      <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener" style={{ color: "#E8192C" }}>OpenAI 대시보드</a>에서 발급 · 미입력 시 서버 환경변수(OPENAI_API_KEY) 사용
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>모델 선택</label>
                    <select value={settings.openaiModel} onChange={(e) => setSettings({ ...settings, openaiModel: e.target.value })} style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}>
                      {OPENAI_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label style={labelStyle}>Gemini API 키</label>
                    <input type="password" value={settings.geminiApiKey} onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })} placeholder="AI..." style={inputStyle} />
                    <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                      <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style={{ color: "#E8192C" }}>Google AI Studio</a>에서 발급 (무료) · 미입력 시 서버 환경변수(GEMINI_API_KEY) 사용
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>모델 선택</label>
                    <select value={settings.geminiModel} onChange={(e) => setSettings({ ...settings, geminiModel: e.target.value })} style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}>
                      {GEMINI_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                </>
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={handleTest} disabled={testing} style={{ padding: "8px 20px", background: "#333", color: "#FFF", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                  {testing ? "테스트 중..." : "연결 테스트"}
                </button>
                {testResult && (
                  <span style={{ fontSize: 13, color: testResult.startsWith("성공") ? "#4CAF50" : "#E8192C" }}>{testResult}</span>
                )}
              </div>
            </div>
          </section>

          <div>
            <button onClick={saveSettings} style={{ padding: "12px 32px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>저장</button>
            {saved && <span style={{ marginLeft: 12, fontSize: 14, color: "#4CAF50", fontWeight: 500 }}>저장되었습니다!</span>}
          </div>
        </div>
      )}

      {/* ============ 스킬 관리 탭 ============ */}
      {activeTab === "skills" && (
        <div style={{ maxWidth: 760 }}>
          <div style={{ fontSize: 13, color: "#666", marginBottom: 20, padding: "12px 16px", background: "#F8F9FA", borderRadius: 8, border: "1px solid #EEE" }}>
            스킬을 클릭하면 프롬프트 편집 및 문체 학습을 할 수 있습니다.
            학습된 스킬 버튼에는 <span style={{ background: "#E8192C", color: "#FFF", fontSize: 11, borderRadius: 3, padding: "1px 5px" }}>학습됨</span> 배지가 표시됩니다.
          </div>

          {/* Skill List */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {skills.map((skill) => (
              <div key={skill.id} style={{ border: `1px solid ${expandedSkillId === skill.id ? "#E8192C" : "#EEE"}`, borderRadius: 10, overflow: "hidden" }}>
                {/* Skill Row */}
                <div
                  onClick={() => expandSkill(skill)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "14px 18px",
                    background: expandedSkillId === skill.id ? "#FFF8F8" : "#FFF",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{skill.name}</span>
                      {skill.isBuiltin && (
                        <span style={{ fontSize: 10, background: "#F5F5F5", color: "#888", borderRadius: 3, padding: "1px 6px", border: "1px solid #DDD" }}>기본</span>
                      )}
                      {skill.styleContext && (
                        <span style={{ fontSize: 10, background: "#E8192C", color: "#FFF", borderRadius: 3, padding: "1px 6px" }}>학습됨</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "#888" }}>{skill.description}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: "#999", background: "#F5F5F5", borderRadius: 4, padding: "2px 8px" }}>
                      {TARGET_OPTIONS.find((t) => t.value === skill.outputTarget)?.label}
                    </span>
                    <span style={{ fontSize: 11, color: "#999" }}>{skill.maxOutputTokens}토큰</span>
                    {!skill.isBuiltin && (
                      confirmDeleteSkillId === skill.id ? (
                        <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => deleteSkill(skill.id)} style={{ fontSize: 11, background: "#E8192C", color: "#FFF", border: "none", borderRadius: 4, cursor: "pointer", padding: "2px 8px" }}>삭제</button>
                          <button type="button" onClick={() => setConfirmDeleteSkillId(null)} style={{ fontSize: 11, background: "#FFF", border: "1px solid #DDD", borderRadius: 4, cursor: "pointer", padding: "2px 8px" }}>취소</button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteSkillId(skill.id); }}
                          style={{ fontSize: 12, color: "#E8192C", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}
                        >
                          삭제
                        </button>
                      )
                    )}
                    <span style={{ color: "#CCC", fontSize: 16 }}>{expandedSkillId === skill.id ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Expanded Panel */}
                {expandedSkillId === skill.id && editedSkill && (
                  <div style={{ borderTop: "1px solid #EEE", background: "#FAFAFA", padding: 20 }}>
                    {/* Sub-tabs */}
                    <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #DDD", marginBottom: 16 }}>
                      {([
                        { key: "prompt", label: "프롬프트 편집" },
                        { key: "file", label: "파일 학습" },
                        { key: "url", label: "URL 학습" },
                      ] as { key: "prompt" | "file" | "url"; label: string }[]).map((t) => (
                        <button
                          key={t.key}
                          onClick={() => { setExpandedTab(t.key); setLearnError(""); setLearnSuccess(""); }}
                          style={{
                            padding: "6px 16px", fontSize: 13, background: "none", border: "none",
                            borderBottom: expandedTab === t.key ? "2px solid #E8192C" : "2px solid transparent",
                            color: expandedTab === t.key ? "#E8192C" : "#666",
                            fontWeight: expandedTab === t.key ? 600 : 400,
                            cursor: "pointer",
                          }}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {/* Prompt Edit Tab */}
                    {expandedTab === "prompt" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        <div>
                          <label style={labelStyle}>스킬 이름</label>
                          <input
                            value={editedSkill.name}
                            onChange={(e) => setEditedSkill({ ...editedSkill, name: e.target.value })}
                            style={inputStyle}
                            disabled={editedSkill.isBuiltin}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>설명</label>
                          <input
                            value={editedSkill.description}
                            onChange={(e) => setEditedSkill({ ...editedSkill, description: e.target.value })}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>프롬프트</label>
                          <textarea
                            value={editedSkill.prompt}
                            onChange={(e) => setEditedSkill({ ...editedSkill, prompt: e.target.value })}
                            rows={6}
                            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }}
                          />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                          <div>
                            <label style={labelStyle}>적용 대상</label>
                            <select
                              value={editedSkill.outputTarget}
                              onChange={(e) => setEditedSkill({ ...editedSkill, outputTarget: e.target.value as AiSkill["outputTarget"] })}
                              style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}
                              disabled={editedSkill.isBuiltin}
                            >
                              {TARGET_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={labelStyle}>최대 토큰</label>
                            <input
                              type="number"
                              value={editedSkill.maxOutputTokens}
                              onChange={(e) => setEditedSkill({ ...editedSkill, maxOutputTokens: Number(e.target.value) })}
                              min={50} max={8000} step={50}
                              style={inputStyle}
                            />
                          </div>
                          <div>
                            <label style={labelStyle}>온도 (0~1)</label>
                            <input
                              type="number"
                              value={editedSkill.temperature}
                              onChange={(e) => setEditedSkill({ ...editedSkill, temperature: parseFloat(e.target.value) })}
                              min={0} max={1} step={0.05}
                              style={inputStyle}
                            />
                          </div>
                          <div>
                            <label style={labelStyle}>입력 최대 글자</label>
                            <input
                              type="number"
                              value={editedSkill.contentMaxChars}
                              onChange={(e) => setEditedSkill({ ...editedSkill, contentMaxChars: Number(e.target.value) })}
                              min={200} max={10000} step={200}
                              style={inputStyle}
                            />
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={saveEditedSkill} style={{ padding: "8px 20px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                            저장
                          </button>
                          <button onClick={() => { setExpandedSkillId(null); setEditedSkill(null); }} style={{ padding: "8px 20px", background: "#FFF", color: "#666", border: "1px solid #DDD", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                            취소
                          </button>
                        </div>
                      </div>
                    )}

                    {/* File Learn Tab */}
                    {expandedTab === "file" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <div style={{ fontSize: 13, color: "#666", lineHeight: 1.6 }}>
                          텍스트 파일(.txt, .md, .html)을 업로드하면 AI가 문체 패턴을 학습합니다.
                          여러 파일을 동시에 선택하면 한 번에 누적 학습됩니다.
                        </div>
                        {editedSkill.styleContext && (
                          <div style={{ background: "#F0FFF4", border: "1px solid #C8E6C9", borderRadius: 8, padding: 12 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: "#2E7D32" }}>현재 학습 상태</span>
                              {confirmClearSkillId === editedSkill.id ? (
                                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                  <span style={{ fontSize: 11, color: "#E8192C" }}>초기화할까요?</span>
                                  <button onClick={() => clearStyleContext(editedSkill.id)} style={{ fontSize: 11, background: "#E8192C", color: "#FFF", border: "none", borderRadius: 4, cursor: "pointer", padding: "2px 8px" }}>확인</button>
                                  <button onClick={() => setConfirmClearSkillId(null)} style={{ fontSize: 11, background: "#FFF", border: "1px solid #DDD", borderRadius: 4, cursor: "pointer", padding: "2px 8px" }}>취소</button>
                                </div>
                              ) : (
                                <button onClick={() => setConfirmClearSkillId(editedSkill.id)} style={{ fontSize: 11, color: "#E8192C", background: "none", border: "none", cursor: "pointer" }}>초기화</button>
                              )}
                            </div>
                            {editedSkill.lastLearnedAt && (
                              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
                                마지막 학습: {new Date(editedSkill.lastLearnedAt).toLocaleDateString("ko-KR")}
                              </div>
                            )}
                            {editedSkill.uploadedFiles && editedSkill.uploadedFiles.length > 0 && (
                              <div style={{ fontSize: 12, color: "#666" }}>
                                학습 파일 {editedSkill.uploadedFiles.length}개: {editedSkill.uploadedFiles.join(", ")}
                              </div>
                            )}
                          </div>
                        )}
                        {/* Hidden native file input */}
                        <input
                          ref={fileInputRef}
                          id="skill-file-input"
                          type="file"
                          accept=".txt,.md,.html,.htm,.csv"
                          multiple
                          onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
                          style={{ display: "none" }}
                        />
                        {/* Styled file select button row */}
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <label
                            htmlFor="skill-file-input"
                            style={{
                              padding: "8px 18px",
                              background: "#FFF",
                              border: "1px solid #999",
                              borderRadius: 8,
                              fontSize: 13,
                              fontWeight: 500,
                              color: "#333",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              userSelect: "none",
                            }}
                          >
                            파일 선택
                            {selectedFiles.length > 0 && (
                              <span style={{ background: "#E8192C", color: "#FFF", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>
                                {selectedFiles.length}
                              </span>
                            )}
                          </label>
                          <span style={{ fontSize: 12, color: "#AAA" }}>.txt .md .html — 복수 선택 가능</span>
                          <button
                            onClick={handleFileLearn}
                            disabled={fileLearning || selectedFiles.length === 0}
                            style={{
                              padding: "8px 20px",
                              background: fileLearning || selectedFiles.length === 0 ? "#CCC" : "#333",
                              color: "#FFF",
                              border: "none",
                              borderRadius: 8,
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: fileLearning || selectedFiles.length === 0 ? "default" : "pointer",
                              whiteSpace: "nowrap",
                              marginLeft: "auto",
                            }}
                          >
                            {fileLearning ? "학습 중..." : "학습 시작"}
                          </button>
                        </div>
                        {/* Selected file list preview */}
                        {selectedFiles.length > 0 && (
                          <div style={{ padding: "10px 14px", background: "#F0F4FF", border: "1px solid #C5CAE9", borderRadius: 8 }}>
                            <div style={{ fontSize: 12, color: "#3F51B5", fontWeight: 600, marginBottom: 6 }}>
                              선택된 파일 {selectedFiles.length}개 (학습 시작 버튼을 눌러주세요)
                            </div>
                            {selectedFiles.map((f, i) => (
                              <div key={i} style={{ fontSize: 12, color: "#555", lineHeight: 1.8 }}>· {f.name}</div>
                            ))}
                          </div>
                        )}
                        {learnError && <div style={{ fontSize: 13, color: "#E8192C", padding: "8px 12px", background: "#FFF0F0", borderRadius: 6 }}>{learnError}</div>}
                        {learnSuccess && <div style={{ fontSize: 13, color: "#2E7D32", padding: "8px 12px", background: "#F0FFF4", borderRadius: 6 }}>{learnSuccess}</div>}
                      </div>
                    )}

                    {/* URL Learn Tab */}
                    {expandedTab === "url" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <div style={{ fontSize: 13, color: "#666", lineHeight: 1.6 }}>
                          기사 URL을 입력하면 서버에서 내용을 가져와 문체를 학습합니다.
                          한 줄에 URL 하나씩, 최대 10개까지 동시 학습 가능합니다.
                        </div>
                        {editedSkill.styleContext && (
                          <div style={{ background: "#F0FFF4", border: "1px solid #C8E6C9", borderRadius: 8, padding: 12 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: "#2E7D32" }}>현재 학습 상태</span>
                              {confirmClearSkillId === editedSkill.id ? (
                                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                  <span style={{ fontSize: 11, color: "#E8192C" }}>초기화할까요?</span>
                                  <button onClick={() => clearStyleContext(editedSkill.id)} style={{ fontSize: 11, background: "#E8192C", color: "#FFF", border: "none", borderRadius: 4, cursor: "pointer", padding: "2px 8px" }}>확인</button>
                                  <button onClick={() => setConfirmClearSkillId(null)} style={{ fontSize: 11, background: "#FFF", border: "1px solid #DDD", borderRadius: 4, cursor: "pointer", padding: "2px 8px" }}>취소</button>
                                </div>
                              ) : (
                                <button onClick={() => setConfirmClearSkillId(editedSkill.id)} style={{ fontSize: 11, color: "#E8192C", background: "none", border: "none", cursor: "pointer" }}>초기화</button>
                              )}
                            </div>
                            {editedSkill.lastLearnedAt && (
                              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
                                마지막 학습: {new Date(editedSkill.lastLearnedAt).toLocaleDateString("ko-KR")}
                              </div>
                            )}
                            {editedSkill.learnedUrls && editedSkill.learnedUrls.length > 0 && (
                              <div style={{ fontSize: 12, color: "#666" }}>
                                학습 URL {editedSkill.learnedUrls.length}개
                              </div>
                            )}
                          </div>
                        )}
                        <div>
                          <label style={labelStyle}>기사 URL (한 줄에 하나씩)</label>
                          <textarea
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            placeholder={"https://example.com/article1\nhttps://example.com/article2"}
                            rows={5}
                            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6, fontFamily: "monospace", fontSize: 12 }}
                          />
                        </div>
                        <div>
                          <button
                            onClick={handleUrlLearn}
                            disabled={urlLearning}
                            style={{ padding: "8px 20px", background: urlLearning ? "#CCC" : "#333", color: "#FFF", border: "none", borderRadius: 8, fontSize: 13, cursor: urlLearning ? "default" : "pointer" }}
                          >
                            {urlLearning ? "학습 중..." : "URL 학습 시작"}
                          </button>
                        </div>
                        {learnError && <div style={{ fontSize: 13, color: "#E8192C", padding: "8px 12px", background: "#FFF0F0", borderRadius: 6 }}>{learnError}</div>}
                        {learnSuccess && <div style={{ fontSize: 13, color: "#2E7D32", padding: "8px 12px", background: "#F0FFF4", borderRadius: 6 }}>{learnSuccess}</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add New Skill */}
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              style={{ padding: "10px 20px", background: "#FFF", border: "2px dashed #DDD", borderRadius: 10, fontSize: 14, color: "#666", cursor: "pointer", width: "100%" }}
            >
              + 새 스킬 추가
            </button>
          ) : (
            <div style={{ border: "1px solid #E8192C", borderRadius: 10, padding: 20, background: "#FFF" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>새 스킬 추가</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>스킬 이름 *</label>
                    <input value={newSkill.name || ""} onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })} placeholder="예: 인터뷰 기사 작성" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>설명</label>
                    <input value={newSkill.description || ""} onChange={(e) => setNewSkill({ ...newSkill, description: e.target.value })} placeholder="스킬 기능 설명" style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>프롬프트 *</label>
                  <textarea
                    value={newSkill.prompt || ""}
                    onChange={(e) => setNewSkill({ ...newSkill, prompt: e.target.value })}
                    placeholder="AI에게 전달할 지시 내용을 작성하세요"
                    rows={5}
                    style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>적용 대상</label>
                    <select value={newSkill.outputTarget} onChange={(e) => setNewSkill({ ...newSkill, outputTarget: e.target.value as AiSkill["outputTarget"] })} style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}>
                      {TARGET_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>최대 토큰</label>
                    <input type="number" value={newSkill.maxOutputTokens || 1500} onChange={(e) => setNewSkill({ ...newSkill, maxOutputTokens: Number(e.target.value) })} min={50} max={8000} step={50} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>온도 (0~1)</label>
                    <input type="number" value={newSkill.temperature ?? 0.7} onChange={(e) => setNewSkill({ ...newSkill, temperature: parseFloat(e.target.value) })} min={0} max={1} step={0.05} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>입력 최대 글자</label>
                    <input type="number" value={newSkill.contentMaxChars || 3000} onChange={(e) => setNewSkill({ ...newSkill, contentMaxChars: Number(e.target.value) })} min={200} max={10000} step={200} style={inputStyle} />
                  </div>
                </div>
                {addSkillError && <div style={{ fontSize: 13, color: "#E8192C", background: "#FFF0F0", border: "1px solid #FFCDD2", borderRadius: 6, padding: "8px 12px" }}>{addSkillError}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleAddSkill} style={{ padding: "8px 20px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>추가</button>
                  <button onClick={() => { setShowAddForm(false); setAddSkillError(""); }} style={{ padding: "8px 20px", background: "#FFF", color: "#666", border: "1px solid #DDD", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>취소</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
