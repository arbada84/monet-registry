"use client";

import { useEffect, useState } from "react";

interface AiSettings {
  provider: "openai" | "gemini";
  openaiApiKey: string;
  openaiModel: string;
  geminiApiKey: string;
  geminiModel: string;
  defaultPromptRewrite: string;
  defaultPromptSummarize: string;
  defaultPromptTitle: string;
}

const DEFAULT_AI: AiSettings = {
  provider: "gemini",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  geminiApiKey: "",
  geminiModel: "gemini-2.0-flash",
  defaultPromptRewrite: "당신은 한국의 전문 뉴스 기자입니다. 아래 보도자료를 뉴스 기사 형식으로 다시 작성해주세요.\n\n규칙:\n- 역피라미드 구조 (핵심 → 상세 → 배경)\n- 객관적이고 간결한 문체\n- 제목, 부제, 본문으로 구분\n- 원문의 핵심 사실을 빠짐없이 포함\n- 500~800자 분량",
  defaultPromptSummarize: "아래 기사의 핵심 내용을 3줄로 요약해주세요. 각 줄은 한 문장으로, 가장 중요한 정보부터 순서대로 작성합니다.",
  defaultPromptTitle: "아래 기사 내용을 바탕으로 클릭하고 싶은 매력적인 뉴스 제목 5개를 제안해주세요.\n\n규칙:\n- 각 제목은 30자 이내\n- 핵심 키워드 포함\n- 다양한 스타일 (정보형, 질문형, 숫자형 등)",
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

export default function AdminAiSettingsPage() {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("cp-ai-settings");
    if (stored) setSettings({ ...DEFAULT_AI, ...JSON.parse(stored) });
  }, []);

  const handleSave = () => {
    localStorage.setItem("cp-ai-settings", JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult("");
    const apiKey = settings.provider === "openai" ? settings.openaiApiKey : settings.geminiApiKey;
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

  const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #DDD", borderRadius: 8, outline: "none", boxSizing: "border-box" };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: "#333", marginBottom: 6 };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 24 }}>AI 기사 편집 설정</h1>

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
                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener" style={{ color: "#E8192C" }}>OpenAI 대시보드</a>에서 발급
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
                    <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style={{ color: "#E8192C" }}>Google AI Studio</a>에서 발급 (무료)
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

        {/* Default Prompts */}
        <section style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>기본 프롬프트 설정</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>기사 리라이트 프롬프트</label>
              <textarea value={settings.defaultPromptRewrite} onChange={(e) => setSettings({ ...settings, defaultPromptRewrite: e.target.value })} rows={5} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
            </div>
            <div>
              <label style={labelStyle}>요약 프롬프트</label>
              <textarea value={settings.defaultPromptSummarize} onChange={(e) => setSettings({ ...settings, defaultPromptSummarize: e.target.value })} rows={3} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
            </div>
            <div>
              <label style={labelStyle}>제목 생성 프롬프트</label>
              <textarea value={settings.defaultPromptTitle} onChange={(e) => setSettings({ ...settings, defaultPromptTitle: e.target.value })} rows={4} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
            </div>
          </div>
        </section>

        <div>
          <button onClick={handleSave} style={{ padding: "12px 32px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>저장</button>
          {saved && <span style={{ marginLeft: 12, fontSize: 14, color: "#4CAF50", fontWeight: 500 }}>저장되었습니다!</span>}
        </div>
      </div>
    </div>
  );
}
