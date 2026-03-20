import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

interface Subscriber {
  id: string;
  email: string;
  name: string;
  subscribedAt: string;
  status: "active" | "unsubscribed";
  token?: string;
}

interface NewsletterSettings {
  enabled?: boolean;
  senderName: string;
  senderEmail: string;
  replyToEmail: string;
  welcomeSubject: string;
  welcomeBody: string;
  footerText: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpSecure: boolean;
}

async function sendWelcomeEmail(subscriber: Subscriber): Promise<void> {
  try {
    const { serverGetSetting } = await import("@/lib/db-server");
    const settings = await serverGetSetting<NewsletterSettings>("cp-newsletter-settings", {} as NewsletterSettings);
    if (!settings?.smtpHost || !settings?.smtpUser || !settings?.smtpPass) return;
    if (!settings.welcomeSubject && !settings.welcomeBody) return;

    const { getBaseUrl } = await import("@/lib/get-base-url");
    const baseUrl = getBaseUrl();

    const unsubscribeLink = subscriber.token
      ? `${baseUrl}/api/newsletter/unsubscribe?token=${subscriber.token}`
      : null;

    const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: 'Apple SD Gothic Neo', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 3px solid #E8192C; margin-bottom: 24px; padding-bottom: 12px;">
    <h2 style="color: #E8192C; margin: 0; font-size: 20px;">${escHtml(settings.senderName || "컬처피플")}</h2>
  </div>
  <div style="line-height: 1.8; font-size: 15px;">
    ${(settings.welcomeBody || "").replace(/\n/g, "<br>")}
  </div>
  ${settings.footerText ? `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #EEE;font-size:12px;color:#999;">${settings.footerText.replace(/\n/g, "<br>")}</div>` : ""}
  ${unsubscribeLink ? `<p style="font-size:12px;color:#999;text-align:center;margin-top:20px"><a href="${unsubscribeLink}" style="color:#999;">구독 해제</a></p>` : ""}
</body>
</html>`;

    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort || 587,
      secure: settings.smtpSecure ?? false,
      auth: { user: settings.smtpUser, pass: settings.smtpPass },
    });

    await transporter.sendMail({
      from: `"${settings.senderName || "컬처피플"}" <${settings.senderEmail}>`,
      replyTo: settings.replyToEmail || settings.senderEmail,
      to: subscriber.name
        ? `"${subscriber.name.replace(/[\r\n\t\x00"\\]/g, "").slice(0, 100)}" <${subscriber.email}>`
        : subscriber.email,
      subject: settings.welcomeSubject || "컬처피플 뉴스레터 구독을 환영합니다!",
      html,
    });
  } catch {
    // 웰컴 이메일 실패는 구독 자체에 영향 없음
  }
}

async function getDB() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const { sbGetSetting, sbSaveSetting } = await import("@/lib/supabase-server-db");
    return { dbGetSetting: sbGetSetting, dbSaveSetting: sbSaveSetting };
  }
  if (process.env.MYSQL_DATABASE) {
    const { dbGetSetting, dbSaveSetting } = await import("@/lib/mysql-db");
    return { dbGetSetting, dbSaveSetting };
  }
  const { fileGetSetting, fileSaveSetting } = await import("@/lib/file-db");
  return { dbGetSetting: fileGetSetting, dbSaveSetting: fileSaveSetting };
}

// GET /api/db/newsletter → 구독자 목록 (어드민용) — token 없는 구독자는 자동 생성
export async function GET(request: NextRequest) {
  try {
    // 심층 방어: 미들웨어 외에도 라우트 레벨 인증 검사
    const { isAuthenticated } = await import("@/lib/cookie-auth");
    if (!await isAuthenticated(request)) {
      return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }

    const { dbGetSetting, dbSaveSetting } = await getDB();
    const subscribers = await dbGetSetting<Subscriber[]>("cp-newsletter-subscribers", []);

    // token 없는 구독자에게 token 자동 생성
    let needsSave = false;
    const withTokens = subscribers.map((s) => {
      if (!s.token) {
        needsSave = true;
        return { ...s, token: crypto.randomUUID() };
      }
      return s;
    });

    if (needsSave) {
      await dbSaveSetting("cp-newsletter-subscribers", withTokens);
    }

    return NextResponse.json({ success: true, subscribers: withTokens });
  } catch (e) {
    console.error("[DB] GET newsletter error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// 구독 Rate Limit: IP당 1시간에 5회
const subRateLimitMap = new Map<string, { count: number; resetAt: number }>();

// POST /api/db/newsletter { email, name? } → 구독 등록
export async function POST(request: NextRequest) {
  try {
    // Rate Limit 검사
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const now = Date.now();
    const entry = subRateLimitMap.get(ip);
    if (entry && now < entry.resetAt) {
      if (entry.count >= 5) {
        return NextResponse.json({ success: false, error: "잠시 후 다시 시도해주세요." }, { status: 429 });
      }
      entry.count++;
    } else {
      subRateLimitMap.set(ip, { count: 1, resetAt: now + 3600_000 });
    }
    // 메모리 누수 방지
    if (subRateLimitMap.size > 500) {
      for (const [k, v] of subRateLimitMap) {
        if (now > v.resetAt) subRateLimitMap.delete(k);
      }
    }

    const { dbGetSetting, dbSaveSetting } = await getDB();
    const { email, name: rawName = "" } = await request.json();
    const name = typeof rawName === "string" ? rawName.replace(/[\r\n<>"]/g, "").trim().slice(0, 50) : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ success: false, error: "올바른 이메일 주소를 입력하세요." }, { status: 400 });
    }
    if (email.length > 320) {
      return NextResponse.json({ success: false, error: "이메일 주소가 너무 깁니다." }, { status: 400 });
    }

    const all = await dbGetSetting<Subscriber[]>("cp-newsletter-subscribers", []);

    // 구독자 수 제한
    if (all.length >= 10000) {
      return NextResponse.json({ success: false, error: "구독자 한도에 달했습니다." }, { status: 400 });
    }

    // 이미 활성 구독 중인 경우 성공으로 처리
    if (all.find((s) => s.email === email)) {
      if (all.some((s) => s.email === email && s.status === "active")) {
        return NextResponse.json({ success: true, message: "이미 구독 중입니다." });
      }
      // 기존에 unsubscribed였으면 재활성화
      const updated = all.map((s) => s.email === email ? { ...s, status: "active" as const } : s);
      await dbSaveSetting("cp-newsletter-subscribers", updated);
    } else {
      const newSubscriber: Subscriber = {
        id: crypto.randomUUID(),
        email,
        name,
        subscribedAt: new Date().toISOString().slice(0, 10),
        status: "active",
        token: crypto.randomUUID(),
      };
      const updated = [...all, newSubscriber];
      await dbSaveSetting("cp-newsletter-subscribers", updated);
      // 웰컴 이메일 비동기 발송 (실패해도 구독 성공으로 처리)
      void sendWelcomeEmail(newSubscriber);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] POST newsletter error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// DELETE /api/db/newsletter?email=xxx → 구독 취소
export async function DELETE(request: NextRequest) {
  try {
    const { dbGetSetting, dbSaveSetting } = await getDB();
    const email = request.nextUrl.searchParams.get("email");
    if (!email) return NextResponse.json({ success: false, error: "email required" }, { status: 400 });
    const subs = await dbGetSetting<Subscriber[]>("cp-newsletter-subscribers", []);
    const updated = subs.map((s) => s.email === email ? { ...s, status: "unsubscribed" as const } : s);
    await dbSaveSetting("cp-newsletter-subscribers", updated);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] DELETE newsletter error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
