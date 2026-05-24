"use client";

import type { Dispatch, SetStateAction } from "react";
import { inputStyle, labelStyle } from "@/lib/admin-styles";
import type { SaveSetting, SmtpSettings as SmtpSettingsState } from "../hooks/useSettings";
import { SectionCard } from "./SectionCard";

interface SmtpSettingsSectionProps {
  smtp: SmtpSettingsState;
  setSmtp: Dispatch<SetStateAction<SmtpSettingsState>>;
  smtpSaved: boolean;
  setSmtpSaved: Dispatch<SetStateAction<boolean>>;
  smtpSaveError: string;
  setSmtpSaveError: Dispatch<SetStateAction<string>>;
  smtpTesting: boolean;
  setSmtpTesting: Dispatch<SetStateAction<boolean>>;
  smtpTestResult: { ok: boolean; msg: string } | null;
  setSmtpTestResult: Dispatch<SetStateAction<{ ok: boolean; msg: string } | null>>;
  smtpPassChanged: boolean;
  setSmtpPassChanged: Dispatch<SetStateAction<boolean>>;
  saveSetting: SaveSetting;
}

export function SmtpSettingsSection({
  smtp,
  setSmtp,
  smtpSaved,
  setSmtpSaved,
  smtpSaveError,
  setSmtpSaveError,
  smtpTesting,
  setSmtpTesting,
  smtpTestResult,
  setSmtpTestResult,
  smtpPassChanged,
  setSmtpPassChanged,
  saveSetting,
}: SmtpSettingsSectionProps) {
  const SMTP_PRESETS: Record<string, { label: string; host: string; port: number; secure: boolean; hint: string; placeholder: string }> = {
    naver: { label: "네이버", host: "smtp.naver.com", port: 465, secure: true, hint: "네이버 로그인 비밀번호를 입력하세요. 2단계 인증 사용 시 애플리케이션 비밀번호를 발급받아 입력하세요.", placeholder: "아이디@naver.com" },
    gmail: { label: "Gmail", host: "smtp.gmail.com", port: 465, secure: true, hint: "Google 앱 비밀번호를 발급받아 입력하세요. (Google 계정 > 보안 > 앱 비밀번호)", placeholder: "아이디@gmail.com" },
    daum: { label: "다음/카카오", host: "smtp.daum.net", port: 465, secure: true, hint: "다음 메일 비밀번호를 입력하세요.", placeholder: "아이디@daum.net" },
    custom: { label: "직접 입력", host: "", port: 587, secure: false, hint: "SMTP 서버 정보를 직접 입력하세요.", placeholder: "user@example.com" },
  };
  const selectedService =
    smtp.smtpHost === "smtp.naver.com" ? "naver" :
    smtp.smtpHost === "smtp.gmail.com" ? "gmail" :
    smtp.smtpHost === "smtp.daum.net" ? "daum" : "custom";
  const preset = SMTP_PRESETS[selectedService];
  const isCustom = selectedService === "custom";
  const smtpStatus = smtp.smtpRuntimeStatus;
  const isEnvSource = (key: keyof NonNullable<typeof smtpStatus>["source"]) => smtpStatus?.source[key] === "env";
  const envManagedLabels = smtpStatus
    ? [
        isEnvSource("host") ? "호스트" : "",
        isEnvSource("port") ? "포트" : "",
        isEnvSource("secure") ? "보안 모드" : "",
        isEnvSource("user") ? "계정" : "",
        isEnvSource("pass") ? "비밀번호" : "",
        isEnvSource("senderName") ? "발신자 이름" : "",
        isEnvSource("senderEmail") ? "발신 이메일" : "",
      ].filter(Boolean).join(", ")
    : "";
  const presetLocked = isEnvSource("host") || isEnvSource("port") || isEnvSource("secure");
  const canTestSmtp = Boolean(smtpStatus?.configured || (smtp.smtpHost && smtp.smtpUser));
  const fieldStyle = (disabled: boolean) => ({
    ...inputStyle,
    backgroundColor: disabled ? "#F5F5F5" : "#FFF",
    color: disabled ? "#777" : "#111",
    cursor: disabled ? "not-allowed" : "text",
  });
  const buildSmtpPayload = () => {
    const { smtpRuntimeStatus, ...payload } = smtp;
    void smtpRuntimeStatus;
    return smtpPassChanged ? payload : { ...payload, smtpPass: "••••••••" };
  };

  return (
    <SectionCard title="메일(SMTP) 설정">
      <div style={{ fontSize: 13, color: "#888", marginBottom: 16, lineHeight: 1.5 }}>
        AI 편집 실패 알림, 뉴스레터 발송 등에 사용됩니다.
      </div>
      {smtpStatus && (
        <div style={{ fontSize: 13, color: smtpStatus.configured ? "#2E7D32" : "#A15C00", background: smtpStatus.configured ? "#F0FFF4" : "#FFF8E1", border: `1px solid ${smtpStatus.configured ? "#C8E6C9" : "#FFE082"}`, borderRadius: 8, padding: "10px 14px", marginBottom: 16, lineHeight: 1.6 }}>
          <strong>{smtpStatus.configured ? "SMTP 런타임 설정 준비됨" : "SMTP 런타임 설정 미완성"}</strong>
          <div>
            {envManagedLabels
              ? `Vercel 환경변수 관리 항목: ${envManagedLabels}`
              : "DB 저장 설정을 fallback으로 사용 중입니다."}
          </div>
          {!smtpStatus.configured && smtpStatus.missing.length > 0 && (
            <div>확인 필요: {smtpStatus.missing.join(", ")}</div>
          )}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={labelStyle}>메일 서비스</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.entries(SMTP_PRESETS).map(([key, p]) => (
              <button
                key={key}
                disabled={presetLocked}
                onClick={() => {
                  if (presetLocked) return;
                  setSmtp((prev) => ({ ...prev, smtpHost: p.host, smtpPort: p.port, smtpSecure: p.secure }));
                  setSmtpSaved(false);
                }}
                style={{
                  padding: "8px 20px",
                  fontSize: 14,
                  fontWeight: selectedService === key ? 600 : 400,
                  background: presetLocked ? "#F5F5F5" : selectedService === key ? "#E8192C" : "#F5F5F5",
                  color: presetLocked ? "#AAA" : selectedService === key ? "#FFF" : "#555",
                  border: selectedService === key && !presetLocked ? "1px solid #E8192C" : "1px solid #DDD",
                  borderRadius: 8,
                  cursor: presetLocked ? "not-allowed" : "pointer",
                  transition: "all 0.15s",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {isCustom && (
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
            <div>
              <label style={labelStyle}>SMTP 호스트</label>
              <input
                type="text"
                value={smtp.smtpHost}
                onChange={(e) => { setSmtp((prev) => ({ ...prev, smtpHost: e.target.value })); setSmtpSaved(false); }}
                placeholder={isEnvSource("host") ? "Vercel SMTP_HOST에서 관리됨" : "smtp.example.com"}
                style={fieldStyle(isEnvSource("host"))}
                disabled={isEnvSource("host")}
              />
            </div>
            <div>
              <label style={labelStyle}>포트</label>
              <input
                type="number"
                value={smtp.smtpPort}
                onChange={(e) => { setSmtp((prev) => ({ ...prev, smtpPort: Number(e.target.value) })); setSmtpSaved(false); }}
                style={fieldStyle(isEnvSource("port"))}
                disabled={isEnvSource("port")}
              />
            </div>
          </div>
        )}

        {!isCustom && (
          <div style={{ fontSize: 13, color: "#666", background: "#F8F9FA", borderRadius: 8, padding: "10px 14px", border: "1px solid #EAEAEA" }}>
            <span style={{ fontWeight: 500 }}>{preset.host}</span>
            <span style={{ color: "#999", marginLeft: 8 }}>포트 {smtp.smtpPort} · {smtp.smtpSecure ? "SSL" : "STARTTLS"}</span>
          </div>
        )}

        <div>
          <label style={labelStyle}>계정 (이메일)</label>
          <input
            type="email"
            value={smtp.smtpUser}
            onChange={(e) => {
              const val = e.target.value;
              setSmtp((prev) => ({
                ...prev,
                smtpUser: val,
                senderEmail: prev.senderEmail || val,
              }));
              setSmtpSaved(false);
            }}
            placeholder={isEnvSource("user") ? "Vercel SMTP_USER에서 관리됨" : preset.placeholder}
            style={fieldStyle(isEnvSource("user"))}
            disabled={isEnvSource("user")}
          />
        </div>
        <div>
          <label style={labelStyle}>비밀번호</label>
          <input
            type="password"
            value={isEnvSource("pass") ? "" : smtpPassChanged ? smtp.smtpPass : ""}
            onChange={(e) => { setSmtpPassChanged(true); setSmtp((prev) => ({ ...prev, smtpPass: e.target.value })); setSmtpSaved(false); }}
            placeholder={isEnvSource("pass") ? "Vercel SMTP_PASS에서 관리됨" : smtp.smtpPass === "••••••••" ? "저장된 비밀번호 있음" : "비밀번호 입력"}
            style={fieldStyle(isEnvSource("pass"))}
            disabled={isEnvSource("pass")}
          />
          <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
            {preset.hint}
          </div>
        </div>
        <div>
          <label style={labelStyle}>발신자 이름</label>
          <input
            type="text"
            value={smtp.senderName}
            onChange={(e) => { setSmtp((prev) => ({ ...prev, senderName: e.target.value })); setSmtpSaved(false); }}
            placeholder={isEnvSource("senderName") ? "Vercel SMTP_SENDER_NAME에서 관리됨" : "컬처피플"}
            style={fieldStyle(isEnvSource("senderName"))}
            disabled={isEnvSource("senderName")}
          />
        </div>

        {isCustom && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "#333" }}>SSL/TLS 보안 연결</div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>포트 465는 SSL, 587은 STARTTLS를 사용합니다.</div>
            </div>
            <button
              disabled={isEnvSource("secure")}
              onClick={() => { setSmtp((prev) => ({ ...prev, smtpSecure: !prev.smtpSecure })); setSmtpSaved(false); }}
              style={{
                width: 52,
                height: 28,
                borderRadius: 14,
                background: smtp.smtpSecure ? "#E8192C" : "#CCC",
                border: "none",
                cursor: isEnvSource("secure") ? "not-allowed" : "pointer",
                position: "relative",
                transition: "background 0.2s",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: smtp.smtpSecure ? 27 : 3,
                  width: 22,
                  height: 22,
                  background: "#FFF",
                  borderRadius: "50%",
                  transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                }}
              />
            </button>
          </div>
        )}
      </div>

      <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={async () => {
            try {
              await saveSetting("cp-newsletter-settings", buildSmtpPayload());
              setSmtpSaved(true);
              setSmtpSaveError("");
              setTimeout(() => setSmtpSaved(false), 3000);
            } catch (e) {
              setSmtpSaveError(e instanceof Error ? e.message : "저장에 실패했습니다.");
            }
          }}
          style={{
            padding: "10px 24px",
            background: "#E8192C",
            color: "#FFF",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          메일 설정 저장
        </button>
        <button
          disabled={smtpTesting || !canTestSmtp}
          onClick={async () => {
            setSmtpTesting(true);
            setSmtpTestResult(null);
            try {
              await saveSetting("cp-newsletter-settings", buildSmtpPayload());
              const res = await fetch("/api/smtp/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  host: smtp.smtpHost,
                  port: smtp.smtpPort,
                  user: smtp.smtpUser,
                  pass: smtpPassChanged ? smtp.smtpPass : "__KEEP__",
                  secure: smtp.smtpSecure,
                }),
              });
              const data = await res.json();
              setSmtpTestResult({ ok: data.success, msg: data.success ? "연결 성공!" : (data.error || "연결 실패") });
            } catch {
              setSmtpTestResult({ ok: false, msg: "테스트 요청에 실패했습니다." });
            } finally {
              setSmtpTesting(false);
            }
          }}
          style={{
            padding: "10px 24px",
            background: smtpTesting ? "#CCC" : "#F5F5F5",
            color: "#333",
            border: "1px solid #DDD",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            cursor: smtpTesting ? "not-allowed" : "pointer",
          }}
        >
          {smtpTesting ? "테스트 중..." : "연결 테스트"}
        </button>
        {smtpSaved && (
          <span style={{ fontSize: 14, color: "#4CAF50", fontWeight: 500 }}>저장되었습니다!</span>
        )}
      </div>
      {smtpSaveError && (
        <div style={{ fontSize: 13, color: "#E8192C", background: "#FFF0F0", border: "1px solid #FFCDD2", borderRadius: 6, padding: "8px 12px", marginTop: 8 }}>
          {smtpSaveError}
        </div>
      )}
      {smtpTestResult && (
        <div style={{
          fontSize: 13,
          color: smtpTestResult.ok ? "#4CAF50" : "#E8192C",
          background: smtpTestResult.ok ? "#F0FFF0" : "#FFF0F0",
          border: `1px solid ${smtpTestResult.ok ? "#C8E6C9" : "#FFCDD2"}`,
          borderRadius: 6,
          padding: "8px 12px",
          marginTop: 8,
        }}>
          {smtpTestResult.msg}
        </div>
      )}
    </SectionCard>
  );
}
