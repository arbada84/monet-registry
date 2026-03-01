"use client";

import { useEffect, useState } from "react";

interface KeyRecord {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
}

const SITE_URL = typeof window !== "undefined" ? window.location.origin : "https://culturepeople.co.kr";

// Python 예시 코드 (SITE_URL은 컴포넌트 렌더 시점에 삽입)
function buildPythonExample(siteUrl: string) {
  return [
    "import requests",
    "from datetime import datetime, timedelta",
    "",
    'API_KEY = "cpk_여기에_발급받은_키_입력"',
    `BASE_URL = "${siteUrl}/api/v1/articles"`,
    'HEADERS = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}',
    "",
    "# ── 기사 목록 조회 ────────────────────────",
    "def list_articles(page=1, limit=20, status=None, category=None, q=None):",
    '    params = {"page": page, "limit": limit}',
    '    if status:   params["status"]   = status',
    '    if category: params["category"] = category',
    '    if q:        params["q"]        = q',
    "    res = requests.get(BASE_URL, headers=HEADERS, params=params)",
    "    return res.json()",
    "",
    "# ── 기사 단건 조회 ────────────────────────",
    "def get_article(article_id):",
    '    res = requests.get(f"{BASE_URL}/{article_id}", headers=HEADERS)',
    "    return res.json()",
    "",
    "# ── 기사 생성 ─────────────────────────────",
    "# author만 넣으면 등록된 기자 이메일 자동 조회",
    "# status='예약' 시 scheduledPublishAt 필수 (ISO 8601)",
    "# 리턴값: { success, id, no, article }  ← no = 기사 일련번호",
    "def create_article(title, category, body='', status='게시',",
    "                   author=None, scheduled_at=None, **kwargs):",
    "    payload = {",
    '        "title": title,',
    '        "category": category,',
    '        "body": body,',
    '        "status": status,',
    "        **kwargs,",
    "    }",
    '    if author:       payload["author"] = author',
    '    if scheduled_at: payload["scheduledPublishAt"] = scheduled_at',
    "    res = requests.post(BASE_URL, headers=HEADERS, json=payload)",
    "    return res.json()",
    "",
    "# ── 기사 수정 ─────────────────────────────",
    "# author 변경 시 authorEmail 자동 갱신",
    "def update_article(article_id, **fields):",
    '    res = requests.put(f"{BASE_URL}/{article_id}", headers=HEADERS, json=fields)',
    "    return res.json()",
    "",
    "# ── 기사 삭제 ─────────────────────────────",
    "def delete_article(article_id):",
    '    res = requests.delete(f"{BASE_URL}/{article_id}", headers=HEADERS)',
    "    return res.json()",
    "",
    "# ── 사용 예시 ─────────────────────────────",
    'if __name__ == "__main__":',
    "    # 즉시 게시",
    "    result = create_article(",
    '        title="AI 기술의 미래",',
    '        category="IT·과학",',
    '        body="<p>본문 내용...</p>",',
    '        status="게시",',
    '        author="김문화",           # 관리자에 등록된 기자명 → 이메일 자동 입력',
    '        thumbnail="https://example.com/img.jpg",',
    '        tags="AI,기술,미래",',
    '        summary="기사 요약",',
    '        slug="ai-technology-future",',
    "    )",
    "    print(f\"생성: id={result.get('id')}, no={result.get('no')}\")",
    "",
    "    # 예약 게시 (내일 오전 9시)",
    "    tomorrow_9am = (datetime.now() + timedelta(days=1)).replace(",
    "        hour=9, minute=0, second=0, microsecond=0",
    '    ).strftime("%Y-%m-%dT%H:%M:%S")',
    "",
    "    reserved = create_article(",
    '        title="예약 기사 제목",',
    '        category="사회",',
    '        body="<p>예약 본문</p>",',
    '        status="예약",',
    '        author="이연예",',
    "        scheduled_at=tomorrow_9am,   # 필수: 예약 날짜/시간",
    "    )",
    "    print(f\"예약: id={reserved.get('id')}, no={reserved.get('no')}, 예약시간={tomorrow_9am}\")",
    "",
    "    # 기사 목록 (게시된 것만, 1페이지)",
    '    articles = list_articles(status="게시", limit=10)',
    '    print("목록:", articles)',
  ].join("\n");
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<KeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const pythonExample = buildPythonExample(SITE_URL);

  async function loadKeys() {
    try {
      const res = await fetch("/api/db/api-keys");
      const data = await res.json();
      if (data.success) setKeys(data.keys);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadKeys(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setNewKey(null);
    setMsg(null);
    try {
      const res = await fetch("/api/db/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setNewKey(data.key);
        setNewName("");
        await loadKeys();
      } else {
        setMsg({ type: "error", text: data.error || "생성 실패" });
      }
    } catch {
      setMsg({ type: "error", text: "서버 오류" });
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" 키를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    try {
      const res = await fetch(`/api/db/api-keys?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setMsg({ type: "success", text: "키가 삭제되었습니다." });
        await loadKeys();
      } else {
        setMsg({ type: "error", text: data.error || "삭제 실패" });
      }
    } catch {
      setMsg({ type: "error", text: "서버 오류" });
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>API 키 관리</h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 28 }}>
        외부 시스템(Python, 자동화 등)에서 기사 API를 사용하려면 키를 발급받으세요.
      </p>

      {/* 알림 메시지 */}
      {msg && (
        <div style={{
          padding: "10px 16px", borderRadius: 8, marginBottom: 20, fontSize: 14,
          background: msg.type === "success" ? "#F0FFF4" : "#FFF0F0",
          color: msg.type === "success" ? "#276749" : "#C53030",
          border: `1px solid ${msg.type === "success" ? "#9AE6B4" : "#FEB2B2"}`,
        }}>
          {msg.text}
          <button onClick={() => setMsg(null)} style={{ float: "right", background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      )}

      {/* 새 키 생성 */}
      <div style={{ background: "white", borderRadius: 12, border: "1px solid #E5E7EB", padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>새 API 키 발급</h2>
        <form onSubmit={handleCreate} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 6 }}>키 이름 (용도 메모)</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="예: Python 자동화 스크립트"
              style={{ width: "100%", padding: "9px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }}
            />
          </div>
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            style={{
              padding: "9px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14,
              background: creating || !newName.trim() ? "#D1D5DB" : "#E8192C",
              color: creating || !newName.trim() ? "#9CA3AF" : "white",
              fontWeight: 600, whiteSpace: "nowrap",
            }}
          >
            {creating ? "생성 중..." : "키 발급"}
          </button>
        </form>

        {/* 새로 발급된 키 표시 */}
        {newKey && (
          <div style={{ marginTop: 16, padding: 16, background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#92400E", marginBottom: 8 }}>
              ⚠️ 이 키는 지금만 표시됩니다. 반드시 복사해 두세요.
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <code style={{ flex: 1, background: "#FEF3C7", padding: "8px 12px", borderRadius: 6, fontSize: 13, fontFamily: "monospace", wordBreak: "break-all" }}>
                {newKey}
              </code>
              <button
                onClick={() => { navigator.clipboard.writeText(newKey); setMsg({ type: "success", text: "클립보드에 복사되었습니다." }); }}
                style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid #D97706", background: "white", cursor: "pointer", fontSize: 13, color: "#92400E", fontWeight: 600 }}
              >
                복사
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 발급된 키 목록 */}
      <div style={{ background: "white", borderRadius: 12, border: "1px solid #E5E7EB", padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>발급된 키 목록</h2>
        {loading ? (
          <div style={{ color: "#999", fontSize: 14 }}>로딩 중...</div>
        ) : keys.length === 0 ? (
          <div style={{ color: "#999", fontSize: 14 }}>발급된 키가 없습니다.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #F3F4F6" }}>
                <th style={{ padding: "8px 12px", textAlign: "left", color: "#6B7280", fontWeight: 600 }}>이름</th>
                <th style={{ padding: "8px 12px", textAlign: "left", color: "#6B7280", fontWeight: 600 }}>접두사 (앞 12자)</th>
                <th style={{ padding: "8px 12px", textAlign: "left", color: "#6B7280", fontWeight: 600 }}>발급일</th>
                <th style={{ padding: "8px 12px", textAlign: "center", color: "#6B7280", fontWeight: 600 }}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{k.name}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <code style={{ background: "#F3F4F6", padding: "2px 8px", borderRadius: 4, fontSize: 12 }}>{k.prefix}...</code>
                  </td>
                  <td style={{ padding: "10px 12px", color: "#6B7280" }}>
                    {new Date(k.createdAt).toLocaleDateString("ko-KR")}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                    <button
                      onClick={() => handleDelete(k.id, k.name)}
                      style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #FCA5A5", background: "white", cursor: "pointer", fontSize: 12, color: "#DC2626" }}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* API 엔드포인트 + 파라미터 안내 */}
      <div style={{ background: "white", borderRadius: 12, border: "1px solid #E5E7EB", padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>API 엔드포인트</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
              <th style={{ padding: "8px 12px", textAlign: "left", color: "#374151", fontWeight: 600 }}>메서드</th>
              <th style={{ padding: "8px 12px", textAlign: "left", color: "#374151", fontWeight: 600 }}>엔드포인트</th>
              <th style={{ padding: "8px 12px", textAlign: "left", color: "#374151", fontWeight: 600 }}>설명</th>
            </tr>
          </thead>
          <tbody>
            {[
              { method: "GET",    path: "/api/v1/articles",      desc: "기사 목록 (page, limit, q, category, status)" },
              { method: "POST",   path: "/api/v1/articles",      desc: "기사 생성 — 리턴: { id, no, article }" },
              { method: "GET",    path: "/api/v1/articles/:id",  desc: "기사 단건 조회" },
              { method: "PUT",    path: "/api/v1/articles/:id",  desc: "기사 수정 (부분 업데이트) — 리턴: { no, article }" },
              { method: "DELETE", path: "/api/v1/articles/:id",  desc: "기사 삭제" },
            ].map((row, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #F3F4F6" }}>
                <td style={{ padding: "8px 12px" }}>
                  <span style={{
                    display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, fontFamily: "monospace",
                    background: row.method === "GET" ? "#DBEAFE" : row.method === "POST" ? "#D1FAE5" : row.method === "PUT" ? "#FEF3C7" : "#FEE2E2",
                    color: row.method === "GET" ? "#1D4ED8" : row.method === "POST" ? "#065F46" : row.method === "PUT" ? "#92400E" : "#991B1B",
                  }}>
                    {row.method}
                  </span>
                </td>
                <td style={{ padding: "8px 12px" }}>
                  <code style={{ fontFamily: "monospace", fontSize: 12 }}>{row.path}</code>
                </td>
                <td style={{ padding: "8px 12px", color: "#6B7280" }}>{row.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* POST 파라미터 */}
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>POST /api/v1/articles 주요 파라미터</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#F9FAFB" }}>
                <th style={{ padding: "6px 10px", textAlign: "left", color: "#6B7280" }}>필드</th>
                <th style={{ padding: "6px 10px", textAlign: "left", color: "#6B7280" }}>필수</th>
                <th style={{ padding: "6px 10px", textAlign: "left", color: "#6B7280" }}>설명</th>
              </tr>
            </thead>
            <tbody>
              {[
                { field: "title",              req: "✅", desc: "기사 제목" },
                { field: "category",           req: "✅", desc: "카테고리명" },
                { field: "body",               req: "",  desc: "HTML 본문" },
                { field: "status",             req: "",  desc: "게시 | 임시저장 | 예약 (기본: 임시저장)" },
                { field: "scheduledPublishAt", req: "",  desc: "예약 시간 — status='예약'이면 필수. 형식: 2026-03-10T09:00:00" },
                { field: "author",             req: "",  desc: "기자명 (관리자 기자 목록에 등록된 이름이면 이메일 자동 입력)" },
                { field: "authorEmail",        req: "",  desc: "기자 이메일 (직접 지정 시 자동 조회보다 우선)" },
                { field: "thumbnail",          req: "",  desc: "대표 이미지 URL" },
                { field: "tags",               req: "",  desc: "태그 (쉼표 구분)" },
                { field: "summary",            req: "",  desc: "기사 요약" },
                { field: "slug",               req: "",  desc: "URL 슬러그" },
                { field: "sourceUrl",          req: "",  desc: "원문 URL" },
              ].map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "5px 10px", fontFamily: "monospace", color: "#1D4ED8" }}>{r.field}</td>
                  <td style={{ padding: "5px 10px", textAlign: "center" }}>{r.req}</td>
                  <td style={{ padding: "5px 10px", color: "#4B5563" }}>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 12, padding: "10px 14px", background: "#F8FAFC", borderRadius: 8, fontSize: 13, color: "#4B5563" }}>
          <strong>인증 헤더:</strong>{" "}
          <code style={{ fontFamily: "monospace", background: "#E2E8F0", padding: "1px 6px", borderRadius: 4 }}>Authorization: Bearer cpk_...</code>
        </div>
      </div>

      {/* Python 예시 코드 */}
      <div style={{ background: "white", borderRadius: 12, border: "1px solid #E5E7EB", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Python 예시 코드</h2>
          <button
            onClick={() => { navigator.clipboard.writeText(pythonExample); setMsg({ type: "success", text: "코드가 클립보드에 복사되었습니다." }); }}
            style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #D1D5DB", background: "white", cursor: "pointer", fontSize: 13, color: "#374151" }}
          >
            복사
          </button>
        </div>
        <pre style={{
          background: "#1E293B", color: "#E2E8F0", padding: 20, borderRadius: 10,
          fontSize: 12.5, lineHeight: 1.65, overflowX: "auto", fontFamily: "monospace",
          whiteSpace: "pre",
        }}>
          {pythonExample}
        </pre>
      </div>
    </div>
  );
}
