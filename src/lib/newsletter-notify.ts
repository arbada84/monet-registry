/**
 * 기사 발행 시 뉴스레터 자동발송 — 공유 유틸리티
 * articles/route.ts 와 cron/publish/route.ts 양쪽에서 사용
 */
import type { Article } from "@/types/article";
import { serverGetSetting } from "@/lib/db-server";

export async function notifyNewsletterOnPublish(article: Article): Promise<void> {
  try {
    const newsletterSettings = await serverGetSetting<{
      autoSendOnPublish?: boolean;
      senderName?: string;
      senderEmail?: string;
      replyToEmail?: string;
      smtpHost?: string;
      smtpPort?: number;
      smtpUser?: string;
      smtpPass?: string;
      smtpSecure?: boolean;
    }>("cp-newsletter-settings", {});

    if (!newsletterSettings.autoSendOnPublish) return;
    if (!newsletterSettings.smtpHost || !newsletterSettings.smtpUser || !newsletterSettings.smtpPass) return;

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.split(/\s/)[0]?.replace(/\/$/, "") ||
      "https://culturepeople.co.kr";
    const articleUrl = `${baseUrl}/article/${article.no ?? article.id}`;

    const subscribers = await serverGetSetting<{ email: string; name: string; status: string; token?: string }[]>(
      "cp-newsletter-subscribers", []
    );
    const activeSubscribers = subscribers.filter((s) => s.status === "active");
    if (activeSubscribers.length === 0) return;

    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: newsletterSettings.smtpHost,
      port: newsletterSettings.smtpPort || 587,
      secure: newsletterSettings.smtpSecure ?? false,
      auth: { user: newsletterSettings.smtpUser, pass: newsletterSettings.smtpPass },
    });

    const subject = article.title;
    const bodyText = article.summary || article.title;

    const BATCH = 10;
    for (let i = 0; i < activeSubscribers.length; i += BATCH) {
      await Promise.allSettled(
        activeSubscribers.slice(i, i + BATCH).map((s) => {
          const unsubLink = s.token
            ? `${baseUrl}/api/newsletter/unsubscribe?token=${s.token}`
            : null;
          return transporter.sendMail({
            from: `"${newsletterSettings.senderName || "컬처피플"}" <${newsletterSettings.senderEmail}>`,
            replyTo: newsletterSettings.replyToEmail || newsletterSettings.senderEmail,
            to: `<${s.email}>`,
            subject,
            html: `<p>${bodyText}</p><p><a href="${articleUrl}">기사 보기</a></p>${
              unsubLink
                ? `<p style="font-size:12px;color:#999"><a href="${unsubLink}">구독 해제</a></p>`
                : ""
            }`,
          });
        })
      );
    }
  } catch (err) {
    console.error("[newsletter] 자동발송 실패:", err);
  }
}
