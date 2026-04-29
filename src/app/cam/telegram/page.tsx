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
      {label}: {ok ? "OK" : "OFF"}
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
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return data as T;
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
      setError(err instanceof Error ? err.message : "Request failed while processing the Telegram operation.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void runAction("Telegram status loaded.", async () => {
      await Promise.all([loadWebhook(), loadAudit(), loadDeliveries()]);
    });
  }, []);

  const sendTest = () => runAction("Test message sent.", async () => {
    const data = await requestJson<TestResponse>("/api/telegram/test", {
      method: "POST",
      body: JSON.stringify({ text: "CulturePeople Telegram test message." }),
    });
    if (data.telegram) setStatus(data.telegram);
    await loadDeliveries();
    if (!data.sent) throw new Error("Telegram send failed or is disabled.");
  });

  const findChatIds = () => runAction("Recent Telegram updates loaded.", async () => {
    const data = await requestJson<ChatIdResponse>("/api/telegram/chat-id");
    if (data.telegram) setStatus(data.telegram);
    setChatIds(data.chatIds || []);
  });

  const registerWebhook = () => runAction("Webhook registered.", async () => {
    const data = await requestJson<WebhookConfigResponse>("/api/telegram/webhook-config", {
      method: "POST",
      body: JSON.stringify({ dropPendingUpdates: false }),
    });
    if (data.telegram) setStatus(data.telegram);
    await Promise.all([loadWebhook(), loadDeliveries()]);
  });

  const removeWebhook = () => runAction("Webhook removed.", async () => {
    if (!window.confirm("Remove the Telegram webhook? Commands will stop until it is registered again.")) return;
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
          OPERATIONS
        </p>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#111827" }}>
          Telegram Operations
        </h1>
        <p style={{ margin: "10px 0 0", color: "#6B7280", fontSize: 14 }}>
          Manage webhook status, test notifications, command audits, and recent delivery results without exposing secrets.
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
        <h2 style={{ margin: "0 0 16px", fontSize: 18, color: "#111827" }}>Environment Status</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Badge ok={!!status?.enabled} label="Notifications" />
          <Badge ok={!!status?.hasToken} label="Bot token" />
          <Badge ok={(status?.chatCount || 0) > 0} label="Chat ID" />
          <Badge ok={!!status?.hasWebhookSecret} label="Webhook secret" />
          <Badge ok={!!status?.hasWebhookHeaderSecret} label="Header secret" />
          <Badge ok={!!status?.tempLoginEnabled} label="Temp login" />
        </div>
        <p style={{ margin: "14px 0 0", color: "#6B7280", fontSize: 13 }}>
          Registered chats: {status?.chatIds?.join(", ") || "-"}
        </p>
      </section>

      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 18, color: "#111827" }}>Webhook</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button disabled={loading} onClick={() => runAction("Webhook status refreshed.", loadWebhook)} style={secondaryButtonStyle}>Refresh</button>
            <button disabled={loading} onClick={registerWebhook} style={buttonStyle}>Register Webhook</button>
            <button disabled={loading} onClick={removeWebhook} style={{ ...secondaryButtonStyle, color: "#991B1B" }}>Remove Webhook</button>
          </div>
        </div>
        <dl style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "10px 14px", margin: "18px 0 0", fontSize: 13 }}>
          <dt style={{ color: "#6B7280" }}>Configured URL</dt>
          <dd style={{ margin: 0, wordBreak: "break-all" }}>{maskWebhookUrl(configuredUrl)}</dd>
          <dt style={{ color: "#6B7280" }}>Telegram URL</dt>
          <dd style={{ margin: 0, wordBreak: "break-all" }}>{maskWebhookUrl(webhook?.url)}</dd>
          <dt style={{ color: "#6B7280" }}>Pending updates</dt>
          <dd style={{ margin: 0 }}>{webhook?.pending_update_count ?? 0}</dd>
          <dt style={{ color: "#6B7280" }}>Last error</dt>
          <dd style={{ margin: 0 }}>{webhook?.last_error_message || "-"}</dd>
        </dl>
      </section>

      <section style={cardStyle}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18, color: "#111827" }}>Test / Chat ID</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button disabled={loading} onClick={sendTest} style={buttonStyle}>Send Test</button>
          <button disabled={loading} onClick={findChatIds} style={secondaryButtonStyle}>Find Chat ID</button>
        </div>
        <p style={{ margin: "14px 0 0", color: "#6B7280", fontSize: 13 }}>
          Chat ID candidates: {chatIds.length > 0 ? chatIds.join(", ") : "Send /start to the bot, then load recent updates."}
        </p>
      </section>

      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 18, color: "#111827" }}>Delivery Log</h2>
          <button disabled={loading} onClick={() => runAction("Delivery log refreshed.", loadDeliveries)} style={secondaryButtonStyle}>Refresh</button>
        </div>
        {deliveries.length === 0 ? (
          <p style={{ margin: "14px 0 0", color: "#9CA3AF", fontSize: 13 }}>No delivery logs yet.</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #E5E7EB", color: "#6B7280", textAlign: "left" }}>
                  <th style={{ padding: "9px 8px" }}>Time</th>
                  <th style={{ padding: "9px 8px" }}>Action</th>
                  <th style={{ padding: "9px 8px" }}>Result</th>
                  <th style={{ padding: "9px 8px" }}>Method</th>
                  <th style={{ padding: "9px 8px" }}>Preview / Error</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((item) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "9px 8px", whiteSpace: "nowrap", color: "#6B7280" }}>{formatDate(item.at)}</td>
                    <td style={{ padding: "9px 8px", whiteSpace: "nowrap" }}>{item.action}</td>
                    <td style={{ padding: "9px 8px", whiteSpace: "nowrap", color: item.ok ? "#047857" : "#991B1B", fontWeight: 700 }}>
                      {item.ok ? "OK" : "FAIL"}
                    </td>
                    <td style={{ padding: "9px 8px", whiteSpace: "nowrap" }}>
                      {item.method || "-"} {typeof item.chatCount === "number" ? `(${item.chatCount})` : ""}
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
          <h2 style={{ margin: 0, fontSize: 18, color: "#111827" }}>Command Audit</h2>
          <button disabled={loading} onClick={() => runAction("Command audit refreshed.", loadAudit)} style={secondaryButtonStyle}>Refresh</button>
        </div>

        <h3 style={{ margin: "18px 0 10px", fontSize: 14, color: "#374151" }}>Pending Commands</h3>
        {pending.length === 0 ? (
          <p style={{ margin: 0, color: "#9CA3AF", fontSize: 13 }}>No pending commands.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pending.map((item) => (
              <div key={item.id} style={{ border: "1px solid #E5E7EB", borderRadius: 10, padding: 12, fontSize: 13 }}>
                <strong>{item.action}</strong> - <code>{item.id}</code>
                <div style={{ marginTop: 5, color: "#6B7280" }}>{item.summary}</div>
                <div style={{ marginTop: 5, color: "#9CA3AF" }}>Expires: {formatDate(item.expiresAt)}</div>
              </div>
            ))}
          </div>
        )}

        <h3 style={{ margin: "22px 0 10px", fontSize: 14, color: "#374151" }}>Recent Executions</h3>
        {audit.length === 0 ? (
          <p style={{ margin: 0, color: "#9CA3AF", fontSize: 13 }}>No command audit logs.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #E5E7EB", color: "#6B7280", textAlign: "left" }}>
                  <th style={{ padding: "9px 8px" }}>Time</th>
                  <th style={{ padding: "9px 8px" }}>Command</th>
                  <th style={{ padding: "9px 8px" }}>Status</th>
                  <th style={{ padding: "9px 8px" }}>Summary</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((item) => (
                  <tr key={`${item.id}-${item.status}-${item.at}`} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "9px 8px", whiteSpace: "nowrap", color: "#6B7280" }}>{formatDate(item.at)}</td>
                    <td style={{ padding: "9px 8px", whiteSpace: "nowrap" }}>{item.action}</td>
                    <td style={{ padding: "9px 8px", whiteSpace: "nowrap" }}>{item.status}</td>
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
