/**
 * SMTP 연결 테스트 API
 * POST /api/smtp/test
 */
import { NextRequest, NextResponse } from "next/server";
import { createSmtpTransport, getSmtpConfigError, getSmtpRuntimeConfig } from "@/lib/smtp-settings";

export async function POST(req: NextRequest) {
  // 인증 검사
  const { verifyAuthToken } = await import("@/lib/cookie-auth");
  const cookie = req.cookies.get("cp-admin-auth");
  const result = await verifyAuthToken(cookie?.value ?? "");
  if (!result.valid) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const { host, port, user, pass, secure } = (await req.json().catch(() => ({}))) as {
      host?: string;
      port?: number;
      user?: string;
      pass?: string;
      secure?: boolean;
    };
    const settings = await getSmtpRuntimeConfig({
      overrides: {
        smtpHost: host,
        smtpPort: port,
        smtpUser: user,
        smtpPass: pass,
        smtpSecure: secure,
      },
    });
    const smtpError = getSmtpConfigError(settings.status);
    if (smtpError) {
      return NextResponse.json({ success: false, error: smtpError }, { status: 400 });
    }

    const transporter = await createSmtpTransport(settings, {
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    });

    await transporter.verify();

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "SMTP 연결 실패";
    return NextResponse.json({ success: false, error: msg });
  }
}
