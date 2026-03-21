/**
 * SMTP 연결 테스트 API
 * POST /api/smtp/test
 */
import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(req: NextRequest) {
  // 인증 검사
  const { verifyAuthToken } = await import("@/lib/cookie-auth");
  const cookie = req.cookies.get("cp-admin-auth");
  const result = await verifyAuthToken(cookie?.value ?? "");
  if (!result.valid) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const { host, port, user, pass, secure } = (await req.json()) as {
      host: string;
      port: number;
      user: string;
      pass: string;
      secure: boolean;
    };

    if (!host || !user) {
      return NextResponse.json({ success: false, error: "SMTP 호스트와 계정을 입력하세요." }, { status: 400 });
    }

    // __KEEP__ 이면 DB에서 기존 비밀번호 로드
    let smtpPass = pass;
    if (pass === "__KEEP__" || pass === "••••••••") {
      const { serverGetSetting } = await import("@/lib/db-server");
      const existing = await serverGetSetting<{ smtpPass?: string }>("cp-newsletter-settings", {});
      smtpPass = existing.smtpPass ?? "";
    }

    if (!smtpPass) {
      return NextResponse.json({ success: false, error: "비밀번호를 입력하세요." }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      host,
      port: port || 587,
      secure: secure ?? false,
      auth: { user, pass: smtpPass },
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
