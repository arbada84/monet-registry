"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

interface TelegramStatus {
  enabled: boolean;
  hasToken: boolean;
  hasWebhookSecret: boolean;
  hasWebhookHeaderSecret: boolean;
  tempLoginEnabled: boolean;
  chatCount: number;
  chatIds: string[];
}

interface WebhookInfo {
  url?: string;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
  allowed_updates?: string[];
}

interface AuditEntry {
  id: string;
  action: string;
  chatId: string;
  status: string;
  summary: string;
  at: string;
  error?: string;
}

interface PendingAction {
  id: string;
  action: string;
  chatId: string;
  requestedAt: string;
  expiresAt: string;
  summary: string;
}

interface DeliveryLog {
  id: string;
  at: string;
  action: string;
  ok: boolean;
  method?: string;
  chatCount?: number;
  preview?: string;
  error?: string;
}

interface WebhookConfigResponse {
  success: boolean;
  telegram?: TelegramStatus;
  configuredWebhookUrl?: string;
  webhookUrl?: string;
  webhook?: WebhookInfo;
  result?: boolean;
  error?: string;
}

interface TestResponse {
  success: boolean;
  sent?: boolean;
  telegram?: TelegramStatus;
  error?: string;
}

interface ChatIdResponse {
  success: boolean;
  telegram?: TelegramStatus;
  chatIds?: Array<string | number>;
  updates?: Array<Record<string, unknown>>;
  error?: string;
}

interface AuditResponse {
  success: boolean;
  audit?: AuditEntry[];
  pending?: PendingAction[];
  error?: string;
}

interface DeliveryResponse {
  success: boolean;
  deliveries?: DeliveryLog[];
  error?: string;
}

const cardStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #EEEEEE",
  borderRadius: 14,
  padding: 22,
};

const buttonStyle: CSSProperties = {
  border: "none",
  borderRadius: 8,
  background: "#111827",
  color: "#FFFFFF",
  padding: "10px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "#F3F4F6",
  color: "#111827",
  border: "1px solid #E5E7EB",
};

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        padding: "5px 9px",
        fontSize: 12,
        fontWeight: 700,
        color: ok ? "#065F46" : "#991B1B",
        background: ok ? "#D1FAE5" : "#FEE2E2",
      }}
    >
      {label}: {ok ? "정상" : "꺼짐"}
    </span>
  );
}

function formatDate(value?: string | number) {
  if (!value) return "-";
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function maskWebhookUrl(url?: string) {
  if (!url) return "-";
  return url.replace(/\/api\/telegram\/webhook\/[^/?#]+/, "/api/telegram/webhook/***");
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: options?.body ? { "Content-Type": "application/json", ...(options.headers || {}) } : options?.headers,
    cache: "no-store",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `요청 실패: ${res.status}`);
  }
  return data as T;
}

function translateAction(action?: string) {
  const labels: Record<string, string> = {
    send_message: "메시지 발송",
    send_photo: "사진 발송",
    set_webhook: "웹훅 등록",
    delete_webhook: "웹훅 삭제",
    test: "테스트",
    approve: "승인",
    reject: "거절",
    temp_login: "임시 로그인",
    maintenance_on: "점검모드 켜기",
    maintenance_off: "점검모드 끄기",
  };
  if (!action) return "-";
  return labels[action] || action.replaceAll("_", " ");
}

function translateStatus(status?: string) {
  const labels: Record<string, string> = {
    pending: "대기",
    approved: "승인",
    rejected: "거절",
    completed: "완료",
    failed: "실패",
    expired: "만료",
    ok: "성공",
    success: "성공",
    error: "오류",
  };
  if (!status) return "-";
  return labels[status] || status;
}

function translateMethod(method?: string) {
  const labels: Record<string, string> = {
    sendMessage: "메시지",
    sendPhoto: "사진",
    setWebhook: "웹훅 등록",
    deleteWebhook: "웹훅 삭제",
  };
  if (!method) return "-";
  return labels[method] || method;
}

export default function TelegramAdminPage() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [webhook, setWebhook] = useState<WebhookInfo | null>(null);
  const [configuredUrl, setConfiguredUrl] = useState("");
  const [chatIds, setChatIds] = useState<Array<string | number>>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryLog[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadWebhook = async () => {
    const data = await requestJson<WebhookConfigResponse>("/api/telegram/webhook-config");
    if (data.telegram) setStatus(data.telegram);
    setWebhook(data.webhook || null);
    setConfiguredUrl(data.configuredWebhookUrl || "");
  };

  const loadAudit = async () => {
    const data = await requestJson<AuditResponse>("/api/telegram/audit?limit=50");
    setAudit(data.audit || []);
    setPending(data.pending || []);
  };

  const loadDeliveries = async () => {
    const data = await requestJson<DeliveryResponse>("/api/telegram/deliveries?limit=50");
    setDeliveries(data.deliveries || []);
  };

  const runAction = async (label: string, action: () => Promise<void>) => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(label);
    } catch (err) {
      setError(err instanceof Error ? err.message : "텔레그램 작업을 처리하는 중 요청이 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void runAction("텔레그램 상태를 불러왔습니다.", async () => {
      await Promise.all([loadWebhook(), loadAudit(), loadDeliveries()]);
    });
  }, []);

  const sendTest = () => runAction("테스트 메시지를 발송했습니다.", async () => {
    const data = await requestJson<TestResponse>("/api/telegram/test", {
      method: "POST",
      body: JSON.stringify({ text: "컬처피플 텔레그램 테스트 메시지입니다." }),
    });
    if (data.telegram) setStatus(data.telegram);
    await loadDeliveries();
    if (!data.sent) throw new Error("텔레그램 발송에 실패했거나 알림 기능이 비활성화되어 있습니다.");
  });

  const findChatIds = () => runAction("최근 텔레그램 업데이트를 불러왔습니다.", async () => {
    const data = await requestJson<ChatIdResponse>("/api/telegram/chat-id");
    if (data.telegram) setStatus(data.telegram);
    setChatIds(data.chatIds || []);
  });

  const registerWebhook = () => runAction("웹훅을 등록했습니다.", async () => {
    const data = await requestJson<WebhookConfigResponse>("/api/telegram/webhook-config", {
      method: "POST",
      body: JSON.stringify({ dropPendingUpdates: false }),
    });
    if (data.telegram) setStatus(data.telegram);
    await Promise.all([loadWebhook(), loadDeliveries()]);
  });

  const removeWebhook = () => runAction("웹훅을 삭제했습니다.", async () => {
    if (!window.confirm("텔레그램 웹훅을 삭제할까요? 다시 등록하기 전까지 텔레그램 명령 수신이 중단됩니다.")) return;
    const data = await requestJson<WebhookConfigResponse>("/api/telegram/webhook-config", {
      method: "DELETE",
      body: JSON.stringify({ dropPendingUpdates: false }),
    });
    if (data.telegram) setStatus(data.telegram);
    await Promise.all([loadWebhook(), loadDeliveries()]);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <p style={{ margin: "0 0 8px", color: "#6B7280", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em" }}>
          운영 관리
        </p>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#111827" }}>
          텔레그램 운영 관리
        </h1>
        <p style={{ margin: "10px 0 0", color: "#6B7280", fontSize: 14 }}>
          웹훅 상태, 테스트 알림, 명령 감사 기록, 최근 발송 결과를 비밀값 노출 없이 관리합니다.
        </p>
      </div>

      {(message || error) && (
        <div
          style={{
            borderRadius: 10,
            padding: "12px 14px",
            background: error ? "#FEF2F2" : "#ECFDF5",
            color: error ? "#991B1B" : "#065F46",
            border: `1px solid ${error ? "#FECACA" : "#A7F3D0"}`,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {error || message}
        </div>
      )}

      <section style={cardStyle}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18, color: "#111827" }}>환경 상태</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Badge ok={!!status?.enabled} label="알림" />
          <Badge ok={!!status?.hasToken} label="봇 토큰" />
          <Badge ok={(status?.chatCount || 0) > 0} label="채팅 ID" />
          <Badge ok={!!status?.hasWebhookSecret} label="웹훅 비밀키" />
          <Badge ok={!!status?.hasWebhookHeaderSecret} label="헤더 비밀키" />
          <Badge ok={!!status?.tempLoginEnabled} label="임시 로그인" />
        </div>
        <p style={{ margin: "14px 0 0", color: "#6B7280", fontSize: 13 }}>
          등록된 채팅: {status?.chatIds?.join(", ") || "-"}
        </p>
      </section>

      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 18, color: "#111827" }}>웹훅</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button disabled={loading} onClick={() => runAction("웹훅 상태를 새로고침했습니다.", loadWebhook)} style={secondaryButtonStyle}>새로고침</button>
            <button disabled={loading} onClick={registerWebhook} style={buttonStyle}>웹훅 등록</button>
            <button disabled={loading} onClick={removeWebhook} style={{ ...secondaryButtonStyle, color: "#991B1B" }}>웹훅 삭제</button>
          </div>
        </div>
        <dl style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "10px 14px", margin: "18px 0 0", fontSize: 13 }}>
          <dt style={{ color: "#6B7280" }}>설정된 URL</dt>
          <dd style={{ margin: 0, wordBreak: "break-all" }}>{maskWebhookUrl(configuredUrl)}</dd>
          <dt style={{ color: "#6B7280" }}>텔레그램 URL</dt>
          <dd style={{ margin: 0, wordBreak: "break-all" }}>{maskWebhookUrl(webhook?.url)}</dd>
          <dt style={{ color: "#6B7280" }}>대기 업데이트</dt>
          <dd style={{ margin: 0 }}>{webhook?.pending_update_count ?? 0}</dd>
          <dt style={{ color: "#6B7280" }}>최근 오류</dt>
          <dd style={{ margin: 0 }}>{webhook?.last_error_message || "-"}</dd>
        </dl>
      </section>

      <section style={cardStyle}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18, color: "#111827" }}>테스트 / 채팅 ID</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button disabled={loading} onClick={sendTest} style={buttonStyle}>테스트 발송</button>
          <button disabled={loading} onClick={findChatIds} style={secondaryButtonStyle}>채팅 ID 찾기</button>
        </div>
        <p style={{ margin: "14px 0 0", color: "#6B7280", fontSize: 13 }}>
          채팅 ID 후보: {chatIds.length > 0 ? chatIds.join(", ") : "봇에게 /start를 보낸 뒤 최근 업데이트를 불러오세요."}
        </p>
      </section>

      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 18, color: "#111827" }}>발송 기록</h2>
          <button disabled={loading} onClick={() => runAction("발송 기록을 새로고침했습니다.", loadDeliveries)} style={secondaryButtonStyle}>새로고침</button>
        </div>
        {deliveries.length === 0 ? (
          <p style={{ margin: "14px 0 0", color: "#9CA3AF", fontSize: 13 }}>아직 발송 기록이 없습니다.</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #E5E7EB", color: "#6B7280", textAlign: "left" }}>
                  <th style={{ padding: "9px 8px" }}>시간</th>
                  <th style={{ padding: "9px 8px" }}>작업</th>
                  <th style={{ padding: "9px 8px" }}>결과</th>
                  <th style={{ padding: "9px 8px" }}>방식</th>
                  <th style={{ padding: "9px 8px" }}>미리보기 / 오류</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((item) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "9px 8px", whiteSpace: "nowrap", color: "#6B7280" }}>{formatDate(item.at)}</td>
                    <td style={{ padding: "9px 8px", whiteSpace: "nowrap" }}>{translateAction(item.action)}</td>
                    <td style={{ padding: "9px 8px", whiteSpace: "nowrap", color: item.ok ? "#047857" : "#991B1B", fontWeight: 700 }}>
                      {item.ok ? "성공" : "실패"}
                    </td>
                    <td style={{ padding: "9px 8px", whiteSpace: "nowrap" }}>
                      {translateMethod(item.method)} {typeof item.chatCount === "number" ? `(${item.chatCount})` : ""}
                    </td>
                    <td style={{ padding: "9px 8px", minWidth: 280 }}>
                      {item.preview || "-"}
                      {item.error && <div style={{ color: "#991B1B", marginTop: 4 }}>{item.error}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 18, color: "#111827" }}>명령 감사</h2>
          <button disabled={loading} onClick={() => runAction("명령 감사 기록을 새로고침했습니다.", loadAudit)} style={secondaryButtonStyle}>새로고침</button>
        </div>

        <h3 style={{ margin: "18px 0 10px", fontSize: 14, color: "#374151" }}>대기 중인 명령</h3>
        {pending.length === 0 ? (
          <p style={{ margin: 0, color: "#9CA3AF", fontSize: 13 }}>대기 중인 명령이 없습니다.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pending.map((item) => (
              <div key={item.id} style={{ border: "1px solid #E5E7EB", borderRadius: 10, padding: 12, fontSize: 13 }}>
                <strong>{translateAction(item.action)}</strong> - <code>{item.id}</code>
                <div style={{ marginTop: 5, color: "#6B7280" }}>{item.summary}</div>
                <div style={{ marginTop: 5, color: "#9CA3AF" }}>만료: {formatDate(item.expiresAt)}</div>
              </div>
            ))}
          </div>
        )}

        <h3 style={{ margin: "22px 0 10px", fontSize: 14, color: "#374151" }}>최근 실행</h3>
        {audit.length === 0 ? (
          <p style={{ margin: 0, color: "#9CA3AF", fontSize: 13 }}>명령 감사 기록이 없습니다.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #E5E7EB", color: "#6B7280", textAlign: "left" }}>
                  <th style={{ padding: "9px 8px" }}>시간</th>
                  <th style={{ padding: "9px 8px" }}>명령</th>
                  <th style={{ padding: "9px 8px" }}>상태</th>
                  <th style={{ padding: "9px 8px" }}>요약</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((item) => (
                  <tr key={`${item.id}-${item.status}-${item.at}`} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "9px 8px", whiteSpace: "nowrap", color: "#6B7280" }}>{formatDate(item.at)}</td>
                    <td style={{ padding: "9px 8px", whiteSpace: "nowrap" }}>{translateAction(item.action)}</td>
                    <td style={{ padding: "9px 8px", whiteSpace: "nowrap" }}>{translateStatus(item.status)}</td>
                    <td style={{ padding: "9px 8px", minWidth: 260 }}>
                      {item.summary}
                      {item.error && <div style={{ color: "#991B1B", marginTop: 4 }}>{item.error}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
