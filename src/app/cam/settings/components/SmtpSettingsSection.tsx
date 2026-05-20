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

  return (
    <SectionCard title="메일(SMTP) 설정">
      <div style={{ fontSize: 13, color: "#888", marginBottom: 16, lineHeight: 1.5 }}>
        AI 편집 실패 알림, 뉴스레터 발송 등에 사용됩니다.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={labelStyle}>메일 서비스</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.entries(SMTP_PRESETS).map(([key, p]) => (
              <button
                key={key}
                onClick={() => {
                  setSmtp((prev) => ({ ...prev, smtpHost: p.host, smtpPort: p.port, smtpSecure: p.secure }));
                  setSmtpSaved(false);
                }}
                style={{
                  padding: "8px 20px",
                  fontSize: 14,
                  fontWeight: selectedService === key ? 600 : 400,
                  background: selectedService === key ? "#E8192C" : "#F5F5F5",
                  color: selectedService === key ? "#FFF" : "#555",
                  border: selectedService === key ? "1px solid #E8192C" : "1px solid #DDD",
                  borderRadius: 8,
                  cursor: "pointer",
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
                placeholder="smtp.example.com"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>포트</label>
              <input
                type="number"
                value={smtp.smtpPort}
                onChange={(e) => { setSmtp((prev) => ({ ...prev, smtpPort: Number(e.target.value) })); setSmtpSaved(false); }}
                style={inputStyle}
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
            placeholder={preset.placeholder}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>비밀번호</label>
          <input
            type="password"
            value={smtpPassChanged ? smtp.smtpPass : ""}
            onChange={(e) => { setSmtpPassChanged(true); setSmtp((prev) => ({ ...prev, smtpPass: e.target.value })); setSmtpSaved(false); }}
            placeholder={smtp.smtpPass === "••••••••" ? "저장된 비밀번호 있음" : "비밀번호 입력"}
            style={inputStyle}
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
            placeholder="컬처피플"
            style={inputStyle}
          />
        </div>

        {isCustom && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "#333" }}>SSL/TLS 보안 연결</div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>포트 465는 SSL, 587은 STARTTLS를 사용합니다.</div>
            </div>
            <button
              onClick={() => { setSmtp((prev) => ({ ...prev, smtpSecure: !prev.smtpSecure })); setSmtpSaved(false); }}
              style={{
                width: 52,
                height: 28,
                borderRadius: 14,
                background: smtp.smtpSecure ? "#E8192C" : "#CCC",
                border: "none",
                cursor: "pointer",
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
              const payload = smtpPassChanged
                ? smtp
                : { ...smtp, smtpPass: "••••••••" };
              await saveSetting("cp-newsletter-settings", payload);
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
          disabled={smtpTesting || !smtp.smtpHost || !smtp.smtpUser}
          onClick={async () => {
            setSmtpTesting(true);
            setSmtpTestResult(null);
            try {
              const testPayload = smtpPassChanged
                ? smtp
                : { ...smtp, smtpPass: "••••••••" };
              await saveSetting("cp-newsletter-settings", testPayload);
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
