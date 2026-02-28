import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

interface NewsletterSettings {
  senderName: string;
  senderEmail: string;
  replyToEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpSecure: boolean;
  footerText: string;
}

interface Subscriber {
  id: string;
  email: string;
  name: string;
  status: "active" | "unsubscribed";
  token?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subject, content, settings, subscribers } = body as {
      subject: string;
      content: string;
      settings: NewsletterSettings;
      subscribers: Subscriber[];
    };

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      "https://culturepeople.co.kr";

    if (!subject || !content) {
      return NextResponse.json({ success: false, error: "제목과 내용을 입력해주세요." }, { status: 400 });
    }

    // SMTP 설정 검증
    if (!settings?.smtpHost || !settings?.smtpUser || !settings?.smtpPass) {
      return NextResponse.json(
        { success: false, error: "SMTP 설정이 불완전합니다. 발송 설정 탭에서 SMTP 정보를 입력해주세요." },
        { status: 400 }
      );
    }

    const activeSubscribers = subscribers.filter((s) => s.status === "active");
    if (activeSubscribers.length === 0) {
      return NextResponse.json({ success: false, error: "활성 구독자가 없습니다." }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort || 587,
      secure: settings.smtpSecure ?? false,
      auth: {
        user: settings.smtpUser,
        pass: settings.smtpPass,
      },
    });

    // SMTP 연결 검증
    await transporter.verify();

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    const buildHtml = (subscriber: Subscriber) => {
      const unsubscribeLink = subscriber.token
        ? `${baseUrl}/api/newsletter/unsubscribe?token=${subscriber.token}`
        : null;
      const unsubscribeFooter = unsubscribeLink
        ? `<p style="font-size:12px;color:#999;text-align:center;margin-top:20px">
    <a href="${unsubscribeLink}" style="color:#999;">구독 해제</a>
  </p>`
        : "";
      return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: 'Apple SD Gothic Neo', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 3px solid #E8192C; margin-bottom: 24px; padding-bottom: 12px;">
    <h2 style="color: #E8192C; margin: 0; font-size: 20px;">${settings.senderName || "컬처피플"}</h2>
  </div>
  <h1 style="font-size: 22px; margin-bottom: 16px; line-height: 1.4;">${subject}</h1>
  <div style="line-height: 1.8; font-size: 15px;">
    ${content.replace(/\n/g, "<br>")}
  </div>
  ${
    settings.footerText
      ? `<div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #EEE; font-size: 12px; color: #999;">
    ${settings.footerText.replace(/\n/g, "<br>")}
  </div>`
      : ""
  }
  ${unsubscribeFooter}
</body>
</html>`;
    };

    // 10명씩 병렬 발송, 배치 간 100ms 대기 (SMTP 레이트 리밋 방지)
    const BATCH_SIZE = 10;
    const BATCH_DELAY_MS = 100;
    for (let i = 0; i < activeSubscribers.length; i += BATCH_SIZE) {
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
      const batch = activeSubscribers.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((subscriber) =>
          transporter.sendMail({
            from: `"${settings.senderName}" <${settings.senderEmail}>`,
            replyTo: settings.replyToEmail || settings.senderEmail,
            to: `${subscriber.name ? `"${subscriber.name}" ` : ""}<${subscriber.email}>`,
            subject,
            html: buildHtml(subscriber),
          })
        )
      );
      for (let j = 0; j < results.length; j++) {
        if (results[j].status === "fulfilled") {
          sent++;
        } else {
          failed++;
          errors.push(batch[j].email);
          console.error(`[newsletter] Failed to send to ${batch[j].email}:`, (results[j] as PromiseRejectedResult).reason);
        }
      }
    }

    return NextResponse.json({
      success: true,
      sent,
      failed,
      errors: errors.slice(0, 5),
      message: `${sent}명에게 발송 완료${failed > 0 ? `, ${failed}명 실패` : ""}`,
    });
  } catch (error) {
    console.error("[newsletter/send]", error);
    return NextResponse.json(
      { success: false, error: "SMTP 연결에 실패했습니다. 설정을 확인해주세요." },
      { status: 500 }
    );
  }
}
