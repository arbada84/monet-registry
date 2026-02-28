"use client";

import { useEffect, useState } from "react";
import { getSetting, saveSetting } from "@/lib/db";
import { inputStyle, labelStyle } from "@/lib/admin-styles";

interface Subscriber {
  id: string;
  email: string;
  name: string;
  subscribedAt: string;
  status: "active" | "unsubscribed";
}

interface NewsletterSettings {
  enabled: boolean;
  senderName: string;
  senderEmail: string;
  replyToEmail: string;
  welcomeSubject: string;
  welcomeBody: string;
  footerText: string;
  autoSendOnPublish: boolean;
  sendTime: string;
  // SMTP 설정
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpSecure: boolean;
}

const DEFAULT_SETTINGS: NewsletterSettings = {
  enabled: true,
  senderName: "컬처피플",
  senderEmail: "newsletter@culturepeople.co.kr",
  replyToEmail: "contact@culturepeople.co.kr",
  welcomeSubject: "컬처피플 뉴스레터에 오신 것을 환영합니다!",
  welcomeBody: "안녕하세요! 컬처피플 뉴스레터를 구독해주셔서 감사합니다.\n매일 선별된 문화 뉴스를 전해드리겠습니다.",
  footerText: "본 메일은 컬처피플 뉴스레터 수신에 동의하신 분들께 발송됩니다.\n수신거부를 원하시면 하단 '구독 해지' 버튼을 클릭해주세요.",
  autoSendOnPublish: false,
  sendTime: "08:00",
  smtpHost: "",
  smtpPort: 587,
  smtpUser: "",
  smtpPass: "",
  smtpSecure: false,
};

export default function AdminNewsletterPage() {
  const [settings, setSettings] = useState<NewsletterSettings>(DEFAULT_SETTINGS);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [activeTab, setActiveTab] = useState<"subscribers" | "settings" | "compose">("subscribers");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "unsubscribed">("all");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState("");
  const [sendError, setSendError] = useState("");

  useEffect(() => {
    getSetting<NewsletterSettings | null>("cp-newsletter-settings", null).then((s) => {
      if (s) setSettings({ ...DEFAULT_SETTINGS, ...s });
    });
    getSetting<Subscriber[] | null>("cp-newsletter-subscribers", null).then((sub) => {
      if (sub) {
        setSubscribers(sub);
      }
      // 구독자가 없으면 빈 배열 유지 (샘플 자동 삽입 없음)
    });
  }, []);

  const saveSubs = async (updated: Subscriber[]) => {
    setSubscribers(updated);
    await saveSetting("cp-newsletter-subscribers", updated);
  };

  const handleSaveSettings = async () => {
    try {
      await saveSetting("cp-newsletter-settings", settings);
      setSaved(true);
      setSaveError("");
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장에 실패했습니다. 다시 시도해주세요.");
    }
  };

  const handleRemove = (id: string) => {
    saveSubs(subscribers.filter((s) => s.id !== id));
    setConfirmDelete(null);
  };

  const handleToggleStatus = (id: string) => {
    saveSubs(subscribers.map((s) => s.id === id ? { ...s, status: s.status === "active" ? "unsubscribed" as const : "active" as const } : s));
  };

  const [sending, setSending] = useState(false);

  const handleSendNewsletter = async () => {
    if (!composeSubject.trim() || !composeBody.trim()) {
      setSendError("제목과 내용을 입력해주세요.");
      return;
    }
    setSendError("");
    setSending(true);
    try {
      const res = await fetch("/api/newsletter/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: composeSubject,
          content: composeBody,
          settings,
          subscribers,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSendSuccess(data.message);
        setComposeSubject("");
        setComposeBody("");
        setTimeout(() => setSendSuccess(""), 6000);
      } else {
        setSendError(data.error || "발송에 실패했습니다.");
      }
    } catch {
      setSendError("네트워크 오류가 발생했습니다.");
    }
    setSending(false);
  };

  const filteredSubs = filter === "all" ? subscribers : subscribers.filter((s) => s.status === filter);
  const activeSubs = subscribers.filter((s) => s.status === "active").length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>뉴스레터 관리</h1>
        <div style={{ fontSize: 14, color: "#666" }}>활성 구독자: <strong style={{ color: "#E8192C" }}>{activeSubs}명</strong></div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
        {[
          { key: "subscribers" as const, label: "구독자 관리" },
          { key: "compose" as const, label: "뉴스레터 발송" },
          { key: "settings" as const, label: "발송 설정" },
        ].map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ padding: "8px 18px", fontSize: 14, fontWeight: activeTab === tab.key ? 600 : 400, color: activeTab === tab.key ? "#E8192C" : "#666", background: activeTab === tab.key ? "#FFF0F0" : "#FFF", border: `1px solid ${activeTab === tab.key ? "#E8192C" : "#DDD"}`, borderRadius: 8, cursor: "pointer" }}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "subscribers" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {(["all", "active", "unsubscribed"] as const).map((key) => (
              <button key={key} onClick={() => setFilter(key)} style={{ padding: "6px 16px", fontSize: 13, fontWeight: filter === key ? 600 : 400, color: filter === key ? "#E8192C" : "#666", background: filter === key ? "#FFF0F0" : "#FFF", border: `1px solid ${filter === key ? "#E8192C" : "#DDD"}`, borderRadius: 6, cursor: "pointer" }}>
                {key === "all" ? "전체" : key === "active" ? "활성" : "해지"} ({key === "all" ? subscribers.length : subscribers.filter((s) => s.status === key).length})
              </button>
            ))}
          </div>
          <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
                  <th style={{ padding: "10px 20px", textAlign: "left", fontWeight: 500, color: "#666" }}>이메일</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>이름</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>구독일</th>
                  <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 500, color: "#666" }}>상태</th>
                  <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 500, color: "#666", width: 120 }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubs.map((sub) => (
                  <tr key={sub.id} style={{ borderBottom: "1px solid #EEE" }}>
                    <td style={{ padding: "12px 20px" }}>{sub.email}</td>
                    <td style={{ padding: "12px 16px", color: "#666" }}>{sub.name || "-"}</td>
                    <td style={{ padding: "12px 16px", color: "#666" }}>{sub.subscribedAt}</td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      <button onClick={() => handleToggleStatus(sub.id)} style={{ padding: "3px 12px", borderRadius: 12, fontSize: 12, fontWeight: 500, border: "none", cursor: "pointer", background: sub.status === "active" ? "#E8F5E9" : "#F5F5F5", color: sub.status === "active" ? "#2E7D32" : "#999" }}>
                        {sub.status === "active" ? "활성" : "해지"}
                      </button>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      {confirmDelete === sub.id ? (
                        <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                          <button onClick={() => handleRemove(sub.id)} style={{ padding: "4px 10px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>삭제</button>
                          <button onClick={() => setConfirmDelete(null)} style={{ padding: "4px 10px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>취소</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDelete(sub.id)} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #E8192C", borderRadius: 6, color: "#E8192C", fontSize: 12, cursor: "pointer" }}>삭제</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "compose" && (
        <div style={{ maxWidth: 640 }}>
          <section style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>뉴스레터 작성</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>제목</label>
                <input type="text" value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} placeholder="뉴스레터 제목" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>내용</label>
                <textarea value={composeBody} onChange={(e) => setComposeBody(e.target.value)} placeholder="뉴스레터 내용을 작성하세요" rows={12} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.7 }} />
              </div>
              <div style={{ padding: 12, background: "#FFF3E0", borderRadius: 8, fontSize: 13, color: "#E65100" }}>
                발송 대상: 활성 구독자 {activeSubs}명
              </div>
              {sendError && <div style={{ fontSize: 13, color: "#E8192C", background: "#FFF0F0", border: "1px solid #FFCDD2", borderRadius: 6, padding: "8px 12px" }}>{sendError}</div>}
              {sendSuccess && <div style={{ fontSize: 13, color: "#2E7D32", background: "#F0FFF4", border: "1px solid #C8E6C9", borderRadius: 6, padding: "8px 12px" }}>{sendSuccess}</div>}
              <button onClick={handleSendNewsletter} disabled={sending} style={{ padding: "12px 32px", background: sending ? "#CCC" : "#E8192C", color: "#FFF", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: sending ? "default" : "pointer", alignSelf: "flex-start" }}>
                {sending ? "발송 중..." : "뉴스레터 발송"}
              </button>
            </div>
          </section>
        </div>
      )}

      {activeTab === "settings" && (
        <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 20 }}>
          <section style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>발송 설정</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} style={{ width: 16, height: 16 }} />
                뉴스레터 기능 활성화
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: 16 }}>
                <div>
                  <label style={labelStyle}>발신자 이름</label>
                  <input type="text" value={settings.senderName} onChange={(e) => setSettings({ ...settings, senderName: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>발신 이메일</label>
                  <input type="email" value={settings.senderEmail} onChange={(e) => setSettings({ ...settings, senderEmail: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>회신 이메일</label>
                <input type="email" value={settings.replyToEmail} onChange={(e) => setSettings({ ...settings, replyToEmail: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: 16 }}>
                <div>
                  <label style={labelStyle}>자동 발송 시간</label>
                  <input type="time" value={settings.sendTime} onChange={(e) => setSettings({ ...settings, sendTime: e.target.value })} style={inputStyle} />
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 4 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                    <input type="checkbox" checked={settings.autoSendOnPublish} onChange={(e) => setSettings({ ...settings, autoSendOnPublish: e.target.checked })} style={{ width: 16, height: 16 }} />
                    기사 게시 시 자동 발송
                  </label>
                </div>
              </div>
            </div>
          </section>

          {/* SMTP 서버 설정 */}
          <section style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>SMTP 서버 설정</h2>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>실제 이메일 발송을 위한 SMTP 서버 정보를 입력하세요. Gmail: smtp.gmail.com (포트 587)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 160px), 1fr))", gap: 16 }}>
                <div>
                  <label style={labelStyle}>SMTP 호스트</label>
                  <input type="text" value={settings.smtpHost} onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })} placeholder="smtp.gmail.com" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>포트</label>
                  <input type="number" value={settings.smtpPort} onChange={(e) => setSettings({ ...settings, smtpPort: Number(e.target.value) })} placeholder="587" style={inputStyle} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: 16 }}>
                <div>
                  <label style={labelStyle}>SMTP 사용자명</label>
                  <input type="text" value={settings.smtpUser} onChange={(e) => setSettings({ ...settings, smtpUser: e.target.value })} placeholder="your@gmail.com" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>SMTP 비밀번호</label>
                  <input type="password" value={settings.smtpPass} onChange={(e) => setSettings({ ...settings, smtpPass: e.target.value })} placeholder="앱 비밀번호" style={inputStyle} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", background: "#FFF8E1", border: "1px solid #FFE082", borderRadius: 8, fontSize: 12, color: "#795548" }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
                <div>
                  <strong>보안 안내:</strong> SMTP 비밀번호는 데이터베이스에 암호화 없이 저장됩니다. Gmail 사용 시 계정 비밀번호 대신 <strong>앱 비밀번호</strong>를 발급받아 사용하세요. 계정 설정 → 보안 → 2단계 인증 → 앱 비밀번호에서 발급할 수 있습니다.
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={settings.smtpSecure} onChange={(e) => setSettings({ ...settings, smtpSecure: e.target.checked })} style={{ width: 16, height: 16 }} />
                SSL/TLS 사용 (포트 465)
              </label>
            </div>
          </section>
          <section style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>환영 메일</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>제목</label>
                <input type="text" value={settings.welcomeSubject} onChange={(e) => setSettings({ ...settings, welcomeSubject: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>내용</label>
                <textarea value={settings.welcomeBody} onChange={(e) => setSettings({ ...settings, welcomeBody: e.target.value })} rows={4} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.7 }} />
              </div>
            </div>
          </section>
          <div>
            <button onClick={handleSaveSettings} style={{ padding: "12px 32px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>저장</button>
            {saved && <span style={{ marginLeft: 12, fontSize: 14, color: "#4CAF50", fontWeight: 500 }}>저장되었습니다!</span>}
          </div>
          {saveError && (
            <div style={{ fontSize: 13, color: "#E8192C", background: "#FFF0F0", border: "1px solid #FFCDD2", borderRadius: 6, padding: "8px 12px", marginTop: 8 }}>{saveError}</div>
          )}
        </div>
      )}
    </div>
  );
}
