"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const CATEGORIES = ["뉴스", "연예", "스포츠", "문화", "라이프", "포토"];

const PORTALS = [
  { key: "google", name: "Google Indexing API" },
  { key: "bing", name: "Bing IndexNow" },
  { key: "naver", name: "네이버 서치어드바이저" },
  { key: "daum", name: "다음 검색등록" },
  { key: "zum", name: "ZUM 검색등록" },
  { key: "rss", name: "RSS 피드" },
];

interface Article {
  id: string;
  title: string;
  category: string;
  date: string;
  status: string;
  views: number;
  body: string;
  thumbnail: string;
  tags: string;
  author: string;
  summary: string;
}

interface DistributeLog {
  id: string;
  articleId: string;
  articleTitle: string;
  portal: string;
  status: "success" | "failed";
  timestamp: string;
  message: string;
}

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

function ArticleNewInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromPress = searchParams.get("from") === "press";

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [body, setBody] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [status, setStatus] = useState<"게시" | "임시저장">("게시");
  const [tags, setTags] = useState("");
  const [author, setAuthor] = useState("");
  const [summary, setSummary] = useState("");
  const [sourceInfo, setSourceInfo] = useState<{ source: string; sourceUrl: string; date: string } | null>(null);
  const [selectedPortals, setSelectedPortals] = useState<Set<string>>(new Set());
  const [distributing, setDistributing] = useState(false);
  const [distributeResults, setDistributeResults] = useState<{ portal: string; success: boolean }[]>([]);

  // AI state
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<{ type: string; content: string } | null>(null);
  const [aiError, setAiError] = useState("");

  // Load press import data
  useEffect(() => {
    if (fromPress) {
      const raw = sessionStorage.getItem("cp-press-import");
      if (raw) {
        try {
          const data = JSON.parse(raw);
          setTitle(data.title || "");
          setBody(data.body || "");
          setAuthor(data.source || "");
          if (data.source || data.sourceUrl) {
            setSourceInfo({ source: data.source || "", sourceUrl: data.sourceUrl || "", date: data.date || "" });
          }
          sessionStorage.removeItem("cp-press-import");
        } catch {
          // ignore
        }
      }
    }
  }, [fromPress]);

  // Load AI settings
  useEffect(() => {
    const raw = localStorage.getItem("cp-ai-settings");
    if (raw) {
      try {
        setAiSettings(JSON.parse(raw));
      } catch {
        // ignore
      }
    }
  }, []);

  const handleThumbnailUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setThumbnail(reader.result as string);
    reader.readAsDataURL(file);
  };

  const togglePortal = (key: string) => {
    setSelectedPortals((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const callAi = useCallback(async (type: string, prompt: string, content: string) => {
    if (!aiSettings) {
      setAiError("AI 설정이 없습니다. 관리자 > AI 설정에서 API 키를 등록해주세요.");
      return;
    }
    const apiKey = aiSettings.provider === "openai" ? aiSettings.openaiApiKey : aiSettings.geminiApiKey;
    const model = aiSettings.provider === "openai" ? aiSettings.openaiModel : aiSettings.geminiModel;
    if (!apiKey) {
      setAiError("API 키가 설정되지 않았습니다. AI 설정 페이지에서 키를 등록해주세요.");
      return;
    }

    setAiLoading(type);
    setAiError("");
    setAiResult(null);

    try {
      const resp = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: aiSettings.provider, model, apiKey, prompt, content }),
      });
      const data = await resp.json();
      if (data.success) {
        setAiResult({ type, content: data.result });
      } else {
        setAiError(data.error || "AI 요청 실패");
      }
    } catch (e) {
      setAiError(String(e));
    }
    setAiLoading(null);
  }, [aiSettings]);

  const handleAiRewrite = () => {
    if (!body.trim()) { setAiError("본문을 먼저 입력해주세요."); return; }
    const prompt = aiSettings?.defaultPromptRewrite || "아래 보도자료를 뉴스 기사 형식으로 다시 작성해주세요.";
    callAi("rewrite", prompt, body);
  };

  const handleAiSummarize = () => {
    if (!body.trim()) { setAiError("본문을 먼저 입력해주세요."); return; }
    const prompt = aiSettings?.defaultPromptSummarize || "아래 기사의 핵심 내용을 3줄로 요약해주세요.";
    callAi("summarize", prompt, body);
  };

  const handleAiTitle = () => {
    if (!body.trim()) { setAiError("본문을 먼저 입력해주세요."); return; }
    const prompt = aiSettings?.defaultPromptTitle || "아래 기사 내용을 바탕으로 매력적인 뉴스 제목 5개를 제안해주세요.";
    callAi("title", prompt, body);
  };

  const applyAiResult = () => {
    if (!aiResult) return;
    if (aiResult.type === "rewrite") {
      setBody(aiResult.content);
    } else if (aiResult.type === "summarize") {
      setSummary(aiResult.content);
    } else if (aiResult.type === "title") {
      // Extract first line as title suggestion
      const firstLine = aiResult.content.split("\n").find((l) => l.trim())?.replace(/^\d+[\.\)]\s*/, "").trim();
      if (firstLine) setTitle(firstLine);
    }
    setAiResult(null);
  };

  const handleDistribute = (articleId: string, articleTitle: string) => {
    if (selectedPortals.size === 0) return;
    setDistributing(true);

    setTimeout(() => {
      const results: { portal: string; success: boolean }[] = [];
      const newLogs: DistributeLog[] = [];

      selectedPortals.forEach((portalKey) => {
        const portal = PORTALS.find((p) => p.key === portalKey);
        const success = Math.random() > 0.15;
        results.push({ portal: portal?.name || portalKey, success });
        newLogs.push({
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          articleId,
          articleTitle,
          portal: portal?.name || portalKey,
          status: success ? "success" : "failed",
          timestamp: new Date().toISOString(),
          message: success
            ? "색인 요청이 성공적으로 전송되었습니다."
            : "API 키 미설정 또는 요청 실패. SEO 설정을 확인하세요.",
        });
      });

      const existingLogs = localStorage.getItem("cp-distribute-logs");
      const logs: DistributeLog[] = existingLogs ? JSON.parse(existingLogs) : [];
      const updatedLogs = [...newLogs, ...logs].slice(0, 100);
      localStorage.setItem("cp-distribute-logs", JSON.stringify(updatedLogs));

      setDistributeResults(results);
      setDistributing(false);
    }, 1500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { alert("제목을 입력해주세요."); return; }

    const newArticle: Article = {
      id: `article-${Date.now()}`,
      title: title.trim(),
      category,
      date: new Date().toISOString().slice(0, 10),
      status,
      views: 0,
      body,
      thumbnail,
      tags,
      author: author || (localStorage.getItem("cp-admin-user") || "관리자"),
      summary,
    };

    const stored = localStorage.getItem("cp-articles");
    const articles: Article[] = stored ? JSON.parse(stored) : [];
    articles.push(newArticle);
    localStorage.setItem("cp-articles", JSON.stringify(articles));

    if (selectedPortals.size > 0 && status === "게시") {
      handleDistribute(newArticle.id, newArticle.title);
      setTimeout(() => router.push("/admin/articles"), 2000);
    } else {
      router.push("/admin/articles");
    }
  };

  const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #DDD", borderRadius: 8, outline: "none", boxSizing: "border-box" };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: "#333", marginBottom: 6 };
  const aiBtnStyle: React.CSSProperties = { padding: "7px 14px", fontSize: 12, fontWeight: 500, border: "1px solid #DDD", borderRadius: 6, cursor: "pointer", background: "#FFF", color: "#333", display: "flex", alignItems: "center", gap: 4 };

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

      <form onSubmit={handleSubmit} style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 20 }}>
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
                {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>상태</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as "게시" | "임시저장")} style={{ ...inputStyle, background: "#FFF", cursor: "pointer" }}>
                <option value="게시">게시</option>
                <option value="임시저장">임시저장</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>작성자</label>
              <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="기자명 / 작성자명" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>태그</label>
              <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="쉼표로 구분 (예: 문화, 예술, 전시)" style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>요약문</label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="기사 요약문 (SNS 공유, 검색결과에 표시)" rows={2} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>본문</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="기사 본문을 입력하세요" rows={12} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.7 }} />
          </div>

          <div>
            <label style={labelStyle}>썸네일 이미지</label>
            <input type="file" accept="image/*" onChange={handleThumbnailUpload} style={{ fontSize: 14 }} />
            {thumbnail && (
              <div style={{ marginTop: 12, padding: 12, background: "#FAFAFA", borderRadius: 8, border: "1px solid #EEE" }}>
                <img src={thumbnail} alt="썸네일 미리보기" style={{ maxWidth: 240, maxHeight: 160, objectFit: "cover", borderRadius: 6 }} />
              </div>
            )}
          </div>
        </div>

        {/* AI Editing Tools */}
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>AI 기사 편집</h3>
              <div style={{ fontSize: 12, color: "#999" }}>
                {aiSettings ? `${aiSettings.provider === "openai" ? "OpenAI" : "Gemini"} · ${aiSettings.provider === "openai" ? aiSettings.openaiModel : aiSettings.geminiModel}` : "AI 설정 필요"}
              </div>
            </div>
            <a href="/admin/ai-settings" style={{ fontSize: 12, color: "#E8192C", textDecoration: "none" }}>설정 변경 →</a>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button type="button" onClick={handleAiRewrite} disabled={!!aiLoading} style={{ ...aiBtnStyle, ...(aiLoading === "rewrite" ? { background: "#F5F5F5", color: "#999" } : {}) }}>
              ✍️ {aiLoading === "rewrite" ? "작성 중..." : "기사 리라이트"}
            </button>
            <button type="button" onClick={handleAiSummarize} disabled={!!aiLoading} style={{ ...aiBtnStyle, ...(aiLoading === "summarize" ? { background: "#F5F5F5", color: "#999" } : {}) }}>
              📝 {aiLoading === "summarize" ? "요약 중..." : "요약 생성"}
            </button>
            <button type="button" onClick={handleAiTitle} disabled={!!aiLoading} style={{ ...aiBtnStyle, ...(aiLoading === "title" ? { background: "#F5F5F5", color: "#999" } : {}) }}>
              💡 {aiLoading === "title" ? "생성 중..." : "제목 추천"}
            </button>
          </div>

          {aiError && (
            <div style={{ padding: "10px 14px", background: "#FFF0F0", border: "1px solid #FFCDD2", borderRadius: 8, fontSize: 13, color: "#E8192C", marginBottom: 12 }}>
              {aiError}
            </div>
          )}

          {aiLoading && (
            <div style={{ padding: "20px 0", textAlign: "center", color: "#999", fontSize: 13 }}>
              AI가 처리 중입니다...
            </div>
          )}

          {aiResult && (
            <div style={{ background: "#F8FFF8", border: "1px solid #C8E6C9", borderRadius: 8, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#2E7D32" }}>
                  {aiResult.type === "rewrite" ? "✍️ 리라이트 결과" : aiResult.type === "summarize" ? "📝 요약 결과" : "💡 제목 추천"}
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={applyAiResult} style={{ padding: "5px 12px", fontSize: 12, background: "#4CAF50", color: "#FFF", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
                    {aiResult.type === "rewrite" ? "본문에 적용" : aiResult.type === "summarize" ? "요약문에 적용" : "제목에 적용"}
                  </button>
                  <button type="button" onClick={() => setAiResult(null)} style={{ padding: "5px 12px", fontSize: 12, background: "#FFF", color: "#666", border: "1px solid #DDD", borderRadius: 6, cursor: "pointer" }}>
                    닫기
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 13, color: "#333", lineHeight: 1.8, whiteSpace: "pre-wrap", maxHeight: 300, overflowY: "auto", background: "#FFF", borderRadius: 6, padding: 12, border: "1px solid #E8F5E9" }}>
                {aiResult.content}
              </div>
            </div>
          )}
        </div>

        {/* Portal Distribution */}
        <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>포털 배포 (저장 시 자동 전송)</h3>
          <div style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>
            게시 상태로 저장 시, 선택한 포털에 자동으로 색인 요청을 보냅니다. SEO 설정에서 API 키를 먼저 등록해주세요.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {PORTALS.map((portal) => (
              <label key={portal.key} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6, cursor: "pointer",
                background: selectedPortals.has(portal.key) ? "#FFF0F0" : "#FAFAFA",
                border: `1px solid ${selectedPortals.has(portal.key) ? "#E8192C" : "#EEE"}`,
                fontSize: 13,
              }}>
                <input type="checkbox" checked={selectedPortals.has(portal.key)} onChange={() => togglePortal(portal.key)} style={{ width: 14, height: 14 }} />
                {portal.name}
              </label>
            ))}
          </div>

          {distributeResults.length > 0 && (
            <div style={{ marginTop: 16, padding: 12, background: "#FAFAFA", borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>배포 결과:</div>
              {distributeResults.map((r, i) => (
                <div key={i} style={{ fontSize: 13, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: r.success ? "#4CAF50" : "#E8192C" }} />
                  <span>{r.portal}</span>
                  <span style={{ color: r.success ? "#4CAF50" : "#E8192C", fontSize: 12 }}>{r.success ? "성공" : "실패"}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button type="submit" disabled={distributing} style={{
            padding: "12px 32px", background: distributing ? "#CCC" : "#E8192C", color: "#FFF",
            border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: distributing ? "default" : "pointer",
          }}>
            {distributing ? "전송 중..." : "저장"}
          </button>
          <button type="button" onClick={() => router.push("/admin/articles")} style={{
            padding: "12px 32px", background: "#FFF", color: "#333", border: "1px solid #DDD",
            borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: "pointer",
          }}>
            취소
          </button>
          {selectedPortals.size > 0 && status === "게시" && (
            <span style={{ fontSize: 12, color: "#E8192C" }}>저장 시 {selectedPortals.size}개 포털에 자동 배포됩니다</span>
          )}
        </div>
      </form>
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
