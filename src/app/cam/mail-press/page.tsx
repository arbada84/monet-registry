"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import DOMPurify from "dompurify";
import { AdminPreviewImage } from "@/components/ui/AdminPreviewImage";

// ── 타입 ──
interface MailItem {
  uid: number;
  account: string;
  accountEmail: string;
  from: string;
  subject: string;
  date: string;
  hasAttachments: boolean;
  attachmentNames: string[];
  folder: string;
  status: string; // "pending" | "imported" | "skipped"
  articleId?: string;
}

interface MailAccount {
  id: string;
  email: string;
}

interface MailDetail {
  subject: string;
  from: string;
  date: string;
  bodyHtml: string;
  bodyText: string;
  attachments: { name: string; type: string; content: string; mimeType: string }[];
  images: string[];
}

interface RegisterResult {
  success: boolean;
  articleId?: string;
  title?: string;
  error?: string;
}

interface MailAccountSetting {
  id: string;
  email: string;
  password: string;
  host: string;
  port: number;
  enabled: boolean;
  folders: string[];
  filterRecipient: boolean;
  provider: string; // "daum" | "naver" | "gmail" | "custom"
}

interface MailSettings {
  accounts: MailAccountSetting[];
  defaultAuthor: string;
  defaultCategory: string;
  autoSync: boolean;
  autoSyncDays: number; // 자동 동기화 시 가져올 기간 (일)
}

const DEFAULT_SETTINGS: MailSettings = {
  accounts: [],
  autoSync: false,
  autoSyncDays: 1,
  defaultAuthor: "편집국",
  defaultCategory: "자동분류",
};

// IMAP 서버 프리셋
const IMAP_PRESETS: Record<string, { host: string; port: number; label: string }> = {
  daum: { host: "imap.daum.net", port: 993, label: "다음/카카오" },
  naver: { host: "imap.naver.com", port: 993, label: "네이버" },
  gmail: { host: "imap.gmail.com", port: 993, label: "Gmail" },
  outlook: { host: "outlook.office365.com", port: 993, label: "Outlook/365" },
  custom: { host: "", port: 993, label: "수동 입력" },
};

function normalizeMailAccountSetting(value: unknown, index: number): MailAccountSetting {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const provider = typeof raw.provider === "string" && raw.provider ? raw.provider : "daum";
  const preset = IMAP_PRESETS[provider] ?? IMAP_PRESETS.daum;
  const folders = Array.isArray(raw.folders)
    ? raw.folders.map((folder) => String(folder).trim()).filter(Boolean)
    : typeof raw.folders === "string"
      ? raw.folders.split(",").map((folder) => folder.trim()).filter(Boolean)
      : [];
  const port = Number(raw.port ?? preset.port);

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : `mail-${Date.now()}-${index}`,
    email: typeof raw.email === "string" ? raw.email : "",
    password: typeof raw.password === "string" ? raw.password : "",
    host: typeof raw.host === "string" && raw.host ? raw.host : preset.host,
    port: Number.isFinite(port) && port > 0 ? port : 993,
    enabled: raw.enabled !== false,
    folders,
    filterRecipient: raw.filterRecipient === true,
    provider,
  };
}

function normalizeMailSettings(value: unknown): MailSettings {
  const raw = value && typeof value === "object" ? value as Partial<MailSettings> : {};
  const autoSyncDays = Number(raw.autoSyncDays ?? DEFAULT_SETTINGS.autoSyncDays);

  return {
    accounts: Array.isArray(raw.accounts)
      ? raw.accounts.map((account, index) => normalizeMailAccountSetting(account, index))
      : [],
    defaultAuthor: typeof raw.defaultAuthor === "string" && raw.defaultAuthor ? raw.defaultAuthor : DEFAULT_SETTINGS.defaultAuthor,
    defaultCategory: typeof raw.defaultCategory === "string" && raw.defaultCategory ? raw.defaultCategory : DEFAULT_SETTINGS.defaultCategory,
    autoSync: raw.autoSync === true,
    autoSyncDays: Number.isFinite(autoSyncDays) && autoSyncDays > 0 ? autoSyncDays : DEFAULT_SETTINGS.autoSyncDays,
  };
}

// ── 스타일 상수 ──
const CARD = { background: "#fff", borderRadius: 8, border: "1px solid #E5E7EB", padding: 20 };
const BTN_PRIMARY = {
  padding: "8px 16px", background: "#4A3A8E", color: "#fff", border: "none",
  borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 as const,
};
const BTN_SECONDARY = {
  padding: "8px 16px", background: "#F3F4F6", color: "#374151", border: "1px solid #D1D5DB",
  borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500 as const,
};
const BTN_DANGER = { ...BTN_PRIMARY, background: "#E8192C" };
const INPUT_STYLE = {
  width: "100%", padding: "8px 12px", borderRadius: 6,
  border: "1px solid #D1D5DB", fontSize: 13, boxSizing: "border-box" as const,
};
const LABEL_STYLE = { display: "block", fontSize: 12, fontWeight: 600 as const, color: "#374151", marginBottom: 4 };

// ── 설정 패널 ──
function SettingsPanel({
  settings,
  onSave,
  onClose,
}: {
  settings: MailSettings;
  onSave: (s: MailSettings) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState<MailSettings>(() => normalizeMailSettings(settings));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  useEffect(() => {
    setLocal(normalizeMailSettings(settings));
  }, [settings]);

  const updateAccount = (idx: number, patch: Partial<MailAccountSetting>) => {
    setLocal((prev) => {
      const next = { ...normalizeMailSettings(prev), accounts: [...normalizeMailSettings(prev).accounts] };
      next.accounts[idx] = { ...next.accounts[idx], ...patch };
      return next;
    });
  };

  const handleProviderChange = (idx: number, provider: string) => {
    const preset = IMAP_PRESETS[provider];
    if (preset && provider !== "custom") {
      updateAccount(idx, { provider, host: preset.host, port: preset.port });
    } else {
      updateAccount(idx, { provider });
    }
  };

  const addAccount = () => {
    setLocal((prev) => ({
      ...prev,
      accounts: [
        ...prev.accounts,
        {
          id: String(Date.now()),
          email: "",
          password: "",
          host: "imap.daum.net",
          port: 993,
          enabled: true,
          folders: [],
          filterRecipient: false,
          provider: "daum",
        },
      ],
    }));
  };

  const removeAccount = (idx: number) => {
    if (!confirm("이 계정을 삭제하시겠습니까?")) return;
    setLocal((prev) => {
      const normalized = normalizeMailSettings(prev);
      return { ...normalized, accounts: normalized.accounts.filter((_, i) => i !== idx) };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/db/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "cp-mail-settings", value: normalizeMailSettings(local) }),
      });
      const data = await res.json();
      if (data.success) {
        onSave(normalizeMailSettings(local));
        alert("설정이 저장되었습니다.");
      } else {
        alert(data.error || "저장 실패");
      }
    } catch {
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (acc: MailAccountSetting, idx: number) => {
    setTesting(acc.id);
    setTestResult((prev) => ({ ...prev, [idx]: "연결 테스트 중..." }));
    try {
      const res = await fetch("/api/mail/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: acc.host, port: acc.port, email: acc.email, password: acc.password }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult((prev) => ({
          ...prev,
          [idx]: `연결 성공! 폴더: ${data.folders?.join(", ") || "INBOX"} (총 ${data.totalMessages || 0}통)`,
        }));
      } else {
        setTestResult((prev) => ({ ...prev, [idx]: `연결 실패: ${data.error}` }));
      }
    } catch {
      setTestResult((prev) => ({ ...prev, [idx]: "연결 테스트 중 오류 발생" }));
    } finally {
      setTesting(null);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 12, width: 720, maxHeight: "90vh", overflow: "auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>메일 수신 설정</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#999" }}>&times;</button>
        </div>

        {/* 기본 설정 */}
        <div style={{ marginBottom: 20, padding: 16, background: "#F9FAFB", borderRadius: 8 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>기본 설정</h3>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={LABEL_STYLE}>기본 기자명</label>
              <input value={local.defaultAuthor} onChange={(e) => setLocal({ ...local, defaultAuthor: e.target.value })} style={INPUT_STYLE} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={LABEL_STYLE}>기본 카테고리</label>
              <select value={local.defaultCategory} onChange={(e) => setLocal({ ...local, defaultCategory: e.target.value })} style={INPUT_STYLE}>
                <option>자동분류</option>
                <option>엔터</option>
                <option>스포츠</option>
                <option>라이프</option>
                <option>테크·모빌리티</option>
                <option>비즈</option>
                <option>공공</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={local.autoSync ?? false}
                  onChange={(e) => setLocal({ ...local, autoSync: e.target.checked })}
                />
                자동 동기화 (매일 오전 6시, 뉴스/보도자료 수집 완료 후 실행)
              </label>
              {local.autoSync && (
                <select
                  value={local.autoSyncDays ?? 1}
                  onChange={(e) => setLocal({ ...local, autoSyncDays: parseInt(e.target.value) })}
                  style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid #D1D5DB", fontSize: 12 }}
                >
                  <option value={1}>최근 1일</option>
                  <option value={3}>최근 3일</option>
                  <option value={7}>최근 7일</option>
                  <option value={14}>최근 14일</option>
                  <option value={30}>최근 30일</option>
                </select>
              )}
            </div>
          </div>
        </div>

        {/* 계정 목록 */}
        {local.accounts.map((acc, idx) => (
          <div key={idx} style={{ marginBottom: 16, padding: 16, border: "1px solid #E5E7EB", borderRadius: 8, background: acc.enabled ? "#fff" : "#F9FAFB" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
                계정 {idx + 1}
                {!acc.enabled && <span style={{ color: "#9CA3AF", fontWeight: 400, marginLeft: 8 }}>(비활성)</span>}
              </h3>
              <div style={{ display: "flex", gap: 8 }}>
                <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="checkbox" checked={acc.enabled} onChange={(e) => updateAccount(idx, { enabled: e.target.checked })} />
                  활성화
                </label>
                <button onClick={() => removeAccount(idx)} style={{ ...BTN_SECONDARY, padding: "4px 10px", fontSize: 11, color: "#DC2626" }}>삭제</button>
              </div>
            </div>

            {/* IMAP 서버: 자동/수동 */}
            <div style={{ marginBottom: 12 }}>
              <label style={LABEL_STYLE}>IMAP 서버</label>
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  value={acc.provider || "custom"}
                  onChange={(e) => handleProviderChange(idx, e.target.value)}
                  style={{ ...INPUT_STYLE, width: 160, flex: "none" }}
                >
                  {Object.entries(IMAP_PRESETS).map(([key, preset]) => (
                    <option key={key} value={key}>{preset.label}</option>
                  ))}
                </select>
                {(acc.provider === "custom" || !acc.provider) ? (
                  <>
                    <input
                      value={acc.host}
                      onChange={(e) => updateAccount(idx, { host: e.target.value })}
                      placeholder="IMAP 서버 주소"
                      style={{ ...INPUT_STYLE, flex: 1 }}
                    />
                    <input
                      type="number"
                      value={acc.port}
                      onChange={(e) => updateAccount(idx, { port: parseInt(e.target.value) || 993 })}
                      placeholder="포트"
                      style={{ ...INPUT_STYLE, width: 80, flex: "none" }}
                    />
                  </>
                ) : (
                  <div style={{ flex: 1, padding: "8px 12px", background: "#F3F4F6", borderRadius: 6, fontSize: 13, color: "#6B7280" }}>
                    {acc.host}:{acc.port} (자동 설정)
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={LABEL_STYLE}>메일 주소</label>
                <input value={acc.email} onChange={(e) => updateAccount(idx, { email: e.target.value })} placeholder="user@example.com" style={INPUT_STYLE} />
              </div>
              <div>
                <label style={LABEL_STYLE}>앱 비밀번호</label>
                <input type="password" value={acc.password} onChange={(e) => updateAccount(idx, { password: e.target.value })} placeholder="IMAP 앱 비밀번호" style={INPUT_STYLE} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={LABEL_STYLE}>수신 폴더 (쉼표로 구분, 비워두면 전체 자동 탐색)</label>
              <input
                value={acc.folders.join(", ")}
                onChange={(e) => updateAccount(idx, { folders: e.target.value ? e.target.value.split(",").map((f) => f.trim()).filter(Boolean) : [] })}
                placeholder="예: INBOX, 컬처피플"
                style={INPUT_STYLE}
              />
            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                <input type="checkbox" checked={acc.filterRecipient} onChange={(e) => updateAccount(idx, { filterRecipient: e.target.checked })} />
                수신자(To/CC)에 이 메일이 포함된 경우만 표시
              </label>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={() => handleTest(acc, idx)} disabled={testing === acc.id || !acc.email || !acc.password} style={{ ...BTN_SECONDARY, padding: "6px 12px", fontSize: 12 }}>
                {testing === acc.id ? "테스트 중..." : "연결 테스트"}
              </button>
              {testResult[idx] && (
                <span style={{ fontSize: 12, color: testResult[idx].startsWith("연결 성공") ? "#059669" : "#DC2626" }}>{testResult[idx]}</span>
              )}
            </div>
          </div>
        ))}

        <button onClick={addAccount} style={{ ...BTN_SECONDARY, width: "100%", marginBottom: 20 }}>+ 계정 추가</button>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={BTN_SECONDARY}>취소</button>
          <button onClick={handleSave} disabled={saving} style={BTN_PRIMARY}>{saving ? "저장 중..." : "설정 저장"}</button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 페이지 ──
export default function MailPressPage() {
  const [mails, setMails] = useState<MailItem[]>([]);
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncDays, setSyncDays] = useState(30);
  const [accountFilter, setAccountFilter] = useState("all");

  // 설정
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<MailSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // 선택
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  // 미리보기
  const [previewMail, setPreviewMail] = useState<MailItem | null>(null);
  const [detail, setDetail] = useState<MailDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 등록
  const [registering, setRegistering] = useState(false);
  const [registerResults, setRegisterResults] = useState<RegisterResult[]>([]);
  const [category, setCategory] = useState("자동분류");
  const [author, setAuthor] = useState("");

  // 설정 로드 → 기본값 반영
  useEffect(() => {
    fetch("/api/db/settings?key=cp-mail-settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.value) {
          const s = normalizeMailSettings(data.value);
          setSettings(s);
          if (s.defaultAuthor) setAuthor(s.defaultAuthor);
          if (s.defaultCategory) setCategory(s.defaultCategory);
        }
        setSettingsLoaded(true);
      })
      .catch(() => setSettingsLoaded(true));
  }, []);

  // ── 메일 목록 조회 (DB에서) ──
  const fetchMails = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/mail/list?account=${accountFilter}`);
      const data = await res.json();
      if (data.success) {
        setMails(data.mails || []);
        setAccounts(data.accounts || []);
      } else {
        alert(data.error || "메일 조회 실패");
      }
    } catch (e) {
      alert("메일 조회 중 오류가 발생했습니다.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [accountFilter]);

  useEffect(() => {
    if (settingsLoaded) fetchMails();
  }, [fetchMails, settingsLoaded]);

  // ── 메일 동기화 (IMAP → DB) ──
  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/mail/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: syncDays }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`동기화 완료: ${data.synced}건 새로 추가 (총 ${data.total}건)`);
        fetchMails();
      } else {
        alert(data.error || "동기화 실패");
      }
    } catch {
      alert("동기화 중 오류가 발생했습니다.");
    } finally {
      setSyncing(false);
    }
  };

  // ── 메일 상세 조회 ──
  const fetchDetail = async (mail: MailItem) => {
    setPreviewMail(mail);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/mail/detail?uid=${mail.uid}&account=${mail.account}&folder=${encodeURIComponent(mail.folder || "INBOX")}`);
      const data = await res.json();
      if (data.success) {
        setDetail(data);
      } else {
        alert(data.error || "메일 상세 조회 실패");
      }
    } catch (e) {
      alert("메일 상세 조회 중 오류가 발생했습니다.");
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  };

  // ── 체크박스 ──
  const mailKey = (m: MailItem) => `${m.account}:${m.folder}:${m.uid}`;
  const toggleSelect = (m: MailItem) => {
    const key = mailKey(m);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectAll) setSelected(new Set());
    else setSelected(new Set(mails.map(mailKey)));
    setSelectAll(!selectAll);
  };

  // ── 단일 등록 ──
  const handleRegisterSingle = async (mode: "draft" | "ai") => {
    if (!detail || !previewMail) return;
    setRegistering(true);
    try {
      const item = {
        subject: detail.subject,
        bodyHtml: detail.bodyHtml,
        bodyText: detail.bodyText,
        images: detail.images,
        attachmentContents: detail.attachments.filter((a) => a.type !== "image").map((a) => a.content),
        from: detail.from,
      };
      const cat = category === "자동분류" ? "보도자료" : category;
      const res = await fetch("/api/mail/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [item], mode, category: cat, author }),
      });
      const data = await res.json();
      if (data.success && data.results?.[0]?.success) {
        alert(`기사가 ${mode === "ai" ? "AI편집 후 게시" : "임시저장"}되었습니다.`);
        setRegisterResults(data.results);
      } else {
        alert(data.results?.[0]?.error || data.error || "등록 실패");
      }
    } catch (e) {
      alert("기사 등록 중 오류가 발생했습니다.");
      console.error(e);
    } finally {
      setRegistering(false);
    }
  };

  // ── 일괄 등록 ──
  const handleBulkRegister = async (mode: "draft" | "ai") => {
    if (selected.size === 0) { alert("등록할 메일을 선택하세요."); return; }
    if (!confirm(`선택한 ${selected.size}건을 ${mode === "ai" ? "AI편집 후 게시" : "임시저장"}하시겠습니까?`)) return;

    setRegistering(true);
    setRegisterResults([]);
    const selectedMails = mails.filter((m) => selected.has(mailKey(m)));
    const allResults: RegisterResult[] = [];

    for (let i = 0; i < selectedMails.length; i += 3) {
      const batch = selectedMails.slice(i, i + 3);
      const detailPromises = batch.map(async (mail) => {
        try {
          const res = await fetch(`/api/mail/detail?uid=${mail.uid}&account=${mail.account}&folder=${encodeURIComponent(mail.folder || "INBOX")}`);
          const data = await res.json();
          if (!data.success) return null;
          return {
            subject: data.subject, bodyHtml: data.bodyHtml, bodyText: data.bodyText,
            images: data.images || [],
            attachmentContents: (data.attachments || []).filter((a: { type: string }) => a.type !== "image").map((a: { content: string }) => a.content),
            from: data.from,
          };
        } catch { return null; }
      });
      const details = await Promise.all(detailPromises);
      const validItems = details.filter(Boolean);
      if (validItems.length > 0) {
        try {
          const cat = category === "자동분류" ? "보도자료" : category;
          const res = await fetch("/api/mail/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: validItems, mode, category: cat, author }),
          });
          const data = await res.json();
          if (data.results) allResults.push(...data.results);
        } catch (e) { console.error("[mail-press] batch error:", e); }
      }
    }

    setRegisterResults(allResults);
    const ok = allResults.filter((r) => r.success).length;
    alert(ok > 0 ? `${ok}건 등록 완료, ${allResults.length - ok}건 실패` : "모든 항목 등록에 실패했습니다.");
    setRegistering(false);
  };

  const formatDate = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>메일 보도자료</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #D1D5DB", fontSize: 13 }}>
            <option value="all">전체 계정</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
          </select>
          <button onClick={fetchMails} disabled={loading} style={BTN_SECONDARY}>
            {loading ? "조회 중..." : "새로고침"}
          </button>
          <button onClick={() => setShowSettings(true)} style={BTN_SECONDARY}>설정</button>
        </div>
      </div>

      {/* 동기화 바 */}
      <div style={{ ...CARD, marginBottom: 16, padding: "12px 20px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>메일 동기화</span>
        <select value={syncDays} onChange={(e) => setSyncDays(parseInt(e.target.value))}
          style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #D1D5DB", fontSize: 12 }}>
          <option value={3}>최근 3일</option>
          <option value={7}>최근 7일</option>
          <option value={14}>최근 14일</option>
          <option value={30}>최근 30일</option>
          <option value={90}>최근 3개월</option>
          <option value={180}>최근 6개월</option>
          <option value={365}>최근 1년</option>
          <option value={730}>최근 2년</option>
        </select>
        <button onClick={handleSync} disabled={syncing} style={{ ...BTN_PRIMARY, padding: "6px 14px" }}>
          {syncing ? "동기화 중..." : "IMAP에서 가져오기"}
        </button>
        <span style={{ fontSize: 12, color: "#9CA3AF" }}>
          저장된 메일: {mails.length}건
        </span>
      </div>

      <div style={{ display: "flex", gap: 20 }}>
        {/* 좌측: 메일 리스트 */}
        <div style={{ ...CARD, flex: 1, minWidth: 0, maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
          {selected.size > 0 && (
            <div style={{ padding: "10px 0", marginBottom: 10, borderBottom: "1px solid #E5E7EB", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "#6B7280" }}>{selected.size}건 선택</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid #D1D5DB", fontSize: 12 }}>
                <option>자동분류</option><option>엔터</option><option>스포츠</option><option>라이프</option><option>테크·모빌리티</option><option>비즈</option><option>공공</option>
              </select>
              <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="기자명" style={{ width: 80, padding: "4px 8px", borderRadius: 4, border: "1px solid #D1D5DB", fontSize: 12 }} />
              <button onClick={() => handleBulkRegister("draft")} disabled={registering} style={BTN_SECONDARY}>임시저장</button>
              <button onClick={() => handleBulkRegister("ai")} disabled={registering} style={BTN_PRIMARY}>{registering ? "등록 중..." : "AI편집 후 게시"}</button>
            </div>
          )}

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #E5E7EB" }}>
                <th style={{ width: 36, padding: "8px 4px", textAlign: "center" }}>
                  <input type="checkbox" checked={selectAll} onChange={toggleSelectAll} />
                </th>
                <th style={{ padding: "8px", textAlign: "left", color: "#6B7280", fontWeight: 600 }}>발신자</th>
                <th style={{ padding: "8px", textAlign: "left", color: "#6B7280", fontWeight: 600 }}>제목</th>
                <th style={{ width: 130, padding: "8px", textAlign: "center", color: "#6B7280", fontWeight: 600 }}>날짜</th>
                <th style={{ width: 60, padding: "8px", textAlign: "center", color: "#6B7280", fontWeight: 600 }}>폴더</th>
                <th style={{ width: 50, padding: "8px", textAlign: "center", color: "#6B7280", fontWeight: 600 }}>첨부</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>메일을 불러오는 중...</td></tr>
              ) : mails.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>
                  동기화된 메일이 없습니다. 위의 &quot;IMAP에서 가져오기&quot; 버튼을 눌러 메일을 동기화하세요.
                </td></tr>
              ) : (
                mails.map((mail) => {
                  const key = mailKey(mail);
                  const isImported = mail.status === "imported";
                  const isSelected = selected.has(key);
                  const isActive = previewMail && mailKey(previewMail) === key;
                  return (
                    <tr key={key} onClick={() => fetchDetail(mail)}
                      style={{ cursor: "pointer", borderBottom: "1px solid #F3F4F6", background: isActive ? "#F0EDFA" : isSelected ? "#F9FAFB" : "transparent", opacity: isImported ? 0.5 : 1, transition: "background 0.15s" }}>
                      <td style={{ padding: "8px 4px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(mail)} />
                      </td>
                      <td style={{ padding: "8px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {mail.from.split("<")[0].trim() || mail.from}
                      </td>
                      <td style={{ padding: "8px", fontWeight: isImported ? 400 : 500 }}>
                        {isImported && <span style={{ color: "#10B981", marginRight: 4, fontSize: 11 }}>[등록됨]</span>}
                        {mail.subject}
                      </td>
                      <td style={{ padding: "8px", textAlign: "center", color: "#6B7280", fontSize: 12 }}>{formatDate(mail.date)}</td>
                      <td style={{ padding: "8px", textAlign: "center", color: "#9CA3AF", fontSize: 11 }}>{mail.folder !== "INBOX" ? mail.folder : ""}</td>
                      <td style={{ padding: "8px", textAlign: "center" }}>
                        {mail.hasAttachments && <span title={mail.attachmentNames.join(", ")} style={{ cursor: "help" }}>{mail.attachmentNames.length}</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 우측: 미리보기 */}
        <div style={{ ...CARD, width: 500, maxHeight: "calc(100vh - 260px)", overflowY: "auto", flexShrink: 0 }}>
          {!previewMail ? (
            <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>
              <p style={{ fontSize: 14 }}>왼쪽 목록에서 메일을 선택하세요</p>
            </div>
          ) : detailLoading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>메일 내용을 불러오는 중...</div>
          ) : detail ? (
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, lineHeight: 1.4 }}>{detail.subject}</h2>
              <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>발신: {detail.from}</div>
              <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 16 }}>날짜: {detail.date ? new Date(detail.date).toLocaleString("ko-KR") : ""}</div>

              {detail.attachments.length > 0 && (
                <div style={{ marginBottom: 16, padding: 10, background: "#F9FAFB", borderRadius: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>첨부파일 ({detail.attachments.length})</div>
                  {detail.attachments.map((att, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#6B7280", padding: "2px 0" }}>
                      {att.type === "image" ? (
                        <span><AdminPreviewImage src={att.content} alt={att.name} style={{ maxWidth: 100, maxHeight: 60, borderRadius: 4, verticalAlign: "middle", marginRight: 6 }} />{att.name}</span>
                      ) : (
                        <span>{att.type === "docx" ? "[DOCX]" : att.type === "pdf" ? "[PDF]" : att.type === "hwp" ? "[HWP]" : "[파일]"} {att.name}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {detail.images.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>이미지 ({detail.images.length})</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {detail.images.map((url, i) => <AdminPreviewImage key={i} src={url} alt={`첨부 ${i + 1}`} style={{ maxWidth: 140, maxHeight: 100, borderRadius: 6, objectFit: "cover", border: "1px solid #E5E7EB" }} />)}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>본문</div>
                <div style={{ fontSize: 13, lineHeight: 1.7, color: "#374151", maxHeight: 300, overflow: "auto", padding: 10, background: "#FAFAFA", borderRadius: 6, border: "1px solid #F3F4F6" }}
                  dangerouslySetInnerHTML={{ __html: typeof window !== "undefined" ? DOMPurify.sanitize(detail.bodyHtml, { ALLOWED_TAGS: ["p", "br", "b", "strong", "i", "em", "u", "a", "img", "h1", "h2", "h3", "h4", "ul", "ol", "li", "table", "tr", "td", "th", "thead", "tbody", "span", "div", "figure", "figcaption", "blockquote"], ALLOWED_ATTR: ["href", "src", "alt", "style", "class", "width", "height", "target", "rel"], ALLOW_DATA_ATTR: false }) : "" }} />
              </div>

              {detail.attachments.filter((a) => a.type !== "image" && a.type !== "other").map((att, i) => (
                <div key={i} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>{att.name} 내용</div>
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: "#374151", maxHeight: 200, overflow: "auto", padding: 10, background: "#FAFAFA", borderRadius: 6, border: "1px solid #F3F4F6" }}
                    dangerouslySetInnerHTML={{ __html: typeof window !== "undefined" ? DOMPurify.sanitize(att.content, { ALLOWED_TAGS: ["p", "br", "b", "strong", "i", "em", "u", "a", "img", "h1", "h2", "h3", "h4", "ul", "ol", "li", "table", "tr", "td", "th", "thead", "tbody", "span", "div"], ALLOWED_ATTR: ["href", "src", "alt", "style", "class"], ALLOW_DATA_ATTR: false }) : "" }} />
                </div>
              ))}

              <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 12, borderTop: "1px solid #E5E7EB", flexWrap: "wrap" }}>
                <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #D1D5DB", fontSize: 12 }}>
                  <option>자동분류</option><option>엔터</option><option>스포츠</option><option>라이프</option><option>테크·모빌리티</option><option>비즈</option><option>공공</option>
                </select>
                <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="기자명" style={{ width: 80, padding: "6px 10px", borderRadius: 6, border: "1px solid #D1D5DB", fontSize: 12 }} />
                <button onClick={() => handleRegisterSingle("draft")} disabled={registering} style={BTN_SECONDARY}>임시저장</button>
                <button onClick={() => handleRegisterSingle("ai")} disabled={registering} style={BTN_DANGER}>{registering ? "처리 중..." : "AI편집 후 게시"}</button>
              </div>
            </div>
          ) : null}

          {registerResults.length > 0 && (
            <div style={{ marginTop: 16, padding: 10, background: "#F0FDF4", borderRadius: 6, border: "1px solid #BBF7D0" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#166534", marginBottom: 4 }}>등록 결과</div>
              {registerResults.map((r, i) => (
                <div key={i} style={{ fontSize: 12, color: r.success ? "#166534" : "#DC2626", padding: "2px 0" }}>
                  {r.success ? `[성공] ${r.title}` : `[실패] ${r.error}`}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onSave={(s) => {
            setSettings(s);
            setShowSettings(false);
            if (s.defaultAuthor) setAuthor(s.defaultAuthor);
            if (s.defaultCategory) setCategory(s.defaultCategory);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
